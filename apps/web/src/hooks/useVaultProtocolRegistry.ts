'use client'

import { useBFFData } from './useBFFData'
import type { VaultProtocolRegistryResponse } from '../lib/bff.types'
import { VaultProtocolRegistryResponseSchema } from '../lib/validation'

export function useVaultProtocolRegistry(
    chainScope: string[] = ['arbitrum', 'ethereum', 'base', 'optimism', 'polygon', 'gnosis', 'sonic', 'scroll']
) {
    const scope = chainScope.join(',')

    return useBFFData<VaultProtocolRegistryResponse>({
        queryKey: ['gr-vault-protocol-registry', scope],
        endpoint: `/api/gr/vault/protocol-registry?chainScope=${encodeURIComponent(scope)}`,
        staleTime: 45_000,
        refetchInterval: 60_000,
        schema: VaultProtocolRegistryResponseSchema,
    })
}
