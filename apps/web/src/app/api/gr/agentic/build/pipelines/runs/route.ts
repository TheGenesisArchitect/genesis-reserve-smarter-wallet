import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../../../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function unwrapDataArray(payload: unknown): unknown[] {
    const record = asRecord(payload)
    if (Array.isArray(record.data)) return record.data
    if (Array.isArray(payload)) return payload
    return []
}

export async function GET(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const search = new URL(request.url).searchParams
        const pipelineItemId = search.get('pipelineItemId')
        const queryString = pipelineItemId
            ? `pipelineItemId=${encodeURIComponent(pipelineItemId)}`
            : undefined

        const upstream = await backendGet('/v1/agentic/build/pipelines/runs', queryString)
        const payload = await upstream.json().catch(() => ([]))

        if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status })

        return NextResponse.json(unwrapDataArray(payload), {
            status: 200,
            headers: {
                'cache-control': 'private, max-age=8',
            },
        })
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_pipeline_runs_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
