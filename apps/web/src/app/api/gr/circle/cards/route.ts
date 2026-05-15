import { NextRequest, NextResponse } from 'next/server'
import { ensureNotRateLimited } from '../../_lib/card-service'
import { getRequestIp } from '../../_lib/request-controls'

const CIRCLE_API_BASE = 'https://api.circle.com/v1'

// Registers a debit card with Circle's card API using client-side encrypted data.
// The card PAN + CVV are encrypted in the browser with Circle's RSA public key
// (from GET /api/gr/circle/encryption-key) before reaching this endpoint — raw
// card data never touches Genesis servers.
//
// On success, returns { circleCardId } which the caller stores on LinkedDebitCard
// to enable future USDC purchases via Circle's non-custodial Payments API.
export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:circle:cards')
    if (limited) return limited

    const apiKey = process.env.CIRCLE_API_KEY
    if (!apiKey) {
        return NextResponse.json({ error: 'circle_unavailable', message: 'Circle is not configured.' }, { status: 503 })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const { encryptedData, keyId, billingDetails, expMonth, expYear, idempotencyKey } = body ?? {}

    if (!encryptedData || !keyId || !expMonth || !expYear || !idempotencyKey) {
        return NextResponse.json({
            error: 'invalid_request',
            message: 'encryptedData, keyId, expMonth, expYear, and idempotencyKey are required.',
        }, { status: 400 })
    }

    const clientIp = getRequestIp(request) ?? '0.0.0.0'

    try {
        const res = await fetch(`${CIRCLE_API_BASE}/cards`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                idempotencyKey,
                keyId,
                encryptedData,
                billingDetails: billingDetails ?? {},
                expMonth: Number(expMonth),
                expYear: Number(expYear),
                metadata: {
                    sessionId: idempotencyKey,
                    ipAddress: clientIp,
                    email: billingDetails?.email ?? null,
                    phoneNumber: billingDetails?.phoneNumber ?? null,
                },
            }),
        })

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}))
            const message = errBody?.message ?? 'Circle card registration failed.'
            return NextResponse.json({ error: 'circle_error', message }, { status: res.status })
        }

        const result = await res.json()
        const circleCardId = result?.data?.id

        if (!circleCardId) {
            return NextResponse.json({ error: 'upstream_error', message: 'Circle did not return a card ID.' }, { status: 502 })
        }

        return NextResponse.json({ circleCardId })
    } catch {
        return NextResponse.json({ error: 'upstream_error', message: 'Could not reach Circle.' }, { status: 502 })
    }
}
