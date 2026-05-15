import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../../../../../_lib/backend'

type ReviewType = 'functional' | 'qa' | 'orchestrator'
type ReviewVerdict = 'approve' | 'decline' | 'conditional_approve' | 'rework_required' | 'blocked'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function unwrapData(payload: unknown): Record<string, unknown> {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    return Object.keys(data).length > 0 ? data : record
}

function isReviewType(value: unknown): value is ReviewType {
    return value === 'functional' || value === 'qa' || value === 'orchestrator'
}

function isReviewVerdict(value: unknown): value is ReviewVerdict {
    return value === 'approve' || value === 'decline' || value === 'conditional_approve' || value === 'rework_required' || value === 'blocked'
}

export async function POST(
    request: Request,
    context: { params: { runId: string } }
) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const runId = String(context.params.runId || '').trim()
        if (!runId) {
            return NextResponse.json({ error: 'run_id_required', detail: 'runId is required.' }, { status: 400 })
        }

        const body = asRecord(await request.json())
        const reviewType = body.reviewType
        const verdict = body.verdict
        const reviewedBy = String(body.reviewedBy || '').trim()
        const notes = String(body.notes || '').trim()

        if (!isReviewType(reviewType)) {
            return NextResponse.json({ error: 'invalid_review_type', detail: 'reviewType must be functional, qa, or orchestrator.' }, { status: 400 })
        }

        if (!isReviewVerdict(verdict)) {
            return NextResponse.json(
                {
                    error: 'invalid_review_verdict',
                    detail: 'verdict must be approve, decline, conditional_approve, rework_required, or blocked.',
                },
                { status: 400 }
            )
        }

        if (!reviewedBy) {
            return NextResponse.json({ error: 'reviewer_required', detail: 'reviewedBy is required.' }, { status: 400 })
        }

        const runUpstream = await backendGet(`/v1/agentic/build/pipelines/runs/${encodeURIComponent(runId)}`)
        const runPayload = await runUpstream.json().catch(() => ({}))
        if (!runUpstream.ok) {
            return NextResponse.json(runPayload, { status: runUpstream.status })
        }

        const runData = unwrapData(runPayload)
        const run = asRecord(runData.run)
        const pipelineItemId = String(run.pipeline_item_id || '').trim()

        if (!pipelineItemId) {
            return NextResponse.json(
                {
                    error: 'pipeline_item_missing',
                    detail: `Pipeline item ID missing for run ${runId}.`,
                },
                { status: 502 }
            )
        }

        const eventType = reviewType === 'functional'
            ? (verdict === 'decline' ? 'FUNCTIONAL_APPROVAL_DECLINED' : 'FUNCTIONAL_APPROVAL_GRANTED')
            : reviewType === 'qa'
                ? 'QA_REVIEW_SUBMITTED'
                : 'ORCHESTRATOR_REVIEW_SUBMITTED'
        const reviewPayload = {
            runId,
            reviewType,
            verdict,
            reviewedBy,
            reviewedAt: new Date().toISOString(),
            ecosystemImpact: body.ecosystemImpact || null,
            optimizationRecommendations: Array.isArray(body.optimizationRecommendations)
                ? body.optimizationRecommendations
                : [],
            metadata: asRecord(body.metadata),
        }

        const idempotencyKey = request.headers.get('idempotency-key')
            || `pipeline-review-${runId}-${reviewType}-${Date.now()}`

        const eventUpstream = await backendPost(
            `/v1/agentic/build/items/${encodeURIComponent(pipelineItemId)}/events`,
            {
                eventType,
                notes: notes || `${reviewType.toUpperCase()} verdict: ${String(verdict).toUpperCase()}`,
                payload: reviewPayload,
                requestedBy: reviewedBy,
                targetEnvironment: run.target_environment,
            },
            idempotencyKey,
            request
        )

        const eventPayload = await eventUpstream.json().catch(() => ({}))
        if (!eventUpstream.ok) {
            return NextResponse.json(eventPayload, { status: eventUpstream.status })
        }

        const eventData = unwrapData(eventPayload)
        return NextResponse.json(
            {
                runId,
                pipelineItemId,
                review: reviewPayload,
                event: asRecord(eventData.event),
            },
            { status: 200 }
        )
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_pipeline_review_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
