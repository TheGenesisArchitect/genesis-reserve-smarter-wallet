import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const TRANSAK_WEBHOOK_SECRET = process.env.TRANSAK_WEBHOOK_SECRET ?? ''

function verifySignature(payload: string, signature: string): boolean {
  if (!TRANSAK_WEBHOOK_SECRET) return true // dev: skip verification
  const expected = crypto
    .createHmac('sha512', TRANSAK_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-webhook-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventId = event.event_id as string | undefined
  const data = event.data as Record<string, unknown> | undefined

  if (eventId === 'ORDER_COMPLETED') {
    const orderId = data?.id
    const walletAddress = data?.walletAddress
    const cryptoAmount = data?.cryptoAmount
    const cryptoCurrency = data?.cryptoCurrency
    const network = data?.network

    console.log('[Transak] Order completed', { orderId, walletAddress, cryptoAmount, cryptoCurrency, network })
    // TODO: record completed order in DB for reconciliation
  }

  return NextResponse.json({ received: true })
}
