import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const body = await request.json() as { amount: string }
        const amount = parseFloat(body.amount)

        if (!amount || amount < 0.25) {
            return NextResponse.json({ error: 'Minimum deposit is $0.25' }, { status: 400 })
        }

        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (!stripeKey || stripeKey.includes('PASTE')) {
            return NextResponse.json({ error: 'Stripe configuration missing' }, { status: 500 })
        }

        const referenceId = `STRIPE-${Date.now().toString(36).toUpperCase()}`
        const Stripe = (await import(/* webpackIgnore: true */ 'stripe')).default
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            payment_method_types: ['card'],
            metadata: {
                referenceId,
                flow: 'stripe_card_deposit',
            },
        })

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            referenceId,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Stripe intent creation failed.'
        console.error('[Deposit/StripeIntent] error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
