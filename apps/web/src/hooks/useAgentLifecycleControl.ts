import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import type { AgentLifecycleActionResponse } from '../lib/bff.types'
import { AgentLifecycleActionResponseSchema } from '../lib/validation'

export interface AgentLifecycleControlRequest {
    agentId: string
    action: 'START' | 'PAUSE' | 'STOP'
    targetEnvironment?: 'dev' | 'staging' | 'prod'
    reason?: string
    requestedBy?: string
    ownerApproval?: {
        approvedBy: string
        approvedAt: string
        ticketId: string
    }
}

export function useAgentLifecycleControl() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: AgentLifecycleControlRequest) => {
            const idempotencyKey = `agentic-lifecycle-${payload.agentId}-${payload.action}-${Date.now()}`
            return getJson<AgentLifecycleActionResponse>('/api/gr/agentic/lifecycle', {
                method: 'POST',
                headers: {
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(payload),
            }, AgentLifecycleActionResponseSchema)
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'agents'] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'launch'] }),
                queryClient.invalidateQueries({ queryKey: ['gr-dashboard'] }),
            ])
        },
    })
}
