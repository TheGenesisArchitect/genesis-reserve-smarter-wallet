'use client'

import { useBFFData } from './useBFFData'
import type { AccountsResponse } from '../lib/bff.types'
import { AccountsResponseSchema } from '../lib/validation'

export function useAccountResolver(walletAddress?: string, smartAccountAddress?: string) {
    const wallet = encodeURIComponent(walletAddress ?? '')
    const smart = encodeURIComponent(smartAccountAddress ?? '')

    return useBFFData<AccountsResponse>({
        queryKey: ['gr-accounts', walletAddress, smartAccountAddress],
        endpoint: `/api/gr/accounts?walletAddress=${wallet}&smartAccountAddress=${smart}`,
        enabled: Boolean(walletAddress || smartAccountAddress),
        staleTime: 30_000,
        schema: AccountsResponseSchema,
    })
}
