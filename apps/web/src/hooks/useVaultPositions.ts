'use client'

import { useBFFData } from './useBFFData'
import type { VaultPositionsResponse } from '../lib/bff.types'
import { VaultPositionsResponseSchema } from '../lib/validation'

export function useVaultPositions(walletAddress?: string) {
    return useBFFData<VaultPositionsResponse>({
        queryKey: ['gr-vault-positions', walletAddress?.toLowerCase() ?? ''],
        endpoint: `/api/gr/vault/positions?walletAddress=${encodeURIComponent(walletAddress ?? '')}`,
        enabled: Boolean(walletAddress),
        staleTime: 30_000,
        refetchInterval: 45_000,
        schema: VaultPositionsResponseSchema,
    })
}
