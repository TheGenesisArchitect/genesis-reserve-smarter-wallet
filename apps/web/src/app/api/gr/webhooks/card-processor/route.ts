import { NextRequest } from 'next/server'
import { ensureNotRateLimited, handleProcessorWebhook, toResponse } from '../../_lib/card-service'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:webhooks:card-processor')
    if (limited) return limited

    // Accept Stripe's standard header or our internal header for testing.
    const signature = request.headers.get('stripe-signature') ?? request.headers.get('x-webhook-signature')
    const payloadRaw = await request.text()
    let body: unknown = {}
    try {
        body = JSON.parse(payloadRaw || '{}')
    } catch {
        return toResponse({
            status: 400,
            body: {
                error: {
                    code: 'invalid_request',
                    message: 'Webhook payload must be valid JSON.',
                    details: {},
                    retryable: false,
                },
                meta: { source: 'mock', timestamp: new Date().toISOString() },
            },
        })
    }
    return toResponse(handleProcessorWebhook(signature, payloadRaw, body))
}
