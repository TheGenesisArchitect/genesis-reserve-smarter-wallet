import { NextResponse } from 'next/server'
import {
    deframeGet,
    getFallbackStrategies,
    isDeframeConfigured,
    mapIntentRecommendation,
    normalizeDeframeStrategy,
    readJsonSafe,
    selectTopStrategiesForIntentWithDiagnostics,
    type VaultStrategySummary,
} from '../../_lib/deframe'
import { enrichPendleMaturity } from '../../_lib/protocols/pendle'
import { fetchLiveProtocolStrategies } from '../../_lib/protocols/liveProtocols'
import { createRateLimiter, createTtlCache, getRequestIp } from '../../_lib/request-controls'

const vaultStrategiesRateLimiter = createRateLimiter(40, 60_000)
const vaultStrategiesCache = createTtlCache<unknown>()
const CACHE_TTL_MS = 15_000
const DEFAULT_CHAIN_SCOPE = ['base', 'polygon', 'gnosis'] as const
const CHAIN_WATCHLIST_ENABLED =
    (process.env.DEFRAME_CHAIN_WATCHLIST_ENABLED || 'true').toLowerCase() === 'true'
const CHAIN_WATCHLIST_MIN_APY_PCT = Number(process.env.DEFRAME_CHAIN_WATCHLIST_MIN_APY_PCT || '4')
const CHAIN_WATCHLIST_MIN_CANDIDATES = Number(process.env.DEFRAME_CHAIN_WATCHLIST_MIN_CANDIDATES || '1')

function parseChainScope(raw: string | null): string[] {
    if (!raw) return [...DEFAULT_CHAIN_SCOPE]
    return Array.from(new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)))
}

function countBy(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const item of items) {
        counts[item] = (counts[item] ?? 0) + 1
    }
    return counts
}

function parseApyPct(value: string): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function buildWatchlistChainCounts(strategies: Array<{ chain: string; netApyPct: string; paused: boolean; availableActions: Array<'lend' | 'withdraw'>; strategyId: string; protocol: string; label: string }>): Record<string, number> {
    const watchlistEligible = strategies.filter((strategy) => {
        if (!strategy.availableActions.includes('lend')) return false
        if (strategy.paused) return false
        if (parseApyPct(strategy.netApyPct) < CHAIN_WATCHLIST_MIN_APY_PCT) return false
        if (strategy.strategyId.trim().length === 0) return false
        if (strategy.protocol.trim().length === 0) return false
        if (strategy.label.trim().length === 0) return false
        return true
    })

    return countBy(watchlistEligible.map((strategy) => strategy.chain))
}

function promotedChainsFromWatchlist(chainScope: string[], chainCounts: Record<string, number>): string[] {
    if (!CHAIN_WATCHLIST_ENABLED) return []
    return Object.entries(chainCounts)
        .filter(([chain, count]) => !chainScope.includes(chain) && count >= CHAIN_WATCHLIST_MIN_CANDIDATES)
        .map(([chain]) => chain)
        .sort()
}

// Protocols we expect DeFrame to supply. Any absent here need a listing request.
const TARGET_PROTOCOLS = ['pendle', 'maple', 'resolv', 'compound', 'superform', 'ethena'] as const

interface ProtocolGapEntry {
    status: 'present' | 'suppressed' | 'absent'
    fetchedCount: number
    suppressedCount: number
    suppressionReasons: string[]
    rankedCount: number
}

function buildSourceUniverseGap(
    normalized: VaultStrategySummary[],
    ranked: VaultStrategySummary[]
): Record<string, ProtocolGapEntry> {
    const gap: Record<string, ProtocolGapEntry> = {}

    for (const key of TARGET_PROTOCOLS) {
        const fetched = normalized.filter((s) => s.protocol.toLowerCase().includes(key))
        const rankedForKey = ranked.filter((s) => s.protocol.toLowerCase().includes(key))
        const suppressed = fetched.filter((s) => s.suppression != null)
        const suppressionReasons = [...new Set(suppressed.map((s) => s.suppression!.reason))]

        let status: ProtocolGapEntry['status']
        if (fetched.length === 0) {
            status = 'absent'
        } else if (rankedForKey.length > 0) {
            status = 'present'
        } else {
            status = 'suppressed'
        }

        gap[key] = {
            status,
            fetchedCount: fetched.length,
            suppressedCount: suppressed.length,
            suppressionReasons,
            rankedCount: rankedForKey.length,
        }
    }

    return gap
}

export async function GET(request: Request) {
    const search = new URL(request.url).searchParams
    const intentTier = (search.get('intentTier') || 'grow').toLowerCase()
    const chainScope = parseChainScope(search.get('chainScope'))
    const requesterIp = getRequestIp(request)
    const cacheKey = `${intentTier}:${[...chainScope].sort().join(',')}`

    if (vaultStrategiesRateLimiter.isLimited(requesterIp)) {
        return NextResponse.json(
            { error: 'rate_limited', detail: 'Too many strategy requests. Please retry shortly.' },
            { status: 429 }
        )
    }

    const cached = vaultStrategiesCache.get(cacheKey)
    if (cached) {
        return NextResponse.json(cached, {
            headers: {
                'cache-control': 'private, max-age=15',
                'x-rpc-cache': 'hit',
            },
        })
    }

    if (!isDeframeConfigured()) {
        const [fallbackAll, liveProtocols] = await Promise.all([
            Promise.resolve(getFallbackStrategies()),
            fetchLiveProtocolStrategies(),
        ])
        // Merge live protocol data over fallback — deduplicated by strategyId
        const fallbackIds = new Set(fallbackAll.map((s) => s.strategyId))
        const mergedAll = [...fallbackAll, ...liveProtocols.filter((s) => !fallbackIds.has(s.strategyId))]
        await enrichPendleMaturity(mergedAll)
        const watchlistChainCounts = buildWatchlistChainCounts(mergedAll)
        const promotedChains = promotedChainsFromWatchlist(chainScope, watchlistChainCounts)
        const effectiveChainScope = Array.from(new Set([...chainScope, ...promotedChains]))

        const fallbackStrategies = mergedAll.filter((s) => effectiveChainScope.includes(s.chain))
        const { ranked: rankedByScoreFallback, diagnostics } = selectTopStrategiesForIntentWithDiagnostics(
            intentTier,
            fallbackStrategies,
            { limit: 6, chainScope: effectiveChainScope }
        )
        // Present strategies highest APY first for a natural user flow
        const rankedFallback = [...rankedByScoreFallback].sort(
            (a, b) => parseApyPct(b.netApyPct) - parseApyPct(a.netApyPct)
        )
        const recommended = mapIntentRecommendation(intentTier, rankedFallback)
        const sourceUniverseGap = buildSourceUniverseGap(fallbackStrategies, rankedFallback)
        const payload = {
            intentTier,
            recommendedStrategyId: recommended?.strategyId ?? null,
            recommendationReason: 'Fallback recommendation based on selected intent and supported chains.',
            strategies: rankedFallback,
            meta: {
                fetchedAt: new Date().toISOString(),
                source: 'fallback',
                scan: {
                    pagesFetched: 0,
                    fetchedCandidates: fallbackStrategies.length,
                    normalizedCandidates: fallbackStrategies.length,
                    dedupedCandidates: diagnostics.dedupedCount,
                    requestedChainScope: chainScope,
                    effectiveChainScope,
                    watchlistEnabled: CHAIN_WATCHLIST_ENABLED,
                    watchlistMinApyPct: CHAIN_WATCHLIST_MIN_APY_PCT,
                    watchlistMinCandidates: CHAIN_WATCHLIST_MIN_CANDIDATES,
                    promotedChains,
                    watchlistCandidateCountsByChain: watchlistChainCounts,
                    candidateCountsByChain: countBy(fallbackStrategies.map((s) => s.chain)),
                    candidateCountsByProtocol: countBy(fallbackStrategies.map((s) => s.protocol)),
                    postChainScopeCount: diagnostics.postChainScopeCount,
                    postEligibilityCount: diagnostics.postEligibilityCount,
                    postCategoryFilterCount: diagnostics.postCategoryFilterCount,
                    protocolCount: diagnostics.protocolCount,
                    protocolsTop: diagnostics.protocolsTop,
                    relaxationLevel: diagnostics.relaxationLevel,
                    rejectedByReason: diagnostics.rejectedByReason,
                    rejectedCandidates: diagnostics.rejectedCandidates,
                    sourceUniverseGap,
                },
            },
        }

        vaultStrategiesCache.set(cacheKey, payload, CACHE_TTL_MS)
        return NextResponse.json(payload, {
            headers: {
                'cache-control': 'private, max-age=15',
                'x-rpc-cache': 'miss',
            },
        })
    }

    const rawStrategies: Record<string, unknown>[] = []
    const maxPages = 5
    let pagesFetched = 0

    for (let page = 1; page <= maxPages; page += 1) {
        const qs = new URLSearchParams({ page: String(page), limit: '100' })
        const upstream = await deframeGet('/strategies', qs)
        const payload = await readJsonSafe(upstream)

        if (!upstream.ok) {
            return NextResponse.json(
                {
                    error: 'vault_strategy_fetch_failed',
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

    const normalized = rawStrategies.map((entry) => normalizeDeframeStrategy(entry as Record<string, unknown>))
    // Merge live protocol strategies not already in the DeFrame feed
    const liveProtocols = await fetchLiveProtocolStrategies()
    const deframeIds = new Set(normalized.map((s) => s.strategyId))
    const mergedFromSources = [...normalized, ...liveProtocols.filter((s) => !deframeIds.has(s.strategyId))]

    // Inject fallback strategies for protocols absent from both DeFrame and live feeds.
    // Guarantees coverage for protocols (e.g. Gearbox) that DeFiLlama may not surface.
    const KNOWN_PROTOCOL_KEYS = [
        'gearbox', 'ethena', 'morpho', 'pendle', 'aave', 'compound',
        'spark', 'sky', 'ondo', 'maple', 'resolv', 'fluid', 'notional', 'term',
    ]
    const presentKeys = new Set<string>()
    for (const s of mergedFromSources) {
        const p = s.protocol.toLowerCase()
        for (const key of KNOWN_PROTOCOL_KEYS) {
            if (p.includes(key)) presentKeys.add(key)
        }
    }
    const fallbackInjections = getFallbackStrategies().filter((fb) => {
        const fbP = fb.protocol.toLowerCase()
        const fbKey = KNOWN_PROTOCOL_KEYS.find((k) => fbP.includes(k))
        return fbKey !== undefined && !presentKeys.has(fbKey)
    })
    const mergedNormalized = [...mergedFromSources, ...fallbackInjections]

    await enrichPendleMaturity(mergedNormalized)
    const watchlistChainCounts = buildWatchlistChainCounts(mergedNormalized)
    const promotedChains = promotedChainsFromWatchlist(chainScope, watchlistChainCounts)
    const effectiveChainScope = Array.from(new Set([...chainScope, ...promotedChains]))
    const scopedNormalized = mergedNormalized.filter((strategy) => effectiveChainScope.includes(strategy.chain))

    const { ranked: rankedByScore, diagnostics } = selectTopStrategiesForIntentWithDiagnostics(intentTier, mergedNormalized, {
        limit: 8,
        chainScope: effectiveChainScope,
    })
    // Present strategies highest APY first for a natural user flow
    const ranked = [...rankedByScore].sort((a, b) => parseApyPct(b.netApyPct) - parseApyPct(a.netApyPct))

    const recommended = mapIntentRecommendation(intentTier, ranked)
    const sourceUniverseGap = buildSourceUniverseGap(mergedNormalized, ranked)

    const responsePayload = {
        intentTier,
        recommendedStrategyId: recommended?.strategyId ?? null,
        recommendationReason: 'Ranked by APY, fees, liquidity profile, and risk fit for your intent.',
        strategies: ranked,
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'deframe',
            scan: {
                pagesFetched,
                fetchedCandidates: rawStrategies.length,
                normalizedCandidates: mergedNormalized.length,
                liveProtocolsInjected: liveProtocols.filter((s) => !deframeIds.has(s.strategyId)).length,
                fallbacksInjected: fallbackInjections.length,
                dedupedCandidates: diagnostics.dedupedCount,
                requestedChainScope: chainScope,
                effectiveChainScope,
                watchlistEnabled: CHAIN_WATCHLIST_ENABLED,
                watchlistMinApyPct: CHAIN_WATCHLIST_MIN_APY_PCT,
                watchlistMinCandidates: CHAIN_WATCHLIST_MIN_CANDIDATES,
                promotedChains,
                watchlistCandidateCountsByChain: watchlistChainCounts,
                candidateCountsByChain: countBy(scopedNormalized.map((s) => s.chain)),
                candidateCountsByProtocol: countBy(scopedNormalized.map((s) => s.protocol)),
                postChainScopeCount: diagnostics.postChainScopeCount,
                postEligibilityCount: diagnostics.postEligibilityCount,
                postCategoryFilterCount: diagnostics.postCategoryFilterCount,
                protocolCount: diagnostics.protocolCount,
                protocolsTop: diagnostics.protocolsTop,
                relaxationLevel: diagnostics.relaxationLevel,
                rejectedByReason: diagnostics.rejectedByReason,
                rejectedCandidates: diagnostics.rejectedCandidates,
                sourceUniverseGap,
            },
        },
    }

    vaultStrategiesCache.set(cacheKey, responsePayload, CACHE_TTL_MS)

    return NextResponse.json(responsePayload, {
        headers: {
            'cache-control': 'private, max-age=15',
            'x-rpc-cache': 'miss',
        },
    })
}
