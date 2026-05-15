import { NextRequest } from 'next/server'
import { ensureNotRateLimited, getPayout, toResponse } from '../../_lib/card-service'

type Params = { params: Promise<{ payoutId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:payouts:get')
    if (limited) return limited

    const { payoutId } = await params
    return toResponse(getPayout(payoutId))
}
