import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../../_lib/backend'

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function parseNumeric(value: unknown, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function toQuoteView(payload: unknown) {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    const source = Object.keys(data).length > 0 ? data : record

    const quoteId = String(source.quoteId ?? source.quote_id ?? `quote-${Date.now()}`)
    const fxRate = String(source.fxRate ?? source.rate ?? '1')
    const spreadBps = parseNumeric(source.fxSpreadBps ?? source.spreadBps ?? source.spread, 0)
    const etaSeconds = parseNumeric(source.etaSeconds ?? source.eta ?? 0)
    const hours = Math.max(1, Math.ceil(etaSeconds / 3600))
    const fee = String(source.totalCostUsdc ?? source.fee ?? '0')
    const netAmount = String(source.receiveAmount ?? source.netAmount ?? source.sendAmount ?? '0')

    return {
        quoteId,
        rate: fxRate,
        spread: spreadBps / 100,
        deliveryEstimate: `${hours}h`,
        fee,
        netAmount,
        expiresAt: String(source.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString()),
        fetchedAt: new Date().toISOString(),
    }
}

async function quoteUpstream(body: Record<string, unknown>, idempotencyKey: string) {
    const upstream = await backendPost('/v1/remittance/quote', body, idempotencyKey)
    const payload = await upstream.json().catch(() => ({}))

    if (!upstream.ok) {
        return NextResponse.json(payload, { status: upstream.status })
    }

    return NextResponse.json(toQuoteView(payload))
}

export async function GET(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const params = new URL(request.url).searchParams
        const accountId = params.get('accountId')
        const amount = params.get('amount')

        if (!accountId || !amount) {
            return NextResponse.json(
                {
                    error: 'missing_params',
                    detail: 'Provide accountId and amount query parameters.',
                },
                { status: 400 }
            )
        }

        return quoteUpstream(
            {
                accountId,
                sendAmount: amount,
                sendCurrency: 'USDC',
                receiveCurrency: params.get('receiveCurrency') || 'PHP',
                corridor: params.get('corridor') || 'US-PH',
                payoutMethod: params.get('payoutMethod') || 'bank_transfer',
            },
            `quote-${Date.now()}`
        )
    } catch (error) {
        return NextResponse.json(
            {
                error: 'quote_request_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}

export async function POST(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const body = (await request.json()) as Record<string, unknown>
        const idempotencyKey = request.headers.get('idempotency-key') || `quote-${Date.now()}`
        return quoteUpstream(body, idempotencyKey)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'quote_request_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
