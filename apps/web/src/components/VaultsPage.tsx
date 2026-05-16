'use client'

import { useEffect, useMemo, useState } from 'react'
import { YieldEngineDashboard } from './YieldEngineDashboard'
import { useYieldEngine } from '../hooks/useYieldEngine'
import { useVaultStrategies } from '../hooks/useVaultStrategies'
import { useAnalytics } from '../hooks/useAnalytics'
import { useInflationRate } from '../hooks/useInflationRate'
import type { ViewKey } from './AppShell'
import type { StrategyAllocationSummary, YieldHistoryPoint, VaultStrategySummary } from '../lib/bff.types'
import { StatusPill } from './ds'
import { getCodexEntry } from '@/lib/codex/protocols'
import { CodexChip } from './codex/CodexChip'

type CategoryKey = 'preserve' | 'grow' | 'accelerate'

interface DrillDownState {
  category: CategoryKey
  strategy: VaultStrategySummary
}

const STRATEGY_CHAIN_SCOPE = ['arbitrum', 'ethereum', 'base', 'polygon', 'gnosis', 'optimism']

const CATEGORY_CONFIG: Record<CategoryKey, {
  name: string
  subtitle: string
  targetLabel: string
  apyMin: number
  apyMax: number
  color: string
  tone: string
  defaultStrategy: string
}> = {
  preserve: {
    name: 'Preserve',
    subtitle: 'Conservative',
    targetLabel: '4–6%',
    apyMin: 4,
    apyMax: 6,
    color: '#00D4AA',
    tone: 'Capital-protected allocation with stable returns.',
    defaultStrategy: 'tbills',
  },
  grow: {
    name: 'Grow',
    subtitle: 'Most Popular',
    targetLabel: '6–12%',
    apyMin: 6,
    apyMax: 12,
    color: '#c9a84c',
    tone: 'The sweet spot. Multi-pair strategy with weekly distributions.',
    defaultStrategy: 'morpho',
  },
  accelerate: {
    name: 'Accelerate',
    subtitle: 'Growth Tier',
    targetLabel: '13%+',
    apyMin: 13,
    apyMax: 100,
    color: '#9B6DFF',
    tone: 'Full throttle. Maximum yield with priority execution.',
    defaultStrategy: 'balancer',
  },
}

/**
 * Categorize a strategy by its APY first, then by protocol keywords as fallback
 */
function strategyToCategory(strategy: VaultStrategySummary): CategoryKey {
  const apy = Number(strategy.netApyPct)
  if (apy >= 13) return 'accelerate'
  if (apy >= 6) return 'grow'
  return 'preserve'
}

/** Categorize a live allocation by its current APY */
function allocationToCategory(apy: number): CategoryKey {
  if (apy >= 13) return 'accelerate'
  if (apy >= 6) return 'grow'
  return 'preserve'
}

/**
 * Group strategies by category and return top 3 per category sorted by APY descending
 */
function topByCategoryFromStrategies(strategies: VaultStrategySummary[]): Record<CategoryKey, VaultStrategySummary[]> {
  const grouped: Record<CategoryKey, VaultStrategySummary[]> = {
    preserve: [],
    grow: [],
    accelerate: [],
  }

  for (const strategy of strategies) {
    const category = strategyToCategory(strategy)
    grouped[category].push(strategy)
  }

  for (const category of Object.keys(grouped) as CategoryKey[]) {
    grouped[category]
      .sort((a, b) => Number(b.netApyPct) - Number(a.netApyPct))
      .splice(8)
  }

  return grouped
}

function parseAtomicUsdc(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed / 1e6
}

function matchAllocation(
  strategy: VaultStrategySummary,
  allocations: StrategyAllocationSummary[]
): StrategyAllocationSummary | null {
  const strategyKey = `${strategy.strategyId} ${strategy.label} ${strategy.protocol}`.toLowerCase()
  return (
    allocations.find((allocation) => strategyKey.includes(allocation.name.toLowerCase())) ??
    allocations.find((allocation) => allocation.name.toLowerCase().includes(strategy.protocol.toLowerCase())) ??
    null
  )
}

function StrategyDrillDownCard({
  state,
  analyticsHistory,
  analyticsAllocations,
  nextHarvestSeconds,
  analyticsSource,
  inflationRate,
  depositAmount,
  onDepositAmountChange,
  categoryStrategies,
  onExecuteAllocation,
  onExecuteStrategy,
  onClose,
}: {
  state: DrillDownState
  analyticsHistory: YieldHistoryPoint[]
  analyticsAllocations: StrategyAllocationSummary[]
  nextHarvestSeconds?: number
  analyticsSource: string
  inflationRate: number
  depositAmount: number
  onDepositAmountChange: (v: number) => void
  categoryStrategies: VaultStrategySummary[]
  onExecuteAllocation: () => void
  onExecuteStrategy: () => void
  onClose: () => void
}) {
  const { strategy, category } = state
  const cfg = CATEGORY_CONFIG[category]
  const codexEntry = getCodexEntry(strategy.protocol)

  // ── Core APY values ───────────────────────────────────────────────
  const netApy = Number(strategy.netApyPct)
  const avg30d  = strategy.avgApyPct       ? Number(strategy.avgApyPct)       : null
  const baseApy = strategy.inceptionApyPct ? Number(strategy.inceptionApyPct) : null
  const matchedAlloc = matchAllocation(strategy, analyticsAllocations)
  const liveApy = matchedAlloc?.apy ?? netApy
  const deployedUsdc = matchedAlloc ? parseAtomicUsdc(matchedAlloc.deployedUsdc) : 0

  // ── Inflation beat ────────────────────────────────────────────────
  const realYield = liveApy - inflationRate
  const beatsPct  = Number(realYield.toFixed(2))
  const inflationBarMax = Math.max(liveApy * 1.1, inflationRate * 2, 5)
  const strategyBarW = Math.min(100, (liveApy / inflationBarMax) * 100)
  const inflationBarW = Math.min(100, (inflationRate / inflationBarMax) * 100)

  // ── Earnings projection ────────────────────────────────────────────
  const [localDeposit, setLocalDeposit] = useState(depositAmount)
  const earnMonthly  = localDeposit * (liveApy / 100) / 12
  const earnAnnual   = localDeposit * (liveApy / 100)
  const earn5yr      = localDeposit * (Math.pow(1 + liveApy / 100, 5) - 1)
  const inflationErosion = localDeposit * (inflationRate / 100)

  // ── APY stability ─────────────────────────────────────────────────
  const deviation = avg30d && avg30d > 0 ? Math.abs(liveApy - avg30d) / avg30d : 0
  const stabilityGrade = deviation < 0.10 ? 'Stable' : deviation < 0.25 ? 'Watch' : 'Volatile'
  const stabilityColor = stabilityGrade === 'Stable' ? '#00D4AA' : stabilityGrade === 'Watch' ? '#C9A84C' : '#E84040'
  const apyRangeLow  = codexEntry?.apyRange?.low  ?? (avg30d ? Math.min(avg30d, liveApy) * 0.75 : liveApy * 0.6)
  const apyRangeHigh = codexEntry?.apyRange?.high ?? liveApy * 1.4
  const currentInRange = Math.min(100, Math.max(0, ((liveApy - apyRangeLow) / Math.max(apyRangeHigh - apyRangeLow, 0.01)) * 100))

  // ── Category rank ─────────────────────────────────────────────────
  const sortedCat = [...categoryStrategies].sort((a, b) => Number(b.netApyPct) - Number(a.netApyPct))
  const rank = sortedCat.findIndex((s) => s.strategyId === strategy.strategyId) + 1 || 1
  const catAvgApy = sortedCat.length > 0
    ? sortedCat.reduce((sum, s) => sum + Number(s.netApyPct), 0) / sortedCat.length
    : liveApy
  const vsAvg = liveApy - catAvgApy

  // ── Trend chart ───────────────────────────────────────────────────
  const rawHistory = analyticsHistory.length >= 5
    ? analyticsHistory.slice(-10).map((p) => ({ label: '', apy: p.apy }))
    : (codexEntry?.apyHistory?.slice(-10) ?? [{ label: 'Now', apy: liveApy }])
  const chartW = 300
  const chartH = 110
  const chartPad = { t: 12, r: 12, b: 24, l: 36 }
  const innerW = chartW - chartPad.l - chartPad.r
  const innerH = chartH - chartPad.t - chartPad.b
  const apyVals = rawHistory.map((p) => p.apy)
  const chartMin = Math.max(0, Math.min(...apyVals, inflationRate) - 1)
  const chartMax = Math.max(...apyVals, inflationRate) + 2
  const chartRange = Math.max(chartMax - chartMin, 0.01)
  const toX = (i: number) => chartPad.l + (i / Math.max(rawHistory.length - 1, 1)) * innerW
  const toY = (v: number) => chartPad.t + innerH - ((v - chartMin) / chartRange) * innerH
  const linePoints = rawHistory.map((p, i) => `${toX(i)},${toY(p.apy)}`).join(' ')
  const areaPoints = `${chartPad.l},${chartPad.t + innerH} ` + linePoints + ` ${toX(rawHistory.length - 1)},${chartPad.t + innerH}`
  const inflationY = toY(inflationRate)
  const lastX = toX(rawHistory.length - 1)
  const lastY = toY(rawHistory[rawHistory.length - 1]?.apy ?? liveApy)
  const gradId = `ddGrad-${strategy.strategyId.replace(/[^a-z0-9]/gi, '')}`

  // ── Risk profile ──────────────────────────────────────────────────
  type RiskKey = 'smartContract' | 'liquidity' | 'oracle' | 'governance' | 'market'
  const rs = codexEntry?.riskScores
  const riskAxes: Array<{ label: string; key: RiskKey }> = [
    { label: 'Smart Contract', key: 'smartContract' },
    { label: 'Liquidity',      key: 'liquidity'      },
    { label: 'Oracle',         key: 'oracle'         },
    { label: 'Governance',     key: 'governance'     },
    { label: 'Market',         key: 'market'         },
  ]
  const safetyColor = (score: number) =>
    score >= 7 ? '#00D4AA' : score >= 4 ? '#C9A84C' : '#E84040'

  // ── Yield components ──────────────────────────────────────────────
  const yc = codexEntry?.yieldComponents ?? []

  // ── Fees ──────────────────────────────────────────────────────────
  const feeLabel = strategy.feeBps === 0
    ? 'Zero fee'
    : `${(strategy.feeBps / 100).toFixed(2)}% fee`

  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${cfg.color}55`,
      background: 'rgba(8,11,18,0.92)',
      padding: '20px 20px 16px',
      marginBottom: 20,
    }}>

      {/* ── 1. HEADER ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: cfg.color, marginBottom: 5, fontFamily: "'Tenor Sans', sans-serif" }}>
            Strategy Drill Down · {cfg.name}
          </div>
          <div style={{ fontSize: 22, color: '#f5f0e8', fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, lineHeight: 1.2, marginBottom: 6 }}>
            {strategy.label}
          </div>
          {strategy.pendleMaturity?.yieldLockWarning && (
            <div style={{ fontSize: 11, padding: '7px 10px', marginBottom: 8, background: 'rgba(255,152,0,0.13)', border: '1px solid rgba(255,152,0,0.45)', borderRadius: 6, color: '#ffb74d' }}>
              ⚠ Yield lock expires in {strategy.pendleMaturity.daysUntilExpiry}d ({strategy.pendleMaturity.expiryDate})
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.50)' }}>{strategy.protocol} · {strategy.chain}</span>
            <span style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{liveApy.toFixed(2)}% APY</span>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.40)', textTransform: 'capitalize' }}>{strategy.liquidityWindow.replace('_', ' ')} liquidity</span>
            {rank === 1 && <span style={{ fontSize: 10, color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}40`, borderRadius: 20, padding: '1px 7px', letterSpacing: '0.06em' }}>#1 in {cfg.name}</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(245,240,232,0.55)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, fontFamily: "'Tenor Sans', sans-serif" }}>
          Close
        </button>
      </div>

      {/* ── 2. INFLATION BEAT BANNER ──────────────────────────────── */}
      <div style={{
        borderRadius: 12,
        background: beatsPct > 0 ? 'rgba(0,212,170,0.06)' : 'rgba(232,64,64,0.06)',
        border: `1px solid ${beatsPct > 0 ? 'rgba(0,212,170,0.25)' : 'rgba(232,64,64,0.25)'}`,
        padding: '14px 16px',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', marginBottom: 4, fontFamily: "'Tenor Sans', sans-serif" }}>
              Genesis Core Mission · Outpace Inflation
            </div>
            <div style={{ fontSize: 18, fontFamily: "'Cormorant Garamond', serif", color: beatsPct > 0 ? '#00D4AA' : '#E84040', fontWeight: 600 }}>
              {beatsPct > 0 ? `Beating Inflation by +${beatsPct.toFixed(2)}%` : `Below Inflation by ${beatsPct.toFixed(2)}%`}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.50)', marginTop: 3 }}>
              Real purchasing power gain: +{beatsPct.toFixed(2)}%/yr
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.38)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>US CPI</div>
            <div style={{ fontSize: 16, color: '#E84040', fontFamily: "'Cormorant Garamond', serif" }}>{inflationRate.toFixed(1)}%</div>
          </div>
        </div>
        {/* Comparison bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 10, color: cfg.color, width: 56, textAlign: 'right', flexShrink: 0, letterSpacing: '0.04em' }}>{liveApy.toFixed(1)}%</div>
            <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${strategyBarW}%`, height: '100%', background: `linear-gradient(90deg, ${cfg.color}cc, ${cfg.color})`, borderRadius: 5, transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ fontSize: 9, color: cfg.color, width: 48, flexShrink: 0, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}>This yield</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 10, color: '#E84040', width: 56, textAlign: 'right', flexShrink: 0, letterSpacing: '0.04em' }}>{inflationRate.toFixed(1)}%</div>
            <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${inflationBarW}%`, height: '100%', background: 'linear-gradient(90deg, #E84040aa, #E84040)', borderRadius: 5 }} />
            </div>
            <div style={{ fontSize: 9, color: '#E84040', width: 48, flexShrink: 0, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}>US CPI</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', marginTop: 10, lineHeight: 1.5 }}>
          Idle cash loses {inflationRate.toFixed(1)}% of its value annually. This strategy captures {liveApy.toFixed(1)}%, preserving and growing your purchasing power.
        </div>
      </div>

      {/* ── 3. EARNINGS CALCULATOR ───────────────────────────────── */}
      <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', marginBottom: 18, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', marginBottom: 12, fontFamily: "'Tenor Sans', sans-serif" }}>
          Earnings Projection
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 18, color: 'rgba(245,240,232,0.50)', fontFamily: "'Cormorant Garamond', serif" }}>$</span>
          <input
            type="number"
            min={0}
            value={localDeposit}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0)
              setLocalDeposit(v)
              onDepositAmountChange(v)
            }}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${cfg.color}40`,
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 18,
              color: '#f5f0e8',
              fontFamily: "'Cormorant Garamond', serif",
              outline: 'none',
              minWidth: 0,
            }}
          />
          <span style={{ fontSize: 11, color: cfg.color, flexShrink: 0 }}>at {liveApy.toFixed(2)}% APY</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Per Month', value: earnMonthly, suffix: '/mo' },
            { label: 'Per Year',  value: earnAnnual,  suffix: '/yr' },
            { label: '5-Yr Compounded', value: earn5yr, suffix: ' total' },
          ].map((item) => (
            <div key={item.label} style={{ background: `${cfg.color}0d`, border: `1px solid ${cfg.color}30`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.40)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Tenor Sans', sans-serif" }}>{item.label}</div>
              <div style={{ fontSize: 18, color: cfg.color, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                ${item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value.toFixed(0)}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>{item.suffix}</div>
            </div>
          ))}
        </div>
        {localDeposit > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(232,64,64,0.07)', border: '1px solid rgba(232,64,64,0.20)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.55)' }}>Purchasing power you'd lose idle (at {inflationRate.toFixed(1)}% inflation)</span>
            <span style={{ fontSize: 13, color: '#E84040', fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
              −${inflationErosion.toFixed(0)}/yr
            </span>
          </div>
        )}
      </div>

      {/* ── 4. APY STABILITY ─────────────────────────────────────── */}
      <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', marginBottom: 18, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', fontFamily: "'Tenor Sans', sans-serif" }}>APY Stability</div>
          <span style={{ fontSize: 10, color: stabilityColor, background: `${stabilityColor}18`, border: `1px solid ${stabilityColor}40`, borderRadius: 20, padding: '2px 10px', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}>
            {stabilityGrade}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'Current APY', value: liveApy, highlight: true },
            { label: '30-Day Avg',  value: avg30d,  highlight: false },
            { label: 'Base Yield',  value: baseApy, highlight: false },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px' }}>
              <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.38)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Tenor Sans', sans-serif" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond', serif", color: item.highlight ? cfg.color : 'rgba(245,240,232,0.70)' }}>
                {item.value !== null ? `${item.value.toFixed(2)}%` : '—'}
              </div>
            </div>
          ))}
        </div>
        {/* Yield range bar with current position */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.30)' }}>Low {apyRangeLow.toFixed(1)}%</span>
            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.30)' }}>High {apyRangeHigh.toFixed(1)}%</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }}>
            <div style={{
              position: 'absolute', left: `${Math.max(0, currentInRange - 1.5)}%`,
              width: 10, height: 10, top: -1,
              background: cfg.color, borderRadius: '50%',
              boxShadow: `0 0 6px ${cfg.color}`,
              transition: 'left 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', marginTop: 6, textAlign: 'center' }}>
            Historical range · current position shown
          </div>
        </div>
      </div>

      {/* ── 5. RISK PROFILE + TREND CHART ────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>

        {/* Risk profile */}
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', marginBottom: 12, fontFamily: "'Tenor Sans', sans-serif" }}>
            Safety Profile
          </div>
          {rs ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {riskAxes.map(({ label, key }) => {
                const score = (rs as Record<string, number>)[key as string] ?? 5
                const sc = safetyColor(score)
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.55)' }}>{label}</span>
                      <span style={{ fontSize: 10, color: sc, fontWeight: 600 }}>{score}/10</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(score / 10) * 100}%`, height: '100%', background: sc, borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[['Overall Risk', strategy.riskLevel], ['Liquidity', strategy.liquidityWindow.replace('_', ' ')], ['Fee', feeLabel]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.40)' }}>{k}</span>
                  <span style={{ fontSize: 10, color: '#f5f0e8', textTransform: 'capitalize' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trend chart */}
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', fontFamily: "'Tenor Sans', sans-serif" }}>APY vs Inflation</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 8, height: 2, background: cfg.color, display: 'inline-block', borderRadius: 1 }} />
              <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)' }}>APY</span>
              <span style={{ width: 8, height: 1, background: '#E84040', display: 'inline-block', borderRadius: 1, borderTop: '1px dashed #E84040' }} />
              <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)' }}>CPI</span>
            </div>
          </div>
          <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cfg.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={cfg.color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {/* Y-axis labels */}
            <text x={chartPad.l - 4} y={chartPad.t + 4} textAnchor="end" fill="rgba(245,240,232,0.3)" fontSize="8">{chartMax.toFixed(0)}%</text>
            <text x={chartPad.l - 4} y={chartPad.t + innerH} textAnchor="end" fill="rgba(245,240,232,0.3)" fontSize="8">{chartMin.toFixed(0)}%</text>
            {/* X-axis labels */}
            {rawHistory.length > 1 && (
              <>
                <text x={chartPad.l} y={chartH - 4} textAnchor="start" fill="rgba(245,240,232,0.25)" fontSize="7">
                  {rawHistory[0]?.label || '—'}
                </text>
                <text x={chartPad.l + innerW} y={chartH - 4} textAnchor="end" fill="rgba(245,240,232,0.25)" fontSize="7">Now</text>
              </>
            )}
            {/* Area fill */}
            <polygon points={areaPoints} fill={`url(#${gradId})`} />
            {/* APY line */}
            <polyline fill="none" stroke={cfg.color} strokeWidth="2" points={linePoints} strokeLinejoin="round" strokeLinecap="round" />
            {/* Inflation reference line */}
            <line x1={chartPad.l} y1={inflationY} x2={chartPad.l + innerW} y2={inflationY} stroke="#E84040" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
            {/* CPI label */}
            <text x={chartPad.l + innerW - 2} y={inflationY - 4} textAnchor="end" fill="#E84040" fontSize="7" opacity="0.75">CPI {inflationRate.toFixed(1)}%</text>
            {/* Current APY dot + callout */}
            <circle cx={lastX} cy={lastY} r="4" fill={cfg.color} />
            <circle cx={lastX} cy={lastY} r="7" fill="none" stroke={cfg.color} strokeWidth="1" opacity="0.4" />
            <text x={lastX} y={lastY - 10} textAnchor="middle" fill={cfg.color} fontSize="8" fontWeight="bold">{liveApy.toFixed(1)}%</text>
          </svg>
          <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.30)', marginTop: 4 }}>
            Source: {analyticsSource}{nextHarvestSeconds !== undefined ? ` · harvest in ${nextHarvestSeconds}s` : ''}
          </div>
        </div>
      </div>

      {/* ── 6. PROTOCOL TRUST + YIELD BREAKDOWN ──────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>

        {/* Protocol trust */}
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', marginBottom: 12, fontFamily: "'Tenor Sans', sans-serif" }}>
            Protocol Trust
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Live Since',  value: codexEntry?.launchYear ? `${codexEntry.launchYear} · ${new Date().getFullYear() - codexEntry.launchYear}yr track record` : '—' },
              { label: 'TVL',         value: codexEntry?.tvlUsdBn != null ? `$${codexEntry.tvlUsdBn.toFixed(1)}B` : '—' },
              { label: 'Fees',        value: feeLabel },
              { label: 'Audited By',  value: codexEntry?.auditFirms?.slice(0, 2).join(', ') || '—' },
              { label: 'Chain',       value: strategy.chain.charAt(0).toUpperCase() + strategy.chain.slice(1) },
              { label: 'Category Rank', value: `#${rank} of ${sortedCat.length} · ${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)}% vs avg` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.38)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 10, color: '#f5f0e8', textAlign: 'right', lineHeight: 1.4 }}>{value}</span>
              </div>
            ))}
            {deployedUsdc > 0 && (
              <div style={{ marginTop: 4, padding: '6px 10px', background: `${cfg.color}0f`, border: `1px solid ${cfg.color}30`, borderRadius: 8 }}>
                <span style={{ fontSize: 10, color: cfg.color }}>Active: ${deployedUsdc.toLocaleString(undefined, { maximumFractionDigits: 0 })} deployed</span>
              </div>
            )}
          </div>
        </div>

        {/* Yield breakdown */}
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.45)', marginBottom: 12, fontFamily: "'Tenor Sans', sans-serif" }}>
            Yield Breakdown
          </div>
          {yc.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {yc.map((comp) => (
                <div key={comp.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.70)' }}>{comp.label}</span>
                      <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", background: comp.organic ? 'rgba(0,212,170,0.12)' : 'rgba(245,158,11,0.12)', color: comp.organic ? '#00D4AA' : '#F59E0B', border: `1px solid ${comp.organic ? 'rgba(0,212,170,0.30)' : 'rgba(245,158,11,0.30)'}` }}>
                        {comp.organic ? 'Organic' : 'Incentive'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: comp.organic ? '#00D4AA' : '#F59E0B', fontFamily: "'Cormorant Garamond', serif" }}>{comp.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (comp.pct / liveApy) * 100)}%`, height: '100%', background: comp.organic ? '#00D4AA' : '#F59E0B', borderRadius: 2 }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.30)', marginTop: 4, lineHeight: 1.5 }}>
                Organic yield is protocol revenue. Incentive yield is token rewards — may vary with market conditions.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {baseApy !== null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.55)' }}>Organic base</span>
                    <span style={{ fontSize: 11, color: '#00D4AA', fontFamily: "'Cormorant Garamond', serif" }}>{baseApy.toFixed(2)}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (baseApy / liveApy) * 100)}%`, height: '100%', background: '#00D4AA', borderRadius: 2 }} />
                  </div>
                </div>
              )}
              {baseApy !== null && liveApy > baseApy && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.55)' }}>Incentive / bonus</span>
                    <span style={{ fontSize: 11, color: '#F59E0B', fontFamily: "'Cormorant Garamond', serif" }}>{(liveApy - baseApy).toFixed(2)}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, ((liveApy - baseApy) / liveApy) * 100)}%`, height: '100%', background: '#F59E0B', borderRadius: 2 }} />
                  </div>
                </div>
              )}
              {baseApy === null && (
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.40)', fontFamily: "'Cormorant Garamond', serif" }}>
                  Breakdown unavailable — see Codex for yield composition detail.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 7. CODEX EDUCATION ───────────────────────────────────── */}
      {codexEntry && (
        <div style={{ marginBottom: 16 }}>
          <CodexChip entry={codexEntry} fullWidth />
        </div>
      )}

      {/* ── 8. ACTION BUTTONS ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onExecuteAllocation}
          style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: `1px solid ${cfg.color}55`, background: `${cfg.color}12`, color: '#f5f0e8', cursor: 'pointer', fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}
        >
          Set as Allocation
        </button>
        <button
          type="button"
          onClick={onExecuteStrategy}
          style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: 'none', background: cfg.color, color: '#0d1117', cursor: 'pointer', fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700, fontFamily: "'Tenor Sans', sans-serif" }}
        >
          Deploy This Strategy →
        </button>
      </div>
    </div>
  )
}



export function VaultsPage({ onNavigate, accountId }: { onNavigate?: (v: ViewKey) => void; accountId?: string }) {
  const [openCategory, setOpenCategory] = useState<CategoryKey | null>('grow')
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null)
  const [selectedByCategory, setSelectedByCategory] = useState<Record<CategoryKey, VaultStrategySummary | null>>({
    preserve: null,
    grow: null,
    accelerate: null,
  })
  const [depositAmount, setDepositAmount] = useState(10000)
  const [isMobile, setIsMobile] = useState(false)
  const inflation = useInflationRate()
  // strategyId from a YieldMonitorPanel "Allocate →" tap — resolved once strategies load
  const [pendingStrategyId, setPendingStrategyId] = useState<string | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Consume pending-tier from YieldMonitorPanel "Allocate →", or restore last open ──
  useEffect(() => {
    try {
      const rawPending = localStorage.getItem('gr:pending-tier')
      if (rawPending) {
        const pending = JSON.parse(rawPending) as {
          tierKey?: string
          strategyId?: string | null
        }
        const tier = pending.tierKey as CategoryKey | undefined
        if (tier && ['preserve', 'grow', 'accelerate'].includes(tier)) {
          setOpenCategory(tier)
          if (pending.strategyId) setPendingStrategyId(pending.strategyId)
          localStorage.removeItem('gr:pending-tier')
          return
        }
      }
      // Normal restore — no inbound alert
      const savedCategory = localStorage.getItem('gr:vault-open-category') as CategoryKey | null
      if (savedCategory && ['preserve', 'grow', 'accelerate'].includes(savedCategory)) {
        setOpenCategory(savedCategory)
      }
    } catch { }
  }, [])

  // ── Persist open category on change ──────────────────────────────
  useEffect(() => {
    try {
      if (openCategory) localStorage.setItem('gr:vault-open-category', openCategory)
    } catch { }
  }, [openCategory])


  const engine = useYieldEngine()
  const { data: analytics } = useAnalytics(accountId)

  // Load ranked strategies by intent tier
  const { data: strategyDataPreserve, isLoading: isLoadingPreserve } = useVaultStrategies('preserve', STRATEGY_CHAIN_SCOPE)
  const { data: strategyDataGrow, isLoading: isLoadingGrow } = useVaultStrategies('grow', STRATEGY_CHAIN_SCOPE)
  const { data: strategyDataAccelerate, isLoading: isLoadingAccelerate } = useVaultStrategies('accelerate', STRATEGY_CHAIN_SCOPE)

  const strategiesByCategory = useMemo<Record<CategoryKey, VaultStrategySummary[]>>(() => {
    const byApy = (arr: VaultStrategySummary[]) =>
      [...arr].sort((a, b) => Number(b.netApyPct) - Number(a.netApyPct))
    return {
      preserve: byApy(strategyDataPreserve?.strategies ?? []),
      grow:     byApy(strategyDataGrow?.strategies     ?? []),
      accelerate: byApy(strategyDataAccelerate?.strategies ?? []),
    }
  }, [strategyDataPreserve?.strategies, strategyDataGrow?.strategies, strategyDataAccelerate?.strategies])

  const normalizedByApyBand = useMemo(() => {
    const merged = [
      ...strategiesByCategory.preserve,
      ...strategiesByCategory.grow,
      ...strategiesByCategory.accelerate,
    ]
    return topByCategoryFromStrategies(merged)
  }, [strategiesByCategory])

  // ── Resolve a pending strategy once the strategy lists are populated ──
  useEffect(() => {
    if (!pendingStrategyId) return
    const all = [
      ...strategiesByCategory.preserve,
      ...strategiesByCategory.grow,
      ...strategiesByCategory.accelerate,
    ]
    if (all.length === 0) return
    const match = all.find(s => s.strategyId === pendingStrategyId)
    if (match) {
      const cat = strategyToCategory(match)
      setOpenCategory(cat)
      setSelectedByCategory(prev => ({ ...prev, [cat]: match }))
      setPendingStrategyId(null)
    }
  }, [strategiesByCategory, pendingStrategyId])

  // Map live allocated positions into the correct tier bucket by their current APY
  const deployedByCategory = useMemo<Record<CategoryKey, StrategyAllocationSummary[]>>(() => {
    const result: Record<CategoryKey, StrategyAllocationSummary[]> = {
      preserve: [], grow: [], accelerate: [],
    }
    for (const alloc of analytics?.strategyAllocations ?? []) {
      if (alloc.pct <= 0) continue
      const deployed = parseAtomicUsdc(alloc.deployedUsdc)
      if (deployed < 1) continue
      result[allocationToCategory(alloc.apy)].push(alloc)
    }
    return result
  }, [analytics?.strategyAllocations])

  // Auto-select top strategy per category if not already selected
  useEffect(() => {
    let changed = false
    const updated = { ...selectedByCategory }
    for (const category of ['preserve', 'grow', 'accelerate'] as CategoryKey[]) {
      const preferred = strategiesByCategory[category][0] ?? normalizedByApyBand[category][0] ?? null
      if (!updated[category] && preferred) {
        updated[category] = preferred
        changed = true
      }
    }
    if (changed) {
      setSelectedByCategory(updated)
    }
  }, [normalizedByApyBand, selectedByCategory, strategiesByCategory])

  // ── Persist selected strategies per category ──────────────────────
  useEffect(() => {
    try {
      const persist: Record<string, string> = {}
      for (const cat of ['preserve', 'grow', 'accelerate'] as CategoryKey[]) {
        const s = selectedByCategory[cat]
        if (s?.strategyId) persist[cat] = s.strategyId
      }
      if (Object.keys(persist).length) {
        localStorage.setItem('gr:vault-selected-ids', JSON.stringify(persist))
      }
    } catch { }
  }, [selectedByCategory])

  function handleUseStrategy(category: CategoryKey) {
    const selected = selectedByCategory[category]
    const strategy = selected || strategiesByCategory[category][0]

    if (!strategy) {
      // No strategy available, use fallback
      const config = CATEGORY_CONFIG[category]
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('gr:pending-tier', JSON.stringify({
          tierKey: category,
          tierName: config.name,
          strategyId: null,
          strategyLabel: null,
          tierColor: config.color,
          yieldRange: config.targetLabel,
          badge: config.subtitle,
        }))
      }
      onNavigate?.('deposit')
      return
    }

    const config = CATEGORY_CONFIG[category]

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('gr:pending-tier', JSON.stringify({
        tierKey: category,
        tierName: config.name,
        strategyId: strategy.strategyId,
        strategyLabel: strategy.label,
        tierColor: config.color,
        yieldRange: config.targetLabel,
        badge: config.subtitle,
      }))
    }

    onNavigate?.('deposit')
  }

  // Derive what is actively selected for the open category (for sticky bar)
  const activeSelectedStrategy = openCategory ? selectedByCategory[openCategory] : null
  const activeConfig = openCategory ? CATEGORY_CONFIG[openCategory] : null
  const blendedApyLabel = engine.isLoading || engine.apySource === 'fallback'
    ? 'Blended APY --'
    : `${engine.displayApy.toFixed(2)}% blended APY`

  return (
    <div style={{ padding: isMobile ? '20px 16px 120px' : '32px 32px 48px', maxWidth: 1100, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Sticky selected-strategy summary bar ─────────────────────── */}
      {activeSelectedStrategy && activeConfig && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          margin: isMobile ? '-20px -16px 20px' : '-32px -32px 28px',
          padding: isMobile ? '12px 16px' : '12px 32px',
          background: 'rgba(10,10,14,0.94)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${activeConfig.color}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeConfig.color, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: activeConfig.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>
                {activeConfig.name} — Selected
              </div>
              <div style={{ fontSize: isMobile ? 13 : 15, color: '#f5f0e8', fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeSelectedStrategy.label}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 1 }}>APY</div>
                  <div style={{ fontSize: 14, color: activeConfig.color, fontFamily: "'Cormorant Garamond', serif" }}>{activeSelectedStrategy.netApyPct}%</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 1 }}>Risk</div>
                  <div style={{ fontSize: 11, color: '#f5f0e8', textTransform: 'capitalize' }}>{activeSelectedStrategy.riskLevel}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 1 }}>Liquidity</div>
                  <div style={{ fontSize: 11, color: '#f5f0e8', textTransform: 'capitalize' }}>{activeSelectedStrategy.liquidityWindow?.replace('_', ' ')}</div>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => openCategory && handleUseStrategy(openCategory)}
              style={{
                padding: isMobile ? '9px 16px' : '9px 22px',
                background: activeConfig.color,
                color: '#1a1400',
                border: 'none',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                fontFamily: "'Tenor Sans', sans-serif",
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Deploy →
            </button>
          </div>
        </div>
      )}

      {/* ── Compact signal row ──────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusPill label={blendedApyLabel} tone="accent" />
          <StatusPill
            label={engine.wsConnected ? 'Live' : 'Updating'}
            tone={engine.wsConnected ? 'success' : 'neutral'}
          />
        </div>
      </div>

      {/* ── Intro text ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, maxWidth: 600 }}>
        <p style={{ fontSize: 13, color: 'rgba(245,240,232,0.6)', lineHeight: 1.7, margin: 0 }}>
          Choose your opportunity. Each category reveals the best-performing strategies in real time—handpicked, ranked by yield, and ready to deploy your capital.
        </p>
      </div>

      {/* ── Category Drawers ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
        {(['preserve', 'grow', 'accelerate'] as CategoryKey[]).map((category) => {
          const config = CATEGORY_CONFIG[category]
          const opportunities = (strategiesByCategory[category]?.length ? strategiesByCategory[category] : normalizedByApyBand[category]) || []
          const isOpen = openCategory === category
          const selected = selectedByCategory[category]
          const deployedPositions = deployedByCategory[category]
          const totalDeployedUsd = deployedPositions.reduce((sum, a) => sum + parseAtomicUsdc(a.deployedUsdc), 0)

          return (
            <div
              key={category}
              style={{
                border: `1px solid ${isOpen ? config.color + '60' : 'rgba(201,168,76,0.15)'}`,
                borderRadius: 16,
                background: isOpen ? `rgba(${config.color === '#00D4AA' ? '0,212,170' : config.color === '#c9a84c' ? '201,168,76' : '155,109,255'},0.06)` : 'rgba(255,255,255,0.02)',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Header: tap to expand/collapse */}
              <button
                type="button"
                onClick={() => setOpenCategory(isOpen ? null : category)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '18px 24px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, textAlign: 'left' }}>
                  <div style={{ width: 4, height: 4, background: config.color, borderRadius: '50%' }} />
                  <div>
                    <div style={{ fontSize: 12, letterSpacing: '0.06em', color: config.color, textTransform: 'uppercase', marginBottom: 2 }}>
                      {config.subtitle}
                    </div>
                    <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond', serif", color: '#f5f0e8', fontWeight: 300 }}>
                      {config.name}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginBottom: 2 }}>Target</div>
                    <div style={{ fontSize: 16, fontFamily: "'Cormorant Garamond', serif", color: config.color }}>
                      {config.targetLabel}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginBottom: 2 }}>Opportunities</div>
                    <div style={{ fontSize: 14, color: '#f5f0e8' }}>
                      {opportunities.length}
                    </div>
                  </div>
                  {totalDeployedUsd > 0 && (
                    <div style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      background: `${config.color}18`,
                      border: `1px solid ${config.color}50`,
                    }}>
                      <div style={{ fontSize: 9, color: config.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 1 }}>Deployed</div>
                      <div style={{ fontSize: 13, color: config.color, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                        ${totalDeployedUsd >= 1000
                          ? `${(totalDeployedUsd / 1000).toFixed(1)}k`
                          : totalDeployedUsd.toFixed(0)}
                      </div>
                    </div>
                  )}
                  <div style={{
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    color: config.color,
                    fontSize: 14,
                  }}>
                    ▼
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${config.color}30` }}>
                  {drillDown?.category === category && (
                    <StrategyDrillDownCard
                      state={drillDown}
                      analyticsHistory={analytics?.apyHistory ?? engine.apyHistory}
                      analyticsAllocations={analytics?.strategyAllocations ?? []}
                      nextHarvestSeconds={analytics?.secondsToNextHarvest ?? engine.epochState?.secondsToNext}
                      analyticsSource={analytics ? 'bff' : 'on-chain'}
                      inflationRate={inflation.rate}
                      depositAmount={depositAmount}
                      onDepositAmountChange={setDepositAmount}
                      categoryStrategies={opportunities}
                      onExecuteAllocation={() => {
                        setSelectedByCategory({ ...selectedByCategory, [category]: drillDown.strategy })
                      }}
                      onExecuteStrategy={() => {
                        setSelectedByCategory({ ...selectedByCategory, [category]: drillDown.strategy })
                        handleUseStrategy(category)
                      }}
                      onClose={() => setDrillDown(null)}
                    />
                  )}

                  {/* ── Active Positions ───────────────────────────────── */}
                  {deployedPositions.length > 0 && (
                    <div style={{ marginBottom: 20, marginTop: 16 }}>
                      <div style={{ fontSize: 10, color: config.color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.color, display: 'inline-block', boxShadow: `0 0 6px ${config.color}` }} />
                        Active Positions
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {deployedPositions.map((pos) => {
                          const deployedUsd = parseAtomicUsdc(pos.deployedUsdc)
                          const pctOfCategory = totalDeployedUsd > 0 ? (deployedUsd / totalDeployedUsd) * 100 : 0
                          return (
                            <div key={pos.name} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 14px',
                              background: `${config.color}09`,
                              border: `1px solid ${config.color}30`,
                              borderLeft: `3px solid ${config.color}`,
                              borderRadius: 10,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: '#f5f0e8', fontWeight: 500, marginBottom: 2 }}>{pos.name}</div>
                                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 5 }}>
                                  <div style={{ height: '100%', borderRadius: 2, background: config.color, width: `${pctOfCategory}%`, transition: 'width 0.4s' }} />
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 13, color: config.color, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                                  ${deployedUsd >= 1000 ? `${(deployedUsd / 1000).toFixed(1)}k` : deployedUsd.toFixed(0)}
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)' }}>
                                  {pos.apy.toFixed(1)}% APY · {pos.pct.toFixed(0)}% alloc
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', margin: '0 0 14px 0', lineHeight: 1.6 }}>
                      {config.tone}
                    </p>
                  </div>

                  {opportunities.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {opportunities.slice(0, 3).map((opportunity, idx) => {
                        const isSelected = selected?.strategyId === opportunity.strategyId
                        const codexEntry = getCodexEntry(opportunity.protocol)
                        return (
                          <div key={`${opportunity.strategyId}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedByCategory({ ...selectedByCategory, [category]: opportunity })
                                setDrillDown({ category, strategy: opportunity })
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '14px 16px',
                                background: isSelected ? `${config.color}15` : 'rgba(255,255,255,0.03)',
                                border: isSelected ? `2px solid ${config.color}` : '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 12,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                              }}
                            >
                              <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ fontSize: 13, color: '#f5f0e8', fontWeight: 500, marginBottom: 2 }}>
                                  {opportunity.label}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)' }}>
                                  {opportunity.protocol} on {opportunity.chain}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, textAlign: 'right' }}>
                                <div>
                                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginBottom: 2 }}>APY</div>
                                  <div style={{ fontSize: 14, fontFamily: "'Cormorant Garamond', serif", color: '#c9a84c' }}>
                                    {opportunity.netApyPct}%
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginBottom: 2 }}>Risk</div>
                                  <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.65)', textTransform: 'capitalize' }}>
                                    {opportunity.riskLevel}
                                  </div>
                                </div>
                                {isSelected && (
                                  <div style={{ fontSize: 16, color: config.color }}>✓</div>
                                )}
                              </div>
                            </button>
                            {/* ◈ Codex chip — sibling to card button, never nested inside it */}
                            {codexEntry && (
                              <div style={{ paddingLeft: 2 }}>
                                <CodexChip entry={codexEntry} compact fullWidth />
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {opportunities.length > 3 && (
                        <div
                          style={{
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(0,0,0,0.16)',
                            padding: '10px 10px 6px',
                          }}
                        >
                          <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.38)', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>
                            Additional Yield Strategies
                          </div>
                          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8, paddingRight: 4 }}>
                            {opportunities.slice(3).map((opportunity, idx) => {
                              const isSelected = selected?.strategyId === opportunity.strategyId
                              return (
                                <button
                                  key={`${opportunity.strategyId}-extra-${idx}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedByCategory({ ...selectedByCategory, [category]: opportunity })
                                    setDrillDown({ category, strategy: opportunity })
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 14px',
                                    background: isSelected ? `${config.color}15` : 'rgba(255,255,255,0.03)',
                                    border: isSelected ? `2px solid ${config.color}` : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 10,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: 12, color: '#f5f0e8', marginBottom: 2 }}>{opportunity.label}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)' }}>{opportunity.protocol} on {opportunity.chain}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12, color: '#c9a84c' }}>{opportunity.netApyPct}%</div>
                                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)', textTransform: 'capitalize' }}>{opportunity.riskLevel}</div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Use Strategy button */}
                      <button
                        type="button"
                        onClick={() => handleUseStrategy(category)}
                        style={{
                          marginTop: 8,
                          padding: '12px 20px',
                          background: config.color,
                          color: '#1a1400',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 11,
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase',
                          fontFamily: "'Tenor Sans', sans-serif",
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        Use {config.name} Strategy →
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 10,
                      border: `1px dashed ${config.color}40`,
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', marginBottom: 8 }}>
                        No strategies available in this category.
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)' }}>
                        Will use {CATEGORY_CONFIG[category].defaultStrategy.toUpperCase()} as fallback.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <YieldEngineDashboard />
    </div>
  )
}
