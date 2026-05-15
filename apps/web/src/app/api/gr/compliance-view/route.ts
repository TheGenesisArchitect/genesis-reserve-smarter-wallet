import { NextResponse } from 'next/server'
import { backendGet, backendNotConfiguredResponse, isBackendConfigured } from '../_lib/backend'
import type { ComplianceTier, ComplianceViewResponse } from '../../../../lib/bff.types'

const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/

function normalizeTier(value: unknown): ComplianceTier {
    const raw = String(value ?? '').toUpperCase()
    if (raw === 'INSTITUTIONAL' || raw === '3') return 'INSTITUTIONAL'
    if (raw === 'ENHANCED' || raw === '2') return 'ENHANCED'
    return 'BASIC'
}

function limitsForTier(tier: ComplianceTier) {
    if (tier === 'INSTITUTIONAL') return { dailyLimit: 1_000_000, txLimit: 250_000 }
    if (tier === 'ENHANCED') return { dailyLimit: 250_000, txLimit: 10_000 }
    return { dailyLimit: 10_000, txLimit: 1_000 }
}

function toView(walletAddress: string, payload: unknown): ComplianceViewResponse {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
    // Backend AccountStatus fields: kycLevel (0-3), sanctionStatus, amlStatus
    const tier = normalizeTier(data.kycLevel ?? data.kycTier ?? data.tier ?? data.level)
    const limits = limitsForTier(tier)
    // sanctioned: true if sanctionStatus === 'BLOCKED' or any legacy boolean flag
    const sanctioned = data.sanctionStatus === 'BLOCKED'
        || Boolean(data.sanctioned ?? data.blacklisted ?? false)
    // pendingReview: true if sanctionStatus === 'REVIEW' or any legacy flag
    const pendingReview = data.sanctionStatus === 'REVIEW'
        || Boolean(data.pendingReview ?? data.pending_review ?? data.reviewRequired ?? false)
    // Prefer backend amlStatus if present, otherwise derive from screen result
    const backendAml = data.amlStatus as string | undefined
    const amlStatus: 'CLEAR' | 'REVIEW' | 'BLOCKED' =
        backendAml === 'BLOCKED' ? 'BLOCKED'
            : backendAml === 'REVIEW' ? 'REVIEW'
                : sanctioned ? 'BLOCKED'
                    : pendingReview ? 'REVIEW'
                        : 'CLEAR'

    return {
        walletAddress,
        kycTier: tier,
        sanctioned,
        pendingReview,
        amlStatus,
        canDeposit: !sanctioned,
        canSend: !sanctioned && tier !== 'BASIC',
        dailyLimit: Number(data.dailyLimit ?? limits.dailyLimit),
        txLimit: Number(data.txLimit ?? limits.txLimit),
        travelRuleRequired: tier !== 'BASIC',
        fetchedAt: new Date().toISOString(),
    }
}

export async function GET(request: Request) {
    if (!isBackendConfigured()) return backendNotConfiguredResponse()

    const search = new URL(request.url).searchParams
    const walletAddress = search.get('walletAddress')

    if (!walletAddress) {
        return NextResponse.json({ error: 'missing_wallet_address', detail: 'Provide walletAddress query parameter.' }, { status: 400 })
    }

    if (!walletAddressPattern.test(walletAddress)) {
        return NextResponse.json({ error: 'invalid_wallet_address', detail: 'walletAddress must be a valid EVM address.' }, { status: 400 })
    }

    try {
        const upstream = await backendGet(`/v1/compliance/status/${walletAddress}`)
        const payload = await upstream.json()

        if (!upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(toView(walletAddress, payload), {
            headers: {
                'cache-control': 'private, max-age=300',
            },
        })
    } catch (error) {
        return NextResponse.json(
            {
                error: 'compliance_view_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
