import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getJson } from '../lib/apiClient'
import type {
    BuildPipelinePromoteResponse,
    BuildPipelineRun,
    BuildRunReviewSubmitResponse,
    ReviewType,
    ReviewVerdict,
} from '../lib/bff.types'
import {
    BuildPipelinePromoteResponseSchema,
    BuildPipelineRunSchema,
    BuildRunReviewSubmitResponseSchema,
} from '../lib/validation'

export interface TriggerPipelineRunRequest {
    pipelineItemId: string
    triggeredBy?: string
    provider?: 'github-actions' | 'internal'
    workflowRef?: string
    branch?: string
    commitSha?: string
    targetEnvironment?: 'dev' | 'staging' | 'prod'
}

export interface UpdatePipelineRunStatusRequest {
    runId: string
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
    notes?: string
    updatedBy?: string
}

export interface PromotePipelineRunRequest {
    runId: string
    promotedBy?: string
    targetEnvironment?: 'dev' | 'staging' | 'prod'
    ownerApproval: {
        approvedBy: string
        approvedAt: string
        ticketId: string
    }
}

export interface SubmitPipelineRunReviewRequest {
    runId: string
    reviewType: ReviewType
    verdict: ReviewVerdict
    reviewedBy: string
    notes?: string
    ecosystemImpact?: unknown
    optimizationRecommendations?: unknown[]
    metadata?: Record<string, unknown>
}

export function useTriggerPipelineRun() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: TriggerPipelineRunRequest) => {
            const idempotencyKey = `agentic-pipeline-trigger-${payload.pipelineItemId}-${Date.now()}`
            return getJson<BuildPipelineRun>(
                '/api/gr/agentic/build/pipelines/trigger',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                BuildPipelineRunSchema
            )
        },
        onSuccess: async (run) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-runs', run.pipeline_item_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run', run.run_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run-drilldown', run.run_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'launch'] }),
            ])
        },
    })
}

export function useUpdatePipelineRunStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: UpdatePipelineRunStatusRequest) => {
            const idempotencyKey = `agentic-pipeline-status-${payload.runId}-${Date.now()}`
            return getJson<BuildPipelineRun>(
                `/api/gr/agentic/build/pipelines/runs/${encodeURIComponent(payload.runId)}/status`,
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                BuildPipelineRunSchema
            )
        },
        onSuccess: async (run) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-runs', run.pipeline_item_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run', run.run_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run-drilldown', run.run_id] }),
            ])
        },
    })
}

export function usePromotePipelineRun() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: PromotePipelineRunRequest) => {
            const idempotencyKey = `agentic-pipeline-promote-${payload.runId}-${Date.now()}`
            return getJson<BuildPipelinePromoteResponse>(
                `/api/gr/agentic/build/pipelines/runs/${encodeURIComponent(payload.runId)}/promote`,
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                BuildPipelinePromoteResponseSchema
            )
        },
        onSuccess: async (result) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-runs', result.run.pipeline_item_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run', result.run.run_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run-drilldown', result.run.run_id] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'launch'] }),
            ])
        },
    })
}

export function useSubmitPipelineRunReview() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: SubmitPipelineRunReviewRequest) => {
            const idempotencyKey = `agentic-pipeline-review-${payload.runId}-${payload.reviewType}-${Date.now()}`
            return getJson<BuildRunReviewSubmitResponse>(
                `/api/gr/agentic/build/pipelines/runs/${encodeURIComponent(payload.runId)}/reviews`,
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify(payload),
                },
                BuildRunReviewSubmitResponseSchema
            )
        },
        onSuccess: async (result) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run-drilldown', result.runId] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'pipeline-run', result.runId] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-universe', 'launch'] }),
            ])
        },
    })
}
