import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../../../_lib/backend'

export async function GET(_request: Request, context: { params: { agentId: string } }) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const agentId = String(context.params.agentId || '').trim()
        if (!agentId) {
            return NextResponse.json(
                { error: 'agent_id_required', detail: 'agentId is required.' },
                { status: 400 }
            )
        }

        const upstream = await backendGet(`/v1/agentic/agents/${encodeURIComponent(agentId)}/lifecycle`)
        const payload = await upstream.json()

        if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status })

        const record = payload as Record<string, unknown>
        return NextResponse.json(record.data ?? payload, {
            headers: {
                'cache-control': 'private, max-age=10',
            },
        })
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_lifecycle_history_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
