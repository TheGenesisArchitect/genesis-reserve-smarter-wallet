import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured, toJsonResponse } from '../../_lib/backend'

export async function GET(
    request: Request,
    context: { params: { accountId: string } }
) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const accountId = context.params.accountId
        const query = new URL(request.url).searchParams
        const queryString = query.toString()
        const upstream = await backendGet(`/v1/ledger/entries/${accountId}`, queryString)
        return toJsonResponse(upstream)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'history_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
