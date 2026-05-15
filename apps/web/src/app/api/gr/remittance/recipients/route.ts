import { NextResponse } from 'next/server'
import { backendNotConfiguredResponse, backendGet, backendPost, isBackendConfigured } from '../../_lib/backend'

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

function toRecipientsListView(payload: unknown) {
    const record = asRecord(payload)
    const data = asRecord(record.data)
    const source = Object.keys(data).length > 0 ? data : record

    const recipients = Array.isArray(source.recipients) ? source.recipients : []

    return {
        accountId: String(source.accountId ?? source.account_id ?? ''),
        recipients: recipients.map(toRecipientView),
        fetchedAt: String(source.fetchedAt ?? new Date().toISOString()),
    }
}

export async function GET(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const params = new URL(request.url).searchParams
        const accountId = params.get('accountId')

        if (!accountId) {
            return NextResponse.json(
                { error: 'missing_account_id', detail: 'Provide accountId query parameter.' },
                { status: 400 }
            )
        }

        const queryString = new URLSearchParams()
        queryString.append('accountId', accountId)

        const corridor = params.get('corridor')
        if (corridor) queryString.append('corridor', corridor)

        const payoutMethod = params.get('payoutMethod')
        if (payoutMethod) queryString.append('payoutMethod', payoutMethod)

        const upstream = await backendGet(`/v1/remittance/recipients/${accountId}`, queryString.toString())
        const payload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toRecipientsListView(payload))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'recipients_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}

export async function POST(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || `recip-${Date.now()}`

        const upstream = await backendPost('/v1/remittance/recipients', body, idempotencyKey)
        const payload = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toRecipientView(payload))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'recipient_create_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
