import { NextRequest } from 'next/server'
import { createPushToCardPayout, ensureNotRateLimited, withIdempotency } from '../../_lib/card-service'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:payouts:push-to-card')
    if (limited) return limited

    return withIdempotency(request, 'payouts.push_to_card', async () => {
        const body = await request.json().catch(() => ({}))
        return createPushToCardPayout(body)
    })
}
