import { NextRequest } from 'next/server'
import { ensureNotRateLimited, getAuthorization, toResponse } from '../../_lib/card-service'

type Params = { params: Promise<{ authorizationId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
    const limited = ensureNotRateLimited(request, 'gr:authorizations:get')
    if (limited) return limited

    const { authorizationId } = await params
    return toResponse(getAuthorization(authorizationId))
}
