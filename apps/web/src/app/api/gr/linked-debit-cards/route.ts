import { NextRequest } from 'next/server'
import { ensureNotRateLimited, linkDebitCard, listLinkedDebitCards, toResponse, withIdempotency } from '../_lib/card-service'

export async function GET(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:linked-debit-cards:list')
    if (limited) return limited

    return toResponse(listLinkedDebitCards(request.nextUrl.searchParams))
}

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:linked-debit-cards:create')
    if (limited) return limited

    return withIdempotency(request, 'linked_debit_cards.create', async () => {
        const body = await request.json().catch(() => ({}))
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
            ?? request.headers.get('x-real-ip')
            ?? undefined
        return linkDebitCard(body, ip)
    })
}
