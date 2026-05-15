import { NextRequest } from 'next/server'
import { ensureNotRateLimited, getFundingStatus, toResponse } from '../../_lib/card-service'

type Params = { params: Promise<{ fundingId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:funding:get')
    if (limited) return limited

    const { fundingId } = await params
    return toResponse(getFundingStatus(fundingId))
}
