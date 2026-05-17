import { NextResponse } from 'next/server'
import { createTtlCache } from '../_lib/request-controls'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StrategyRate {
  name: string
  protocol: 'pendle' | 'gearbox' | 'aave' | 'tbill'
  apy: number           // annualized % e.g. 18.2
  allocation: number    // 0–1 weight in blended model
  source: 'live' | 'fallback'
}

export interface RatesPayload {
  strategies: StrategyRate[]
  blendedApy: number          // weighted blended across all strategies
  genesisSpread: number       // blendedApy - investorPreferred
  investorPreferred: number   // always 8.0
  allocationModel: string
  dataSource: 'live' | 'partial' | 'fallback'
  lastUpdated: string
  cacheHit: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

const EPOCH_MS   = 15 * 60 * 1000   // 15-min epoch cadence
const CACHE_KEY  = 'gr-strategy-rates'
const INVESTOR_PREFERRED = 8.0

// Current allocation model weights (must sum to 1.0)
const ALLOCATIONS = {
  pendle:  0.40,
  gearbox: 0.30,
  aave:    0.20,
  tbill:   0.10,
}

// Fallback rates — updated to user-confirmed live values
const FALLBACK_RATES = {
  pendle:  18.00,
  gearbox: 20.53,
  aave:     8.10,
  tbill:    5.20,
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = createTtlCache<RatesPayload>()

// ── Pendle Fetcher ────────────────────────────────────────────────────────────

async function fetchPendleRate(): Promise<number | null> {
  try {
    // Pendle v2 markets on Arbitrum One (chainId 42161)
    const res = await fetch(
      'https://api-v2.pendle.finance/core/v2/42161/markets?limit=100&is_expired=false',
      { cache: 'no-store', signal: AbortSignal.timeout(6_000), headers: { accept: 'application/json' } }
    )
    if (!res.ok) return null

    const body = await res.json().catch(() => null)
    const markets: any[] = body?.results ?? body?.markets ?? (Array.isArray(body) ? body : [])

    // Find USDC-correlated markets — look for USDC, aUSDC, or cUSDC underlyings
    const usdcMarkets = markets.filter((m: any) => {
      const name: string = (m?.name || m?.pt?.name || m?.sy?.name || '').toLowerCase()
      const symbol: string = (m?.sy?.symbol || m?.pt?.symbol || '').toLowerCase()
      return name.includes('usdc') || symbol.includes('usdc')
    })

    if (usdcMarkets.length === 0) return null

    // Pick the market with the highest implied APY that is reasonable (<= 40%)
    const apys = usdcMarkets
      .map((m: any) => {
        const raw = m?.impliedApy ?? m?.implied_apy ?? m?.fixedApy ?? m?.fixed_apy
        return typeof raw === 'number' ? raw * 100 : null  // Pendle returns as decimal (0.18 = 18%)
      })
      .filter((v): v is number => v !== null && v > 0 && v <= 40)

    if (apys.length === 0) return null
    return Number(Math.max(...apys).toFixed(2))
  } catch {
    return null
  }
}

// ── Gearbox Fetcher ───────────────────────────────────────────────────────────

async function fetchGearboxRate(): Promise<number | null> {
  try {
    // Gearbox pools API — Arbitrum
    const res = await fetch(
      'https://api.gearbox.fi/pools?chainId=42161',
      { cache: 'no-store', signal: AbortSignal.timeout(6_000), headers: { accept: 'application/json' } }
    )
    if (!res.ok) return null

    const body = await res.json().catch(() => null)
    const pools: any[] = Array.isArray(body) ? body : (body?.data ?? body?.pools ?? [])

    const usdcPools = pools.filter((p: any) => {
      const symbol: string = (p?.symbol || p?.underlying?.symbol || p?.token?.symbol || '').toUpperCase()
      return symbol.includes('USDC')
    })

    if (usdcPools.length === 0) return null

    const apys = usdcPools
      .map((p: any) => {
        // Gearbox may return as decimal or percentage depending on version
        const raw = p?.depositAPY ?? p?.supplyAPY ?? p?.apy ?? p?.totalAPY
        if (typeof raw === 'number') {
          return raw > 1 ? raw : raw * 100   // handle both 20.53 and 0.2053
        }
        return null
      })
      .filter((v): v is number => v !== null && v > 0 && v <= 40)

    if (apys.length === 0) return null
    return Number(Math.max(...apys).toFixed(2))
  } catch {
    return null
  }
}

// ── Aave Fetcher ──────────────────────────────────────────────────────────────

async function fetchAaveRate(): Promise<number | null> {
  try {
    // Aave v3 Arbitrum — use Aave's public data API
    const res = await fetch(
      'https://aave-api-v2.aave.com/data/markets-data/0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      { cache: 'no-store', signal: AbortSignal.timeout(6_000), headers: { accept: 'application/json' } }
    )
    if (!res.ok) return null

    const body = await res.json().catch(() => null)
    const reserves: any[] = body?.reserves ?? body?.data ?? []

    const usdc = reserves.find((r: any) => {
      const symbol: string = (r?.symbol || r?.underlyingAsset?.symbol || '').toUpperCase()
      return symbol === 'USDC' || symbol === 'USDC.E'
    })

    if (!usdc) return null

    const raw = usdc?.liquidityRate ?? usdc?.supplyAPY ?? usdc?.depositAPY
    if (typeof raw !== 'number') return null

    // Aave returns as ray (1e27) if from on-chain, or as decimal/% from API
    const apy = raw > 1e20
      ? (raw / 1e27) * 100                // ray → %
      : raw > 1
        ? raw                              // already %
        : raw * 100                        // decimal → %

    return apy > 0 && apy <= 30 ? Number(apy.toFixed(2)) : null
  } catch {
    return null
  }
}

// ── Blended Rate Calculator ───────────────────────────────────────────────────

function computeBlended(rates: Record<keyof typeof ALLOCATIONS, number>): number {
  return Object.entries(ALLOCATIONS).reduce((sum, [key, weight]) => {
    return sum + (rates[key as keyof typeof ALLOCATIONS] ?? 0) * weight
  }, 0)
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // Check module-level cache first
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    return NextResponse.json({ ...cached, cacheHit: true }, {
      headers: {
        'cache-control': `public, max-age=${EPOCH_MS / 1000}, stale-while-revalidate=60`,
        'x-gr-cache': 'hit',
        'x-gr-epoch-ms': String(EPOCH_MS),
        'access-control-allow-origin': '*',
      }
    })
  }

  // Fetch all strategy rates in parallel
  const [pendleRaw, gearboxRaw, aaveRaw] = await Promise.all([
    fetchPendleRate(),
    fetchGearboxRate(),
    fetchAaveRate(),
  ])

  const pendleApy  = pendleRaw  ?? FALLBACK_RATES.pendle
  const gearboxApy = gearboxRaw ?? FALLBACK_RATES.gearbox
  const aaveApy    = aaveRaw    ?? FALLBACK_RATES.aave
  const tbillApy   = FALLBACK_RATES.tbill  // static — no live API needed

  const liveCount = [pendleRaw, gearboxRaw, aaveRaw].filter(v => v !== null).length
  const dataSource: RatesPayload['dataSource'] =
    liveCount === 3 ? 'live' : liveCount > 0 ? 'partial' : 'fallback'

  const rates = { pendle: pendleApy, gearbox: gearboxApy, aave: aaveApy, tbill: tbillApy }
  const blendedApy = Number(computeBlended(rates).toFixed(2))

  const strategies: StrategyRate[] = [
    { name: 'Pendle PT-USDC',  protocol: 'pendle',  apy: pendleApy,  allocation: ALLOCATIONS.pendle,  source: pendleRaw  !== null ? 'live' : 'fallback' },
    { name: 'Gearbox USDC',    protocol: 'gearbox', apy: gearboxApy, allocation: ALLOCATIONS.gearbox, source: gearboxRaw !== null ? 'live' : 'fallback' },
    { name: 'Aave v3 USDC',    protocol: 'aave',    apy: aaveApy,    allocation: ALLOCATIONS.aave,    source: aaveRaw    !== null ? 'live' : 'fallback' },
    { name: 'T-bill Wrapper',  protocol: 'tbill',   apy: tbillApy,   allocation: ALLOCATIONS.tbill,   source: 'fallback' },
  ]

  const payload: RatesPayload = {
    strategies,
    blendedApy,
    genesisSpread: Number(Math.max(0, blendedApy - INVESTOR_PREFERRED).toFixed(2)),
    investorPreferred: INVESTOR_PREFERRED,
    allocationModel: 'optimized-v1',
    dataSource,
    lastUpdated: new Date().toISOString(),
    cacheHit: false,
  }

  cache.set(CACHE_KEY, payload, EPOCH_MS)

  return NextResponse.json(payload, {
    headers: {
      'cache-control': `public, max-age=${EPOCH_MS / 1000}, stale-while-revalidate=60`,
      'x-gr-cache': 'miss',
      'x-gr-data-source': dataSource,
      'x-gr-epoch-ms': String(EPOCH_MS),
      'access-control-allow-origin': '*',
    }
  })
}
