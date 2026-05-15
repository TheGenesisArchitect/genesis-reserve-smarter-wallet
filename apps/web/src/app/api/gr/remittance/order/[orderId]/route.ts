import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured, toJsonResponse } from '../../../_lib/backend'

export async function GET(
    _request: Request,
    context: { params: { orderId: string } }
) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const orderId = context.params.orderId
        const upstream = await backendGet(`/v1/remittance/order/${orderId}`)
        return toJsonResponse(upstream)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'order_status_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
