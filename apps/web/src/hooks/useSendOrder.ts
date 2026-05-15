import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import { SendOrderResponseSchema } from '../lib/validation'

export interface SendOrderRequest {
    quoteId?: string
    accountId?: string
    recipientId?: string
    payoutMethod?: string
    recipientAddress?: string
    amount?: string
    memo?: string
    [key: string]: unknown
}

export interface SendOrderResponse {
    orderId: string
    reservationId: string
    amount: string
    fee: string
    status: string
    createdAt: string
    [key: string]: unknown
}

/**
 * useSendOrder - Mutation hook for creating a send order
 * POST to /api/gr/remittance/order
 */
export function useSendOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (payload: SendOrderRequest) => {
            const recipientKey = payload.recipientAddress?.slice(2, 8)
                ?? payload.recipientId?.slice(2, 8)
                ?? payload.quoteId?.slice(0, 8)
                ?? 'order'
            const idempotencyKey = `order-${Date.now()}-${recipientKey}`
            const response = await getJson<SendOrderResponse>(
                '/api/gr/remittance/order',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                SendOrderResponseSchema
            )
            return response
        },
        onSuccess: () => {
            // Invalidate dashboard and history queries after successful order
            queryClient.invalidateQueries({ queryKey: ['gr-dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['gr-history'] })
        },
    })
}
