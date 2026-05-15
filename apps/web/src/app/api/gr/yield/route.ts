import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../_lib/backend'

function unwrapDataEnvelope(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return payload
    const maybeRecord = payload as Record<string, unknown>
    return maybeRecord.data ?? payload
}

export async function GET(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    const search = new URL(request.url).searchParams
    const accountId = search.get('accountId')

    if (!accountId) {
        return NextResponse.json(
            { error: 'missing_account_id', detail: 'Provide accountId query parameter.' },
            { status: 400 }
        )
    }

    try {
        const upstream = await backendGet(`/v1/treasury/yield/${accountId}`)
        const payload = await upstream.json()

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(
            {
                accountId,
                yield: unwrapDataEnvelope(payload),
                fetchedAt: new Date().toISOString(),
            },
            {
                status: 200,
                headers: {
                    'cache-control': 'private, max-age=60',
                },
            }
        )
    } catch (error) {
        return NextResponse.json(
            {
                error: 'yield_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
