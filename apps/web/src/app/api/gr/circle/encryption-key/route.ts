import { NextRequest, NextResponse } from 'next/server'
import { ensureNotRateLimited } from '../../_lib/card-service'

const CIRCLE_API_BASE = 'https://api.circle.com/v1'

// Returns Circle's RSA public key for client-side card data encryption.
// The frontend uses this to encrypt the card PAN + CVV with RSA-OAEP before
// posting to /api/gr/circle/cards — Circle's API key never leaves the server.
export async function GET(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:circle:encryption-key')
    if (limited) return limited

    const apiKey = process.env.CIRCLE_API_KEY
    if (!apiKey) {
        return NextResponse.json({ error: 'circle_unavailable', message: 'Circle is not configured.' }, { status: 503 })
    }

    try {
        const res = await fetch(`${CIRCLE_API_BASE}/encryption/public`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) {
            return NextResponse.json({ error: 'upstream_error', message: 'Failed to fetch Circle encryption key.' }, { status: 502 })
        }
        const body = await res.json()
        const { keyId, publicKey } = body?.data ?? {}
        if (!keyId || !publicKey) {
            return NextResponse.json({ error: 'upstream_error', message: 'Circle returned an incomplete encryption key.' }, { status: 502 })
        }
        return NextResponse.json({ keyId, publicKey })
    } catch {
        return NextResponse.json({ error: 'upstream_error', message: 'Could not reach Circle.' }, { status: 502 })
    }
}
