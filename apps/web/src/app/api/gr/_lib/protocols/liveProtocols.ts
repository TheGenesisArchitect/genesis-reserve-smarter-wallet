/**
 * Live protocol strategy fetcher.
 *
 * Pulls real APY/pool data from DeFiLlama Yields API and Superform REST API,
 * normalises results into VaultStrategySummary objects, and merges them into
 * the strategy ranking pipeline.
 *
 * Protocol universe (14 protocols across Preserve / Grow / Accelerate tiers):
 *
 *  PRESERVE  — Aave, Compound V3, Spark, Sky, Ondo Finance
 *  GROW      — Pendle, Morpho, Resolv, Maple, Fluid, Notional, Term Finance
 *  ACCELERATE — Ethena, Gearbox
 *
 * Errors are swallowed and an empty array returned so a transient API failure
 * never blocks the vault.
 */

import { inferLiquidity, inferRisk } from '../deframe'
import type { VaultStrategySummary } from '../deframe'

// ---------------------------------------------------------------------------
// Shared TTL cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
    data: T
    fetchedAt: number
}

function makeTtlCache<T>() {
    let entry: CacheEntry<T> | null = null
    return {
        get(): T | null {
            if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null
            return entry.data
        },
        set(data: T) {
            entry = { data, fetchedAt: Date.now() }
        },
    }
}

// ---------------------------------------------------------------------------
// Chain mapping (DeFiLlama names → internal)
// ---------------------------------------------------------------------------

const CHAIN_MAP: Record<string, { chain: string; chainId: number }> = {
    Ethereum:  { chain: 'ethereum',  chainId: 1       },
    Arbitrum:  { chain: 'arbitrum',  chainId: 42161   },
    Base:      { chain: 'base',      chainId: 8453    },
    Optimism:  { chain: 'optimism',  chainId: 10      },
    Polygon:   { chain: 'polygon',   chainId: 137     },
    Gnosis:    { chain: 'gnosis',    chainId: 100     },
    Sonic:     { chain: 'sonic',     chainId: 146     },
    Scroll:    { chain: 'scroll',    chainId: 534352  },
    Avalanche: { chain: 'avalanche', chainId: 43114   },
    BSC:       { chain: 'bsc',       chainId: 56      },
    'BNB Chain': { chain: 'bsc',     chainId: 56      },
}

function resolveChain(raw: string): { chain: string; chainId: number } | null {
    const exact = CHAIN_MAP[raw]
    if (exact) return exact
    const lower = raw.toLowerCase()
    for (const [key, val] of Object.entries(CHAIN_MAP)) {
        if (key.toLowerCase() === lower) return val
    }
    return null
}

// ---------------------------------------------------------------------------
// Stablecoin symbol filter
// ---------------------------------------------------------------------------

// Broad enough to catch all stablecoin-denominated yield — including
// tokenised T-bills (OUSG, USDY), Ethena (sUSDe), Resolv (USR/RLP),
// Frax (FRAX, frxETH-correlated stable pools), Curve's crvUSD, and newer
// stablecoins like pyUSD, USDM, mkUSD.
const STABLECOIN_SYMBOLS = [
    'usdc', 'usdt', 'dai', 'gho', 'usds',
    'usde', 'susde',           // Ethena
    'usr', 'rlp',              // Resolv
    'usd+',
    'frax', 'fxusd',           // Frax ecosystem
    'crvusd',                  // Curve stablecoin
    'pyusd',                   // PayPal USD
    'usdm',                    // Mountain Protocol
    'ousg', 'usdy',            // Ondo tokenised T-bills
    'mkusd',                   // Prisma Finance
    'tusd', 'busd', 'gusd',    // legacy stables still active in some pools
]

function isStablecoinSymbol(symbol: string): boolean {
    const lower = symbol.toLowerCase()
    return STABLECOIN_SYMBOLS.some((s) => lower.includes(s))
}

// ---------------------------------------------------------------------------
// DeFiLlama Yields API
// ---------------------------------------------------------------------------

const DEFI_LLAMA_POOLS_URL = 'https://yields.llama.fi/pools'

interface LlamaPool {
    pool:       string
    chain:      string
    project:    string
    symbol:     string
    tvlUsd:     number
    apyBase:    number | null   // organic lending/borrowing APY component
    apyReward:  number | null   // token-incentive APY component
    apy:        number | null   // total APY (apyBase + apyReward)
    apyMean30d: number | null   // 30-day rolling mean APY — best stability signal
    mu:         number | null   // geometric mean
    sigma:      number | null   // APY volatility (standard deviation in pct pts)
    stablecoin: boolean
    poolMeta:   string | null
    ilRisk:     string
}

const llamaCache = makeTtlCache<LlamaPool[]>()

async function fetchLlamaPools(): Promise<LlamaPool[]> {
    const cached = llamaCache.get()
    if (cached) return cached

    try {
        const res = await fetch(DEFI_LLAMA_POOLS_URL, {
            method: 'GET',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(14_000),
        })
        if (!res.ok) return []

        const body = await res.json().catch(() => null) as Record<string, unknown> | null
        const data = Array.isArray(body?.data) ? (body!.data as LlamaPool[]) : []
        llamaCache.set(data)
        return data
    } catch {
        return []
    }
}

// ---------------------------------------------------------------------------
// Protocol configuration
// ---------------------------------------------------------------------------

interface ProtocolConfig {
    protocolKey:           string    // internal key / strategyId prefix
    protocolLabel:         string    // display name
    projects:              string[]  // DeFiLlama project names (substring match)
    maxPerChain:           number    // top N pools per chain
    feeBps:                number
    accreditationRequired: boolean
    minTvlOverride?:       number    // optional stricter TVL floor (default 100 000)
}

// ---------------------------------------------------------------------------
// Protocol universe — 14 protocols mapped to Preserve / Grow / Accelerate
//
//  PRESERVE  (low-risk, capital preservation, beats inflation)
//    · Aave V3       — blue-chip USDC lending, 4–7%, instant, low risk
//    · Compound V3   — battle-tested, 3–6%, instant, low risk
//    · Spark         — MakerDAO lending arm, tracks DSR, 4–7%, instant, low risk
//    · Sky           — MakerDAO SSR/USDS savings, 4–6%, instant, low risk
//    · Ondo Finance  — tokenised T-bills (OUSG/USDY), 4.5–5.5%, scheduled, low risk
//
//  GROW  (balanced, investor-grade, 7–18%)
//    · Pendle        — fixed/variable PT-USDC & PT-sUSDe, 8–20%, scheduled, medium
//    · Morpho        — curated lending vaults (Gauntlet/Steakhouse), 6–18%, same-day
//    · Resolv        — delta-neutral USR, 7–12%, same-day, medium
//    · Maple         — institutional lending (accreditation req.), 8–14%, scheduled
//    · Fluid         — dynamic lending (ex-Instadapp), 6–12%, instant, medium
//    · Notional V3   — fixed-rate USDC lending, 8–14%, scheduled, medium
//    · Term Finance  — auction-based fixed-rate, 8–18%, scheduled, medium
//
//  ACCELERATE  (high-conviction, maximum yield)
//    · Ethena        — delta-neutral sUSDe funding yield, 10–30%, instant, high
//    · Gearbox V3    — leveraged USDC farming, 12–50%, instant, high
// ---------------------------------------------------------------------------

const LLAMA_PROTOCOL_CONFIGS: ProtocolConfig[] = [
    // ── PRESERVE tier ─────────────────────────────────────────────────────
    {
        protocolKey: 'aave',
        protocolLabel: 'Aave',
        projects: ['aave-v3', 'aave'],
        maxPerChain: 3,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'compound',
        protocolLabel: 'Compound V3',
        projects: ['compound-v3'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'spark',
        protocolLabel: 'Spark',
        projects: ['spark', 'spark-lend', 'spark-protocol', 'sparkdex'],
        maxPerChain: 3,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'sky',
        protocolLabel: 'Sky',
        projects: ['sky', 'maker', 'maker-dao', 'sky-protocol', 'makerdao'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'ondo',
        protocolLabel: 'Ondo Finance',
        projects: ['ondo-finance', 'ondo'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
        minTvlOverride: 1_000_000, // T-bill pools with <$1M TVL not meaningful
    },

    // ── GROW tier ─────────────────────────────────────────────────────────
    {
        protocolKey: 'pendle',
        protocolLabel: 'Pendle',
        projects: ['pendle'],
        maxPerChain: 5, // bumped from 3 — Arbitrum has many quality PT pools
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'morpho',
        protocolLabel: 'Morpho',
        projects: ['morpho', 'morpho-blue', 'morpho-aave'],
        maxPerChain: 3,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'resolv',
        protocolLabel: 'Resolv',
        projects: ['resolv'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'maple',
        protocolLabel: 'Maple',
        projects: ['maple', 'maple-v2', 'maple-finance'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: true,
    },
    {
        protocolKey: 'fluid',
        protocolLabel: 'Fluid',
        projects: ['fluid', 'fluid-dex', 'instadapp-fluid'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'notional',
        protocolLabel: 'Notional',
        projects: ['notional', 'notional-v3', 'notional-v2'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'term',
        protocolLabel: 'Term Finance',
        projects: ['term-finance', 'term'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },

    // ── ACCELERATE tier ───────────────────────────────────────────────────
    {
        protocolKey: 'ethena',
        protocolLabel: 'Ethena',
        projects: ['ethena'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
    {
        protocolKey: 'gearbox',
        protocolLabel: 'Gearbox',
        projects: ['gearbox', 'gearbox-v3'],
        maxPerChain: 2,
        feeBps: 0,
        accreditationRequired: false,
    },
]

// Default minimum TVL across all protocols
const DEFAULT_MIN_TVL = 100_000

function buildLlamaStrategies(pools: LlamaPool[]): VaultStrategySummary[] {
    const strategies: VaultStrategySummary[] = []

    for (const cfg of LLAMA_PROTOCOL_CONFIGS) {
        const minTvl = cfg.minTvlOverride ?? DEFAULT_MIN_TVL

        const matching = pools.filter((p) => {
            if (!cfg.projects.some((proj) => p.project.toLowerCase().includes(proj))) return false
            const apy = p.apy ?? 0
            if (apy < 0.5) return false
            if (p.tvlUsd < minTvl) return false
            if (!(p.stablecoin || isStablecoinSymbol(p.symbol))) return false
            if (!resolveChain(p.chain)) return false
            return true
        })

        // Group by chain, take top N per chain sorted by APY descending
        const byChain = new Map<string, LlamaPool[]>()
        for (const pool of matching) {
            const list = byChain.get(pool.chain) ?? []
            list.push(pool)
            byChain.set(pool.chain, list)
        }

        for (const [chainRaw, chainPools] of byChain.entries()) {
            const chainInfo = resolveChain(chainRaw)!
            const top = chainPools
                .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
                .slice(0, cfg.maxPerChain)

            for (const pool of top) {
                const apy      = pool.apy      ?? 0
                const apyBase  = pool.apyBase  ?? 0
                const mean30d  = pool.apyMean30d ?? null
                const metaSuffix = pool.poolMeta ? ` ${pool.poolMeta}` : ''

                // avgApyPct  = 30-day rolling mean  (best historical stability signal)
                //              falls back to apyBase if mean30d unavailable
                const avgApyPct = mean30d != null && mean30d > 0
                    ? mean30d.toFixed(2)
                    : apyBase > 0
                        ? apyBase.toFixed(2)
                        : undefined

                // inceptionApyPct = organic base APY (no incentive tokens)
                // A large gap between netApyPct and inceptionApyPct signals
                // incentive-heavy yield that may not persist — the stability
                // scorer in deframe.ts penalises this automatically.
                const inceptionApyPct = apyBase > 0 ? apyBase.toFixed(2) : undefined

                strategies.push({
                    strategyId: `${cfg.protocolKey}-${pool.pool.toLowerCase()}`,
                    label: `${cfg.protocolLabel} ${pool.symbol}${metaSuffix} (${chainInfo.chain})`,
                    protocol: cfg.protocolLabel,
                    chain: chainInfo.chain,
                    chainId: chainInfo.chainId,
                    netApyPct: apy.toFixed(2),
                    avgApyPct,
                    inceptionApyPct,
                    riskLevel: inferRisk(cfg.protocolKey),
                    liquidityWindow: inferLiquidity(cfg.protocolKey),
                    feeBps: cfg.feeBps,
                    paused: false,
                    availableActions: ['lend', 'withdraw'],
                    accreditationRequired: cfg.accreditationRequired || undefined,
                    poolUrl: `https://defillama.com/yields/pool/${pool.pool}`,
                })
            }
        }
    }

    return strategies
}

// ---------------------------------------------------------------------------
// Superform API
// ---------------------------------------------------------------------------

const SUPERFORM_API_BASE  = 'https://api.superform.xyz'
const SUPERFORM_MIN_TVL   = 100_000
const SUPERFORM_MIN_APY   = 0.5
const SUPERFORM_MAX_PER_CHAIN = 3

const superformCache = makeTtlCache<VaultStrategySummary[]>()

interface SuperformVault {
    vault_id?: string
    chain_id?: number
    chain?: string
    protocol?: string
    vault_name?: string
    symbol?: string
    apy?: number
    apy_base?: number
    tvl?: number
    tvl_usd?: number
    paused?: boolean
    is_stablecoin?: boolean
}

async function fetchSuperformStrategies(): Promise<VaultStrategySummary[]> {
    const cached = superformCache.get()
    if (cached) return cached

    try {
        const res = await fetch(`${SUPERFORM_API_BASE}/vaults/`, {
            method: 'GET',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return []

        const body = await res.json().catch(() => null) as Record<string, unknown> | null
        if (!body) return []

        const rawVaults: unknown[] = Array.isArray(body)
            ? body
            : Array.isArray((body as Record<string, unknown>).vaults)
                ? (body as { vaults: unknown[] }).vaults
                : Array.isArray((body as Record<string, unknown>).data)
                    ? (body as { data: unknown[] }).data
                    : []

        const byChain = new Map<string, SuperformVault[]>()

        for (const raw of rawVaults) {
            if (!raw || typeof raw !== 'object') continue
            const v = raw as SuperformVault

            const apy      = typeof v.apy     === 'number' ? v.apy     : 0
            const tvl      = typeof v.tvl_usd === 'number' ? v.tvl_usd : (typeof v.tvl === 'number' ? v.tvl : 0)
            const chainRaw = typeof v.chain   === 'string' ? v.chain   : ''

            if (apy < SUPERFORM_MIN_APY) continue
            if (tvl < SUPERFORM_MIN_TVL)  continue
            if (!v.is_stablecoin && !isStablecoinSymbol(v.symbol ?? '')) continue
            if (!resolveChain(chainRaw)) continue

            const list = byChain.get(chainRaw) ?? []
            list.push(v)
            byChain.set(chainRaw, list)
        }

        const strategies: VaultStrategySummary[] = []

        for (const [chainRaw, vaults] of byChain.entries()) {
            const chainInfo = resolveChain(chainRaw)!
            const top = vaults
                .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
                .slice(0, SUPERFORM_MAX_PER_CHAIN)

            for (const v of top) {
                const apy     = v.apy ?? 0
                const vaultId = v.vault_id ?? `${chainInfo.chainId}-${v.vault_name ?? 'unknown'}`
                const label   = v.vault_name ?? v.symbol ?? 'Superform Vault'
                const protocol = v.protocol ? `Superform / ${v.protocol}` : 'Superform'

                strategies.push({
                    strategyId: `superform-${vaultId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
                    label: `${label} (${chainInfo.chain})`,
                    protocol,
                    chain: chainInfo.chain,
                    chainId: chainInfo.chainId,
                    netApyPct:    apy.toFixed(2),
                    avgApyPct:    typeof v.apy_base === 'number' ? v.apy_base.toFixed(2) : undefined,
                    riskLevel:    inferRisk('superform'),
                    liquidityWindow: inferLiquidity('superform'),
                    feeBps: 0,
                    paused: v.paused ?? false,
                    availableActions: ['lend', 'withdraw'],
                    poolUrl: `https://app.superform.xyz/vaults/${vaultId}`,
                })
            }
        }

        superformCache.set(strategies)
        return strategies
    } catch {
        return []
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch live strategies for all 14 target protocols in parallel.
 * Returns an empty array if every upstream API call fails — the caller's
 * fallback / DeFrame pool is always the safety net.
 */
export async function fetchLiveProtocolStrategies(): Promise<VaultStrategySummary[]> {
    const [llamaPools, superformStrategies] = await Promise.all([
        fetchLlamaPools(),
        fetchSuperformStrategies(),
    ])

    const llamaStrategies = buildLlamaStrategies(llamaPools)
    return [...llamaStrategies, ...superformStrategies]
}

/**
 * Returns the protocol keys absent from a set of strategies.
 * Useful for diagnostic logging in route handlers.
 */
export function detectAbsentProtocols(strategies: VaultStrategySummary[]): string[] {
    const keys = [
        // Preserve
        'aave', 'compound', 'spark', 'sky', 'ondo',
        // Grow
        'pendle', 'morpho', 'resolv', 'maple', 'fluid', 'notional', 'term',
        // Accelerate
        'ethena', 'gearbox',
        // Aggregator
        'superform',
    ]
    return keys.filter(
        (key) => !strategies.some((s) => s.protocol.toLowerCase().includes(key))
    )
}
