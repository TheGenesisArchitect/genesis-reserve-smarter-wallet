import { NextResponse } from 'next/server'
import {
    deframeGet,
    getFallbackStrategies,
    isDeframeConfigured,
    normalizeDeframeStrategy,
    readJsonSafe,
    selectTopStrategiesForIntentWithDiagnostics,
} from '../../_lib/deframe'
import { createRateLimiter, createTtlCache, getRequestIp } from '../../_lib/request-controls'
import type { VaultIntentTier, VaultProtocolRegistryItem, VaultStrategySummary } from '@/lib/bff.types'

const protocolRegistryRateLimiter = createRateLimiter(40, 60_000)
const protocolRegistryCache = createTtlCache<unknown>()
const CACHE_TTL_MS = 15_000
const DEFAULT_CHAIN_SCOPE = ['arbitrum', 'ethereum', 'base', 'optimism', 'polygon', 'gnosis', 'sonic', 'scroll']

function parseChainScope(raw: string | null): string[] {
    if (!raw) return [...DEFAULT_CHAIN_SCOPE]
    return Array.from(new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)))
}

function parseApyPct(value: string): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function median(values: number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const center = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 1) return sorted[center]
    return (sorted[center - 1] + sorted[center]) / 2
}

function getAvailableTiersByProtocol(
    strategies: VaultStrategySummary[],
    chainScope: string[]
): Map<string, Set<VaultIntentTier>> {
    const tiers: VaultIntentTier[] = ['preserve', 'grow', 'accelerate']
    const map = new Map<string, Set<VaultIntentTier>>()

    for (const tier of tiers) {
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics(tier, strategies, {
            limit: 30,
            chainScope,
        })
        for (const strategy of ranked) {
            const key = strategy.protocol.toLowerCase()
            const existing = map.get(key) ?? new Set<VaultIntentTier>()
            existing.add(tier)
            map.set(key, existing)
        }
    }

    return map
}

function buildProtocolRegistry(
    strategies: VaultStrategySummary[],
    chainScope: string[]
): VaultProtocolRegistryItem[] {
    const grouped = new Map<string, VaultStrategySummary[]>()

    for (const strategy of strategies) {
        const key = strategy.protocol.toLowerCase()
        const existing = grouped.get(key) ?? []
        existing.push(strategy)
        grouped.set(key, existing)
    }

    const availableTierByProtocol = getAvailableTiersByProtocol(strategies, chainScope)

    const items: VaultProtocolRegistryItem[] = Array.from(grouped.entries()).map(([protocolKey, entries]) => {
        const apys = entries.map((entry) => parseApyPct(entry.netApyPct))
        const lendableCount = entries.filter((entry) => entry.availableActions.includes('lend') && !entry.paused).length
        const pausedCount = entries.filter((entry) => entry.paused).length
        const representativeStrategyIds = [...entries]
            .sort((a, b) => parseApyPct(b.netApyPct) - parseApyPct(a.netApyPct))
            .slice(0, 5)
            .map((entry) => entry.strategyId)

        return {
            protocol: entries[0]?.protocol ?? protocolKey,
            strategyCount: entries.length,
            lendableCount,
            pausedCount,
            chains: Array.from(new Set(entries.map((entry) => entry.chain))).sort(),
            riskBands: Array.from(new Set(entries.map((entry) => entry.riskLevel))).sort(),
            minApyPct: Math.min(...apys),
            p50ApyPct: median(apys),
            maxApyPct: Math.max(...apys),
            representativeStrategyIds,
            availableForTiers: Array.from(availableTierByProtocol.get(protocolKey) ?? new Set<VaultIntentTier>()),
        }
    })

    return items.sort((a, b) => {
        if (b.maxApyPct !== a.maxApyPct) return b.maxApyPct - a.maxApyPct
        return b.strategyCount - a.strategyCount
    })
}

export async function GET(request: Request) {
    const search = new URL(request.url).searchParams
    const chainScope = parseChainScope(search.get('chainScope'))
    const requesterIp = getRequestIp(request)
    const cacheKey = `protocol-registry:${[...chainScope].sort().join(',')}`

    if (protocolRegistryRateLimiter.isLimited(requesterIp)) {
        return NextResponse.json(
            { error: 'rate_limited', detail: 'Too many protocol-registry requests. Please retry shortly.' },
            { status: 429 }
        )
    }

    const cached = protocolRegistryCache.get(cacheKey)
    if (cached) {
        return NextResponse.json(cached, {
            headers: {
                'cache-control': 'private, max-age=15',
                'x-rpc-cache': 'hit',
            },
        })
    }

    if (!isDeframeConfigured()) {
        const fallback = getFallbackStrategies().filter((strategy) => chainScope.includes(strategy.chain))
        const items = buildProtocolRegistry(fallback, chainScope)
        const payload = {
            items,
            meta: {
                fetchedAt: new Date().toISOString(),
                source: 'fallback' as const,
                pagesFetched: 0,
                fetchedCandidates: fallback.length,
                effectiveChainScope: chainScope,
            },
        }

        protocolRegistryCache.set(cacheKey, payload, CACHE_TTL_MS)
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
                    error: 'vault_protocol_registry_fetch_failed',
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

    const normalized = rawStrategies
        .map((entry) => normalizeDeframeStrategy(entry))
        .filter((strategy) => chainScope.includes(strategy.chain))

    const responsePayload = {
        items: buildProtocolRegistry(normalized, chainScope),
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'deframe' as const,
            pagesFetched,
            fetchedCandidates: normalized.length,
            effectiveChainScope: chainScope,
        },
    }

    protocolRegistryCache.set(cacheKey, responsePayload, CACHE_TTL_MS)

    return NextResponse.json(responsePayload, {
        headers: {
            'cache-control': 'private, max-age=15',
            'x-rpc-cache': 'miss',
        },
    })
}
