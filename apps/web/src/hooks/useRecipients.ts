'use client'

import { useBFFData } from './useBFFData'
import type { RecipientsListResponse } from '../lib/bff.types'
import { RecipientsListResponseSchema } from '../lib/validation'

export function useRecipients(accountId?: string, corridor?: string) {
    const corridorParam = corridor ? `&corridor=${encodeURIComponent(corridor)}` : ''
    return useBFFData<RecipientsListResponse>({
        queryKey: ['gr-recipients', accountId, corridor],
        endpoint: `/api/gr/remittance/recipients?accountId=${encodeURIComponent(accountId ?? '')}${corridorParam}`,
        enabled: Boolean(accountId),
        staleTime: 30_000,
        schema: RecipientsListResponseSchema,
    })
}
