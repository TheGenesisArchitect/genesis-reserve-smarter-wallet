import { useMutation } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import type { BatchOperationResponse, BatchUploadRow } from '../lib/bff.types'
import { BatchOperationResponseSchema } from '../lib/validation'

export interface SubmitBatchRequest {
    accountId?: string
    rows: BatchUploadRow[]
}

export function useBatchOperations() {
    return useMutation({
        mutationFn: (payload: SubmitBatchRequest) => {
            const idempotencyKey = `batch-submit-${Date.now()}-${payload.rows.length}`
            return getJson<BatchOperationResponse>('/api/gr/batch-operations', {
                method: 'POST',
                headers: {
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(payload),
            }, BatchOperationResponseSchema)
        },
    })
}
