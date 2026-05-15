import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../../../../../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function unwrapData(payload: unknown): Record<string, unknown> {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    return Object.keys(data).length > 0 ? data : record
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

function computeDurationMinutes(startedAt: unknown, completedAt: unknown): number | null {
    const start = parseDate(startedAt)
    const end = parseDate(completedAt)
    if (!start || !end) return null
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

function toSeverity(eventType: string, status?: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const upperEvent = eventType.toUpperCase()
    const upperStatus = String(status || '').toUpperCase()

    if (upperStatus === 'FAILED' || upperStatus === 'CANCELED') return 'HIGH'
    if (upperEvent.includes('REJECTED') || upperEvent.includes('BLOCKED')) return 'HIGH'
    if (upperEvent.includes('PROMOTED') || upperEvent.includes('DEPLOYED')) return 'MEDIUM'
    if (upperEvent.includes('REVIEW')) return 'MEDIUM'
    return 'LOW'
}

function toImpactSummary(run: Record<string, unknown>, events: Record<string, unknown>[], owner?: string) {
    const failedEvents = events.filter((event) => {
        const status = String(event.status || '').toUpperCase()
        return status === 'FAILED' || status === 'CANCELED'
    }).length

    const targetEnvironment = String(run.target_environment || 'staging')
    const status = String(run.status || 'QUEUED')
    const durationMinutes = computeDurationMinutes(run.started_at, run.completed_at)

    const riskScore = Math.min(
        100,
        (targetEnvironment === 'prod' ? 35 : 15)
        + (status === 'FAILED' ? 35 : status === 'SUCCEEDED' ? 10 : 20)
        + Math.min(20, failedEvents * 10)
        + (durationMinutes && durationMinutes > 30 ? 10 : 0)
    )

    const blastRadius = targetEnvironment === 'prod'
        ? (failedEvents > 0 ? 'high' : 'medium')
        : (failedEvents > 0 ? 'medium' : 'low')

    return {
        targetEnvironment,
        status,
        failedEvents,
        riskScore,
        blastRadius,
        owner: owner || null,
        potentiallyImpactedDomains: [
            'treasury',
            'ledger',
            'compliance',
            'remittance',
        ],
        durationMinutes,
    }
}

export async function GET(
    _request: Request,
    context: { params: { runId: string } }
) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const runId = String(context.params.runId || '').trim()
        if (!runId) {
            return NextResponse.json({ error: 'run_id_required', detail: 'runId is required.' }, { status: 400 })
        }

        const runUpstream = await backendGet(`/v1/agentic/build/pipelines/runs/${encodeURIComponent(runId)}`)
        const runPayload = await runUpstream.json().catch(() => ({}))
        if (!runUpstream.ok) return NextResponse.json(runPayload, { status: runUpstream.status })

        const runData = unwrapData(runPayload)
        const run = asRecord(runData.run)
        const runEvents = asArray(runData.events).map(asRecord)

        const pipelineItemId = String(run.pipeline_item_id || '').trim()
        let pipelineItem = {} as Record<string, unknown>
        let timelineEvents: Record<string, unknown>[] = []

        if (pipelineItemId) {
            const timelineUpstream = await backendGet(`/v1/agentic/build/items/${encodeURIComponent(pipelineItemId)}/timeline`)
            const timelinePayload = await timelineUpstream.json().catch(() => ({}))
            if (timelineUpstream.ok) {
                const timelineData = unwrapData(timelinePayload)
                pipelineItem = asRecord(timelineData.item)
                timelineEvents = asArray(timelineData.events).map(asRecord)
            }
        }

        const reviewEvents = timelineEvents.filter((event) => {
            const eventType = String(event.event_type || '').toUpperCase()
            const payload = asRecord(event.payload)
            return (
                payload.runId === runId
                && (
                    eventType === 'QA_REVIEW_SUBMITTED'
                    || eventType === 'ORCHESTRATOR_REVIEW_SUBMITTED'
                    || eventType === 'FUNCTIONAL_APPROVAL_GRANTED'
                    || eventType === 'FUNCTIONAL_APPROVAL_DECLINED'
                )
            )
        })

        const criticalEvents = runEvents.map((event) => {
            const eventType = String(event.event_type || 'UNKNOWN')
            const status = typeof event.status === 'string' ? event.status : undefined
            return {
                ...event,
                severity: toSeverity(eventType, status),
            }
        })

        const responsibleAgents = [
            run.triggered_by,
            pipelineItem.owner,
            ...reviewEvents.map((event) => asRecord(event.payload).reviewedBy),
        ]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .map((value) => value.trim())
            .filter((value, index, arr) => arr.indexOf(value) === index)

        const impact = toImpactSummary(run, runEvents, typeof pipelineItem.owner === 'string' ? pipelineItem.owner : undefined)

        const optimizationRecommendations = [
            ...(impact.failedEvents > 0
                ? ['Harden failing stage with deterministic retries and circuit-breaker guardrails.']
                : []),
            ...(impact.durationMinutes !== null && impact.durationMinutes > 30
                ? ['Split long-running build jobs and parallelize independent checks.']
                : []),
            ...(reviewEvents.length === 0
                ? ['Add QA and Orchestrator review submissions before promotion to prod.']
                : []),
        ]

        return NextResponse.json(
            {
                runId,
                summary: {
                    ...run,
                    title: pipelineItem.title || null,
                    track: pipelineItem.track || run.track || null,
                    owner: pipelineItem.owner || null,
                },
                details: {
                    pipelineItem,
                    criticalEvents,
                    reviewEvents,
                },
                ecosystemImpact: impact,
                responsibility: {
                    primaryOwner: pipelineItem.owner || run.triggered_by || null,
                    responsibleAgents,
                },
                optimization: {
                    recommendations: optimizationRecommendations,
                    canOptimize: true,
                },
                fetchedAt: new Date().toISOString(),
            },
            {
                status: 200,
                headers: {
                    'cache-control': 'private, max-age=5',
                },
            }
        )
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_pipeline_drilldown_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
