import { NextRequest } from 'next/server'
import { ensureNotRateLimited, mutateCardStatus, withIdempotency } from '../../../_lib/card-service'

type Params = { params: Promise<{ cardId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:cards:unfreeze')
    if (limited) return limited

    const { cardId } = await params
    return withIdempotency(request, `cards.unfreeze:${cardId}`, async () => mutateCardStatus(cardId, 'active'))
}
