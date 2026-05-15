import type { VaultStrategySummary } from '../deframe'

const PENDLE_API_BASE = 'https://api-v2.pendle.finance/core/v1'
const CACHE_TTL_MS = 5 * 60 * 1000

const pendleCache = new Map<number, { expiryMap: Map<string, Date>; fetchedAt: number }>()

async function fetchPendleMarketsForChain(chainId: number): Promise<Map<string, Date>> {
    const cached = pendleCache.get(chainId)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.expiryMap

    const expiryMap = new Map<string, Date>()
    try {
        const res = await fetch(`${PENDLE_API_BASE}/${chainId}/markets?page=1&limit=100`, {
            method: 'GET',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(8_000),
        })
        if (res.ok) {
            const body = await res.json().catch(() => null) as Record<string, unknown> | null
            const items: unknown[] = Array.isArray((body as Record<string, unknown>)?.results)
                ? (body as Record<string, unknown[]>).results
                : Array.isArray((body as Record<string, unknown>)?.data)
                ? (body as Record<string, unknown[]>).data
                : []
            for (const item of items) {
                if (!item || typeof item !== 'object') continue
                const m = item as Record<string, unknown>
                const address = typeof m.address === 'string' ? m.address.toLowerCase() : null
                const expiryRaw = typeof m.expiry === 'string' ? m.expiry
                    : typeof m.maturity === 'string' ? m.maturity : null
                const expiry = expiryRaw ? new Date(expiryRaw) : null
                if (address && expiry && !isNaN(expiry.getTime())) expiryMap.set(address, expiry)
            }
        }
    } catch {
        // Pendle API unavailable — fallback mock expiry in normalizeWithProtocolControls covers this
    }

    pendleCache.set(chainId, { expiryMap, fetchedAt: Date.now() })
    return expiryMap
}

/**
 * Pre-fetches real Pendle expiry data from the Pendle API and mutates strategies in-place.
 * Call BEFORE dedupeStrategies() so that applyPendleMaturityNormalization() finds
 * pendleMaturity already set and only needs to evaluate suppression logic.
 * Non-Pendle strategies are skipped. Errors are silently swallowed — the 90-day
 * fallback in applyPendleMaturityNormalization covers any unmatched strategies.
 */
export async function enrichPendleMaturity(
    strategies: VaultStrategySummary[],
    warningDays = 30
): Promise<void> {
    const pendleStrategies = strategies.filter((s) => s.protocol.toLowerCase() === 'pendle')
    if (pendleStrategies.length === 0) return

    const uniqueChainIds = [...new Set(pendleStrategies.map((s) => s.chainId))]
    const chainExpiryMap = new Map(
        await Promise.all(
            uniqueChainIds.map(async (chainId) => [
                chainId,
                await fetchPendleMarketsForChain(chainId),
            ] as const)
        )
    )

    const now = Date.now()
    for (const strategy of pendleStrategies) {
        if (strategy.pendleMaturity) continue
        const expiry = chainExpiryMap.get(strategy.chainId)?.get(strategy.strategyId.toLowerCase())
        if (!expiry) continue
        const daysUntilExpiry = Math.max(0, Math.floor((expiry.getTime() - now) / 86_400_000))
        strategy.pendleMaturity = {
            expiryDate: expiry.toISOString().split('T')[0],
            daysUntilExpiry,
            yieldLockWarning: daysUntilExpiry < warningDays,
        }
    }
}
