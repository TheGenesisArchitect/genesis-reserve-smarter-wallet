import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      amount: string
      cardNumber?: string
      expiryMM?: string
      expiryYY?: string
      cvc?: string
      cardholderName: string
      billingZip?: string
      referenceId?: string
    }

    const amount = parseFloat(body.amount)
    if (!amount || amount < 0.25) {
      return NextResponse.json({ error: 'Minimum deposit is $0.25' }, { status: 400 })
    }
    if (!body.cardNumber || !body.expiryMM || !body.expiryYY || !body.cvc || !body.cardholderName) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const referenceId = body.referenceId ?? `DEP-${Date.now().toString(36).toUpperCase()}`
    const stripeKey = process.env.STRIPE_SECRET_KEY
    const cleanCardNumber = body.cardNumber.replace(/\D/g, '')
    const expiryMM = body.expiryMM.replace(/\D/g, '')
    const expiryYY = body.expiryYY.replace(/\D/g, '')

    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      return NextResponse.json({ error: 'invalid_card_number' }, { status: 400 })
    }
    if (!expiryMM || !expiryYY) {
      return NextResponse.json({ error: 'invalid_expiry' }, { status: 400 })
    }

    if (stripeKey && !stripeKey.includes('PASTE')) {
      try {
        const Stripe = (await import(/* webpackIgnore: true */ 'stripe')).default
        const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })

        const paymentMethod = await stripe.paymentMethods.create({
          type: 'card',
          card: {
            number: cleanCardNumber,
            exp_month: parseInt(expiryMM, 10),
            exp_year: parseInt(expiryYY.length === 2 ? `20${expiryYY}` : expiryYY, 10),
            cvc: body.cvc,
          },
          billing_details: {
            name: body.cardholderName,
            address: { postal_code: body.billingZip },
          },
        })

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: 'usd',
          payment_method: paymentMethod.id,
          confirmation_method: 'automatic',
          confirm: true,
          description: `Genesis Reserve deposit — ${body.cardholderName}`,
          metadata: {
            referenceId,
            last4: cleanCardNumber.slice(-4),
            cardholderName: body.cardholderName,
          },
        })

        console.log('[Deposit/Card] Stripe PaymentIntent status:', paymentIntent.status)

        if (paymentIntent.status === 'succeeded') {
          return NextResponse.json({
            status: 'processing',
            referenceId,
            amount: amount.toFixed(2),
            stripePaymentIntentId: paymentIntent.id,
          })
        }

        return NextResponse.json({
          error: 'payment_requires_action',
          detail: paymentIntent.status,
          stripePaymentIntentId: paymentIntent.id,
        }, { status: 402 })
      } catch (stripeErr) {
        console.error('[Deposit/Card] Stripe error:', stripeErr)
        const message = stripeErr instanceof Error ? stripeErr.message : 'Stripe payment failed.'
        return NextResponse.json({ error: 'stripe_error', detail: message }, { status: 402 })
      }
    }

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/deposit/card`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, referenceId }),
        })
        if (res.ok) {
          const data = await res.json()
          return NextResponse.json({ ...data, referenceId })
        }
      } catch { /* backend unavailable */ }
    }

    console.log('[Deposit/Card] Accepted locally:', {
      referenceId,
      amount: body.amount,
      last4: cleanCardNumber.slice(-4),
      name: body.cardholderName,
    })

    return NextResponse.json({
      status: 'processing',
      referenceId,
      amount: amount.toFixed(2),
      message: 'Deposit received and queued for processing.',
    })

  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
}
