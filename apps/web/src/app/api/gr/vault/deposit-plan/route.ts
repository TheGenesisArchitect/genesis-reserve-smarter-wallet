import { NextResponse } from 'next/server'
import { deframeGet, isDeframeConfigured, readJsonSafe } from '../../_lib/deframe'

interface DepositPlanRequest {
    walletAddress?: string
    strategyId?: string
    amountAtomic?: string
    fromChainId?: number
    fromTokenAddress?: string
    toTokenAddress?: string
    intentTier?: 'preserve' | 'grow' | 'accelerate'
}

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as DepositPlanRequest

    if (!body.walletAddress || !body.strategyId || !body.amountAtomic) {
        return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    const isValidWallet = /^0x[a-fA-F0-9]{40}$/.test(body.walletAddress)
    const isValidAmount = /^\d+$/.test(body.amountAtomic)

    if (!isValidWallet || !isValidAmount) {
        return NextResponse.json({ error: 'invalid_request_fields' }, { status: 400 })
    }

    const fallbackPlan = {
        planId: `plan_dep_${Date.now()}`,
        strategyId: body.strategyId,
        action: 'lend' as const,
        amountAtomic: body.amountAtomic,
        amountUsd: '0.00',
        isCrossChain: false,
        isSameChainSwap: false,
        crossChainQuoteId: null,
        estimatedSettlementSeconds: 120,
        transactionPlan: [],
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'fallback',
        },
    }

    if (!isDeframeConfigured()) {
        return NextResponse.json(fallbackPlan)
    }

    const qs = new URLSearchParams({
        action: 'lend',
        amount: body.amountAtomic,
        wallet: body.walletAddress,
    })

    if (typeof body.fromChainId === 'number') qs.set('fromChainId', String(body.fromChainId))
    if (body.fromTokenAddress) qs.set('fromTokenAddress', body.fromTokenAddress)
    if (body.toTokenAddress) qs.set('toTokenAddress', body.toTokenAddress)

    let upstream: Response
    let payload: unknown

    try {
        upstream = await deframeGet(`/strategies/${encodeURIComponent(body.strategyId)}/bytecode`, qs)
        payload = await readJsonSafe(upstream)
    } catch {
        return NextResponse.json(fallbackPlan)
    }

    // Deframe strategy not indexed or API unavailable — return preview-only fallback
    if (!upstream.ok) {
        return NextResponse.json(fallbackPlan)
    }

    const result = payload as Record<string, unknown>
    const bytecode = Array.isArray(result.bytecode) ? result.bytecode : []
    const metadata = (result.metadata && typeof result.metadata === 'object')
        ? (result.metadata as Record<string, unknown>)
        : {}

    return NextResponse.json({
        planId: `plan_dep_${Date.now()}`,
        strategyId: body.strategyId,
        action: 'lend',
        amountAtomic: body.amountAtomic,
        amountUsd: '0.00',
        isCrossChain: Boolean(metadata.isCrossChain),
        isSameChainSwap: Boolean(metadata.isSameChainSwap),
        crossChainQuoteId: (metadata.crossChainQuoteId as string | null | undefined) ?? null,
        estimatedSettlementSeconds: Number(metadata.isCrossChain ? 600 : 120),
        transactionPlan: bytecode,
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'deframe',
        },
    })
}
