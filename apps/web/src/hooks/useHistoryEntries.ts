'use client'

import { useBFFData } from './useBFFData'
import type { HistoryResponse } from '../lib/bff.types'
import { HistoryResponseSchema } from '../lib/validation'

export function useHistoryEntries(accountId?: string, pageSize = 20) {
    return useBFFData<HistoryResponse>({
        queryKey: ['gr-history', accountId, pageSize],
        endpoint: `/api/gr/history?accountId=${encodeURIComponent(accountId ?? '')}&pageSize=${pageSize}`,
        enabled: Boolean(accountId),
        staleTime: 10_000,
        schema: HistoryResponseSchema,
    })
}
