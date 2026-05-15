import { NextResponse } from 'next/server'
import { deframeGet, isDeframeConfigured, readJsonSafe } from '../../_lib/deframe'

function toUsdString(value: unknown): string {
    const n = Number(value)
    if (Number.isFinite(n)) return n.toFixed(2)
    return '0.00'
}

function buildFallbackResponse(walletAddress: string, reason: 'not_configured' | 'upstream_unavailable') {
    return {
        walletAddress,
        summary: {
            totalBalanceUsd: '0.00',
            principalUsd: '0.00',
            profitUsd: '0.00',
            blendedApyPct: '0.00',
            yieldTodayUsd: '0.00',
            lastUpdatedAt: new Date().toISOString(),
        },
        positions: [],
        health: {
            circuitBreakerActive: false,
            usdcPrice: '1.0000',
            alerts: [],
        },
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'fallback',
            reason,
        },
    }
}

export async function GET(request: Request) {
    const walletAddress = new URL(request.url).searchParams.get('walletAddress')

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return NextResponse.json({ error: 'invalid_wallet_address' }, { status: 400 })
    }

    if (!isDeframeConfigured()) {
        return NextResponse.json(buildFallbackResponse(walletAddress, 'not_configured'))
    }

    const upstream = await deframeGet(`/wallets/${walletAddress}`)
    const payload = await readJsonSafe(upstream)

    if (!upstream.ok) {
        console.warn('[vault/positions] Upstream unavailable; serving fallback', {
            walletAddress,
            status: upstream.status,
            detail: payload,
        })
        return NextResponse.json(buildFallbackResponse(walletAddress, 'upstream_unavailable'))
    }

    const root = payload as Record<string, unknown>
    const positionsRaw = Array.isArray(root.positions) ? root.positions : []
    const summaryRaw = (root.summary && typeof root.summary === 'object') ? (root.summary as Record<string, unknown>) : {}

    const positions = positionsRaw.map((p) => {
        const item = p as Record<string, unknown>
        const spot = (item.spotPosition && typeof item.spotPosition === 'object')
            ? (item.spotPosition as Record<string, unknown>)
            : {}
        const strategy = (item.strategy && typeof item.strategy === 'object')
            ? (item.strategy as Record<string, unknown>)
            : {}

        const currentPosition = (spot.currentPosition && typeof spot.currentPosition === 'object')
            ? (spot.currentPosition as Record<string, unknown>)
            : {}
        const principal = (spot.principal && typeof spot.principal === 'object')
            ? (spot.principal as Record<string, unknown>)
            : {}
        const profit = (spot.profit && typeof spot.profit === 'object')
            ? (spot.profit as Record<string, unknown>)
            : {}

        return {
            strategyId: String(strategy.id || ''),
            label: `${String(strategy.protocol || 'Protocol')} ${String(strategy.assetName || 'Asset')}`,
            protocol: String(strategy.protocol || 'Unknown'),
            chain: String(strategy.network || 'unknown').toLowerCase(),
            chainId: Number(strategy.networkId || 0),
            status: Boolean(strategy.paused) ? 'paused' : 'active',
            currentPositionUsd: toUsdString(spot.underlyingBalanceUSD),
            principalUsd: toUsdString(principal.humanized),
            profitUsd: toUsdString(profit.humanized),
            apyPct: (Number(spot.apy || 0) * 100).toFixed(2),
            avgApyPct: (Number(spot.avgApy || 0) * 100).toFixed(2),
            inceptionApyPct: (Number(spot.inceptionApy || 0) * 100).toFixed(2),
            liquidityWindow: 'instant',
            currentPosition: currentPosition,
        }
    })

    const totalBalanceUsd = toUsdString(summaryRaw.totalUnderlyingBalanceUSD)
    const principalUsd = positions.reduce((sum, p) => sum + Number(p.principalUsd), 0).toFixed(2)
    const profitUsd = positions.reduce((sum, p) => sum + Number(p.profitUsd), 0).toFixed(2)

    return NextResponse.json({
        walletAddress,
        summary: {
            totalBalanceUsd,
            principalUsd,
            profitUsd,
            blendedApyPct: positions.length > 0
                ? (positions.reduce((sum, p) => sum + Number(p.apyPct), 0) / positions.length).toFixed(2)
                : '0.00',
            yieldTodayUsd: '0.00',
            lastUpdatedAt: new Date().toISOString(),
        },
        positions,
        health: {
            circuitBreakerActive: false,
            usdcPrice: '1.0000',
            alerts: [],
        },
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'deframe',
        },
    })
}
