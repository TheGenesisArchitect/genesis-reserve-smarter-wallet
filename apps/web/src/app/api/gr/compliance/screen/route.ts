import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toComplianceView(payload: unknown) {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    const source = Object.keys(data).length > 0 ? data : record
    const result = String(source.result ?? source.screeningStatus ?? 'REVIEW').toUpperCase()

    return {
        sanctioned: result === 'FAIL' || result === 'BLOCKED',
        screeningStatus: result,
        screeningId: String(source.screeningId ?? source.id ?? ''),
        details: source,
    }
}

export async function POST(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || `screen-${Date.now()}`
        const upstream = await backendPost('/v1/compliance/screen', body, idempotencyKey)
        const payload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toComplianceView(payload))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'compliance_screen_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
