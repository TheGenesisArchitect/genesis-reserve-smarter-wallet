import { NextRequest } from 'next/server'
import { createCard, ensureNotRateLimited, listCards, toResponse, withIdempotency } from '../_lib/card-service'

export async function GET(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:cards:list')
    if (limited) return limited

    return toResponse(listCards(request.nextUrl.searchParams))
}

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:cards:create')
    if (limited) return limited

    return withIdempotency(request, 'cards.create', async () => {
        const body = await request.json().catch(() => ({}))
        return createCard(body)
    })
}
