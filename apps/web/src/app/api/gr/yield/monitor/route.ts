import { NextResponse } from 'next/server'
import {
    deframeGet,
    getRuleRejectionReason,
    getFallbackStrategies,
    isDeframeConfigured,
    normalizeDeframeStrategy,
    readJsonSafe,
    selectTopStrategiesForIntentWithDiagnostics,
    type VaultIntentTier,
    type VaultStrategySummary,
} from '../../_lib/deframe'
import { createRateLimiter, createTtlCache, getRequestIp } from '../../_lib/request-controls'

export const dynamic = 'force-dynamic'
import { enrichPendleMaturity } from '../../_lib/protocols/pendle'
import { fetchLiveProtocolStrategies } from '../../_lib/protocols/liveProtocols'
import type {
    YieldMonitorAlert,
    YieldMonitorAlertReason,
    YieldMonitorPausedWatchlistItem,
    YieldMonitorResponse,
} from '../../../../../lib/bff.types'

const monitorRateLimiter = createRateLimiter(30, 60_000)
const monitorCache = createTtlCache<YieldMonitorResponse>()
const CACHE_TTL_MS = 20_000

// Hard ceiling for APY statistics — values above this are garbage incentive-pool data
// (e.g. 297,995% appearing from miscalculated DeFiLlama pools). Legitimate Accelerate
// strategies cap at ~50%; 200% gives generous headroom without poisoning the ranges.
const APY_STATS_HARD_CAP = 200

function parseApyPct(value: string): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0
    const clamped = Math.min(1, Math.max(0, p))
    const idx = Math.floor((sortedValues.length - 1) * clamped)
    return sortedValues[idx]
}

function rangeFromStrategies(strategies: VaultStrategySummary[]) {
    // count includes ALL positive-APY strategies for the "active" badge
    const allPositive = strategies
        .map((strategy) => parseApyPct(strategy.netApyPct))
        .filter((apy) => apy > 0)

    // percentile statistics are computed only on sane values to suppress outlier garbage
    const apys = allPositive
        .filter((apy) => apy <= APY_STATS_HARD_CAP)
        .sort((a, b) => a - b)

    return {
        minApyPct: apys.length > 0 ? apys[0] : 0,
        p50ApyPct: percentile(apys, 0.5),
        p75ApyPct: percentile(apys, 0.75),
        p90ApyPct: percentile(apys, 0.9),
        maxApyPct: apys.length > 0 ? apys[apys.length - 1] : 0,
        count: allPositive.length,
    }
}

function computeAlerts(
    promotableByTier: Record<VaultIntentTier, VaultStrategySummary[]>
): YieldMonitorAlert[] {
    const byStrategyId = new Map<string, YieldMonitorAlert>()
    const reason: YieldMonitorAlertReason = 'promotable_now'

    for (const tier of ['preserve', 'grow', 'accelerate'] as VaultIntentTier[]) {
        for (const strategy of promotableByTier[tier]) {
            const existing = byStrategyId.get(strategy.strategyId)
            if (existing) {
                if (!existing.promotableTiers.includes(tier)) {
                    existing.promotableTiers.push(tier)
                }
                continue
            }

            byStrategyId.set(strategy.strategyId, {
                strategyId: strategy.strategyId,
                label: strategy.label,
                protocol: strategy.protocol,
                chain: strategy.chain,
                netApyPct: strategy.netApyPct,
                promotableTiers: [tier],
                reason,
                poolUrl: strategy.poolUrl,
            })
        }
    }

    return Array.from(byStrategyId.values())
        .sort((a, b) => parseApyPct(b.netApyPct) - parseApyPct(a.netApyPct))
        .slice(0, 30)
}

function reasonForTier(tier: VaultIntentTier, strategy: VaultStrategySummary): string | null {
    const stageRules: Record<VaultIntentTier, Array<{ allowedRisks: Array<'low' | 'medium' | 'high'>; minApyPct?: number; maxApyPct?: number; allowedLiquidity: Array<'instant' | 'same_day' | 'scheduled'>; maxFeeBps: number }>> = {
        preserve: [
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
        grow: [
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
        accelerate: [
            {
                allowedRisks: ['medium', 'high'],
                minApyPct: Number(process.env.DEFRAME_ACCELERATE_STAGE1_MIN_APY_PCT || '4'),
                maxApyPct: 35,
                allowedLiquidity: (process.env.DEFRAME_ACCELERATE_STAGE1_INCLUDE_INSTANT || 'true').toLowerCase() === 'true'
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
    }

    const rules = stageRules[tier]
    const stageOneReason = getRuleRejectionReason(strategy, rules[0] as never)
    if (!stageOneReason) return null
    const stageTwoReason = getRuleRejectionReason(strategy, rules[1] as never)
    return stageTwoReason
}

function buildPausedWatchlist(pausedCandidates: VaultStrategySummary[]): YieldMonitorPausedWatchlistItem[] {
    const items = pausedCandidates.map((strategy) => {
        const blockedReasonsByTier: Partial<Record<VaultIntentTier, string>> = {}
        const promotableTiers: VaultIntentTier[] = []

        for (const tier of ['preserve', 'grow', 'accelerate'] as VaultIntentTier[]) {
            const reason = reasonForTier(tier, strategy)
            if (!reason) {
                promotableTiers.push(tier)
            } else {
                blockedReasonsByTier[tier] = reason
            }
        }

        return {
            strategy,
            currentApyPct: parseApyPct(strategy.netApyPct),
            bestEligibleTier: promotableTiers[0] ?? null,
            promotableTiers,
            blockedReasonsByTier,
        }
    })

    return items
        .sort((a, b) => b.currentApyPct - a.currentApyPct)
        .slice(0, 40)
}

export async function GET(request: Request) {
    try {
        return await getYieldMonitor(request)
    } catch (err) {
        console.error('[yield/monitor] Unhandled error:', err)
        return NextResponse.json(
            { error: 'internal_error', detail: 'Yield monitor temporarily unavailable.' },
            { status: 500 }
        )
    }
}

async function getYieldMonitor(request: Request) {
    const requesterIp = getRequestIp(request)
    if (monitorRateLimiter.isLimited(requesterIp)) {
        return NextResponse.json(
            { error: 'rate_limited', detail: 'Too many yield monitor requests. Please retry shortly.' },
            { status: 429 }
        )
    }

    const cached = monitorCache.get('global')
    if (cached) {
        return NextResponse.json(cached, {
            headers: {
                'cache-control': 'private, max-age=20',
                'x-rpc-cache': 'hit',
            },
        })
    }

    let normalized: VaultStrategySummary[] = []
    let pagesFetched = 0
    let source: 'deframe' | 'fallback' = 'fallback'

    // Fetch live protocol strategies in parallel with the primary source
    const liveProtocolsPromise = fetchLiveProtocolStrategies()

    if (!isDeframeConfigured()) {
        normalized = getFallbackStrategies()
    } else {
        source = 'deframe'
        const rawStrategies: Record<string, unknown>[] = []
        const maxPages = Number(process.env.DEFRAME_MONITOR_MAX_PAGES || '10')

        for (let page = 1; page <= maxPages; page += 1) {
            const qs = new URLSearchParams({ page: String(page), limit: '100' })
            const upstream = await deframeGet('/strategies', qs)
            const payload = await readJsonSafe(upstream)

            if (!upstream.ok) {
                return NextResponse.json(
                    {
                        error: 'yield_monitor_fetch_failed',
                        detail: payload,
                    },
                    { status: upstream.status }
                )
            }

            const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).data : []
            const pageItems = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
            if (pageItems.length === 0) break
            rawStrategies.push(...pageItems)
            pagesFetched += 1
            if (pageItems.length < 100) break
        }

        normalized = rawStrategies.map((entry) => normalizeDeframeStrategy(entry))
    }

    // Merge live protocol strategies (dedup by strategyId)
    const liveProtocols = await liveProtocolsPromise
    const existingIds = new Set(normalized.map((s) => s.strategyId))
    normalized = [...normalized, ...liveProtocols.filter((s) => !existingIds.has(s.strategyId))]
    await enrichPendleMaturity(normalized)

    const positiveApy = normalized.filter((strategy) => parseApyPct(strategy.netApyPct) > 0)
    const activeLendable = positiveApy.filter(
        (strategy) => !strategy.paused && strategy.availableActions.includes('lend')
    )
    const pausedPositiveApy = positiveApy.filter((strategy) => strategy.paused)

    const global = rangeFromStrategies(positiveApy)

    const byChainMap = new Map<string, VaultStrategySummary[]>()
    for (const strategy of activeLendable) {
        const existing = byChainMap.get(strategy.chain) ?? []
        existing.push(strategy)
        byChainMap.set(strategy.chain, existing)
    }

    const rangesByChain = Array.from(byChainMap.entries())
        .map(([chain, strategies]) => {
            const range = rangeFromStrategies(strategies)
            return {
                chain,
                count: range.count,
                minApyPct: range.minApyPct,
                p50ApyPct: range.p50ApyPct,
                p75ApyPct: range.p75ApyPct,
                p90ApyPct: range.p90ApyPct,
                maxApyPct: range.maxApyPct,
            }
        })
        .sort((a, b) => b.maxApyPct - a.maxApyPct)

    const allChains = Array.from(new Set(activeLendable.map((strategy) => strategy.chain)))
    const promotableByTier: Record<VaultIntentTier, VaultStrategySummary[]> = {
        preserve: [],
        grow: [],
        accelerate: [],
    }

    for (const tier of ['preserve', 'grow', 'accelerate'] as VaultIntentTier[]) {
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics(tier, activeLendable, {
            limit: Math.max(activeLendable.length, 12),
            chainScope: allChains,
        })
        promotableByTier[tier] = ranked
    }

    const alerts = computeAlerts(promotableByTier)

    const distinctPromotableIds = new Set(alerts.map((alert) => alert.strategyId))

    const topPromotable = alerts
        .slice(0, 12)
        .map((alert) => activeLendable.find((strategy) => strategy.strategyId === alert.strategyId))
        .filter((strategy): strategy is VaultStrategySummary => Boolean(strategy))

    const pausedWatchlistItems = buildPausedWatchlist(pausedPositiveApy)
    const pausedPromotableNow = pausedWatchlistItems.filter((item) => item.promotableTiers.length > 0).length

    const response: YieldMonitorResponse = {
        globalRange: {
            minApyPct: global.minApyPct,
            p50ApyPct: global.p50ApyPct,
            p75ApyPct: global.p75ApyPct,
            p90ApyPct: global.p90ApyPct,
            maxApyPct: global.maxApyPct,
            totalPositiveApy: global.count,
            activeLendableCount: activeLendable.length,
        },
        rangesByChain,
        promotableSummary: {
            preserve: promotableByTier.preserve.length,
            grow: promotableByTier.grow.length,
            accelerate: promotableByTier.accelerate.length,
            totalDistinct: distinctPromotableIds.size,
        },
        alerts,
        topPromotable,
        pausedWatchlist: {
            summary: {
                totalPausedPositiveApy: pausedPositiveApy.length,
                promotableNow: pausedPromotableNow,
            },
            items: pausedWatchlistItems,
        },
        meta: {
            fetchedAt: new Date().toISOString(),
            source,
            pagesFetched,
            fetchedCandidates: normalized.length,
        },
    }

    monitorCache.set('global', response, CACHE_TTL_MS)

    return NextResponse.json(response, {
        headers: {
            'cache-control': 'private, max-age=20',
            'x-rpc-cache': 'miss',
        },
    })
}
