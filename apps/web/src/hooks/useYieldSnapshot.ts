'use client'

import { useBFFData } from './useBFFData'
import type { YieldResponse } from '../lib/bff.types'
import { YieldResponseSchema } from '../lib/validation'

export function useYieldSnapshot(accountId?: string) {
    return useBFFData<YieldResponse>({
        queryKey: ['gr-yield', accountId],
        endpoint: `/api/gr/yield?accountId=${encodeURIComponent(accountId ?? '')}`,
        enabled: Boolean(accountId),
        staleTime: 60_000,
        schema: YieldResponseSchema,
    })
}
