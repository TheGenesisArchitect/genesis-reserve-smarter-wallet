import { NextRequest } from 'next/server'
import { ensureNotRateLimited, listWebhookEvents, toResponse } from '../../_lib/card-service'

export async function GET(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:webhooks:events')
    if (limited) return limited

    return toResponse(listWebhookEvents(request.nextUrl.searchParams))
}
