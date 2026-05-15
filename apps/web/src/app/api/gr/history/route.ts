import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../_lib/backend'

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

export async function GET(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    const search = new URL(request.url).searchParams
    const accountId = search.get('accountId')
    const page = search.get('page') ?? '1'
    const pageSize = search.get('pageSize') ?? '20'

    if (!accountId) {
        return NextResponse.json(
            { error: 'missing_account_id', detail: 'Provide accountId query parameter.' },
            { status: 400 }
        )
    }

    let entries: unknown[] = []
    try {
        const upstream = await backendGet(`/v1/ledger/entries/${accountId}`, `page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`)
        if (upstream.ok) {
            entries = unwrapEntries(await upstream.json())
        }
    } catch { /* backend unreachable — fall through with empty entries */ }

    return NextResponse.json(
        { accountId, entries, fetchedAt: new Date().toISOString() },
        { status: 200, headers: { 'cache-control': 'private, max-age=10' } }
    )
}
