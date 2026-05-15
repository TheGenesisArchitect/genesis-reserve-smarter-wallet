import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../../../../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function unwrapData(payload: unknown): Record<string, unknown> {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    return Object.keys(data).length > 0 ? data : record
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

        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || `pipeline-promote-${runId}-${Date.now()}`

        const upstream = await backendPost(
            `/v1/agentic/build/pipelines/runs/${encodeURIComponent(runId)}/promote`,
            body,
            idempotencyKey,
            request
        )

        const payload = await upstream.json().catch(() => ({}))
        if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status })

        return NextResponse.json(unwrapData(payload), { status: 200 })
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_pipeline_promote_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
