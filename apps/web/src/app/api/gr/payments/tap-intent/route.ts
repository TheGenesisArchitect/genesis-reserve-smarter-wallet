import { NextResponse } from 'next/server'

// Creates a Stripe PaymentIntent for the Tap to Pay / digital wallet flow.
// Enabling automatic_payment_methods lets Stripe surface Apple Pay and Google Pay
// automatically — no per-method allowlist needed, Stripe handles the routing.
export async function POST(request: Request) {
    try {
        const body = await request.json() as { amount: number; accountId?: string; description?: string }
        const { amount, accountId, description } = body

        if (!amount || amount < 0.5) {
            return NextResponse.json({ error: 'Minimum payment is $0.50' }, { status: 400 })
        }

        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (!stripeKey || stripeKey.length < 10) {
            return NextResponse.json(
                { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.' },
                { status: 503 }
            )
        }

        const Stripe = (await import(/* webpackIgnore: true */ 'stripe')).default
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })

        const intent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            // automatic_payment_methods lets Stripe route to Apple Pay / Google Pay
            // based on the customer's device and your Stripe dashboard settings.
            automatic_payment_methods: { enabled: true },
            description: description ?? 'Genesis Reserve payment',
            metadata: {
                flow: 'tap_to_pay',
                accountId: accountId ?? 'unknown',
            },
        })

        return NextResponse.json({ clientSecret: intent.client_secret })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create payment intent'
        console.error('[payments/tap-intent]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
