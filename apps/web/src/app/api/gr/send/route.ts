// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/app/api/gr/send/route.ts
//
// Single-surface BFF orchestrator for the full send pipeline.
// All four send-flow steps are dispatched through this one endpoint, which:
//   - Provides a single CORS / auth / rate-limit surface
//   - Centralises normalisation so SendFlow never knows about backend field names
//   - Enables future server-side sequencing (e.g. auto-screen before order)
//
// Accepted body shape: { action: SendAction, ...stepPayload }
//
// action → upstream route
// ──────────────────────────────────────────────
// quote    → POST /v1/remittance/quote
// screen   → POST /v1/compliance/screen
// order    → POST /v1/remittance/order
// finalize → POST /v1/treasury/finalize
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPost, isBackendConfigured } from '../_lib/backend'

// ── Type definitions ──────────────────────────────────────────────────────────

export type SendAction = 'quote' | 'screen' | 'order' | 'finalize'

interface SendRequest {
    action: SendAction
    [key: string]: unknown
}

// ── Normaliser helpers ────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function parseNumeric(value: unknown, fallback = 0): number {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

function unwrap(payload: unknown): Record<string, unknown> {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    return Object.keys(data).length > 0 ? data : record
}

// ── Per-action normalisers ────────────────────────────────────────────────────

function toQuoteView(payload: unknown) {
    const src = unwrap(payload)
    const spreadBps = parseNumeric(src.fxSpreadBps ?? src.spreadBps ?? src.spread, 0)
    const etaSeconds = parseNumeric(src.etaSeconds ?? src.eta ?? 0)
    const hours = Math.max(1, Math.ceil(etaSeconds / 3600))

    return {
        action: 'quote' as const,
        quoteId: String(src.quoteId ?? src.quote_id ?? `q-${Date.now()}`),
        rate: String(src.fxRate ?? src.rate ?? '1'),
        spread: spreadBps / 100,
        deliveryEstimate: `${hours}h`,
        fee: String(src.totalCostUsdc ?? src.fee ?? '0'),
        netAmount: String(src.receiveAmount ?? src.netAmount ?? src.sendAmount ?? '0'),
        expiresAt: String(src.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString()),
        fetchedAt: new Date().toISOString(),
    }
}

function toScreenView(payload: unknown) {
    const src = unwrap(payload)
    const result = String(src.result ?? src.screeningStatus ?? 'REVIEW').toUpperCase()

    return {
        action: 'screen' as const,
        sanctioned: result === 'FAIL' || result === 'BLOCKED',
        screeningStatus: result,
        screeningId: String(src.screeningId ?? src.id ?? ''),
        details: src,
    }
}

function toOrderView(payload: unknown) {
    const src = unwrap(payload)
    const platformFee = parseNumeric(src.platformFee ?? src.platform_fee, 0)
    const partnerFee = parseNumeric(src.partnerFee ?? src.partner_fee, 0)
    const fxRevenue = parseNumeric(src.fxRevenue ?? src.fx_revenue, 0)

    return {
        action: 'order' as const,
        orderId: String(src.orderId ?? src.order_id ?? ''),
        reservationId: String(src.reservationId ?? src.reservation_id ?? src.orderId ?? ''),
        amount: String(src.sendAmount ?? src.amount ?? '0'),
        fee: String(platformFee + partnerFee + fxRevenue),
        status: String(src.status ?? 'PENDING'),
        createdAt: String(src.createdAt ?? src.created_at ?? new Date().toISOString()),
    }
}

function toFinalizeView(payload: unknown) {
    const src = unwrap(payload)

    return {
        action: 'finalize' as const,
        status: String(src.status ?? 'SETTLED'),
        txHash: src.txHash ? String(src.txHash) : undefined,
        completedAt: new Date().toISOString(),
    }
}

// ── Action dispatch table ─────────────────────────────────────────────────────

type Dispatcher = (
    body: Record<string, unknown>,
    idempotencyKey: string
) => Promise<NextResponse>

const ACTION_MAP: Record<SendAction, [string, (p: unknown) => unknown]> = {
    quote: [
        '/v1/remittance/quote',
        toQuoteView,
    ],
    screen: [
        '/v1/compliance/screen',
        toScreenView,
    ],
    order: [
        '/v1/remittance/order',
        toOrderView,
    ],
    finalize: [
        '/v1/treasury/finalize',
        toFinalizeView,
    ],
}

function isValidAction(v: unknown): v is SendAction {
    return typeof v === 'string' && v in ACTION_MAP
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    let body: SendRequest
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'invalid_json', detail: 'Request body must be valid JSON.' },
            { status: 400 }
        )
    }

    const { action, ...payload } = body

    if (!isValidAction(action)) {
        return NextResponse.json(
            {
                error: 'invalid_action',
                detail: `action must be one of: ${Object.keys(ACTION_MAP).join(', ')}`,
            },
            { status: 400 }
        )
    }

    const [upstreamPath, normalise] = ACTION_MAP[action]
    const idempotencyKey =
        request.headers.get('idempotency-key') || `${action}-${Date.now()}`

    try {
        const upstream = await backendPost(upstreamPath, payload, idempotencyKey)
        const upstreamPayload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(
                { action, ...asRecord(upstreamPayload) },
                { status: upstream.status }
            )
        }

        return NextResponse.json(normalise(upstreamPayload))
    } catch (err) {
        return NextResponse.json(
            {
                error: `${action}_failed`,
                action,
                detail: err instanceof Error ? err.message : 'Upstream request failed.',
            },
            { status: 502 }
        )
    }
}
