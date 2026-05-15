import { useMutation } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import type { VaultWithdrawPlanResponse } from '../lib/bff.types'
import { VaultWithdrawPlanResponseSchema } from '../lib/validation'

export interface VaultWithdrawPlanRequest {
    walletAddress: string
    strategyId: string
    amountAtomic: string
}

export function useVaultWithdrawPlan() {
    return useMutation({
        mutationFn: async (payload: VaultWithdrawPlanRequest) => {
            const idempotencyKey = `vault-withdraw-plan-${Date.now()}-${payload.strategyId.slice(0, 12)}`

            return getJson<VaultWithdrawPlanResponse>(
                '/api/gr/vault/withdraw-plan',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                VaultWithdrawPlanResponseSchema
            )
        },
    })
}
