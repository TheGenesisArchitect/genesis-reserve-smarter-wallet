import { NextRequest, NextResponse } from 'next/server'
import { circleStatusToOnChain } from '../../_lib/circle-adapter'
import { dbEnabled, dbGetFundingByCirclePaymentId, dbUpdateFundingCirclePayment } from '../../_lib/card-db'
import { ensureNotRateLimited } from '../../_lib/card-service'

// Circle sends payment status notifications to this endpoint.
// Payload shape: { notificationType: 'payments', payment: { id, status, transactionHash, ... } }
//
// Circle Payments API lifecycle: pending → confirmed → paid (USDC settled on-chain) | failed
//   pending / confirmed → onChainStatus: 'pending'
//   paid                → onChainStatus: 'confirmed'
//   failed              → onChainStatus: 'failed'
//
// Circle does not sign webhooks with HMAC. For production, restrict access by:
//   1. IP allowlisting Circle's published webhook IPs, OR
//   2. Setting CIRCLE_WEBHOOK_SECRET and checking a shared secret header.

export async function POST(request: NextRequest) {
    const limited = ensureNotRateLimited(request, 'gr:webhooks:circle')
    if (limited) return limited

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    // Optional shared-secret check. Set CIRCLE_WEBHOOK_SECRET to a random string
    // and configure it in Circle's notification subscription settings.
    const webhookSecret = process.env.CIRCLE_WEBHOOK_SECRET
    if (webhookSecret) {
        const provided = request.headers.get('x-circle-secret')
        if (provided !== webhookSecret) {
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
        }
    }

    // Only handle payment notifications; acknowledge everything else silently.
    if (body?.notificationType !== 'payments') {
        return NextResponse.json({ ok: true })
    }

    const payment = body?.payment
    if (!payment?.id || !payment?.status) {
        return NextResponse.json({ ok: true })
    }

    const circlePaymentId: string = payment.id
    const onChainStatus = circleStatusToOnChain(String(payment.status))
    const transactionHash: string | null = payment.transactionHash ?? null

    if (dbEnabled()) {
        const funding = await dbGetFundingByCirclePaymentId(circlePaymentId)
        if (funding) {
            await dbUpdateFundingCirclePayment(funding.id, circlePaymentId, onChainStatus, transactionHash)
        }
    } else {
        // In-memory path: scan the global store for a matching circlePaymentId.
        // Imported lazily to avoid circular dependency.
        const { getCardServiceStore } = await import('../../_lib/card-service')
        const store = getCardServiceStore()
        for (const [id, tx] of store.funding.entries()) {
            if ((tx as any).circlePaymentId === circlePaymentId) {
                store.funding.set(id, {
                    ...tx,
                    onChainStatus,
                    updatedAt: new Date().toISOString(),
                })
                break
            }
        }
    }

    return NextResponse.json({ ok: true })
}
