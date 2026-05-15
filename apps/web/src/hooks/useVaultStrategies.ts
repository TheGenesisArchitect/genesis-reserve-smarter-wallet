'use client'

import { useBFFData } from './useBFFData'
import type { VaultIntentTier, VaultStrategiesResponse } from '../lib/bff.types'
import { VaultStrategiesResponseSchema } from '../lib/validation'

export function useVaultStrategies(
    intentTier: VaultIntentTier,
    chainScope: string[] = ['base', 'polygon', 'gnosis']
) {
    const scope = chainScope.join(',')

    return useBFFData<VaultStrategiesResponse>({
        queryKey: ['gr-vault-strategies', intentTier, scope],
        endpoint: `/api/gr/vault/strategies?intentTier=${encodeURIComponent(intentTier)}&chainScope=${encodeURIComponent(scope)}`,
        enabled: Boolean(intentTier),
        staleTime: 45_000,
        refetchInterval: 60_000,
        schema: VaultStrategiesResponseSchema,
    })
}
