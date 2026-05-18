// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/components/YieldEngineDashboard.tsx
//
// The complete Yield Engine UI. Shows:
//   - Live blended APY with source indicator
//   - Per-strategy allocation bar with amounts + individual APYs
//   - Epoch countdown + harvest progress ring
//   - Latest harvest event + 24h history
//   - Circuit breaker status
//   - USDC/USD peg monitor
//   - 24h APY sparkline chart (from harvest events)
//
// Consumes: useYieldEngine (single hook — no prop drilling)
// ─────────────────────────────────────────────────────────────────────────────

'use client'

import { useState, useEffect, useRef } from 'react'
import { useYieldEngine } from '../hooks/useYieldEngine'
import { useVaultPositions } from '../hooks/useVaultPositions'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import type { VaultPositionItem } from '../lib/bff.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtTime(unixTs: number): string {
  if (!unixTs) return '—'
  return new Date(unixTs * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

// ── APY Source badge ─────────────────────────────────────────────────────────
const APY_SOURCE_LABELS = {
  harvest: { label: 'LIVE', color: '#18C870' },
  snapshot: { label: 'CHAIN', color: '#00D4AA' },
  ticker: { label: 'EST', color: '#F0A020' },
  fallback: { label: 'SYNC', color: '#5A5650' },
}

// ── Mini SVG sparkline chart ──────────────────────────────────────────────────
function ApySparkline({ data }: { data: Array<{ apy: number }> }) {
  if (data.length < 2) {
    return (
      <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace' }}>
          Collecting harvest data...
        </span>
      </div>
    )
  }

  const W = 300, H = 48, PAD = 4
  const apys = data.map(d => d.apy)
  const min = Math.min(...apys) * 0.98
  const max = Math.max(...apys) * 1.02
  const range = max - min || 1

  const pts = apys.map((apy, i) => {
    const x = PAD + (i / (apys.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((apy - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
  const areaD = `${pathD} L${(W - PAD)},${H} L${PAD},${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 48 }}>
      <defs>
        <linearGradient id="apy-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#C9A84C" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#apy-grad)" />
      <path d={pathD} fill="none" stroke="#C9A84C" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

// ── Circular progress ring for epoch countdown ────────────────────────────────
function EpochRing({ pct }: { pct: number }) {
  const R = 28, C = 2 * Math.PI * R
  const offset = C - (pct / 100) * C
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={36} cy={36} r={R} fill="none" stroke="rgba(201,168,76,0.12)" strokeWidth={4} />
      <circle
        cx={36} cy={36} r={R} fill="none"
        stroke="#C9A84C" strokeWidth={4}
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}

function StrategyDonut({ allocations }: { allocations: Array<{ name: string; pct: number; bandColor: string }> }) {
  const SIZE = 120
  const RADIUS = 42
  const C = 2 * Math.PI * RADIUS
  const cx = SIZE / 2
  const cy = SIZE / 2

  const active = allocations.filter(a => a.pct > 0)
  if (active.length === 0) {
    return (
      <div style={{ ...S.chartPlaceholder, width: SIZE, height: SIZE }}>
        No active
      </div>
    )
  }

  const totalPct = active.reduce((acc, item) => acc + item.pct, 0) || 1
  let offset = 0

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle
        cx={cx}
        cy={cy}
        r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={12}
      />
      {active.map((allocation) => {
        const normalized = allocation.pct / totalPct
        const strokeLen = normalized * C
        const segment = (
          <circle
            key={allocation.name}
            cx={cx}
            cy={cy}
            r={RADIUS}
            fill="none"
            stroke={allocation.bandColor}
            strokeWidth={12}
            strokeLinecap="butt"
            strokeDasharray={`${strokeLen} ${C - strokeLen}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += strokeLen
        return segment
      })}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fill: '#C9A84C', fontWeight: 700 }}
      >
        {active.length}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: '#5A5650', letterSpacing: '0.08em' }}
      >
        STRATS
      </text>
    </svg>
  )
}

// ── Liquidity window config ───────────────────────────────────────────────────
const LIQ_CFG = {
  instant:   { label: 'Instant',     color: '#00D4AA', bg: 'rgba(0,212,170,0.10)',  border: 'rgba(0,212,170,0.22)' },
  same_day:  { label: '24h Queue',   color: '#C9A84C', bg: 'rgba(201,168,76,0.10)', border: 'rgba(201,168,76,0.22)' },
  scheduled: { label: 'At Maturity', color: '#9B6DFF', bg: 'rgba(155,109,255,0.10)',border: 'rgba(155,109,255,0.22)' },
}

function PositionCard({ pos, onWithdraw }: { pos: VaultPositionItem; onWithdraw: (id: string) => void }) {
  const liq = LIQ_CFG[pos.liquidityWindow] ?? LIQ_CFG.instant
  const isLocked = pos.liquidityWindow === 'scheduled'
      && pos.pendleMaturity
      && new Date(pos.pendleMaturity.expiryDate).getTime() > Date.now()
  const profit = Number(pos.profitUsd)

  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#F0EDE8', marginBottom: 2 }}>{pos.label}</div>
          <div style={{ fontSize: 10, color: '#5A5650' }}>{pos.protocol} · {pos.chain}</div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20, background: liq.bg, border: `1px solid ${liq.border}`, color: liq.color, fontFamily: 'Sora, sans-serif', flexShrink: 0, marginLeft: 8 }}>
          {liq.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: '#5A5650', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Balance</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#F0EDE8' }}>
            ${Number(pos.currentPositionUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#5A5650', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>APY</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#C9A84C' }}>{Number(pos.apyPct).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#5A5650', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Profit</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: profit >= 0 ? '#18C870' : '#E04040' }}>
            {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Pendle maturity bar */}
      {pos.pendleMaturity && (
        <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 8, background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.18)' }}>
          <div style={{ fontSize: 10, color: '#9B6DFF', fontWeight: 600, marginBottom: 1 }}>
            Matures {new Date(pos.pendleMaturity.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.45)' }}>
            {pos.pendleMaturity.daysUntilExpiry > 0
              ? `${pos.pendleMaturity.daysUntilExpiry} days remaining · full yield paid at maturity`
              : 'Maturity reached — ready to redeem'}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onWithdraw(pos.strategyId)}
        disabled={Boolean(isLocked)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8,
          background: isLocked ? 'rgba(155,109,255,0.06)' : `${liq.color}18`,
          border: `1px solid ${isLocked ? 'rgba(155,109,255,0.18)' : liq.border}`,
          color: isLocked ? 'rgba(155,109,255,0.4)' : liq.color,
          fontSize: 10, fontFamily: 'Sora, sans-serif', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          cursor: isLocked ? 'not-allowed' : 'pointer',
        }}
      >
        {isLocked
          ? `Locked · ${pos.pendleMaturity!.daysUntilExpiry}d remaining`
          : pos.liquidityWindow === 'same_day' ? 'Queue Withdrawal →'
          : pos.liquidityWindow === 'scheduled' ? 'Redeem at Maturity →'
          : 'Withdraw Now →'}
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function YieldEngineDashboard() {
  const engine = useYieldEngine()
  const walletAddress = useActiveWalletAddress()
  const { data: positionsData, isLoading: positionsLoading } = useVaultPositions(walletAddress ?? undefined)
  const [epochSeconds, setEpochSeconds] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'allocation' | 'risk'>('overview')
  const [isMobile, setIsMobile] = useState(false)
  const [lastUpdatedSecs, setLastUpdatedSecs] = useState(0)
  const [withdrawTarget, setWithdrawTarget] = useState<string | null>(null)
  const lastUpdatedAtRef = useRef(Date.now())

  // Live epoch countdown — tick every second
  useEffect(() => {
    if (!engine.epochState) return
    setEpochSeconds(engine.epochState.secondsToNext)
    const interval = setInterval(() => {
      setEpochSeconds(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [engine.epochState?.epochNumber])

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Data freshness — reset counter when APY value changes
  useEffect(() => {
    lastUpdatedAtRef.current = Date.now()
    setLastUpdatedSecs(0)
  }, [engine.displayApy, engine.apySource])

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedSecs(Math.floor((Date.now() - lastUpdatedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const apyBadge = APY_SOURCE_LABELS[engine.apySource]
  const showApySourceBadge = engine.apySource !== 'fallback'
  const hasApyValue = !engine.isLoading && engine.apySource !== 'fallback' && engine.displayApy > 0
  const isStale = !engine.wsConnected && engine.apySource !== 'harvest'

  const APY_SOURCE_TOOLTIPS: Record<string, string> = {
    harvest: 'LIVE — Sourced directly from on-chain harvest events (highest confidence)',
    snapshot: 'CHAIN — Derived from on-chain strategy snapshot',
    ticker: 'EST — Interpolated estimate between harvest events',
    fallback: 'SYNC — Waiting for live strategy data',
  }

  // ── Overview tab ──────────────────────────────────────────────────────────
  const overviewContent = (
    <>
      <div style={S.apyHero}>
        <div style={S.apyLabel}>Blended APY</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.apyValue}>
            {hasApyValue ? `${engine.displayApy.toFixed(2)}%` : '—'}
          </div>
          {showApySourceBadge && (
            <div
              style={{ ...S.sourceBadge, background: `${apyBadge.color}15`, border: `1px solid ${apyBadge.color}30`, color: apyBadge.color, cursor: 'help' }}
              title={APY_SOURCE_TOOLTIPS[engine.apySource]}
            >
              {apyBadge.label}
            </div>
          )}
        </div>
        <div style={S.apySub}>
          {engine.yieldSnapshot
            ? `$${engine.yieldSnapshot.totalDeployed} deployed · $${engine.yieldSnapshot.totalYieldAccrued} total yield`
            : 'Awaiting live strategy data'}
        </div>
      </div>

      {/* Compact KPI rail */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={S.kpiCard}>
          <div style={S.kpiLabel}>Deployed</div>
          <div style={S.kpiValue}>{engine.yieldSnapshot ? `$${engine.yieldSnapshot.totalDeployed}` : '—'}</div>
        </div>
        <div style={S.kpiCard}>
          <div style={S.kpiLabel}>Session Yield</div>
          <div style={{ ...S.kpiValue, color: '#18C870' }}>+${engine.sessionYieldUsdc.toFixed(4)}</div>
        </div>
        <div style={S.kpiCard}>
          <div style={S.kpiLabel}>Next Harvest</div>
          <div style={S.kpiValue}>{fmtCountdown(epochSeconds)}</div>
        </div>
        <div style={S.kpiCard}>
          <div style={S.kpiLabel}>Circuit</div>
          <div style={{ ...S.kpiValue, color: engine.circuitBreakerActive ? '#E04040' : '#18C870' }}>
            {engine.circuitBreakerActive ? 'TRIGGERED' : 'ARMED'}
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={S.cardLabel}>24h APY History</div>
          <div style={S.freshness}>Updated {lastUpdatedSecs}s ago</div>
        </div>
        <ApySparkline data={engine.apyHistory} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={S.dimText}>{engine.harvestHistory.length} harvests</span>
          <span style={S.dimText}>+${engine.sessionYieldUsdc.toFixed(4)} this session</span>
        </div>
      </div>
    </>
  )

  // ── Allocation tab ────────────────────────────────────────────────────────
  const userPositions = positionsData?.positions ?? []

  const allocationContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── My Positions ───────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={S.cardLabel}>My Positions</div>
          {positionsData?.summary && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#C9A84C' }}>
              ${Number(positionsData.summary.totalBalanceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
            </div>
          )}
        </div>

        {positionsLoading ? (
          <div style={{ fontSize: 11, color: '#5A5650', padding: '8px 0' }}>Loading positions…</div>
        ) : userPositions.length === 0 ? (
          <div style={{ fontSize: 11, color: '#5A5650', lineHeight: 1.65, padding: '4px 0' }}>
            No active vault positions yet. Deposit to start earning yield.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {userPositions.map(pos => (
              <PositionCard key={pos.strategyId} pos={pos} onWithdraw={id => {
                setWithdrawTarget(id)
                setActiveTab('allocation')
              }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Protocol allocation breakdown ──────────────────────────── */}
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={S.cardLabel}>Strategy Allocations</div>
        <div style={S.freshness}>Updated {lastUpdatedSecs}s ago</div>
      </div>

      <div style={{ ...S.allocDonutWrap, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center' }}>
        <StrategyDonut allocations={engine.allocations.map(a => ({ name: a.name, pct: a.pct, bandColor: a.bandColor }))} />
        <div style={S.allocDonutLegend}>
          {engine.allocations.filter(a => a.isActive).slice(0, 4).map(a => (
            <div key={a.adapter} style={S.allocDonutLegendRow}>
              <span style={{ ...S.allocDot, background: a.bandColor }} />
              <span style={S.allocLegendName}>{a.name}</span>
              <span style={S.allocLegendPct}>{a.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div style={S.allocBar}>
        {engine.allocations.filter(a => a.isActive).map(a => (
          <div
            key={a.adapter}
            title={`${a.name}: ${a.pct.toFixed(1)}%`}
            style={{
              flex: a.pct, background: a.bandColor,
              height: '100%', borderRadius: 1,
              transition: 'flex 0.4s ease',
              opacity: engine.isLoading ? 0.4 : 1,
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
        {engine.allocations.map(a => (
          <div key={a.adapter} style={{ ...S.adapterRow, opacity: a.isActive ? 1 : 0.35 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.bandColor, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#F0EDE8', display: 'flex', alignItems: 'center', gap: 6 }}>
                {a.name}
                {!a.isActive && <span style={{ fontSize: 9, color: '#5A5650' }}>PENDING</span>}
              </div>
              <div style={{ fontSize: 10, color: '#5A5650' }}>{a.bandLabel} · Risk {a.riskScore}/100</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F0EDE8' }}>{a.pct.toFixed(0)}%</div>
              <div style={{ fontSize: 10, color: '#00D4AA' }}>{a.apy > 0 ? `${a.apy.toFixed(2)}% APY` : '—'}</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', minWidth: 80 }}>
              <div style={{ fontSize: 11, color: '#A8A49E' }}>${a.deployedUsdc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  )

  // ── Risk Ops tab ──────────────────────────────────────────────────────────
  const riskContent = (
    <>
      <div style={{ ...S.card, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
          <EpochRing pct={engine.epochState?.pctComplete ?? 0} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>
              {fmtCountdown(epochSeconds)}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={S.cardLabel}>Next Harvest</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#F0EDE8', marginTop: 4 }}>
            Epoch #{engine.epochState?.epochNumber ?? '—'} · {engine.epochState?.harvestCount ?? 0} total harvests
          </div>
          {engine.latestHarvest && (
            <div style={{ fontSize: 11, color: '#18C870', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              Last: +${engine.latestHarvest.totalYieldUsdc} at {fmtTime(engine.latestHarvest.timestamp)}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...S.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={S.cardLabel}>USDC Peg (Chainlink)</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, color: engine.usdcPrice >= 0.995 ? '#18C870' : '#E04040', marginTop: 4 }}>
            ${engine.usdcPrice.toFixed(4)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace' }}>Circuit Breaker</div>
          <div style={{
            marginTop: 4, padding: '3px 8px', borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700,
            background: engine.circuitBreakerActive ? 'rgba(224,64,64,0.15)' : 'rgba(24,200,112,0.10)',
            color: engine.circuitBreakerActive ? '#E04040' : '#18C870',
            border: `1px solid ${engine.circuitBreakerActive ? 'rgba(224,64,64,0.3)' : 'rgba(24,200,112,0.2)'}`,
          }}>
            {engine.circuitBreakerActive ? 'TRIGGERED' : 'ARMED'}
          </div>
        </div>
      </div>

      {engine.harvestHistory.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={S.cardLabel}>Recent Harvests</div>
            <div style={S.freshness}>Updated {lastUpdatedSecs}s ago</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflowY: 'auto' }}>
            {engine.harvestHistory.slice(0, 8).map((h) => (
              <div key={h.txHash} style={S.harvestRow}>
                <span style={{ color: '#5A5650', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, minWidth: 60 }}>
                  {fmtTime(h.timestamp)}
                </span>
                <span style={{ color: '#18C870', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700 }}>
                  +${h.totalYieldUsdc}
                </span>
                <span style={{ color: '#C9A84C', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  {h.blendedApy.toFixed(2)}%
                </span>
                <a
                  href={`https://arbiscan.io/tx/${h.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: '#4A9EFF', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none' }}
                >
                  ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  return (
    <div style={S.container}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div style={S.sectionLabel}>YIELD ENGINE</div>
      </div>

      {/* ── Stale data warning ─────────────────────────────────────────── */}
      {isStale && (
        <div style={{ ...S.alertBox, background: 'rgba(240,160,32,0.10)', border: '1px solid rgba(240,160,32,0.25)', color: '#F0A020' }}>
          ⚡ WebSocket disconnected — showing estimated data. Polling chain for updates.
        </div>
      )}

      {/* ── Circuit Breaker Alert ──────────────────────────────────────── */}
      {engine.circuitBreakerActive && (
        <div style={S.alertBox}>
          ⚠ CIRCUIT BREAKER ACTIVE — Yield operations paused
          · USDC/USD: ${engine.usdcPrice.toFixed(4)}
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div style={S.tabBar}>
        {(['overview', 'allocation', 'risk'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{ ...S.tabBtn, ...(activeTab === tab ? S.tabBtnActive : {}) }}
          >
            {tab === 'overview' ? 'Overview' : tab === 'allocation' ? 'Allocation' : 'Risk Ops'}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      {activeTab === 'overview' && overviewContent}
      {activeTab === 'allocation' && allocationContent}
      {activeTab === 'risk' && riskContent}

    </div>
  )
}


// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 12,
    fontFamily: 'Sora, sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  sectionLabel: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700,
    color: '#C9A84C', letterSpacing: '0.12em',
  },
  alertBox: {
    background: 'rgba(224,64,64,0.10)', border: '1px solid rgba(224,64,64,0.25)',
    borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#E04040',
    fontFamily: 'JetBrains Mono, monospace',
  },
  apyHero: {
    background: 'linear-gradient(135deg, rgba(201,168,76,0.09), rgba(201,168,76,0.03))',
    border: '1px solid rgba(201,168,76,0.20)', borderRadius: 12, padding: '16px 18px',
  },
  apyLabel: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A5650',
    letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4,
  },
  apyValue: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 40, fontWeight: 700, color: '#C9A84C',
    lineHeight: 1,
  },
  apySub: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A5650', marginTop: 6,
  },
  sourceBadge: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', borderRadius: 4, padding: '2px 7px',
  },
  card: {
    background: '#12141C', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  cardLabel: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A5650',
    letterSpacing: '0.10em', textTransform: 'uppercase',
  },
  chartPlaceholder: {
    border: '1px dashed rgba(255,255,255,0.12)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#5A5650',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  allocDonutWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  allocDonutLegend: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  allocDonutLegendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  allocDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  allocLegendName: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: '#A8A49E',
    flex: 1,
  },
  allocLegendPct: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: '#D4C4A0',
    fontWeight: 700,
  },
  allocBar: {
    display: 'flex', gap: 1.5, height: 6, borderRadius: 3, overflow: 'hidden',
  },
  adapterRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  harvestRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
  },
  dimText: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A5650',
  },
  // ── New: tabs + KPI rail + freshness ──────────────────────────────
  tabBar: {
    display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.07)',
    paddingBottom: 0, marginBottom: 4,
  },
  tabBtn: {
    background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
    padding: '6px 14px 8px', cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.08em', color: '#5A5650', textTransform: 'uppercase' as const,
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabBtnActive: {
    color: '#C9A84C', borderBottomColor: '#C9A84C',
  },
  kpiCard: {
    flex: 1, minWidth: 90,
    background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.12)',
    borderRadius: 8, padding: '8px 10px',
  },
  kpiLabel: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A5650',
    letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 2,
  },
  kpiValue: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: '#C9A84C',
  },
  freshness: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A5650',
    letterSpacing: '0.06em',
  },
}
