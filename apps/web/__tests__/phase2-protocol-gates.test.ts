/**
 * Phase 2: Rollout Validation Gates
 *
 * Three mandatory negative-path scenarios per the Phase 2 plan:
 *   1. Maple blocked user       — accreditation_required suppression
 *   2. Pendle near-expiry       — maturity_too_near suppression + yieldLockWarning
 *   3. Ethena APY inversion     — apy_ceiling suppression when APY exceeds protocol ceiling
 *
 * Also covers:
 *   - Happy paths for each protocol (non-suppressed, correctly surfaced)
 *   - Cross-tier degradation: suppressed strategy must NOT appear in any tier's ranked output
 *   - Diagnostics integrity: suppression reasons must be tracked in rejectedByReason
 *   - Identity preservation: strategyId must survive normalization unchanged
 */

import { describe, expect, it } from 'vitest'
import {
    dedupeStrategies,
    selectTopStrategiesForIntentWithDiagnostics,
    type VaultStrategySummary,
    type VaultIntentTier,
} from '../src/app/api/gr/_lib/deframe'

// ── Fixture factory ──────────────────────────────────────────────────────────

function strategy(partial: Partial<VaultStrategySummary> & { strategyId: string; protocol: string }): VaultStrategySummary {
    return {
        label: partial.label ?? `${partial.protocol} Strategy`,
        chain: partial.chain ?? 'base',
        chainId: partial.chainId ?? 8453,
        netApyPct: partial.netApyPct ?? '8.00',
        avgApyPct: partial.avgApyPct,
        inceptionApyPct: partial.inceptionApyPct,
        riskLevel: partial.riskLevel ?? 'medium',
        liquidityWindow: partial.liquidityWindow ?? 'same_day',
        feeBps: partial.feeBps ?? 0,
        paused: partial.paused ?? false,
        availableActions: partial.availableActions ?? ['lend', 'withdraw'],
        ...partial,
    }
}

function runAcrossTiers(
    candidates: VaultStrategySummary[],
    chainScope: string[] = ['base', 'ethereum', 'polygon']
) {
    const results: Record<VaultIntentTier, ReturnType<typeof selectTopStrategiesForIntentWithDiagnostics>> = {
        preserve: selectTopStrategiesForIntentWithDiagnostics('preserve', candidates, { limit: 8, chainScope }),
        grow: selectTopStrategiesForIntentWithDiagnostics('grow', candidates, { limit: 8, chainScope }),
        accelerate: selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, { limit: 8, chainScope }),
    }
    return results
}

// ── 1. Maple Blocked User ────────────────────────────────────────────────────

describe('Scenario 1 — Maple blocked user (accreditation gate)', () => {
    const mapleStrategy = strategy({
        strategyId: 'maple-usdc-secured-v3',
        protocol: 'Maple',
        label: 'Maple USDC Secured',
        netApyPct: '9.50',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
    })

    const backgroundStrategies = [
        strategy({ strategyId: 'aave-usdc-base', protocol: 'Aave', netApyPct: '4.80', riskLevel: 'low', liquidityWindow: 'instant' }),
        strategy({ strategyId: 'morpho-hycs-base', protocol: 'Morpho', netApyPct: '7.20', riskLevel: 'medium', liquidityWindow: 'same_day' }),
    ]

    it('normalizes Maple strategy with accreditationRequired flag', () => {
        const dedupedResult = dedupeStrategies([mapleStrategy])
        const normalized = dedupedResult.find((s) => s.strategyId === 'maple-usdc-secured-v3')

        expect(normalized).toBeDefined()
        expect(normalized!.accreditationRequired).toBe(true)
    })

    it('Maple at 9.50% APY is within 20% ceiling and is suppressed only for accreditation, not APY ceiling', () => {
        const dedupedResult = dedupeStrategies([mapleStrategy])
        const normalized = dedupedResult.find((s) => s.strategyId === 'maple-usdc-secured-v3')

        expect(normalized).toBeDefined()
        // Maple within ceiling → suppressed for accreditation_required
        expect(normalized!.suppression?.reason).toBe('accreditation_required')
    })

    it('suppressed Maple does not appear in any tier ranked output', () => {
        const candidates = [...backgroundStrategies, mapleStrategy]
        const results = runAcrossTiers(candidates)

        for (const tier of ['preserve', 'grow', 'accelerate'] as VaultIntentTier[]) {
            const mapleInRanked = results[tier].ranked.find((s) => s.strategyId === 'maple-usdc-secured-v3')
            expect(mapleInRanked).toBeUndefined()
        }
    })

    it('suppression is tracked in diagnostics rejectedByReason', () => {
        const candidates = [...backgroundStrategies, mapleStrategy]
        const { diagnostics } = selectTopStrategiesForIntentWithDiagnostics('grow', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        expect(diagnostics.rejectedByReason['suppressed_accreditation_required']).toBeGreaterThanOrEqual(1)
    })

    it('suppressed Maple appears in rejectedCandidates with correct reason', () => {
        const candidates = [...backgroundStrategies, mapleStrategy]
        const { diagnostics } = selectTopStrategiesForIntentWithDiagnostics('grow', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        const rejected = diagnostics.rejectedCandidates.find((c) => c.strategyId === 'maple-usdc-secured-v3')
        expect(rejected).toBeDefined()
        expect(rejected!.reason).toContain('suppressed')
    })

    it('non-Maple strategies are unaffected and still surface normally', () => {
        const candidates = [...backgroundStrategies, mapleStrategy]
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics('grow', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        expect(ranked.some((s) => s.strategyId === 'morpho-hycs-base')).toBe(true)
    })

    it('Maple strategyId survives normalization unchanged', () => {
        const dedupedResult = dedupeStrategies([mapleStrategy])
        const normalized = dedupedResult.find((s) => s.strategyId === 'maple-usdc-secured-v3')

        expect(normalized!.strategyId).toBe('maple-usdc-secured-v3')
    })
})

// ── 2. Pendle Near-Expiry ────────────────────────────────────────────────────

describe('Scenario 2 — Pendle near-expiry / low-liquidity (maturity gate)', () => {
    const pendleNearExpiry = strategy({
        strategyId: 'pendle-pt-usdc-sep25',
        protocol: 'Pendle',
        label: 'Pendle PT USDC Sep25',
        netApyPct: '11.00',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
        pendleMaturity: {
            expiryDate: '2026-05-20',
            daysUntilExpiry: 20,
            yieldLockWarning: true,
        },
    })

    const pendleHealthy = strategy({
        strategyId: 'pendle-pt-usdc-dec26',
        protocol: 'Pendle',
        label: 'Pendle PT USDC Dec26',
        netApyPct: '10.50',
        riskLevel: 'medium',
        liquidityWindow: 'scheduled',
    })

    const backgroundStrategies = [
        strategy({ strategyId: 'aave-usdc-base', protocol: 'Aave', netApyPct: '4.80', riskLevel: 'low', liquidityWindow: 'instant' }),
    ]

    it('normalizes Pendle strategy with pendleMaturity metadata', () => {
        const dedupedResult = dedupeStrategies([pendleNearExpiry])
        const normalized = dedupedResult.find((s) => s.strategyId === 'pendle-pt-usdc-sep25')

        expect(normalized).toBeDefined()
        expect(normalized!.pendleMaturity).toBeDefined()
        expect(typeof normalized!.pendleMaturity!.daysUntilExpiry).toBe('number')
        expect(typeof normalized!.pendleMaturity!.expiryDate).toBe('string')
    })

    it('Pendle near-expiry has yieldLockWarning set to true', () => {
        const dedupedResult = dedupeStrategies([pendleNearExpiry])
        const normalized = dedupedResult.find((s) => s.strategyId === 'pendle-pt-usdc-sep25')

        // Fixture is explicitly marked near-expiry (<30-day threshold)
        expect(normalized!.pendleMaturity!.yieldLockWarning).toBe(true)
    })

    it('Pendle at 11% APY is within 20% ceiling — suppressed for maturity not APY', () => {
        const dedupedResult = dedupeStrategies([pendleNearExpiry])
        const normalized = dedupedResult.find((s) => s.strategyId === 'pendle-pt-usdc-sep25')

        // Should be suppressed for maturity_too_near due to near-expiry fixture metadata
        expect(normalized!.suppression?.reason).toBe('maturity_too_near')
    })

    it('near-expiry Pendle does not surface in any tier ranked output', () => {
        const candidates = [...backgroundStrategies, pendleNearExpiry]
        const results = runAcrossTiers(candidates)

        for (const tier of ['preserve', 'grow', 'accelerate'] as VaultIntentTier[]) {
            const pendleInRanked = results[tier].ranked.find((s) => s.strategyId === 'pendle-pt-usdc-sep25')
            expect(pendleInRanked).toBeUndefined()
        }
    })

    it('maturity suppression is tracked in diagnostics', () => {
        const candidates = [...backgroundStrategies, pendleNearExpiry]
        const { diagnostics } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        expect(diagnostics.rejectedByReason['suppressed_maturity_too_near']).toBeGreaterThanOrEqual(1)
    })

    it('both Pendle strategies get maturity metadata attached', () => {
        const dedupedResult = dedupeStrategies([pendleNearExpiry, pendleHealthy])

        for (const strategyId of ['pendle-pt-usdc-sep25', 'pendle-pt-usdc-dec26']) {
            const found = dedupedResult.find((s) => s.strategyId === strategyId)
            expect(found!.pendleMaturity).toBeDefined()
        }
    })

    it('Pendle expiryDate is a valid ISO date string', () => {
        const dedupedResult = dedupeStrategies([pendleNearExpiry])
        const normalized = dedupedResult.find((s) => s.strategyId === 'pendle-pt-usdc-sep25')

        const parsed = new Date(normalized!.pendleMaturity!.expiryDate)
        expect(parsed.toString()).not.toBe('Invalid Date')
    })
})

// ── 3. Ethena APY Inversion ──────────────────────────────────────────────────

describe('Scenario 3 — Ethena APY inversion (ceiling suppression)', () => {
    // Ethena ceiling is 30%. This fixture exceeds it to simulate inversion/spike.
    const ethenaAboveCeiling = strategy({
        strategyId: 'ethena-susde-ethereum',
        protocol: 'Ethena',
        label: 'Ethena sUSDe',
        netApyPct: '31.00', // above 30% ceiling — APY inversion scenario
        riskLevel: 'high',
        liquidityWindow: 'scheduled',
        chain: 'ethereum',
        chainId: 1,
    })

    const ethenaBelowCeiling = strategy({
        strategyId: 'ethena-susde-base',
        protocol: 'Ethena',
        label: 'Ethena sUSDe (base)',
        netApyPct: '16.00', // below 30% ceiling — should pass
        riskLevel: 'high',
        liquidityWindow: 'scheduled',
    })

    const backgroundStrategies = [
        strategy({ strategyId: 'morpho-hycs-base', protocol: 'Morpho', netApyPct: '7.20', riskLevel: 'medium', liquidityWindow: 'same_day' }),
    ]

    it('Ethena above 30% ceiling is suppressed with apy_ceiling reason', () => {
        const dedupedResult = dedupeStrategies([ethenaAboveCeiling])
        const normalized = dedupedResult.find((s) => s.strategyId === 'ethena-susde-ethereum')

        expect(normalized!.suppression).toBeDefined()
        expect(normalized!.suppression!.reason).toBe('apy_ceiling')
    })

    it('suppressed Ethena does not surface in accelerate tier ranked output', () => {
        const candidates = [...backgroundStrategies, ethenaAboveCeiling]
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 8,
            chainScope: ['base', 'ethereum'],
        })

        expect(ranked.find((s) => s.strategyId === 'ethena-susde-ethereum')).toBeUndefined()
    })

    it('APY ceiling suppression tracked in diagnostics', () => {
        const candidates = [...backgroundStrategies, ethenaAboveCeiling]
        const { diagnostics } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 8,
            chainScope: ['base', 'ethereum'],
        })

        expect(diagnostics.rejectedByReason['suppressed_apy_ceiling']).toBeGreaterThanOrEqual(1)
    })

    it('Ethena below ceiling is NOT suppressed', () => {
        const dedupedResult = dedupeStrategies([ethenaBelowCeiling])
        const normalized = dedupedResult.find((s) => s.strategyId === 'ethena-susde-base')

        expect(normalized!.suppression).toBeUndefined()
    })

    it('Ethena below ceiling surfaces in accelerate ranked output', () => {
        const candidates = [...backgroundStrategies, ethenaBelowCeiling]
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        expect(ranked.find((s) => s.strategyId === 'ethena-susde-base')).toBeDefined()
    })

    it('ceiling suppression detail message includes threshold', () => {
        const dedupedResult = dedupeStrategies([ethenaAboveCeiling])
        const normalized = dedupedResult.find((s) => s.strategyId === 'ethena-susde-ethereum')

        // Details field should reference the ceiling value
        const detail = normalized!.suppression!.details ?? ''
        expect(detail).toMatch(/30/)
    })
})

// ── 4. Cross-protocol: mixed pool with all three suppressed types ─────────────

describe('Cross-protocol mixed pool degradation', () => {
    const candidates: VaultStrategySummary[] = [
        // Should pass — control group
        strategy({ strategyId: 'aave-usdc-base', protocol: 'Aave', netApyPct: '4.80', riskLevel: 'low', liquidityWindow: 'instant' }),
        strategy({ strategyId: 'morpho-hycs-base', protocol: 'Morpho', netApyPct: '7.20', riskLevel: 'medium', liquidityWindow: 'same_day' }),
        // Should be suppressed — accreditation
        strategy({ strategyId: 'maple-usdc-v3', protocol: 'Maple', netApyPct: '9.50', riskLevel: 'medium', liquidityWindow: 'scheduled' }),
        // Should be suppressed — maturity_too_near (explicit near-expiry metadata)
        strategy({
            strategyId: 'pendle-pt-sep25',
            protocol: 'Pendle',
            netApyPct: '11.00',
            riskLevel: 'medium',
            liquidityWindow: 'scheduled',
            pendleMaturity: {
                expiryDate: '2026-05-20',
                daysUntilExpiry: 20,
                yieldLockWarning: true,
            },
        }),
        // Should be suppressed — APY ceiling
        strategy({ strategyId: 'ethena-spike-ethereum', protocol: 'Ethena', netApyPct: '32.00', riskLevel: 'high', liquidityWindow: 'scheduled', chain: 'ethereum', chainId: 1 }),
    ]

    it('no suppressed strategy appears in grow-tier ranked output', () => {
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics('grow', candidates, {
            limit: 8,
            chainScope: ['base', 'ethereum'],
        })

        const suppressedIds = ['maple-usdc-v3', 'pendle-pt-sep25', 'ethena-spike-ethereum']
        for (const id of suppressedIds) {
            expect(ranked.find((s) => s.strategyId === id)).toBeUndefined()
        }
    })

    it('non-suppressed strategies (Aave, Morpho) always surface in grow tier', () => {
        const { ranked } = selectTopStrategiesForIntentWithDiagnostics('grow', candidates, {
            limit: 8,
            chainScope: ['base'],
        })

        expect(ranked.find((s) => s.strategyId === 'aave-usdc-base')).toBeDefined()
        expect(ranked.find((s) => s.strategyId === 'morpho-hycs-base')).toBeDefined()
    })

    it('all three suppression reasons appear in diagnostics', () => {
        const { diagnostics } = selectTopStrategiesForIntentWithDiagnostics('accelerate', candidates, {
            limit: 8,
            chainScope: ['base', 'ethereum'],
        })

        expect(diagnostics.rejectedByReason['suppressed_accreditation_required']).toBeGreaterThanOrEqual(1)
        expect(diagnostics.rejectedByReason['suppressed_maturity_too_near']).toBeGreaterThanOrEqual(1)
        expect(diagnostics.rejectedByReason['suppressed_apy_ceiling']).toBeGreaterThanOrEqual(1)
    })

    it('suppression does not affect preserve tier control strategies', () => {
        const results = runAcrossTiers(candidates)

        // Aave should always appear in preserve (low risk, instant liquidity)
        expect(results.preserve.ranked.find((s) => s.strategyId === 'aave-usdc-base')).toBeDefined()
    })

    it('ranked output contains no strategies with suppression field set', () => {
        const results = runAcrossTiers(candidates)

        for (const tier of ['preserve', 'grow', 'accelerate'] as VaultIntentTier[]) {
            for (const s of results[tier].ranked) {
                expect(s.suppression).toBeUndefined()
            }
        }
    })
})

// ── 5. strategyId identity preservation ─────────────────────────────────────

describe('strategyId identity preservation across normalization', () => {
    const protocolFixtures: Array<{ id: string; protocol: string }> = [
        { id: 'pendle-pt-usdc-sep2025', protocol: 'Pendle' },
        { id: 'maple-senior-usdc-v3', protocol: 'Maple' },
        { id: 'ethena-susde-v2-ethereum', protocol: 'Ethena' },
        { id: 'aave-v3-usdc-polygon', protocol: 'Aave' },
        { id: 'morpho-hycs-base-v1', protocol: 'Morpho' },
    ]

    it('strategyId is unchanged after deduplication and normalization', () => {
        const strategies = protocolFixtures.map(({ id, protocol }) =>
            strategy({ strategyId: id, protocol, netApyPct: '8.00', chain: 'base', chainId: 8453 })
        )

        const deduped = dedupeStrategies(strategies)

        for (const { id } of protocolFixtures) {
            const found = deduped.find((s) => s.strategyId === id)
            expect(found).toBeDefined()
            expect(found!.strategyId).toBe(id)
        }
    })

    it('no legacy alias substitution occurs for non-Aave protocols', () => {
        const nonAave = protocolFixtures
            .filter(({ protocol }) => protocol !== 'Aave')
            .map(({ id, protocol }) =>
                strategy({ strategyId: id, protocol, netApyPct: '8.00', chain: 'base', chainId: 8453 })
            )

        const deduped = dedupeStrategies(nonAave)

        for (const s of deduped) {
            expect(s.strategyId.toLowerCase()).not.toContain('aave')
        }
    })
})
