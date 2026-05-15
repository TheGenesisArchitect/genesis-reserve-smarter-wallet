import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { ensureNotRateLimited, withIdempotency } from '../../_lib/card-service'

const STRIPE_VERSION = '2026-04-22.dahlia'

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:linked-debit-cards:setup-intent')
    if (limited) return limited

    return withIdempotency(request, 'linked_debit_cards.setup_intent', async () => {
        const body = await request.json().catch(() => ({}))
        const accountId = body?.accountId

        if (!accountId) {
            return {
                status: 400,
                body: {
                    error: {
                        code: 'invalid_request',
                        message: 'accountId is required.',
                        details: {},
                        retryable: false,
                    },
                    meta: { source: 'internal', timestamp: new Date().toISOString() },
                },
            }
        }

        const secret = process.env.STRIPE_SECRET_KEY
        if (!secret || secret.includes('PASTE')) {
            return {
                status: 500,
                body: {
                    error: {
                        code: 'configuration_error',
                        message: 'Stripe configuration is missing.',
                        details: {},
                        retryable: false,
                    },
                    meta: { source: 'internal', timestamp: new Date().toISOString() },
                },
            }
        }

        const stripe = new Stripe(secret, { apiVersion: STRIPE_VERSION })

        try {
            const setupIntent = await stripe.setupIntents.create({
                payment_method_types: ['card'],
                usage: 'off_session',
                metadata: { accountId },
            })

            return {
                status: 200,
                body: {
                    data: {
                        setupIntentId: setupIntent.id,
                        clientSecret: setupIntent.client_secret,
                    },
                    meta: { source: 'stripe', timestamp: new Date().toISOString() },
                },
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to create Stripe setup intent.'
            return {
                status: 500,
                body: {
                    error: {
                        code: 'stripe_error',
                        message,
                        details: {},
                        retryable: false,
                    },
                    meta: { source: 'stripe', timestamp: new Date().toISOString() },
                },
            }
        }
    })
}
