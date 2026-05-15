import { NextResponse } from 'next/server'
import { backendGet, backendPost, isBackendConfigured } from '../../_lib/backend'

const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/
const fallbackStrategyPreferences = new Map<string, { strategy: string; updatedBy: string | null; updatedAt: string }>()

function buildFallbackPreference(walletAddress: string) {
    const entry = fallbackStrategyPreferences.get(walletAddress.toLowerCase())

    return {
        data: {
            walletAddress,
            strategy: entry?.strategy ?? null,
            updatedBy: entry?.updatedBy ?? null,
            updatedAt: entry?.updatedAt ?? null,
        },
        meta: {
            source: 'fallback',
            fetchedAt: new Date().toISOString(),
        },
    }
}

function writeFallbackPreference(walletAddress: string, strategy: string, updatedBy?: string | null) {
    const now = new Date().toISOString()
    const key = walletAddress.toLowerCase()

    fallbackStrategyPreferences.set(key, {
        strategy,
        updatedBy: updatedBy ?? null,
        updatedAt: now,
    })

    return {
        status: 'accepted',
        data: {
            walletAddress,
            strategy,
            updatedBy: updatedBy ?? null,
            updatedAt: now,
        },
        meta: {
            source: 'fallback',
            acceptedAt: now,
        },
    }
}

export async function GET(request: Request) {
    const search = new URL(request.url).searchParams
    const walletAddress = search.get('walletAddress')

    if (!walletAddress || !walletAddressPattern.test(walletAddress)) {
        return NextResponse.json(
            { error: 'invalid_wallet_address', detail: 'walletAddress query parameter is required and must be a valid EVM address.' },
            { status: 400 }
        )
    }

    if (!isBackendConfigured()) {
        return NextResponse.json(buildFallbackPreference(walletAddress))
    }

    try {
        const upstream = await backendGet(`/v1/treasury/strategy-preference/${walletAddress}`)
        const payload = await upstream.json().catch(() => ({}))

        if (upstream.ok) {
            return NextResponse.json(payload, { status: upstream.status })
        }

        return NextResponse.json(buildFallbackPreference(walletAddress), { status: 200 })
    } catch (error) {
        return NextResponse.json(buildFallbackPreference(walletAddress), { status: 200 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as {
            walletAddress?: string
            strategy?: string
            strategyId?: string
            updatedBy?: string
        }

        const walletAddress = String(body.walletAddress || '')
        const strategy = String(body.strategy || body.strategyId || '').trim()

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

        const fallbackPayload = writeFallbackPreference(walletAddress, strategy, body.updatedBy)

        if (!isBackendConfigured()) {
            return NextResponse.json(fallbackPayload, { status: 202 })
        }

        const idempotencyKey = request.headers.get('idempotency-key') || `strategy-pref-${Date.now()}`
        const upstream = await backendPost(
            '/v1/treasury/strategy-preference',
            { walletAddress, strategy, updatedBy: body.updatedBy || null },
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
