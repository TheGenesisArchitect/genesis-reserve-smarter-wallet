import { NextRequest } from 'next/server'
import { ensureNotRateLimited, listAuthorizations, toResponse } from '../../../_lib/card-service'

type Params = { params: Promise<{ cardId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:cards:authorizations')
    if (limited) return limited

    const { cardId } = await params
    return toResponse(listAuthorizations(cardId, request.nextUrl.searchParams))
}
