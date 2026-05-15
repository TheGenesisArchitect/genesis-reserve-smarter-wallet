import { describe, expect, it } from 'vitest'
import {
    getRuleRejectionReason,
    mapIntentRecommendation,
    normalizeDeframeStrategy,
    selectTopStrategiesForIntentWithDiagnostics,
    type VaultStrategySummary,
} from '../src/app/api/gr/_lib/deframe'

function strategy(partial: Partial<VaultStrategySummary>): VaultStrategySummary {
    return {
        strategyId: partial.strategyId ?? 's1',
        label: partial.label ?? 'Test Strategy',
        protocol: partial.protocol ?? 'Test',
        chain: partial.chain ?? 'base',
        chainId: partial.chainId ?? 8453,
        netApyPct: partial.netApyPct ?? '5.00',
        avgApyPct: partial.avgApyPct,
        inceptionApyPct: partial.inceptionApyPct,
        riskLevel: partial.riskLevel ?? 'medium',
        liquidityWindow: partial.liquidityWindow ?? 'same_day',
        feeBps: partial.feeBps ?? 0,
        paused: partial.paused ?? false,
        availableActions: partial.availableActions ?? ['lend', 'withdraw'],
    }
}

describe('deframe accelerate policy', () => {
    it('classifies low-risk below threshold as apy_out_of_band instead of risk_mismatch', () => {
        const rule = {
            allowedRisks: ['medium', 'high'],
            minApyByRisk: { low: 5 },
            minApyPct: 4,
            maxApyPct: 35,
            allowedLiquidity: ['same_day', 'scheduled'],
            maxFeeBps: 150,
        }

        const lowRiskUnderFloor = strategy({
            riskLevel: 'low',
            netApyPct: '4.80',
            liquidityWindow: 'same_day',
        })

        const reason = getRuleRejectionReason(lowRiskUnderFloor, rule as never)
        expect(reason).toBe('apy_out_of_band')
    })

    it('allows low-risk when APY clears risk-specific threshold and other guards pass', () => {
        const rule = {
            allowedRisks: ['medium', 'high'],
            minApyByRisk: { low: 5 },
            minApyPct: 4,
            maxApyPct: 35,
            allowedLiquidity: ['same_day', 'scheduled'],
            maxFeeBps: 150,
        }

        const lowRiskQualified = strategy({
            riskLevel: 'low',
            netApyPct: '5.40',
            liquidityWindow: 'same_day',
        })

        const reason = getRuleRejectionReason(lowRiskQualified, rule as never)
        expect(reason).toBeNull()
    })

    it('keeps accelerate ranking and recommendation aligned while admitting quality low-risk candidates', () => {
        const candidates: VaultStrategySummary[] = [
            strategy({
                strategyId: 'low-strong',
                protocol: 'Aave',
                riskLevel: 'low',
                netApyPct: '8.20',
                liquidityWindow: 'same_day',
            }),
            strategy({
                strategyId: 'medium-1',
                protocol: 'Morpho',
                riskLevel: 'medium',
                netApyPct: '4.90',
                liquidityWindow: 'same_day',
            }),
            strategy({
                strategyId: 'high-1',
                protocol: 'Balancer',
                riskLevel: 'high',
                netApyPct: '4.20',
                liquidityWindow: 'scheduled',
            }),
            strategy({
                strategyId: 'medium-2',
                protocol: 'Compound',
                riskLevel: 'medium',
                netApyPct: '4.60',
                liquidityWindow: 'same_day',
            }),
        ]

        const { ranked } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 4,
            chainScope: ['base'],
        })

        expect(ranked.find((s) => s.strategyId === 'low-strong')).toBeDefined()

        const recommended = mapIntentRecommendation('accelerate', ranked)
        expect(recommended?.strategyId).toBe(ranked[0]?.strategyId)
    })

    it('admits instant low-risk target protocols under accelerate stage-1 formula', () => {
        const candidates: VaultStrategySummary[] = [
            strategy({
                strategyId: 'aave-instant',
                protocol: 'Aave',
                riskLevel: 'low',
                netApyPct: '5.20',
                liquidityWindow: 'instant',
            }),
            strategy({
                strategyId: 'morpho-1',
                protocol: 'Morpho',
                riskLevel: 'medium',
                netApyPct: '4.60',
                liquidityWindow: 'same_day',
            }),
            strategy({
                strategyId: 'morpho-2',
                protocol: 'Morpho',
                riskLevel: 'medium',
                netApyPct: '4.45',
                liquidityWindow: 'same_day',
            }),
            strategy({
                strategyId: 'sky-instant',
                protocol: 'Sky',
                riskLevel: 'low',
                netApyPct: '4.80',
                liquidityWindow: 'instant',
            }),
        ]

        const { ranked, diagnostics } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        expect(diagnostics.relaxationLevel).toBe(0)
        expect(ranked.some((s) => s.strategyId === 'aave-instant')).toBe(true)
        expect(ranked.some((s) => s.liquidityWindow === 'instant')).toBe(true)
    })

    it('normalizes Balancer as medium risk so it can surface in grow-tier results', () => {
        const normalized = normalizeDeframeStrategy({
            id: 'balancer-usdc-eth',
            protocol: 'BalancerV3',
            network: 'ethereum',
            networkId: 1,
            apy: 0.0621,
            fee: 0,
            paused: false,
            assetName: 'USDC',
            availableActions: ['lend', 'withdraw'],
        })

        expect(normalized.riskLevel).toBe('medium')

        const { ranked, diagnostics } = selectTopStrategiesForIntentWithDiagnostics('grow', [normalized], {
            limit: 8,
            chainScope: ['ethereum'],
        })

        expect(ranked.some((s) => s.strategyId === normalized.strategyId)).toBe(true)
        expect(diagnostics.rejectedByReason.risk_mismatch ?? 0).toBe(0)
    })
})
