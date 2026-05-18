import { NextRequest } from 'next/server'
import { ensureNotRateLimited, toResponse, unlinkLinkedDebitCard, updateLinkedCardIssuerName, withIdempotency } from '../../_lib/card-service'

type Params = { params: Promise<{ linkedCardId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:linked-debit-cards:patch')
    if (limited) return limited

    const { linkedCardId } = await params
    const body = await request.json().catch(() => ({}))
    if (body.issuerName !== undefined) {
        return toResponse(updateLinkedCardIssuerName(linkedCardId, String(body.issuerName)))
    }
    const { NextResponse } = await import('next/server')
    return NextResponse.json({ error: { code: 'invalid_request', message: 'No patchable field provided.' } }, { status: 400 })
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:linked-debit-cards:delete')
    if (limited) return limited

    const { linkedCardId } = await params
    return withIdempotency(request, `linked_debit_cards.remove:${linkedCardId}`, async () => unlinkLinkedDebitCard(linkedCardId))
}
