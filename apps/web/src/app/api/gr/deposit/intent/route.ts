import { NextResponse } from 'next/server'
import { backendPost, isBackendConfigured } from '../../_lib/backend'
import { checkMapleAccreditation } from '../../_lib/protocols/maple'

const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/

function buildFallbackIntent(payload: {
    walletAddress: string
    strategy: string
    amount: string
    accountId?: string
    source?: string
    metadata?: Record<string, unknown>
}) {
    const acceptedAt = new Date().toISOString()

    return {
        status: 'accepted',
        intentId: `intent_fallback_${Date.now()}`,
        data: {
            walletAddress: payload.walletAddress,
            strategy: payload.strategy,
            amount: payload.amount,
            accountId: payload.accountId || null,
            source: payload.source || 'wallet-usdc',
            metadata: payload.metadata || {},
        },
        meta: {
            source: 'fallback',
            acceptedAt,
        },
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as {
            walletAddress?: string
            strategy?: string
            strategyId?: string
            amount?: string
            accountId?: string
            source?: string
            metadata?: Record<string, unknown>
        }

        const walletAddress = String(body.walletAddress || '')
        const strategy = String(body.strategy || body.strategyId || '').trim()
        const amount = String(body.amount || '')

        if (!walletAddressPattern.test(walletAddress)) {
            return NextResponse.json(
                { error: 'invalid_wallet_address', detail: 'walletAddress must be a valid EVM address.' },
                { status: 400 }
            )
        }

        if (!strategy || strategy.length > 160) {
            return NextResponse.json(
                { error: 'invalid_strategy', detail: 'strategy must be a non-empty strategy identifier.' },
                { status: 400 }
            )
        }

        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            return NextResponse.json(
                { error: 'invalid_amount', detail: 'amount must be a positive numeric value.' },
                { status: 400 }
            )
        }

        // Phase 1: Maple accreditation pre-check
        if (strategy.toLowerCase().includes('maple')) {
            // Mock accreditation check: in production, fetch from compliance/screen endpoint
            const isAccredited = await checkMapleAccreditation(walletAddress, request)
            if (!isAccredited) {
                return NextResponse.json(
                    {
                        error: 'accreditation_required',
                        detail: 'This strategy requires investor accreditation. Your wallet does not meet accreditation requirements.',
                    },
                    { status: 403 }
                )
            }
        }

        const fallbackPayload = buildFallbackIntent({
            walletAddress,
            strategy,
            amount,
            accountId: body.accountId,
            source: body.source,
            metadata: body.metadata,
        })

        if (!isBackendConfigured()) {
            return NextResponse.json(fallbackPayload, { status: 202 })
        }

        const idempotencyKey = request.headers.get('idempotency-key') || `deposit-intent-${Date.now()}`
        const upstream = await backendPost(
            '/v1/treasury/deposit-intents',
            {
                walletAddress,
                strategy,
                amount,
                accountId: body.accountId || null,
                source: body.source || 'wallet-usdc',
                metadata: body.metadata || {},
            },
            idempotencyKey,
            request
        )

        const payload = await upstream.json().catch(() => ({}))

        if (upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(
            {
                ...fallbackPayload,
                meta: {
                    ...fallbackPayload.meta,
                    upstreamStatus: upstream.status,
                },
            },
            { status: 202 }
        )
    } catch (error) {
        return NextResponse.json(
            {
                status: 'accepted',
                meta: {
                    source: 'fallback',
                    detail: error instanceof Error ? error.message : 'Unknown error',
                },
            },
            { status: 202 }
        )
    }
}
