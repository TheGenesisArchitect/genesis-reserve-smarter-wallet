'use client'

import { useBFFData } from './useBFFData'
import type { DashboardResponse } from '../lib/bff.types'
import { DashboardResponseSchema } from '../lib/validation'

export function useDashboardSnapshot(accountId?: string) {
    return useBFFData<DashboardResponse>({
        queryKey: ['gr-dashboard', accountId],
        endpoint: `/api/gr/dashboard?accountId=${encodeURIComponent(accountId ?? '')}`,
        enabled: Boolean(accountId),
        staleTime: 30_000,
        schema: DashboardResponseSchema,
    })
}
