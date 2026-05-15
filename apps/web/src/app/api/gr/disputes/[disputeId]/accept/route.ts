import { NextRequest } from 'next/server'
import { acceptDispute, ensureNotRateLimited, toResponse, withIdempotency } from '../../../_lib/card-service'

type Params = { params: Promise<{ disputeId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:disputes:accept')
    if (limited) return limited

    const { disputeId } = await params
    return withIdempotency(request, `disputes.accept:${disputeId}`, async () => acceptDispute(disputeId))
}
