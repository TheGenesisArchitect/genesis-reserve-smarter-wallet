import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import { FinalizeSendResponseSchema } from '../lib/validation'

export interface FinalizeSendRequest {
    orderId: string
    [key: string]: unknown
}

export interface FinalizeSendResponse {
    status: string
    txHash?: string
    completedAt: string
    [key: string]: unknown
}

/**
 * useFinalizeSend - Mutation hook for finalizing a send order
 * POST to /api/gr/treasury/finalize
 */
export function useFinalizeSend() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (payload: FinalizeSendRequest) => {
            const idempotencyKey = `finalize-${Date.now()}-${payload.orderId.slice(0, 8)}`
            const response = await getJson<FinalizeSendResponse>(
                '/api/gr/treasury/finalize',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                FinalizeSendResponseSchema
            )
            return response
        },
        onSuccess: () => {
            // Invalidate all balance and history related queries
            queryClient.invalidateQueries({ queryKey: ['gr-dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['gr-history'] })
            queryClient.invalidateQueries({ queryKey: ['genesis-vault'] })
        },
    })
}
