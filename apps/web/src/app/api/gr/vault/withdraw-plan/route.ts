import { NextResponse } from 'next/server'
import { deframeGet, isDeframeConfigured, readJsonSafe } from '../../_lib/deframe'

interface WithdrawPlanRequest {
    walletAddress?: string
    strategyId?: string
    amountAtomic?: string
}

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as WithdrawPlanRequest

    if (!body.walletAddress || !body.strategyId || !body.amountAtomic) {
        return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    const isValidWallet = /^0x[a-fA-F0-9]{40}$/.test(body.walletAddress)
    const isValidAmount = /^\d+$/.test(body.amountAtomic)

    if (!isValidWallet || !isValidAmount) {
        return NextResponse.json({ error: 'invalid_request_fields' }, { status: 400 })
    }

    if (!isDeframeConfigured()) {
        return NextResponse.json({
            planId: `plan_wdr_${Date.now()}`,
            strategyId: body.strategyId,
            action: 'withdraw',
            amountAtomic: body.amountAtomic,
            amountUsd: '0.00',
            availableNowUsd: '0.00',
            scheduledUsd: '0.00',
            projectedApyAfterWithdrawPct: '0.00',
            estimatedSettlementSeconds: 300,
            transactionPlan: [],
            meta: {
                fetchedAt: new Date().toISOString(),
                source: 'fallback',
            },
        })
    }

    const qs = new URLSearchParams({
        action: 'withdraw',
        amount: body.amountAtomic,
        wallet: body.walletAddress,
    })

    const upstream = await deframeGet(`/strategies/${encodeURIComponent(body.strategyId)}/bytecode`, qs)
    const payload = await readJsonSafe(upstream)

    if (!upstream.ok) {
        return NextResponse.json({ error: 'vault_withdraw_plan_failed', detail: payload }, { status: upstream.status })
    }

    const result = payload as Record<string, unknown>
    const bytecode = Array.isArray(result.bytecode) ? result.bytecode : []

    return NextResponse.json({
        planId: `plan_wdr_${Date.now()}`,
        strategyId: body.strategyId,
        action: 'withdraw',
        amountAtomic: body.amountAtomic,
        amountUsd: '0.00',
        availableNowUsd: '0.00',
        scheduledUsd: '0.00',
        projectedApyAfterWithdrawPct: '0.00',
        estimatedSettlementSeconds: 300,
        transactionPlan: bytecode,
        meta: {
            fetchedAt: new Date().toISOString(),
            source: 'deframe',
        },
    })
}
