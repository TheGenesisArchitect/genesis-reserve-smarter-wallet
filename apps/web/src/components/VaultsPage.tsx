'use client'

import { useEffect, useMemo, useState } from 'react'
import { YieldEngineDashboard } from './YieldEngineDashboard'
import { useYieldEngine } from '../hooks/useYieldEngine'
import { useVaultStrategies } from '../hooks/useVaultStrategies'
import { useAnalytics } from '../hooks/useAnalytics'
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

/**
 * Get fallback strategy for a category if none available
 */
function fallbackStrategyForCategory(category: CategoryKey): string {
  return CATEGORY_CONFIG[category].defaultStrategy
}

function buildTrendPoints(strategy: VaultStrategySummary): number[] {
  const net = Number(strategy.netApyPct)
  const avg = Number(strategy.avgApyPct ?? strategy.netApyPct)
  const inception = Number(strategy.inceptionApyPct ?? strategy.netApyPct)
  const p1 = Math.max(net - 0.6, 0)
  const p2 = avg
  const p3 = Math.max((avg + net) / 2 - 0.2, 0)
  const p4 = inception
  const p5 = net
  return [p1, p2, p3, p4, p5]
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

function riskWeight(risk: VaultStrategySummary['riskLevel']): number {
  if (risk === 'low') return 0.95
  if (risk === 'medium') return 0.78
  return 0.6
}

function liquidityWeight(liquidity: VaultStrategySummary['liquidityWindow']): number {
  if (liquidity === 'instant') return 1
  if (liquidity === 'same_day') return 0.86
  return 0.7
}

function StrategyDrillDownCard({
  state,
  analyticsHistory,
  analyticsAllocations,
  nextHarvestSeconds,
  analyticsSource,
  onExecuteAllocation,
  onExecuteStrategy,
  onClose,
}: {
  state: DrillDownState
  analyticsHistory: YieldHistoryPoint[]
  analyticsAllocations: StrategyAllocationSummary[]
  nextHarvestSeconds?: number
  analyticsSource: string
  onExecuteAllocation: () => void
  onExecuteStrategy: () => void
  onClose: () => void
}) {
  const { strategy, category } = state
  const categoryConfig = CATEGORY_CONFIG[category]
  const historyPoints =
    analyticsHistory.length >= 5
      ? analyticsHistory.slice(-8).map((point) => point.apy)
      : buildTrendPoints(strategy)
  const points = historyPoints
  const minPoint = Math.min(...points)
  const maxPoint = Math.max(...points)
  const range = Math.max(maxPoint - minPoint, 0.0001)
  const chartPoints = points
    .map((value, index) => {
      const x = 12 + index * 64
      const y = 108 - ((value - minPoint) / range) * 76
      return `${x},${y}`
    })
    .join(' ')

  const topAllocations = analyticsAllocations
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)
  const remainingPct = Math.max(0, 100 - topAllocations.reduce((sum, allocation) => sum + allocation.pct, 0))
  const palette = [categoryConfig.color, '#7dd3c7', '#c9a84c', '#7f8ea3']
  const protocolMix = [
    ...topAllocations.map((allocation, index) => ({
      label: allocation.name,
      pct: Math.max(0, Number(allocation.pct.toFixed(1))),
      color: palette[index] ?? '#7f8ea3',
    })),
    ...(remainingPct > 0.5
      ? [
        {
          label: 'Other',
          pct: Number(remainingPct.toFixed(1)),
          color: palette[3],
        },
      ]
      : []),
  ]
  const donutFill = protocolMix
    .map((slice, idx, arr) => {
      const start = arr.slice(0, idx).reduce((sum, item) => sum + item.pct, 0)
      const end = start + slice.pct
      return `${slice.color} ${start}% ${end}%`
    })
    .join(', ')

  const netApy = Number(strategy.netApyPct)
  const matchedAllocation = matchAllocation(strategy, analyticsAllocations)
  const liveApy = matchedAllocation?.apy ?? netApy
  const liveRiskScore = matchedAllocation?.riskScore ?? (strategy.riskLevel === 'low' ? 25 : strategy.riskLevel === 'medium' ? 50 : 75)
  const deployedUsdc = matchedAllocation ? parseAtomicUsdc(matchedAllocation.deployedUsdc) : 0
  const feePenalty = Math.max(0, 1 - strategy.feeBps / 250)
  const performanceScore = Math.min(99, Math.round(liveApy * 12 * riskWeight(strategy.riskLevel) * feePenalty))
  const efficiencyScore = Math.min(99, Math.round((100 - liveRiskScore * 0.6) * liquidityWeight(strategy.liquidityWindow) * feePenalty))
  const executionReadiness = Math.round((performanceScore * 0.55 + efficiencyScore * 0.45))

  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${categoryConfig.color}66`,
        background: 'rgba(9,12,17,0.82)',
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: categoryConfig.color, marginBottom: 6 }}>
            Strategy Drill Down
          </div>
          <div style={{ fontSize: 20, color: '#f5f0e8', fontFamily: "'Cormorant Garamond', serif", marginBottom: 4 }}>
            {strategy.label}
          </div>
          {/* Phase 1: Pendle maturity warning */}
          {strategy.pendleMaturity?.yieldLockWarning && (
            <div
              style={{
                fontSize: 11,
                padding: '8px 10px',
                marginBottom: 8,
                background: 'rgba(255, 152, 0, 0.15)',
                border: '1px solid rgba(255, 152, 0, 0.5)',
                borderRadius: 6,
                color: '#ffb74d',
              }}
            >
              ⚠️ Yield Lock Expires in {strategy.pendleMaturity.daysUntilExpiry} days ({strategy.pendleMaturity.expiryDate})
            </div>
          )}
          <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)' }}>
            {strategy.protocol} on {strategy.chain} · {liveApy.toFixed(2)}% APY · {strategy.liquidityWindow.replace('_', ' ')} liquidity
          </div>
          <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.38)', marginTop: 6 }}>
            Live source: {analyticsSource}{nextHarvestSeconds !== undefined ? ` · next harvest ${nextHarvestSeconds}s` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: 'rgba(245,240,232,0.75)',
            borderRadius: 10,
            padding: '8px 10px',
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Close Card
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Performance Score', value: performanceScore },
          { label: 'Execution Readiness', value: executionReadiness },
          { label: 'Efficiency KPI', value: efficiencyScore },
        ].map((kpi) => (
          <div key={kpi.label} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 24, color: '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ── Codex Academy — embedded education for this strategy ──────── */}
      {(() => {
        const codexEntry = getCodexEntry(strategy.protocol)
        return codexEntry ? (
          <div style={{ marginBottom: 16 }}>
            <CodexChip entry={codexEntry} fullWidth />
          </div>
        ) : null
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', marginBottom: 6 }}>Trend Chart · APY signals</div>
          <svg width="100%" viewBox="0 0 280 120" preserveAspectRatio="none" style={{ height: 130 }}>
            <polyline
              fill="none"
              stroke={categoryConfig.color}
              strokeWidth="2.5"
              points={chartPoints}
            />
            {chartPoints.split(' ').map((point, idx) => {
              const [x, y] = point.split(',')
              return <circle key={`${point}-${idx}`} cx={x} cy={y} r="3" fill="#f5f0e8" />
            })}
          </svg>
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', marginBottom: 8 }}>Pie Chart · Allocation mix</div>
          <div
            style={{
              width: 118,
              height: 118,
              margin: '0 auto 10px',
              borderRadius: '50%',
              background: `conic-gradient(${donutFill})`,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 18,
                borderRadius: '50%',
                background: '#0f131b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f5f0e8',
                fontSize: 12,
              }}
            >
              100%
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {protocolMix.map((slice) => (
              <div key={slice.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(245,240,232,0.58)' }}>
                <span>{slice.label}</span>
                <span>{slice.pct}%</span>
              </div>
            ))}
            {deployedUsdc > 0 && (
              <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.42)', marginTop: 4 }}>
                Deployed: ${deployedUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onExecuteAllocation}
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 10,
            border: `1px solid ${categoryConfig.color}66`,
            background: `${categoryConfig.color}18`,
            color: '#f5f0e8',
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Execute Allocation
        </button>
        <button
          type="button"
          onClick={onExecuteStrategy}
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 10,
            border: 'none',
            background: categoryConfig.color,
            color: '#1a1400',
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Execute Strategy
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
