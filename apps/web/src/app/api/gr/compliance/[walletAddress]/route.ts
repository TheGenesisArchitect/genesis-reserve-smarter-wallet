import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured, toJsonResponse } from '../../_lib/backend'

export async function GET(
    _request: Request,
    context: { params: { walletAddress: string } }
) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const walletAddress = context.params.walletAddress
        const upstream = await backendGet(`/v1/compliance/status/${walletAddress}`)
        return toJsonResponse(upstream)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'compliance_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
