import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import { ComplianceScreenResponseSchema } from '../lib/validation'

export interface ComplianceScreenRequest {
    fromAddress: string
    amount: string
    [key: string]: unknown
}

export interface ComplianceScreenResponse {
    sanctioned: boolean
    screeningStatus: string
    screeningId?: string
    details?: Record<string, unknown>
}

/**
 * useComplianceScreen - Mutation hook for compliance screening
 * POST to /api/gr/compliance/screen
 */
export function useComplianceScreen() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (payload: ComplianceScreenRequest) => {
            const idempotencyKey = `screen-${Date.now()}`
            const response = await getJson<ComplianceScreenResponse>(
                '/api/gr/compliance/screen',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                ComplianceScreenResponseSchema
            )
            return response
        },
        onSuccess: () => {
            // Optionally invalidate compliance status queries
            queryClient.invalidateQueries({ queryKey: ['compliance-status'] })
        },
    })
}
