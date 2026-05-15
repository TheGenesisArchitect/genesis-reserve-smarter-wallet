import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toFinalizeView(payload: unknown) {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    const source = Object.keys(data).length > 0 ? data : record

    return {
        status: String(source.status ?? 'SETTLED'),
        txHash: source.txHash ? String(source.txHash) : undefined,
        completedAt: new Date().toISOString(),
        raw: source,
    }
}

export async function POST(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || `finalize-${Date.now()}`
        const upstream = await backendPost('/v1/treasury/finalize', body, idempotencyKey)
        const payload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toFinalizeView(payload))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'finalize_request_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
