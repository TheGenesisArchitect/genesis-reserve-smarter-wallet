import { NextRequest } from 'next/server'
import { ensureNotRateLimited, getCardholder, toResponse, updateCardholder, withIdempotency } from '../../_lib/card-service'

type Params = { params: Promise<{ cardholderId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:cardholders:get')
    if (limited) return limited

    const { cardholderId } = await params
    return toResponse(getCardholder(cardholderId))
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:cardholders:patch')
    if (limited) return limited

    const { cardholderId } = await params
    return withIdempotency(request, `cardholders.update:${cardholderId}`, async () => {
        const patch = await request.json().catch(() => ({}))
        return updateCardholder(cardholderId, patch)
    })
}
