import { NextRequest } from 'next/server'
import { createFundingConversionQuote, ensureNotRateLimited, toResponse } from '../../_lib/card-service'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:funding:conversion-quote')
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    return toResponse(createFundingConversionQuote(body))
}
