import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toOrderView(payload: unknown) {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    const source = Object.keys(data).length > 0 ? data : record
    const platformFee = source.platformFee ?? source.platform_fee ?? '0'
    const partnerFee = source.partnerFee ?? source.partner_fee ?? '0'
    const totalFee = Number(platformFee) + Number(partnerFee)

    return {
        orderId: String(source.orderId ?? source.order_id ?? ''),
        reservationId: String(source.reservationId ?? source.reservation_id ?? source.orderId ?? ''),
        amount: String(source.sendAmount ?? source.amount ?? '0'),
        fee: Number.isFinite(totalFee) ? String(totalFee) : '0',
        status: String(source.status ?? 'PENDING'),
        createdAt: String(source.createdAt ?? source.created_at ?? new Date().toISOString()),
        raw: source,
    }
}

export async function POST(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || `order-${Date.now()}`
        const upstream = await backendPost('/v1/remittance/order', body, idempotencyKey)
        const payload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toOrderView(payload))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'order_request_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
