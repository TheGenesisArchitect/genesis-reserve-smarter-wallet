import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../_lib/backend'

export async function POST(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const body = await request.json()
        const agentId = String(body?.agentId || '').trim()
        const action = String(body?.action || '').trim().toUpperCase()

        if (!agentId) {
            return NextResponse.json(
                { error: 'agent_id_required', detail: 'agentId is required.' },
                { status: 400 }
            )
        }

        if (!action || !['START', 'PAUSE', 'STOP'].includes(action)) {
            return NextResponse.json(
                { error: 'invalid_action', detail: 'action must be START, PAUSE, or STOP.' },
                { status: 400 }
            )
        }

        const idempotencyKey = request.headers.get('idempotency-key')
            || `agentic-lifecycle-${agentId}-${action}-${Date.now()}`

        const upstream = await backendPost(
            `/v1/agentic/agents/${encodeURIComponent(agentId)}/lifecycle`,
            {
                requestId: body?.requestId,
                action,
                targetEnvironment: body?.targetEnvironment,
                requestedBy: body?.requestedBy,
                reason: body?.reason,
                ownerApproval: body?.ownerApproval,
            },
            idempotencyKey,
            request
        )

        const payload = await upstream.json()
        if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status })

        const record = payload as Record<string, unknown>
        return NextResponse.json(record.data ?? payload)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_lifecycle_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
