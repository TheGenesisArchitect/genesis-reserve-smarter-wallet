import { NextRequest } from 'next/server'
import { createCardholder, ensureNotRateLimited, toResponse, withIdempotency } from '../_lib/card-service'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:cardholders:post')
    if (limited) return limited

    return withIdempotency(request, 'cardholders.create', async () => {
        const body = await request.json().catch(() => ({}))
        return createCardholder(body)
    })
}
