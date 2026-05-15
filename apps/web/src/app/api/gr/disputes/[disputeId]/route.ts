import { NextRequest } from 'next/server'
import { ensureNotRateLimited, getDispute, toResponse } from '../../_lib/card-service'

type Params = { params: Promise<{ disputeId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:disputes:get')
    if (limited) return limited

    const { disputeId } = await params
    return toResponse(getDispute(disputeId))
}
