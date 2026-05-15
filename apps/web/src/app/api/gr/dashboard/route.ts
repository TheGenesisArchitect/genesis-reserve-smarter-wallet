import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../_lib/backend'

function unwrapDataEnvelope(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return payload
    const maybeRecord = payload as Record<string, unknown>
    return maybeRecord.data ?? payload
}

function unwrapEntries(payload: unknown): unknown[] {
    if (!payload || typeof payload !== 'object') return []
    const record = payload as Record<string, unknown>
    const data = record.data

    if (Array.isArray(data)) return data
    if (data && typeof data === 'object') {
        const dataRecord = data as Record<string, unknown>
        if (Array.isArray(dataRecord.entries)) return dataRecord.entries as unknown[]
    }

    if (Array.isArray(record.entries)) return record.entries as unknown[]
    return []
}

function unwrapCommandCenter(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return undefined
    const record = payload as Record<string, unknown>
    const data = record.data
    if (data && typeof data === 'object') return data
    return undefined
}

/* Fetch one backend endpoint and return the JSON, or null on any failure */
async function safeGet(path: string, query?: string): Promise<unknown> {
    try {
        const res = await backendGet(path, query)
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
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

    // Each call is independent — a 401/502 on one won't break the others.
    const [balancePayload, yieldPayload, historyPayload, commandCenterPayload] = await Promise.all([
        safeGet(`/v1/ledger/balance/${accountId}`),
        safeGet(`/v1/treasury/yield/${accountId}`),
        safeGet(`/v1/ledger/entries/${accountId}`, 'page=1&pageSize=5'),
        safeGet('/v1/agentic/dashboard/db-kpis'),
    ])

    return NextResponse.json(
        {
            accountId,
            balance: balancePayload ? unwrapDataEnvelope(balancePayload) : null,
            yield: yieldPayload ? unwrapDataEnvelope(yieldPayload) : null,
            history: historyPayload ? unwrapEntries(historyPayload) : [],
            commandCenter: commandCenterPayload ? unwrapCommandCenter(commandCenterPayload) : null,
            fetchedAt: new Date().toISOString(),
        },
        {
            status: 200,
            headers: { 'cache-control': 'private, max-age=30' },
        }
    )
}
