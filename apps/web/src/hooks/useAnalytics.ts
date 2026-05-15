import { useBFFData } from './useBFFData'
import type { AnalyticsResponse } from '../lib/bff.types'
import { AnalyticsResponseSchema } from '../lib/validation'

/**
 * useAnalytics — BFF-backed analytics for a given accountId.
 * Aggregates yield snapshot, strategy allocations, APY history
 * and account balance into one cached response (30s TTL).
 */
export function useAnalytics(accountId?: string) {
    return useBFFData<AnalyticsResponse>({
        queryKey: ['gr-analytics', accountId],
        endpoint: `/api/gr/analytics?accountId=${encodeURIComponent(accountId ?? '')}`,
        enabled: Boolean(accountId),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        schema: AnalyticsResponseSchema,
    })
}
