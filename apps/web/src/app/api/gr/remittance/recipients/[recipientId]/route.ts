import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendPatch, isBackendConfigured } from '../../../_lib/backend'

type RouteContext = { params: { recipientId: string } }

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toRecipientView(payload: unknown) {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    const source = Object.keys(data).length > 0 ? data : record

    return {
        recipientId: String(source.recipient_id ?? ''),
        accountId: String(source.account_id ?? ''),
        displayName: String(source.display_name ?? ''),
        recipientType: String(source.recipient_type ?? 'INDIVIDUAL'),
        corridor: String(source.corridor ?? ''),
        payoutMethod: String(source.payout_method ?? ''),
        recipientAddress: source.recipient_address ? String(source.recipient_address) : undefined,
        recipientName: source.recipient_name ? String(source.recipient_name) : undefined,
        recipientPhone: source.recipient_phone ? String(source.recipient_phone) : undefined,
        recipientEmail: source.recipient_email ? String(source.recipient_email) : undefined,
        bankCode: source.bank_code ? String(source.bank_code) : undefined,
        bankName: source.bank_name ? String(source.bank_name) : undefined,
        branchCode: source.branch_code ? String(source.branch_code) : undefined,
        accountNumber: source.account_number ? String(source.account_number) : undefined,
        accountType: source.account_type ? String(source.account_type) : undefined,
        mobileProvider: source.mobile_provider ? String(source.mobile_provider) : undefined,
        mobileNumber: source.mobile_number ? String(source.mobile_number) : undefined,
        verificationStatus: String(source.verification_status ?? 'UNVERIFIED'),
        verifiedAt: source.verified_at ? String(source.verified_at) : undefined,
        memo: source.memo ? String(source.memo) : undefined,
        isDefault: Boolean(source.is_default ?? false),
        status: String(source.status ?? 'ACTIVE'),
        createdAt: String(source.created_at ?? new Date().toISOString()),
        updatedAt: String(source.updated_at ?? new Date().toISOString()),
    }
}

/**
 * PATCH /api/gr/remittance/recipients/[recipientId]
 *
 * Proxies to PATCH /v1/remittance/recipients/:recipientId on the Genesis backend.
 * Accepted body fields: displayName, memo, isDefault, verificationStatus.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    const { recipientId } = params

    if (!recipientId) {
        return NextResponse.json(
            { error: 'missing_recipient_id', detail: 'recipientId path parameter is required.' },
            { status: 400 }
        )
    }

    try {
        const body = await request.json().catch(() => ({}))
        const idempotencyKey =
            request.headers.get('idempotency-key') || `recip-patch-${recipientId}-${Date.now()}`

        const upstream = await backendPatch(
            `/v1/remittance/recipients/${encodeURIComponent(recipientId)}`,
            body,
            idempotencyKey
        )
        const payload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toRecipientView(payload))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'recipient_update_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
