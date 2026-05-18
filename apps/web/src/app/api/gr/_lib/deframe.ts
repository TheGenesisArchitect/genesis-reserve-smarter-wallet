import { NextResponse } from 'next/server'

const deframeBaseUrl = process.env.DEFRAME_BASE_URL || 'https://api.deframe.io'
const deframeApiKey = process.env.DEFRAME_API_KEY || ''

export type VaultRiskLevel = 'low' | 'medium' | 'high'
export type VaultLiquidityWindow = 'instant' | 'same_day' | 'scheduled'
export type VaultIntentTier = 'preserve' | 'grow' | 'accelerate'

export interface PendleMaturityInfo {
    expiryDate: string
    daysUntilExpiry: number
    yieldLockWarning: boolean
}

export type SuppressionReason = 'apy_ceiling' | 'accreditation_required' | 'maturity_too_near'

export interface StrategySuppressionMetadata {
    reason: SuppressionReason
    details?: string
}

export interface VaultStrategySummary {
    strategyId: string
    label: string
    protocol: string
    chain: string
    chainId: number
    netApyPct: string
    avgApyPct?: string
    inceptionApyPct?: string
    riskLevel: VaultRiskLevel
    liquidityWindow: VaultLiquidityWindow
    feeBps: number
    paused: boolean
    availableActions: Array<'lend' | 'withdraw'>
    pendleMaturity?: PendleMaturityInfo
    suppression?: StrategySuppressionMetadata
    accreditationRequired?: boolean
    poolUrl?: string
}

type StageRule = {
    allowedRisks: VaultRiskLevel[]
    minApyByRisk?: Partial<Record<VaultRiskLevel, number>>
    minApyPct?: number
    maxApyPct?: number
    allowedLiquidity: VaultLiquidityWindow[]
    maxFeeBps: number
}

type StageWeights = {
    riskFit: number
    apyFit: number
    liquidity: number
    fee: number
    stability: number
}

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
}

function envBoolean(name: string, fallback: boolean): boolean {
    const raw = process.env[name]
    if (!raw) return fallback
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function envCsv(name: string, fallback: string[]): string[] {
    const raw = process.env[name]
    if (!raw) return fallback
    return raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
}

const ACCELERATE_STAGE1_MIN_APY_PCT = envNumber('DEFRAME_ACCELERATE_STAGE1_MIN_APY_PCT', 4)
const ACCELERATE_STAGE1_LOW_RISK_MIN_APY_PCT = envNumber('DEFRAME_ACCELERATE_STAGE1_LOW_RISK_MIN_APY_PCT', 5)
const ACCELERATE_STAGE1_INCLUDE_INSTANT = envBoolean('DEFRAME_ACCELERATE_STAGE1_INCLUDE_INSTANT', true)
const ACCELERATE_INSTANT_RISK_PROMOTION_ENABLED = envBoolean(
    'DEFRAME_ACCELERATE_INSTANT_RISK_PROMOTION_ENABLED',
    true
)
const ACCELERATE_INSTANT_RISK_PROMOTION_PROTOCOLS = new Set(
    envCsv('DEFRAME_ACCELERATE_INSTANT_RISK_PROMOTION_PROTOCOLS', ['aave', 'sky', 'lido'])
)

// ─── Phase 1: Protocol Controls Configuration ───────────────────────────────

/** Hard global anomaly cap (anything above this is treated as bad market data) */
const GLOBAL_APY_CEILING_PCT = envNumber('DEFRAME_GLOBAL_APY_CEILING_PCT', 50)

/** Protocol-family APY ceilings (capped again by GLOBAL_APY_CEILING_PCT)
 *
 *  Conservative ceilings prevent noisy / erroneous market data from
 *  surfacing implausible strategies to users.  Ceilings are deliberately
 *  set to the realistic top-of-market for each protocol family:
 *
 *  PRESERVE  — Aave 15%, Compound 15%, Spark 10%, Sky 10%, Ondo 8%
 *  GROW      — Morpho 20% (curated vaults), Pendle 25% (PT-sUSDe peaks),
 *              Resolv 20%, Maple 20%, Fluid 18%, Notional 18%, Term 20%
 *  ACCELERATE — Ethena 35% (funding-rate spikes), Gearbox 50% (global cap)
 */
const PROTOCOL_APY_CEILINGS: Record<string, number> = {
    // Preserve protocols
    aave:     envNumber('DEFRAME_APY_CEILING_AAVE_PCT',     15),
    compound: envNumber('DEFRAME_APY_CEILING_COMPOUND_PCT', 15),
    spark:    envNumber('DEFRAME_APY_CEILING_SPARK_PCT',    10),
    sky:      envNumber('DEFRAME_APY_CEILING_SKY_PCT',      10),
    ondo:     envNumber('DEFRAME_APY_CEILING_ONDO_PCT',      8),
    // Grow protocols
    morpho:   envNumber('DEFRAME_APY_CEILING_MORPHO_PCT',   20), // raised: curated vaults hit 15–20%
    pendle:   envNumber('DEFRAME_APY_CEILING_PENDLE_PCT',   25), // raised: PT-sUSDe regularly >20%
    maple:    envNumber('DEFRAME_APY_CEILING_MAPLE_PCT',    20),
    resolv:   envNumber('DEFRAME_APY_CEILING_RESOLV_PCT',   20),
    fluid:    envNumber('DEFRAME_APY_CEILING_FLUID_PCT',    18),
    notional: envNumber('DEFRAME_APY_CEILING_NOTIONAL_PCT', 18),
    term:     envNumber('DEFRAME_APY_CEILING_TERM_PCT',     20),
    // Accelerate protocols
    ethena:   envNumber('DEFRAME_APY_CEILING_ETHENA_PCT',   35), // raised: funding spikes
    gearbox:  envNumber('DEFRAME_APY_CEILING_GEARBOX_PCT',  50), // global cap — high risk
}

function resolveProtocolApyCeiling(protocolRaw: string): { protocolKey?: string; ceiling: number } {
    const protocol = protocolRaw.toLowerCase()
    // Longer / more-specific keys must come first to avoid prefix false-matches
    const matchOrder = [
        'ethena', 'gearbox',
        'pendle', 'maple', 'resolv', 'morpho',
        'notional', 'fluid', 'term',
        'compound', 'spark', 'sky', 'ondo',
        'aave',
    ]

    for (const key of matchOrder) {
        if (protocol.includes(key)) {
            return {
                protocolKey: key,
                ceiling: Math.min(PROTOCOL_APY_CEILINGS[key], GLOBAL_APY_CEILING_PCT),
            }
        }
    }

    return { ceiling: GLOBAL_APY_CEILING_PCT }
}

/** Pendle PT maturity threshold: warn if expiry < N days */
const PENDLE_MATURITY_WARNING_DAYS = 30

/** Maple: requires accreditation */
const MAPLE_ACCREDITATION_REQUIRED = true

export interface VaultIntentPolicy {
    tier: VaultIntentTier
    limit: number
    maxPerProtocol: number
    rules: StageRule[]
    weights: StageWeights
    apyScalePct: number
}

export interface VaultSelectionDiagnostics {
    rejectedCandidates: VaultRejectedCandidate[]
    postChainScopeCount: number
    postEligibilityCount: number
    postCategoryFilterCount: number
    dedupedCount: number
    protocolCount: number
    protocolsTop: string[]
    relaxationLevel: number
    rejectedByReason: Record<string, number>
}

export interface VaultRejectedCandidate {
    strategyId: string
    protocol: string
    chain: string
    netApyPct: string
    riskLevel: VaultRiskLevel
    liquidityWindow: VaultLiquidityWindow
    feeBps: number
    paused: boolean
    availableActions: Array<'lend' | 'withdraw'>
    reason: string
}

const DEFAULT_PROTOCOL_REJECT_REASONS: Record<string, number> = {
    chain_scope: 0,
    action_lend: 0,
    paused: 0,
    invalid_identity: 0,
    invalid_apy: 0,
    risk_mismatch: 0,
    liquidity_mismatch: 0,
    fee_exceeds: 0,
    apy_out_of_band: 0,
}

const VAULT_INTENT_POLICIES: Record<VaultIntentTier, VaultIntentPolicy> = {
    preserve: {
        tier: 'preserve',
        limit: 8,
        maxPerProtocol: 2,
        apyScalePct: 10,
        rules: [
            {
                allowedRisks: ['low'],
                minApyPct: 3.5,
                maxApyPct: 7.5,
                allowedLiquidity: ['instant', 'same_day'],
                maxFeeBps: 30,
            },
            {
                allowedRisks: ['low', 'medium'],
                minApyPct: 3,
                maxApyPct: 9,
                allowedLiquidity: ['instant', 'same_day', 'scheduled'],
                maxFeeBps: 50,
            },
        ],
        weights: {
            riskFit: 0.35,
            liquidity: 0.25,
            apyFit: 0.2,
            fee: 0.15,
            stability: 0.05,
        },
    },
    grow: {
        tier: 'grow',
        limit: 8,
        maxPerProtocol: 2,
        apyScalePct: 18,
        rules: [
            {
                allowedRisks: ['low', 'medium'],
                minApyPct: 6,
                maxApyPct: 14,
                allowedLiquidity: ['instant', 'same_day', 'scheduled'],
                maxFeeBps: 75,
            },
            {
                allowedRisks: ['low', 'medium', 'high'],
                minApyPct: 4,
                maxApyPct: 18,
                allowedLiquidity: ['instant', 'same_day', 'scheduled'],
                maxFeeBps: 120,
            },
        ],
        weights: {
            apyFit: 0.3,
            riskFit: 0.25,
            liquidity: 0.2,
            fee: 0.15,
            stability: 0.1,
        },
    },
    accelerate: {
        tier: 'accelerate',
        limit: 8,
        maxPerProtocol: 2,
        apyScalePct: 30,
        rules: [
            {
                allowedRisks: ['medium', 'high'],
                minApyByRisk: {
                    low: ACCELERATE_STAGE1_LOW_RISK_MIN_APY_PCT,
                },
                minApyPct: ACCELERATE_STAGE1_MIN_APY_PCT,
                maxApyPct: 35,
                allowedLiquidity: ACCELERATE_STAGE1_INCLUDE_INSTANT
                    ? ['instant', 'same_day', 'scheduled']
                    : ['same_day', 'scheduled'],
                maxFeeBps: 150,
            },
            {
                allowedRisks: ['low', 'medium', 'high'],
                minApyPct: 4,
                maxApyPct: 150,
                allowedLiquidity: ['instant', 'same_day', 'scheduled'],
                maxFeeBps: 200,
            },
        ],
        weights: {
            apyFit: 0.4,
            riskFit: 0.25,
            liquidity: 0.1,
            fee: 0.1,
            stability: 0.15,
        },
    },
}

// Fallback strategies — shown only when BOTH DeFrame AND live protocol APIs
// are unavailable.  Values represent conservative mid-range estimates for
// each protocol family.  Live DeFiLlama / Superform data always takes
// precedence when reachable.
//
// Tier annotations:
//   [P] = Preserve   [G] = Grow   [A] = Accelerate
const FALLBACK_STRATEGIES: VaultStrategySummary[] = [
    // ── Preserve ──────────────────────────────────────────────────────────
    {
        strategyId: 'fallback-aave-usdc-arbitrum',
        label: 'Aave V3 USDC (arbitrum)',
        protocol: 'Aave',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '5.20',
        avgApyPct: '4.90',
        inceptionApyPct: '5.10',
        riskLevel: 'low',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.aave.com/',
    },
    {
        strategyId: 'fallback-aave-usdc-base',
        label: 'Aave V3 USDC (base)',
        protocol: 'Aave',
        chain: 'base',
        chainId: 8453,
        netApyPct: '4.80',
        avgApyPct: '4.60',
        inceptionApyPct: '4.70',
        riskLevel: 'low',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.aave.com/',
    },
    {
        strategyId: 'fallback-compound-usdc-arbitrum',
        label: 'Compound V3 USDC (arbitrum)',
        protocol: 'Compound V3',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '5.60',
        avgApyPct: '5.30',
        inceptionApyPct: '5.40',
        riskLevel: 'low',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.compound.finance/',
    },
    {
        strategyId: 'fallback-spark-usdc-ethereum',
        label: 'Spark USDC (ethereum)',
        protocol: 'Spark',
        chain: 'ethereum',
        chainId: 1,
        netApyPct: '5.00',
        avgApyPct: '4.85',
        inceptionApyPct: '4.95',
        riskLevel: 'low',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.spark.fi/',
    },
    {
        strategyId: 'fallback-sky-usds-ethereum',
        label: 'Sky USDS Savings (ethereum)',
        protocol: 'Sky',
        chain: 'ethereum',
        chainId: 1,
        netApyPct: '4.75',
        avgApyPct: '4.60',
        inceptionApyPct: '4.70',
        riskLevel: 'low',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.sky.money/',
    },
    {
        strategyId: 'fallback-ondo-ousg-ethereum',
        label: 'Ondo OUSG T-Bill (ethereum)',
        protocol: 'Ondo Finance',
        chain: 'ethereum',
        chainId: 1,
        netApyPct: '5.10',
        avgApyPct: '5.05',
        inceptionApyPct: '5.08',
        riskLevel: 'low',
        liquidityWindow: 'scheduled',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.ondo.finance/',
    },

    // ── Grow ──────────────────────────────────────────────────────────────
    {
        strategyId: 'fallback-morpho-usdc-base',
        label: 'Morpho Gauntlet USDC (base)',
        protocol: 'Morpho',
        chain: 'base',
        chainId: 8453,
        netApyPct: '9.40',
        avgApyPct: '8.80',
        inceptionApyPct: '8.50',
        riskLevel: 'medium',
        liquidityWindow: 'same_day',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.morpho.org/',
    },
    {
        strategyId: 'fallback-pendle-pt-susde-arbitrum',
        label: 'Pendle PT sUSDe (arbitrum)',
        protocol: 'Pendle',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '14.20',
        avgApyPct: '13.50',
        inceptionApyPct: '12.80',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.pendle.finance/trade/pools',
    },
    {
        strategyId: 'fallback-pendle-pt-usdc-arbitrum',
        label: 'Pendle PT USDC (arbitrum)',
        protocol: 'Pendle',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '9.20',
        avgApyPct: '8.90',
        inceptionApyPct: '8.60',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.pendle.finance/trade/pools',
    },
    {
        strategyId: 'fallback-fluid-usdc-arbitrum',
        label: 'Fluid USDC (arbitrum)',
        protocol: 'Fluid',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '8.50',
        avgApyPct: '8.10',
        inceptionApyPct: '7.90',
        riskLevel: 'medium',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://fluid.instadapp.io/',
    },
    {
        strategyId: 'fallback-resolv-usr-arbitrum',
        label: 'Resolv USR (arbitrum)',
        protocol: 'Resolv',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '9.50',
        avgApyPct: '9.10',
        inceptionApyPct: '8.80',
        riskLevel: 'medium',
        liquidityWindow: 'same_day',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://resolv.xyz/app',
    },
    {
        strategyId: 'fallback-maple-usdc-cash-arbitrum',
        label: 'Maple USDC Cash (arbitrum)',
        protocol: 'Maple',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '11.20',
        avgApyPct: '10.80',
        inceptionApyPct: '10.50',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        accreditationRequired: true,
        poolUrl: 'https://app.maple.finance/',
    },
    {
        strategyId: 'fallback-notional-usdc-arbitrum',
        label: 'Notional Fixed-Rate USDC (arbitrum)',
        protocol: 'Notional',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '10.50',
        avgApyPct: '10.20',
        inceptionApyPct: '9.80',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://notional.finance/',
    },
    {
        strategyId: 'fallback-term-usdc-arbitrum',
        label: 'Term Finance USDC (arbitrum)',
        protocol: 'Term Finance',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '12.80',
        avgApyPct: '12.20',
        inceptionApyPct: '11.80',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://www.termfinance.io/',
    },

    // ── Accelerate ────────────────────────────────────────────────────────
    {
        strategyId: 'fallback-ethena-susde-arbitrum',
        label: 'Ethena sUSDe (arbitrum)',
        protocol: 'Ethena',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '15.80',
        avgApyPct: '14.20',
        inceptionApyPct: '12.60',
        riskLevel: 'high',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.ethena.fi/',
    },
    {
        strategyId: 'fallback-gearbox-usdc-arbitrum',
        label: 'Gearbox V3 USDC Farming (arbitrum)',
        protocol: 'Gearbox',
        chain: 'arbitrum',
        chainId: 42161,
        netApyPct: '20.53',
        avgApyPct: '18.40',
        inceptionApyPct: '16.80',
        riskLevel: 'high',
        liquidityWindow: 'instant',
        feeBps: 0,
        paused: false,
        availableActions: ['lend', 'withdraw'],
        poolUrl: 'https://app.gearbox.fi/pools',
    },
]

export function isDeframeConfigured() {
    return Boolean(deframeApiKey)
}

export function deframeNotConfiguredResponse() {
    return NextResponse.json(
        {
            error: 'deframe_not_configured',
            detail: 'Set DEFRAME_API_KEY to enable live strategy and wallet tracking data.',
        },
        { status: 500 }
    )
}

export function getFallbackStrategies() {
    return FALLBACK_STRATEGIES
}

export function getFallbackStrategy(strategyId: string) {
    return FALLBACK_STRATEGIES.find((s) => s.strategyId.toLowerCase() === strategyId.toLowerCase())
}

export function mapIntentRecommendation(intentTier: string, strategies: VaultStrategySummary[]) {
    const ordered = [...strategies]

    if (intentTier === 'preserve') {
        return ordered.find((s) => s.riskLevel === 'low') ?? ordered[0]
    }

    if (intentTier === 'accelerate') {
        return ordered[0]
    }

    return ordered.find((s) => s.riskLevel === 'medium') ?? ordered[0]
}

function parseApyPct(value: string): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function incrementReason(rejectedByReason: Record<string, number>, reason: string) {
    rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1
}

function strategyIdentityKey(strategy: VaultStrategySummary): string {
    return strategy.strategyId.trim().toLowerCase()
}

function toRejectedCandidate(strategy: VaultStrategySummary, reason: string): VaultRejectedCandidate {
    return {
        strategyId: strategy.strategyId,
        protocol: strategy.protocol,
        chain: strategy.chain,
        netApyPct: strategy.netApyPct,
        riskLevel: strategy.riskLevel,
        liquidityWindow: strategy.liquidityWindow,
        feeBps: strategy.feeBps,
        paused: strategy.paused,
        availableActions: strategy.availableActions,
        reason,
    }
}

function hasRequiredIdentity(strategy: VaultStrategySummary): boolean {
    return (
        strategy.strategyId.trim().length > 0 &&
        strategy.protocol.trim().length > 0 &&
        strategy.label.trim().length > 0
    )
}

function normalizedFeeScore(feeBps: number, maxFeeBps: number): number {
    if (maxFeeBps <= 0) return 0
    const pct = Math.min(Math.max(feeBps / maxFeeBps, 0), 1)
    return 1 - pct
}

function normalizedApyFit(apyPct: number, minApyPct?: number, maxApyPct?: number): number {
    if (minApyPct === undefined && maxApyPct === undefined) return 1

    if (minApyPct !== undefined && apyPct < minApyPct) {
        const gap = Math.min((minApyPct - apyPct) / Math.max(minApyPct, 1), 1)
        return 1 - gap
    }

    if (maxApyPct !== undefined && apyPct > maxApyPct) {
        const gap = Math.min((apyPct - maxApyPct) / Math.max(maxApyPct, 1), 1)
        return 1 - gap
    }

    return 1
}

function normalizedStabilityScore(strategy: VaultStrategySummary): number {
    const net = parseApyPct(strategy.netApyPct)
    if (net <= 0) return 0

    // avgApyPct  = 30-day rolling mean APY   (set by liveProtocols.ts from DeFiLlama apyMean30d)
    // inceptionApyPct = organic base APY    (set by liveProtocols.ts from DeFiLlama apyBase)
    //
    // Two orthogonal stability signals:
    //  1. Mean-reversion risk: large gap between current APY and 30-day mean
    //     → today's rate may be a temporary spike that will revert
    //  2. Incentive-dependency risk: large gap between current APY and base APY
    //     → most of the yield comes from token incentives that can vanish
    //
    // Each signal independently reduces the stability score.  Strategies
    // where BOTH signals are adverse (spiking incentive yields) score near 0.

    const mean30d   = strategy.avgApyPct       ? parseApyPct(strategy.avgApyPct)       : null
    const baseApy   = strategy.inceptionApyPct ? parseApyPct(strategy.inceptionApyPct) : null

    if (mean30d === null && baseApy === null) return 0.5 // no data — neutral score

    const deltas: number[] = []

    // Signal 1: current vs 30-day mean (mean-reversion risk)
    if (mean30d !== null && mean30d > 0) {
        deltas.push(Math.abs(mean30d - net) / net)
    }

    // Signal 2: current vs base APY (incentive-dependency risk)
    // Weight this more heavily: incentive rewards can disappear overnight.
    if (baseApy !== null && baseApy > 0) {
        const incentiveDelta = Math.abs(baseApy - net) / net
        deltas.push(incentiveDelta * 1.4) // 40% extra weight vs mean-reversion
    }

    const meanDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length
    return Math.max(0, Math.min(1, 1 - meanDelta * 2.5))
}

function riskFitScore(tier: VaultIntentTier, risk: VaultRiskLevel): number {
    if (tier === 'preserve') {
        if (risk === 'low') return 1
        if (risk === 'medium') return 0.5
        return 0.1
    }

    if (tier === 'accelerate') {
        if (risk === 'high') return 1
        if (risk === 'medium') return 0.82
        return 0.6
    }

    if (risk === 'medium') return 1
    if (risk === 'low') return 0.8
    return 0.7
}

function liquidityFitScore(tier: VaultIntentTier, liquidity: VaultLiquidityWindow): number {
    if (tier === 'preserve') {
        if (liquidity === 'instant') return 1
        if (liquidity === 'same_day') return 0.8
        return 0.3
    }

    if (tier === 'accelerate') {
        if (liquidity === 'scheduled') return 1
        if (liquidity === 'same_day') return 0.85
        return 0.6
    }

    if (liquidity === 'same_day') return 1
    if (liquidity === 'instant') return 0.9
    return 0.8
}

function effectiveRiskLevelForSelection(
    strategy: VaultStrategySummary,
    tier: VaultIntentTier
): VaultRiskLevel {
    if (tier !== 'accelerate') return strategy.riskLevel
    if (!ACCELERATE_INSTANT_RISK_PROMOTION_ENABLED) return strategy.riskLevel
    if (strategy.riskLevel !== 'low' || strategy.liquidityWindow !== 'instant') return strategy.riskLevel

    const protocol = strategy.protocol.toLowerCase()
    const shouldPromote = Array.from(ACCELERATE_INSTANT_RISK_PROMOTION_PROTOCOLS).some((token) =>
        protocol.includes(token)
    )

    if (!shouldPromote) return strategy.riskLevel
    return 'medium'
}

function buildScore(
    strategy: VaultStrategySummary,
    policy: VaultIntentPolicy,
    rule: StageRule
): number {
    const apyPct = parseApyPct(strategy.netApyPct)
    const apyFit = normalizedApyFit(apyPct, rule.minApyPct, rule.maxApyPct)
    const netApyScore = Math.min(apyPct / Math.max(policy.apyScalePct, 1), 1)
    const apyComponent = Math.min(1, apyFit * 0.75 + netApyScore * 0.25)

    const effectiveRisk = effectiveRiskLevelForSelection(strategy, policy.tier)
    const riskComponent = riskFitScore(policy.tier, effectiveRisk)
    const liquidityComponent = liquidityFitScore(policy.tier, strategy.liquidityWindow)
    const feeComponent = normalizedFeeScore(strategy.feeBps, rule.maxFeeBps)
    const stabilityComponent = normalizedStabilityScore(strategy)

    return (
        policy.weights.riskFit * riskComponent +
        policy.weights.apyFit * apyComponent +
        policy.weights.liquidity * liquidityComponent +
        policy.weights.fee * feeComponent +
        policy.weights.stability * stabilityComponent
    )
}

export function getRuleRejectionReason(
    strategy: VaultStrategySummary,
    rule: StageRule,
    options?: { effectiveRiskLevel?: VaultRiskLevel }
): string | null {
    const apyPct = parseApyPct(strategy.netApyPct)
    const effectiveRiskLevel = options?.effectiveRiskLevel ?? strategy.riskLevel
    const riskSpecificMinApy = rule.minApyByRisk?.[effectiveRiskLevel]

    if (!rule.allowedRisks.includes(effectiveRiskLevel)) {
        if (riskSpecificMinApy === undefined) {
            return 'risk_mismatch'
        }

        if (apyPct < riskSpecificMinApy) {
            return 'apy_out_of_band'
        }
    }

    if (!rule.allowedLiquidity.includes(strategy.liquidityWindow)) {
        return 'liquidity_mismatch'
    }

    if (strategy.feeBps > rule.maxFeeBps) {
        return 'fee_exceeds'
    }

    const effectiveMinApy = Math.max(rule.minApyPct ?? 0, riskSpecificMinApy ?? 0)

    if (apyPct < effectiveMinApy) {
        return 'apy_out_of_band'
    }

    if (rule.maxApyPct !== undefined && apyPct > rule.maxApyPct) {
        return 'apy_out_of_band'
    }

    return null
}

function applyDiversityCap(
    entries: Array<{ strategy: VaultStrategySummary; score: number; apyPct: number }>,
    maxPerProtocol: number,
    limit: number
): VaultStrategySummary[] {
    const selected: VaultStrategySummary[] = []
    const perProtocol = new Map<string, number>()

    for (const entry of entries) {
        if (selected.length >= limit) break
        const protocol = entry.strategy.protocol.toLowerCase()
        const count = perProtocol.get(protocol) ?? 0
        if (count >= maxPerProtocol) continue
        selected.push(entry.strategy)
        perProtocol.set(protocol, count + 1)
    }

    if (selected.length < limit) {
        const already = new Set(selected.map((s) => s.strategyId.toLowerCase()))
        for (const entry of entries) {
            if (selected.length >= limit) break
            if (already.has(entry.strategy.strategyId.toLowerCase())) continue
            selected.push(entry.strategy)
        }
    }

    return selected
}

// ─── Phase 1: Protocol Control Functions ─────────────────────────────────

/**
 * Apply Pendle maturity normalization and yield-lock warning.
 * Mock implementation: In production, fetch actual expiry from Pendle API.
 */
function applyPendleMaturityNormalization(strategy: VaultStrategySummary): void {
    const protocol = strategy.protocol.toLowerCase()
    if (protocol !== 'pendle') return

    // If enrichPendleMaturity() already set real data, only evaluate suppression
    if (strategy.pendleMaturity) {
        if (strategy.pendleMaturity.yieldLockWarning && !strategy.suppression) {
            strategy.suppression = {
                reason: 'maturity_too_near',
                details: `Pendle PT expires in ${strategy.pendleMaturity.daysUntilExpiry} days. Fixed-yield lock imminent.`,
            }
        }
        return
    }

    // Fallback: 90-day estimate — keeps fallback strategies out of suppression
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 90)
    const daysUntilExpiry = 90
    const yieldLockWarning = daysUntilExpiry < PENDLE_MATURITY_WARNING_DAYS // false

    strategy.pendleMaturity = {
        expiryDate: expiryDate.toISOString().split('T')[0],
        daysUntilExpiry,
        yieldLockWarning,
    }

    if (yieldLockWarning && !strategy.suppression) {
        strategy.suppression = {
            reason: 'maturity_too_near',
            details: `Pendle PT expires in ${daysUntilExpiry} days. Fixed-yield lock imminent.`,
        }
    }
}

/**
 * Apply APY ceiling suppression per protocol.
 * Strategies exceeding protocol APY ceiling are suppressed from recommendations.
 */
function applyApyCeilingSuppressioncheck(strategy: VaultStrategySummary): void {
    const protocol = strategy.protocol.toLowerCase()
    const { protocolKey, ceiling } = resolveProtocolApyCeiling(protocol)

    const apy = parseApyPct(strategy.netApyPct)
    if (apy <= ceiling) return // Within bounds

    const thresholdLabel = protocolKey ? `${protocolKey} ceiling of ${ceiling}%` : `global ceiling of ${ceiling}%`

    strategy.suppression = {
        reason: 'apy_ceiling',
        details: `APY ${apy.toFixed(2)}% exceeds ${thresholdLabel}`,
    }
}

/**
 * Apply Maple accreditation requirement metadata.
 * Tags accreditationRequired AND marks the strategy as suppressed so it is excluded
 * from ranked/promotable outputs until the user's accreditation status is verified.
 */
function applyMapleAccreditationMetadata(strategy: VaultStrategySummary): void {
    const protocol = strategy.protocol.toLowerCase()
    if (protocol !== 'maple' || !MAPLE_ACCREDITATION_REQUIRED) return

    strategy.accreditationRequired = true

    // Only suppress if not already suppressed by a higher-priority reason
    if (!strategy.suppression) {
        strategy.suppression = {
            reason: 'accreditation_required',
            details: 'Maple pools require verified accredited investor status.',
        }
    }
}

/**
 * Normalize strategy with all Phase 1 protocol controls.
 */
function normalizeWithProtocolControls(strategy: VaultStrategySummary): void {
    applyPendleMaturityNormalization(strategy)
    applyApyCeilingSuppressioncheck(strategy)
    applyMapleAccreditationMetadata(strategy)
}

export function dedupeStrategies(strategies: VaultStrategySummary[]): VaultStrategySummary[] {
    const byKey = new Map<string, VaultStrategySummary>()

    for (const strategy of strategies) {
        // Apply protocol controls before deduping
        normalizeWithProtocolControls(strategy)

        const key = strategyIdentityKey(strategy)
        const existing = byKey.get(key)

        if (!existing) {
            byKey.set(key, strategy)
            continue
        }

        if (parseApyPct(strategy.netApyPct) > parseApyPct(existing.netApyPct)) {
            byKey.set(key, strategy)
        }
    }

    return Array.from(byKey.values())
}

function getPolicy(intentTier: string): VaultIntentPolicy {
    if (intentTier === 'preserve') return VAULT_INTENT_POLICIES.preserve
    if (intentTier === 'accelerate') return VAULT_INTENT_POLICIES.accelerate
    return VAULT_INTENT_POLICIES.grow
}

export function selectTopStrategiesForIntentWithDiagnostics(
    intentTier: string,
    strategies: VaultStrategySummary[],
    options?: { limit?: number; chainScope?: string[] }
): { ranked: VaultStrategySummary[]; diagnostics: VaultSelectionDiagnostics } {
    const policy = getPolicy(intentTier)
    const limit = options?.limit ?? policy.limit
    const chainScope = options?.chainScope?.map((s) => s.toLowerCase())
    const rejectedByReason: Record<string, number> = { ...DEFAULT_PROTOCOL_REJECT_REASONS }
    const rejectedCandidatesByKey = new Map<string, VaultRejectedCandidate>()

    const recordRejected = (strategy: VaultStrategySummary, reason: string) => {
        const key = strategyIdentityKey(strategy)
        const existing = rejectedCandidatesByKey.get(key)
        if (!existing) {
            rejectedCandidatesByKey.set(key, toRejectedCandidate(strategy, reason))
            return
        }

        if (parseApyPct(strategy.netApyPct) > parseApyPct(existing.netApyPct)) {
            rejectedCandidatesByKey.set(key, toRejectedCandidate(strategy, reason))
        }
    }

    const scoped: VaultStrategySummary[] = []
    const eligible: VaultStrategySummary[] = []
    for (const strategy of strategies) {
        if (chainScope && !chainScope.includes(strategy.chain.toLowerCase())) {
            incrementReason(rejectedByReason, 'chain_scope')
            recordRejected(strategy, 'chain_scope')
            continue
        }

        scoped.push(strategy)

        if (!strategy.availableActions.includes('lend')) {
            incrementReason(rejectedByReason, 'action_lend')
            recordRejected(strategy, 'action_lend')
            continue
        }

        if (strategy.paused) {
            incrementReason(rejectedByReason, 'paused')
            recordRejected(strategy, 'paused')
            continue
        }

        if (!hasRequiredIdentity(strategy)) {
            incrementReason(rejectedByReason, 'invalid_identity')
            recordRejected(strategy, 'invalid_identity')
            continue
        }

        if (parseApyPct(strategy.netApyPct) <= 0) {
            incrementReason(rejectedByReason, 'invalid_apy')
            recordRejected(strategy, 'invalid_apy')
            continue
        }

        eligible.push(strategy)
    }

    const deduped = dedupeStrategies(eligible)

    // Phase 1: Filter out suppressed strategies (APY ceiling violations, etc.)
    const suppressed: VaultStrategySummary[] = []
    const nonSuppressed: VaultStrategySummary[] = []
    for (const strategy of deduped) {
        if (strategy.suppression) {
            suppressed.push(strategy)
            incrementReason(rejectedByReason, `suppressed_${strategy.suppression.reason}`)
            recordRejected(strategy, `suppressed: ${strategy.suppression.reason}`)
        } else {
            nonSuppressed.push(strategy)
        }
    }

    let selectedRule: StageRule = policy.rules[policy.rules.length - 1]
    let relaxationLevel = policy.rules.length - 1
    let filtered: VaultStrategySummary[] = []

    for (let i = 0; i < policy.rules.length; i += 1) {
        const rule = policy.rules[i]
        const passing = nonSuppressed.filter((strategy) => {
            const reason = getRuleRejectionReason(strategy, rule, {
                effectiveRiskLevel: effectiveRiskLevelForSelection(strategy, policy.tier),
            })
            if (!reason) return true
            incrementReason(rejectedByReason, reason)
            return false
        })
        if (passing.length >= 3 || i === policy.rules.length - 1) {
            selectedRule = rule
            relaxationLevel = i
            filtered = passing
            break
        }
    }

    const filteredKeys = new Set(filtered.map((strategy) => strategyIdentityKey(strategy)))
    for (const strategy of nonSuppressed) {
        if (filteredKeys.has(strategyIdentityKey(strategy))) continue
        const reason = getRuleRejectionReason(strategy, selectedRule, {
            effectiveRiskLevel: effectiveRiskLevelForSelection(strategy, policy.tier),
        })
        if (reason) recordRejected(strategy, reason)
    }

    const scored = filtered
        .map((strategy) => {
            const apyPct = parseApyPct(strategy.netApyPct)
            const score = buildScore(strategy, policy, selectedRule)
            return { strategy, score, apyPct }
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return b.apyPct - a.apyPct
        })

    const ranked = applyDiversityCap(scored, policy.maxPerProtocol, limit)
    const protocolSet = new Set(ranked.map((s) => s.protocol))
    const rejectedCandidates = Array.from(rejectedCandidatesByKey.values())
        .sort((a, b) => parseApyPct(b.netApyPct) - parseApyPct(a.netApyPct))
        .slice(0, 12)

    return {
        ranked,
        diagnostics: {
            rejectedCandidates,
            postChainScopeCount: scoped.length,
            postEligibilityCount: eligible.length,
            postCategoryFilterCount: filtered.length,
            dedupedCount: deduped.length,
            protocolCount: protocolSet.size,
            protocolsTop: Array.from(protocolSet).slice(0, 8),
            relaxationLevel,
            rejectedByReason,
        },
    }
}

export function selectTopStrategiesForIntent(
    intentTier: string,
    strategies: VaultStrategySummary[],
    limit = 12
): VaultStrategySummary[] {
    return selectTopStrategiesForIntentWithDiagnostics(intentTier, strategies, { limit }).ranked
}

function mapChainIdToLabel(chainId?: number, network?: string): { chain: string; chainId: number } {
    if (chainId === 42161 || network === 'arbitrum') return { chain: 'arbitrum', chainId: 42161 }
    if (chainId === 1 || network === 'ethereum') return { chain: 'ethereum', chainId: 1 }
    return { chain: network || 'unknown', chainId: chainId || 0 }
}

export function inferRisk(protocol: string): VaultRiskLevel {
    const p = protocol.toLowerCase()

    // High risk — leveraged, funding-rate, or LP impermanent-loss exposure
    if (
        p.includes('ethena') ||
        p.includes('gearbox') ||
        p.includes('lp') ||
        (p.includes('balancer') && !p.includes('balancerv3')) ||
        p.includes('curve')
    ) return 'high'

    // BalancerV3 structured lending pools are medium (no IL on single-sided)
    if (p === 'balancerv3') return 'medium'

    // Medium risk — curated lending, fixed-rate, synthetic stablecoins
    if (
        p.includes('morpho')   ||
        p.includes('compound') ||
        p.includes('pendle')   ||
        p.includes('maple')    ||
        p.includes('resolv')   ||
        p.includes('fluid')    ||
        p.includes('notional') ||
        p.includes('term')     ||
        p.includes('superform')
    ) return 'medium'

    // Low risk — blue-chip money markets, T-bills, sovereign-backed savings
    // (aave, spark, sky, ondo, lido, compound-v3 catch via 'compound' above)
    return 'low'
}

export function inferLiquidity(protocol: string): VaultLiquidityWindow {
    const p = protocol.toLowerCase()

    // Scheduled — fixed maturity or lock-up required for full yield
    if (
        p.includes('pendle')   ||
        p.includes('maple')    ||
        p.includes('notional') ||
        p.includes('term')     ||
        p.includes('ondo')
    ) return 'scheduled'

    // Same-day — withdrawable within hours (queued redemption)
    if (
        p.includes('morpho')  ||
        p.includes('resolv')  ||
        p.includes('balancer')  // even V3 liquidity can queue
    ) return 'same_day'

    // Instant — same-block withdraw (Aave, Compound, Spark, Sky, Fluid,
    //           Ethena sUSDe, Gearbox, Superform, Curve base pools)
    return 'instant'
}

export function normalizeDeframeStrategy(strategy: Record<string, unknown>): VaultStrategySummary {
    const strategyId = String(strategy.id || '')
    const protocol = String(strategy.protocol || 'Unknown')
    const network = String(strategy.network || 'unknown').toLowerCase()
    const networkIdRaw = strategy.networkId
    const parsedChainId = typeof networkIdRaw === 'string' ? Number(networkIdRaw) : Number(networkIdRaw || 0)
    const { chain, chainId } = mapChainIdToLabel(parsedChainId, network)

    const apy = Number(strategy.apy || 0)
    const avgApy = Number(strategy.avgApy || 0)
    const inceptionApy = Number(strategy.inceptionApy || 0)
    const feeBps = Number(strategy.fee || 0)
    const paused = Boolean(strategy.paused)

    const actions = Array.isArray(strategy.availableActions)
        ? strategy.availableActions.map((a) => String(a).toLowerCase())
        : []

    return {
        strategyId,
        label: `${protocol} ${String(strategy.assetName || 'Asset')}`,
        protocol,
        chain,
        chainId,
        netApyPct: (apy * 100).toFixed(2),
        avgApyPct: avgApy > 0 ? (avgApy * 100).toFixed(2) : undefined,
        inceptionApyPct: inceptionApy > 0 ? (inceptionApy * 100).toFixed(2) : undefined,
        riskLevel: inferRisk(protocol),
        liquidityWindow: inferLiquidity(protocol),
        feeBps,
        paused,
        availableActions: [
            ...(actions.includes('lend') ? ['lend' as const] : []),
            ...(actions.includes('withdraw') ? ['withdraw' as const] : []),
        ],
    }
}

export async function deframeGet(path: string, query?: URLSearchParams) {
    const qs = query && query.toString().length > 0 ? `?${query.toString()}` : ''
    const url = `${deframeBaseUrl}${path}${qs}`

    try {
        return await fetch(url, {
            method: 'GET',
            headers: {
                'x-api-key': deframeApiKey,
                'content-type': 'application/json',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        })
    } catch (err) {
        // Network error or timeout — return a synthetic 503 so callers can
        // check `upstream.ok` without having to handle a thrown exception.
        const body = JSON.stringify({ error: 'deframe_unreachable', detail: String(err) })
        return new Response(body, {
            status: 503,
            headers: { 'content-type': 'application/json' },
        })
    }
}

export async function readJsonSafe(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch {
        return {}
    }
}
