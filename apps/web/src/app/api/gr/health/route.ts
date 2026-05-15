import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured, toJsonResponse } from '../_lib/backend'

export async function GET() {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const upstream = await backendGet('/health')
        return toJsonResponse(upstream)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'backend_unreachable',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
