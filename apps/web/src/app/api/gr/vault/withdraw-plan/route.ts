import { NextResponse } from 'next/server'
import { deframeGet, isDeframeConfigured, readJsonSafe } from '../../_lib/deframe'

interface WithdrawPlanRequest {
    walletAddress?: string
    strategyId?: string
    amountAtomic?: string
    liquidityWindow?: string
    maturityDate?: string   // ISO date — provided by client for Pendle/Term positions
}

type WithdrawalType = 'instant' | 'queued' | 'maturity'

function resolveWithdrawalType(liquidityWindow: string): WithdrawalType {
    if (liquidityWindow === 'scheduled') return 'maturity'
    if (liquidityWindow === 'same_day') return 'queued'
    return 'instant'
}

function resolveSettlementSeconds(liquidityWindow: string): number {
    if (liquidityWindow === 'same_day') return 86_400         // 24 h
    if (liquidityWindow === 'scheduled') return 0             // redeems at maturity, no queue
    return 0                                                  // instant
}

function resolveCanWithdrawNow(withdrawalType: WithdrawalType, maturityDate: string | null): boolean {
    if (withdrawalType === 'instant' || withdrawalType === 'queued') return true
    if (!maturityDate) return true   // no lock date known → optimistic
    return new Date(maturityDate).getTime() <= Date.now()
}

function buildResponse(
    strategyId: string,
    amountAtomic: string,
    liquidityWindow: string,
    maturityDate: string | null,
    transactionPlan: unknown[],
    source: 'deframe' | 'fallback'
) {
    const withdrawalType = resolveWithdrawalType(liquidityWindow)
    const canWithdrawNow = resolveCanWithdrawNow(withdrawalType, maturityDate)
    const estimatedSettlementSeconds = resolveSettlementSeconds(liquidityWindow)

    // lockedUntil: set for maturity-locked positions that aren't yet redeemable
    const lockedUntil: string | null =
        withdrawalType === 'maturity' && maturityDate && !canWithdrawNow
            ? new Date(maturityDate).toISOString()
            : null

    return {
        planId: `plan_wdr_${Date.now()}`,
        strategyId,
        action: 'withdraw' as const,
        amountAtomic,
        amountUsd: '0.00',
        availableNowUsd: canWithdrawNow ? '0.00' : '0.00',
        scheduledUsd: !canWithdrawNow ? '0.00' : '0.00',
        projectedApyAfterWithdrawPct: '0.00',
        estimatedSettlementSeconds,
        liquidityWindow: (liquidityWindow || 'instant') as 'instant' | 'same_day' | 'scheduled',
        canWithdrawNow,
        lockedUntil,
        withdrawalType,
        transactionPlan,
        meta: {
            fetchedAt: new Date().toISOString(),
            source,
        },
    }
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

    const liquidityWindow = body.liquidityWindow ?? 'instant'
    const maturityDate = body.maturityDate ?? null

    if (!isDeframeConfigured()) {
        return NextResponse.json(
            buildResponse(body.strategyId, body.amountAtomic, liquidityWindow, maturityDate, [], 'fallback')
        )
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

    return NextResponse.json(
        buildResponse(body.strategyId, body.amountAtomic, liquidityWindow, maturityDate, bytecode, 'deframe')
    )
}
