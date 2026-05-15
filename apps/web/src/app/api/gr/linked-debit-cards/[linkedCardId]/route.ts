import { NextRequest } from 'next/server'
import { ensureNotRateLimited, toResponse, unlinkLinkedDebitCard, withIdempotency } from '../../_lib/card-service'

type Params = { params: Promise<{ linkedCardId: string }> }

export async function DELETE(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:linked-debit-cards:delete')
    if (limited) return limited

    const { linkedCardId } = await params
    return withIdempotency(request, `linked_debit_cards.remove:${linkedCardId}`, async () => unlinkLinkedDebitCard(linkedCardId))
}
