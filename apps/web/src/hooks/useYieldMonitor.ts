'use client'

import { useBFFData } from './useBFFData'
import type { YieldMonitorResponse } from '../lib/bff.types'
import { YieldMonitorResponseSchema } from '../lib/validation'

export function useYieldMonitor() {
    return useBFFData<YieldMonitorResponse>({
        queryKey: ['gr-yield-monitor'],
        endpoint: '/api/gr/yield/monitor',
        staleTime: 20_000,
        refetchInterval: 30_000,
        schema: YieldMonitorResponseSchema,
    })
}
