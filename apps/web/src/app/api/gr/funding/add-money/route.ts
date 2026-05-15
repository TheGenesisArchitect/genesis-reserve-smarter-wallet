import { NextRequest } from 'next/server'
import { createAddMoney, ensureNotRateLimited, withIdempotency } from '../../_lib/card-service'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:funding:add-money')
    if (limited) return limited

    return withIdempotency(request, 'funding.add_money', async () => {
        const body = await request.json().catch(() => ({}))
        const idempotencyKey = request.headers.get('idempotency-key') || undefined
        return createAddMoney(body, idempotencyKey)
    })
}
