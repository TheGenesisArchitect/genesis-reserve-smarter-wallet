import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../../_lib/backend'

export async function GET() {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const upstream = await backendGet('/v1/agentic/agents')
        const payload = await upstream.json()

        if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status })

        const record = payload as Record<string, unknown>
        return NextResponse.json(record.data ?? payload, {
            headers: {
                'cache-control': 'private, max-age=15',
            },
        })
    } catch (error) {
        return NextResponse.json(
            {
                error: 'agentic_agents_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
