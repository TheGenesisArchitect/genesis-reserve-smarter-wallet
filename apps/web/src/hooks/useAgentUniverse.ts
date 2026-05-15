'use client'

import { useBFFData } from './useBFFData'
import type {
    AgentLifecycleHistoryResponse,
    AgentUniverseLaunchResponse,
    AgentUniverseRegistryResponse,
    BuildPipelineRun,
    BuildPipelineRunDetailResponse,
    BuildRunDrilldownResponse,
} from '../lib/bff.types'
import {
    AgentLifecycleHistoryResponseSchema,
    AgentUniverseLaunchResponseSchema,
    AgentUniverseRegistryResponseSchema,
    BuildPipelineRunDetailResponseSchema,
    BuildPipelineRunSchema,
    BuildRunDrilldownResponseSchema,
} from '../lib/validation'

export function useAgentUniverseRegistry() {
    return useBFFData<AgentUniverseRegistryResponse>({
        queryKey: ['agentic-universe', 'agents'],
        endpoint: '/api/gr/agentic/agents',
        staleTime: 15_000,
        schema: AgentUniverseRegistryResponseSchema,
    })
}

export function useAgentUniverseLaunch() {
    return useBFFData<AgentUniverseLaunchResponse>({
        queryKey: ['agentic-universe', 'launch'],
        endpoint: '/api/gr/agentic/launch',
        staleTime: 20_000,
        schema: AgentUniverseLaunchResponseSchema,
    })
}

export function useAgentLifecycleHistory(agentId?: string) {
    return useBFFData<AgentLifecycleHistoryResponse>({
        queryKey: ['agentic-universe', 'lifecycle', agentId],
        endpoint: `/api/gr/agentic/lifecycle/${encodeURIComponent(agentId ?? '')}`,
        enabled: Boolean(agentId),
        staleTime: 10_000,
        schema: AgentLifecycleHistoryResponseSchema,
    })
}

export function useBuildPipelineRuns(pipelineItemId?: string) {
    return useBFFData<BuildPipelineRun[]>({
        queryKey: ['agentic-universe', 'pipeline-runs', pipelineItemId],
        endpoint: `/api/gr/agentic/build/pipelines/runs${pipelineItemId ? `?pipelineItemId=${encodeURIComponent(pipelineItemId)}` : ''}`,
        enabled: Boolean(pipelineItemId),
        staleTime: 8_000,
        refetchInterval: 8_000,
        schema: BuildPipelineRunSchema.array(),
    })
}

export function useBuildPipelineRun(runId?: string) {
    return useBFFData<BuildPipelineRunDetailResponse>({
        queryKey: ['agentic-universe', 'pipeline-run', runId],
        endpoint: `/api/gr/agentic/build/pipelines/runs/${encodeURIComponent(runId ?? '')}`,
        enabled: Boolean(runId),
        staleTime: 5_000,
        refetchInterval: 5_000,
        schema: BuildPipelineRunDetailResponseSchema,
    })
}

export function useBuildPipelineRunDrilldown(runId?: string) {
    return useBFFData<BuildRunDrilldownResponse>({
        queryKey: ['agentic-universe', 'pipeline-run-drilldown', runId],
        endpoint: `/api/gr/agentic/build/pipelines/runs/${encodeURIComponent(runId ?? '')}/drilldown`,
        enabled: Boolean(runId),
        staleTime: 5_000,
        refetchInterval: 5_000,
        schema: BuildRunDrilldownResponseSchema,
    })
}
