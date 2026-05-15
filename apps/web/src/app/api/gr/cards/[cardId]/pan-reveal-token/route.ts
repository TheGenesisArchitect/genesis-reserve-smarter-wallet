import { NextRequest } from 'next/server'
import { createPanRevealToken, ensureNotRateLimited, withIdempotency } from '../../../_lib/card-service'

type Params = { params: Promise<{ cardId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:cards:pan-token')
    if (limited) return limited

    const { cardId } = await params
    return withIdempotency(request, `cards.pan_token:${cardId}`, async () => createPanRevealToken(cardId), 2 * 60 * 1000)
}
