import { NextRequest } from 'next/server'
import { ensureNotRateLimited, quotePushToCard, toResponse } from '../../../_lib/card-service'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:payouts:push-to-card:quote')
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    return toResponse(quotePushToCard(body))
}
