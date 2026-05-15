// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useSend.ts
//
// Unified mutation hook for the 3 sequential send-flow steps that mutate state.
// All three actions (screen, order, finalize) are dispatched through the single
// /api/gr/send orchestrator endpoint.
//
// NOTE: The quote step uses useSendQuote (separate query/polling hook) because
// it needs useQuery + refetchInterval, not a one-shot mutation.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'

// ── Payload types (per action) ────────────────────────────────────────────────

export interface ScreenPayload {
    action: 'screen'
    fromAddress: string
    amount: string
}

export interface OrderPayload {
    action: 'order'
    quoteId: string
    accountId: string
    recipientId: string
    payoutMethod: string
    memo?: string
    [key: string]: unknown
}

export interface FinalizePayload {
    action: 'finalize'
    orderId: string
    [key: string]: unknown
}

export type SendPayload = ScreenPayload | OrderPayload | FinalizePayload

// ── Result types (mirror orchestrator normalisers) ────────────────────────────

export interface ScreenResult {
    action: 'screen'
    sanctioned: boolean
    screeningStatus: string
    screeningId: string
    details?: unknown
}

export interface OrderResult {
    action: 'order'
    orderId: string
    reservationId: string
    amount: string
    fee: string
    status: string
    createdAt: string
}

export interface FinalizeResult {
    action: 'finalize'
    status: string
    txHash?: string
    completedAt: string
}

export type SendResult = ScreenResult | OrderResult | FinalizeResult

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useSend — single mutation for screen → order → finalize pipeline steps.
 *
 * Usage:
 *   const send = useSend()
 *   const screen = await send.mutateAsync({ action: 'screen', fromAddress, amount })
 *   const order  = await send.mutateAsync({ action: 'order',  quoteId, accountId, ... })
 *   const fin    = await send.mutateAsync({ action: 'finalize', orderId })
 */
export function useSend() {
    const queryClient = useQueryClient()

    return useMutation<SendResult, Error, SendPayload>({
        mutationFn: async (payload: SendPayload): Promise<SendResult> => {
            const idempotencyKey = `${payload.action}-${Date.now()}`
            return getJson<SendResult>('/api/gr/send', {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
                body: JSON.stringify(payload),
            })
        },

        onSuccess: (data) => {
            // Invalidate balance / history after state-changing steps
            if (data.action === 'order' || data.action === 'finalize') {
                void queryClient.invalidateQueries({ queryKey: ['gr-dashboard'] })
                void queryClient.invalidateQueries({ queryKey: ['gr-history'] })
            }
            if (data.action === 'finalize') {
                void queryClient.invalidateQueries({ queryKey: ['genesis-vault'] })
            }
        },
    })
}
