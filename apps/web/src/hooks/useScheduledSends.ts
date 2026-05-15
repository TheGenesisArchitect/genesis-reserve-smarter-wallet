import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBFFData } from './useBFFData'
import { getJson } from '../lib/apiClient'
import type {
    ScheduledSendFrequency,
    ScheduledSendMutationResponse,
    ScheduledSendsResponse,
    ScheduledSendStatus,
} from '../lib/bff.types'
import { ScheduledSendMutationResponseSchema, ScheduledSendsResponseSchema } from '../lib/validation'

export interface CreateScheduledSendRequest {
    accountId?: string
    recipient: string
    amount: string
    frequency: ScheduledSendFrequency
    payoutMethod: string
    corridor: string
    memo?: string
}

export interface UpdateScheduledSendRequest {
    id: string
    recipient?: string
    amount?: string
    frequency?: ScheduledSendFrequency
    payoutMethod?: string
    corridor?: string
    memo?: string
    status?: ScheduledSendStatus
}

export function useScheduledSends(accountId?: string) {
    return useBFFData<ScheduledSendsResponse>({
        queryKey: ['gr-scheduled-sends', accountId],
        endpoint: `/api/gr/scheduled-sends?accountId=${encodeURIComponent(accountId ?? '')}`,
        enabled: Boolean(accountId),
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        schema: ScheduledSendsResponseSchema,
    })
}

export function useCreateScheduledSend() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: CreateScheduledSendRequest) => {
            const idempotencyKey = `sched-create-${Date.now()}-${payload.frequency.toLowerCase()}`
            return getJson<ScheduledSendMutationResponse>('/api/gr/scheduled-sends', {
                method: 'POST',
                headers: {
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(payload),
            }, ScheduledSendMutationResponseSchema)
        },
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['gr-scheduled-sends', response.item.accountId] })
        },
    })
}

export function useUpdateScheduledSend() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: UpdateScheduledSendRequest) => {
            const idempotencyKey = `sched-update-${Date.now()}-${payload.id}`
            return getJson<ScheduledSendMutationResponse>(`/api/gr/scheduled-sends/${payload.id}`, {
                method: 'PUT',
                headers: {
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(payload),
            }, ScheduledSendMutationResponseSchema)
        },
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['gr-scheduled-sends', response.item.accountId] })
        },
    })
}

export function useCancelScheduledSend() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: { id: string; accountId: string }) => {
            const idempotencyKey = `sched-cancel-${Date.now()}-${payload.id}`
            return getJson<ScheduledSendMutationResponse>(`/api/gr/scheduled-sends/${payload.id}`, {
                method: 'DELETE',
                headers: {
                    'Idempotency-Key': idempotencyKey,
                },
            }, ScheduledSendMutationResponseSchema)
        },
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['gr-scheduled-sends', response.item.accountId] })
        },
    })
}
