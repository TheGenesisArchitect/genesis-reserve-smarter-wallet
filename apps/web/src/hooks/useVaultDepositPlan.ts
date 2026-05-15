import { useMutation } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import type { VaultDepositPlanResponse } from '../lib/bff.types'
import { VaultDepositPlanResponseSchema } from '../lib/validation'

export interface VaultDepositPlanRequest {
    walletAddress: string
    strategyId: string
    amountAtomic: string
}

export function useVaultDepositPlan() {
    return useMutation({
        mutationFn: async (payload: VaultDepositPlanRequest) => {
            const idempotencyKey = `vault-deposit-plan-${Date.now()}-${payload.strategyId.slice(0, 12)}`

            return getJson<VaultDepositPlanResponse>(
                '/api/gr/vault/deposit-plan',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                VaultDepositPlanResponseSchema
            )
        },
    })
}
