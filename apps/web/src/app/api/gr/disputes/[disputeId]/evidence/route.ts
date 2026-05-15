import { NextRequest } from 'next/server'
import { ensureNotRateLimited, submitDisputeEvidence, toResponse, withIdempotency } from '../../../_lib/card-service'

type Params = { params: Promise<{ disputeId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:disputes:evidence')
    if (limited) return limited

    const { disputeId } = await params
    return withIdempotency(request, `disputes.evidence:${disputeId}`, async () => {
        const body = await request.json().catch(() => ({}))
        return submitDisputeEvidence(disputeId, body)
    })
}
