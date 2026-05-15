'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import { RemittanceRecipientSchema } from '../lib/validation'
import type { RemittanceRecipient } from '../lib/bff.types'

// ─── Create Recipient ────────────────────────────────────────────────────────

export interface CreateRecipientRequest {
    accountId: string
    displayName: string
    recipientType: 'INDIVIDUAL' | 'BUSINESS'
    corridor: string
    payoutMethod: 'bank_transfer' | 'mobile_money' | 'crypto_wallet' | 'cash_pickup'
    recipientAddress?: string
    recipientName?: string
    recipientPhone?: string
    recipientEmail?: string
    bankCode?: string
    bankName?: string
    branchCode?: string
    accountNumber?: string
    accountType?: string
    mobileProvider?: string
    mobileNumber?: string
    memo?: string
    isDefault?: boolean
}

/**
 * useCreateRecipient — POST to /api/gr/remittance/recipients
 * Invalidates the recipients list query for the account on success.
 */
export function useCreateRecipient() {
    const queryClient = useQueryClient()

    return useMutation<RemittanceRecipient, Error, CreateRecipientRequest>({
        mutationFn: async (payload) => {
            const idempotencyKey = `recip-create-${payload.accountId}-${Date.now()}`
            return getJson<RemittanceRecipient>(
                '/api/gr/remittance/recipients',
                {
                    method: 'POST',
                    headers: { 'Idempotency-Key': idempotencyKey },
                    body: JSON.stringify(payload),
                },
                RemittanceRecipientSchema
            )
        },
        onSuccess: (_result, variables) => {
            queryClient.invalidateQueries({ queryKey: ['gr-recipients', variables.accountId] })
        },
    })
}

// ─── Update Recipient ────────────────────────────────────────────────────────

export interface UpdateRecipientRequest {
    recipientId: string
    accountId: string
    displayName?: string
    memo?: string
    isDefault?: boolean
    verificationStatus?: string
}

/**
 * useUpdateRecipient — PATCH to /api/gr/remittance/recipients/[recipientId]
 * Invalidates the recipients list query for the account on success.
 */
export function useUpdateRecipient() {
    const queryClient = useQueryClient()

    return useMutation<RemittanceRecipient, Error, UpdateRecipientRequest>({
        mutationFn: async ({ recipientId, accountId: _accountId, ...body }) => {
            const idempotencyKey = `recip-patch-${recipientId}-${Date.now()}`
            return getJson<RemittanceRecipient>(
                `/api/gr/remittance/recipients/${encodeURIComponent(recipientId)}`,
                {
                    method: 'PATCH',
                    headers: { 'Idempotency-Key': idempotencyKey },
                    body: JSON.stringify(body),
                },
                RemittanceRecipientSchema
            )
        },
        onSuccess: (_result, variables) => {
            queryClient.invalidateQueries({ queryKey: ['gr-recipients', variables.accountId] })
        },
    })
}
