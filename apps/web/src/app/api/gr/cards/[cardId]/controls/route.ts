import { NextRequest } from 'next/server'
import { ensureNotRateLimited, updateCardControls, withIdempotency } from '../../../_lib/card-service'

type Params = { params: Promise<{ cardId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:cards:controls')
    if (limited) return limited

    const { cardId } = await params
    return withIdempotency(request, `cards.controls:${cardId}`, async () => {
        const patch = await request.json().catch(() => ({}))
        return updateCardControls(cardId, patch)
    })
}
