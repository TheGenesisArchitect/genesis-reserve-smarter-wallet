import { NextResponse } from 'next/server'
import {
    backendGet,
    backendNotConfiguredResponse,
    isBackendConfigured,
} from '../_lib/backend'
import type { AnalyticsResponse, StrategyAllocationSummary, YieldHistoryPoint } from '../../../../lib/bff.types'

function unwrap(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {}
    const record = payload as Record<string, unknown>
    const inner = record.data ?? record
    if (!inner || typeof inner !== 'object') return {}
    return inner as Record<string, unknown>
}

export async function GET(request: Request) {
    const accountId = new URL(request.url).searchParams.get('accountId')
    if (!accountId) {
        return NextResponse.json(
            { error: 'missing_account_id', detail: 'Provide accountId query parameter.' },
            { status: 400 }
        )
    }

    if (!isBackendConfigured()) {
        const fallback: AnalyticsResponse = {
            accountId,
            blendedApy: 0,
            totalDeployedUsdc: '0',
            liquidBufferUsdc: '0',
            earnedTodayUsdc: '0',
            earnedAllTimeUsdc: '0',
            strategyAllocations: [],
            apyHistory: [],
            epochNumber: 0,
            secondsToNextHarvest: 900,
            fetchedAt: new Date().toISOString(),
        }

        return NextResponse.json(fallback, {
            status: 200,
            headers: { 'cache-control': 'private, max-age=20' },
        })
    }

    try {
        // Parallel: yield snapshot + balance + ledger entries
        const [yieldRes, balanceRes, entriesRes] = await Promise.all([
            backendGet(`/v1/treasury/yield/${accountId}`),
            backendGet(`/v1/treasury/balance/${accountId}`),
            backendGet(`/v1/ledger/entries/${accountId}`, 'limit=50&sort=desc'),
        ])

        const [yieldPayload, balancePayload, entriesPayload] = await Promise.all([
            yieldRes.json().catch(() => ({})),
            balanceRes.json().catch(() => ({})),
            entriesRes.json().catch(() => ({})),
        ])

        const yieldData = unwrap(yieldPayload)
        const balanceData = unwrap(balancePayload)
        const entriesData = unwrap(entriesPayload)

        // Extract strategy allocations from yield payload (if provided by backend)
        const rawAllocations = (yieldData.strategyAllocations ?? yieldData.allocations ?? []) as Array<Record<string, unknown>>
        const strategyAllocations: StrategyAllocationSummary[] = rawAllocations.map((a) => ({
            name: String(a.name ?? a.adapter ?? 'Unknown'),
            deployedUsdc: String(a.deployedUsdc ?? a.deployed_usdc ?? '0'),
            pct: Number(a.pct ?? a.allocationPct ?? 0),
            apy: Number(a.apy ?? a.apyPct ?? 0),
            riskScore: Number(a.riskScore ?? a.risk_score ?? 50),
            bandLabel: String(a.bandLabel ?? a.liquidity_band ?? 'HOURS'),
            bandColor: String(a.bandColor ?? '#C9A84C'),
        }))

        // APY history from yield data or constructed from ledger yield entries
        const rawHistory = (yieldData.apyHistory ?? yieldData.apy_history ?? []) as Array<Record<string, unknown>>
        const apyHistory: YieldHistoryPoint[] = rawHistory.map((h) => ({
            timestamp: Number(h.timestamp ?? h.ts ?? 0),
            apy: Number(h.apy ?? h.apyPct ?? 0),
            yieldUsdc: String(h.yieldUsdc ?? h.yield_usdc ?? '0'),
        }))

        const response: AnalyticsResponse = {
            accountId,
            blendedApy: Number(yieldData.blendedApy ?? yieldData.blended_apy ?? 0),
            totalDeployedUsdc: String(yieldData.totalDeployed ?? yieldData.total_deployed_usdc ?? '0'),
            liquidBufferUsdc: String(yieldData.liquidBuffer ?? yieldData.liquid_buffer_usdc ?? balanceData.available ?? '0'),
            earnedTodayUsdc: String(yieldData.projected24hYield ?? yieldData.earned_today_usdc ?? '0'),
            earnedAllTimeUsdc: String(yieldData.earnedAllTime ?? yieldData.earned_all_time_usdc ?? balanceData.yieldEarned ?? '0'),
            strategyAllocations,
            apyHistory,
            epochNumber: Number(yieldData.epochNumber ?? yieldData.epoch_number ?? 0),
            secondsToNextHarvest: Number(yieldData.secondsToNext ?? yieldData.seconds_to_next_harvest ?? 900),
            fetchedAt: new Date().toISOString(),
        }

        return NextResponse.json(response, {
            status: 200,
            headers: { 'cache-control': 'private, max-age=30' },
        })
    } catch {
        const fallback: AnalyticsResponse = {
            accountId,
            blendedApy: 0,
            totalDeployedUsdc: '0',
            liquidBufferUsdc: '0',
            earnedTodayUsdc: '0',
            earnedAllTimeUsdc: '0',
            strategyAllocations: [],
            apyHistory: [],
            epochNumber: 0,
            secondsToNextHarvest: 900,
            fetchedAt: new Date().toISOString(),
        }

        return NextResponse.json(fallback, {
            status: 200,
            headers: { 'cache-control': 'private, max-age=20' },
        })
    }
}
