import { NextResponse } from 'next/server'
import {
    deframeGet,
    getFallbackStrategy,
    isDeframeConfigured,
    normalizeDeframeStrategy,
    readJsonSafe,
} from '../../../_lib/deframe'

export async function GET(_request: Request, context: { params: { strategyId: string } }) {
    const strategyId = context.params.strategyId

    if (!isDeframeConfigured()) {
        const fallback = getFallbackStrategy(strategyId)
        if (!fallback) {
            return NextResponse.json({ error: 'strategy_not_found' }, { status: 404 })
        }

        return NextResponse.json({
            strategy: fallback,
            deFiDepth: {
                protocolMix: [{ name: fallback.protocol, weightPct: '100.00' }],
                chainExposure: [{ chain: fallback.chain, weightPct: '100.00' }],
                apyStability: { volatilityBand: 'medium', drawdownPct: '0.00' },
            },
            meta: {
                fetchedAt: new Date().toISOString(),
                source: 'fallback',
            },
        })
    }

    const upstream = await deframeGet(`/strategies/${encodeURIComponent(strategyId)}`)
    const payload = await readJsonSafe(upstream)

    if (!upstream.ok) {
        return NextResponse.json({ error: 'vault_strategy_detail_failed', detail: payload }, { status: upstream.status })
    }

    const normalized = normalizeDeframeStrategy(payload as Record<string, unknown>)

    return NextResponse.json({
        strategy: normalized,
        deFiDepth: {
            protocolMix: [{ name: normalized.protocol, weightPct: '100.00' }],
            chainExposure: [{ chain: normalized.chain, weightPct: '100.00' }],
            apyStability: {
                volatilityBand: normalized.riskLevel === 'high' ? 'high' : normalized.riskLevel,
                drawdownPct: normalized.riskLevel === 'high' ? '2.50' : normalized.riskLevel === 'medium' ? '1.20' : '0.60',
            },
        },
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'deframe',
        },
    })
}
