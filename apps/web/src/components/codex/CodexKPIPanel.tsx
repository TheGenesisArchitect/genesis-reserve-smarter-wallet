'use client'

import { useState, useCallback } from 'react'
import type { CodexProtocolEntry } from '@/lib/codex/types'
import { CODEX_PROTOCOLS } from '@/lib/codex/protocols'

const F = {
  tenor: "'Tenor Sans', sans-serif" as const,
  cormorant: "'Cormorant Garamond', serif" as const,
}

const TIER_COLOR: Record<string, string> = {
  preserve: '#00D4AA',
  grow: '#C9A84C',
  accelerate: '#9B6DFF',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals)
}

function getLiquidityCategory(note: string): string {
  const n = note.toLowerCase()
  if (n.includes('instant') || n.includes('same block')) return 'Instant'
  if (n.includes('same-day') || n.includes('hours')) return 'Hours'
  return 'Days'
}

// ── ApyRangeBar (L2 compact) ──────────────────────────────────────────────────
export function ApyRangeBar({
  range,
  tierColor,
}: {
  range: NonNullable<CodexProtocolEntry['apyRange']>
  tierColor: string
}) {
  const span = range.high - range.low || 1
  const pct = Math.min(100, Math.max(0, ((range.current - range.low) / span) * 100))

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.40)', fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Historical Range
        </span>
        <span style={{ fontSize: 11, color: tierColor, fontFamily: F.tenor, fontWeight: 700 }}>
          {fmt(range.current)}% current
        </span>
      </div>
      <div style={{ position: 'relative', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, rgba(${tierColor === '#00D4AA' ? '0,212,170' : tierColor === '#C9A84C' ? '201,168,76' : '155,109,255'},0.25), ${tierColor})`,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          width: 11, height: 11, borderRadius: '50%',
          background: tierColor,
          boxShadow: `0 0 8px ${tierColor}80`,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 8, color: 'rgba(245,240,232,0.28)', fontFamily: F.tenor }}>{fmt(range.low)}%</span>
        <span style={{ fontSize: 8, color: 'rgba(245,240,232,0.28)', fontFamily: F.tenor }}>{fmt(range.high)}%+</span>
      </div>
    </div>
  )
}

// ── ApySparkline ──────────────────────────────────────────────────────────────
function ApySparkline({
  history,
  tierColor,
  entryKey,
}: {
  history: NonNullable<CodexProtocolEntry['apyHistory']>
  tierColor: string
  entryKey: string
}) {
  const W = 400
  const H = 90
  const padT = 8, padB = 20, padL = 30, padR = 12
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const values = history.map(d => d.apy)
  const maxV = Math.max(...values)
  const minV = Math.min(...values)
  const span = maxV - minV || 1

  const px = (i: number) => padL + (i / (history.length - 1)) * plotW
  const py = (v: number) => padT + plotH - ((v - minV) / span) * plotH

  const linePoints = history.map((d, i) => `${px(i)},${py(d.apy)}`).join(' ')
  const areaD = [
    `M${px(0)},${padT + plotH}`,
    ...history.map((d, i) => `L${px(i)},${py(d.apy)}`),
    `L${px(history.length - 1)},${padT + plotH}`,
    'Z',
  ].join(' ')

  const gradId = `apyGrad-${entryKey}`
  const last = history[history.length - 1]

  // Y-axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tierColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={tierColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Y-axis grid lines */}
      {yLabels.map((v, i) => (
        <g key={i}>
          <line
            x1={padL} y1={py(v)} x2={W - padR} y2={py(v)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="0.75" strokeDasharray="3,4"
          />
          <text x={padL - 3} y={py(v)} textAnchor="end" dominantBaseline="middle"
            fontSize="7" fill="rgba(245,240,232,0.28)" fontFamily={F.tenor}>
            {fmt(v)}%
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={areaD} fill={`url(#${gradId})`} />

      {/* Line */}
      <polyline points={linePoints} fill="none" stroke={tierColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

      {/* X-axis labels (every 2nd) */}
      {history.map((d, i) => i % 2 === 0 && (
        <text key={i} x={px(i)} y={H - 4} textAnchor="middle"
          fontSize="7" fill="rgba(245,240,232,0.30)" fontFamily={F.tenor}>
          {d.label}
        </text>
      ))}

      {/* End-point dot + label */}
      {last && (
        <>
          <circle cx={px(history.length - 1)} cy={py(last.apy)} r="3.5" fill={tierColor} />
          <circle cx={px(history.length - 1)} cy={py(last.apy)} r="6" fill={tierColor} fillOpacity="0.18" />
          <rect
            x={px(history.length - 1) - 22} y={py(last.apy) - 17}
            width="44" height="14" rx="3"
            fill="rgba(2,3,5,0.85)" stroke={tierColor} strokeWidth="0.75"
          />
          <text x={px(history.length - 1)} y={py(last.apy) - 7} textAnchor="middle"
            fontSize="8" fill={tierColor} fontFamily={F.tenor} fontWeight="700">
            {fmt(last.apy)}% APY
          </text>
        </>
      )}
    </svg>
  )
}

// ── RiskRadar ─────────────────────────────────────────────────────────────────
function RiskRadar({
  scores,
  tierColor,
}: {
  scores: NonNullable<CodexProtocolEntry['riskScores']>
  tierColor: string
}) {
  const axes = [
    { key: 'smartContract' as const, label: 'Contract' },
    { key: 'liquidity' as const, label: 'Liquidity' },
    { key: 'oracle' as const, label: 'Oracle' },
    { key: 'governance' as const, label: 'Governance' },
    { key: 'market' as const, label: 'Market' },
  ]
  const n = axes.length
  const cx = 80, cy = 80, maxR = 55

  const angle = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2

  const pt = (axisIdx: number, val: number) => ({
    x: cx + maxR * (val / 10) * Math.cos(angle(axisIdx)),
    y: cy + maxR * (val / 10) * Math.sin(angle(axisIdx)),
  })

  const outerPt = (axisIdx: number) => pt(axisIdx, 10)

  const gridLevels = [0.25, 0.5, 0.75, 1.0]
  const gridPaths = gridLevels.map(level => {
    const pts = axes.map((_, i) => {
      const p = { x: cx + maxR * level * Math.cos(angle(i)), y: cy + maxR * level * Math.sin(angle(i)) }
      return `${p.x},${p.y}`
    })
    return `M${pts.join(' L')} Z`
  })

  const dataPoints = axes.map((ax, i) => pt(i, scores[ax.key]))
  const dataPath = `M${dataPoints.map(p => `${p.x},${p.y}`).join(' L')} Z`

  const labelPt = (i: number) => {
    const r = maxR + 20
    return { x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) }
  }

  return (
    <div>
      <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 6 }}>
        Safety Profile
      </div>
      <svg viewBox="0 0 160 180" style={{ width: '100%', maxWidth: 160, height: 'auto' }}>
        {/* Grid pentagons */}
        {gridPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.75" />
        ))}
        {/* Axis spokes */}
        {axes.map((_, i) => {
          const o = outerPt(i)
          return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.75" />
        })}
        {/* Data fill */}
        <path d={dataPath} fill={`${tierColor}22`} stroke={tierColor} strokeWidth="1.5" strokeLinejoin="round" />
        {/* Data dots */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={tierColor} />
        ))}
        {/* Axis labels */}
        {axes.map((ax, i) => {
          const l = labelPt(i)
          return (
            <text key={i} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="6.5" fill="rgba(245,240,232,0.50)" fontFamily={F.tenor}>
              {ax.label}
            </text>
          )
        })}
        {/* Center score */}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize="8" fill={tierColor} fontFamily={F.tenor} fontWeight="700">
          {fmt(Object.values(scores).reduce((a, b) => a + b, 0) / 5, 0)}/10
        </text>
      </svg>
    </div>
  )
}

// ── YieldCalculator ───────────────────────────────────────────────────────────
function YieldCalculator({
  entry,
  tierColor,
}: {
  entry: CodexProtocolEntry
  tierColor: string
}) {
  const [deposit, setDeposit] = useState('10000')
  const [months, setMonths] = useState(12)

  const apy = entry.apyRange?.current ?? 5
  const principal = Math.max(0, parseFloat(deposit.replace(/,/g, '')) || 0)
  const rate = apy / 100
  const total = principal * Math.pow(1 + rate, months / 12)
  const earned = total - principal
  const monthly = principal * rate / 12

  const handleDeposit = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9.]/g, '')
    setDeposit(v)
  }, [])

  const durations = [
    { label: '3 mo', months: 3 },
    { label: '6 mo', months: 6 },
    { label: '12 mo', months: 12 },
    { label: '24 mo', months: 24 },
  ]

  return (
    <div style={{ flex: '1 1 180px', minWidth: 170 }}>
      <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 10 }}>
        Yield Calculator
      </div>

      {/* Deposit input */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 8, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Deposit Amount
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(245,240,232,0.45)', fontFamily: F.tenor }}>$</span>
          <input
            type="text"
            inputMode="numeric"
            value={deposit}
            onChange={handleDeposit}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px 8px 22px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid rgba(255,255,255,0.10)`,
              borderRadius: 6,
              color: '#f5f0e8',
              fontSize: 13,
              fontFamily: F.tenor,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Duration selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 8, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor, marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Duration
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {durations.map(d => (
            <button
              key={d.months}
              type="button"
              onClick={() => setMonths(d.months)}
              style={{
                flex: 1, padding: '5px 2px',
                background: months === d.months ? `${tierColor}18` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${months === d.months ? tierColor : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 5,
                color: months === d.months ? tierColor : 'rgba(245,240,232,0.45)',
                fontSize: 9, fontFamily: F.tenor, cursor: 'pointer',
                fontWeight: months === d.months ? 700 : 400,
                transition: 'all 0.15s',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {principal > 0 ? (
        <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.08)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.40)', fontFamily: F.tenor }}>Monthly</span>
            <span style={{ fontSize: 12, color: '#1ABF6A', fontFamily: F.tenor, fontWeight: 700 }}>+${monthly.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.40)', fontFamily: F.tenor }}>Yield at {months}mo</span>
            <span style={{ fontSize: 13, color: tierColor, fontFamily: F.tenor, fontWeight: 700 }}>+${earned.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
          <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.40)', fontFamily: F.tenor }}>Total value</span>
            <span style={{ fontSize: 13, color: '#f5f0e8', fontFamily: F.cormorant, fontWeight: 600 }}>
              ${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 7, color: 'rgba(245,240,232,0.25)', fontFamily: F.tenor, marginBottom: 3 }}>Yield vs Principal</div>
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, background: tierColor,
                width: `${Math.min(100, (earned / principal) * 100 * (12 / months) * 3)}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.25)', fontFamily: F.tenor }}>Enter an amount to calculate</span>
        </div>
      )}
    </div>
  )
}

// ── YieldBreakdown ────────────────────────────────────────────────────────────
function YieldBreakdown({
  components,
  tierColor,
  entryKey,
}: {
  components: NonNullable<CodexProtocolEntry['yieldComponents']>
  tierColor: string
  entryKey: string
}) {
  const organicPct = components.filter(c => c.organic).reduce((s, c) => s + c.pct, 0)
  const incentivePct = 100 - organicPct
  const hasTwo = incentivePct > 0

  const r = 38, cx = 50, cy = 50
  const C = 2 * Math.PI * r
  const organicDash = C * (organicPct / 100)
  const incentiveDash = C * (incentivePct / 100)
  const startOffset = -C / 4 // start from top

  const clipId = `donut-${entryKey}`

  return (
    <div style={{ flex: '1 1 130px', minWidth: 120 }}>
      <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 8 }}>
        Yield Composition
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg viewBox="0 0 100 100" style={{ width: 80, height: 80, flexShrink: 0 }}>
          <defs>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={r + 10} />
            </clipPath>
          </defs>
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
          {/* Organic segment */}
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={tierColor}
            strokeWidth="16"
            strokeDasharray={`${organicDash} ${C - organicDash}`}
            strokeDashoffset={startOffset}
            strokeLinecap="butt"
          />
          {/* Incentive segment */}
          {hasTwo && (
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke="#9B6DFF"
              strokeWidth="16"
              strokeDasharray={`${incentiveDash} ${C - incentiveDash}`}
              strokeDashoffset={startOffset - organicDash}
              strokeLinecap="butt"
            />
          )}
          {/* Center label */}
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize="11" fontWeight="700" fill={tierColor} fontFamily={F.tenor}>
            {organicPct}%
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="6" fill="rgba(245,240,232,0.40)" fontFamily={F.tenor}>
            organic
          </text>
        </svg>
        <div style={{ flex: 1 }}>
          {components.map((c, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: c.organic ? tierColor : '#9B6DFF', flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.65)', fontFamily: F.tenor, lineHeight: 1.2 }}>{c.label}</span>
              </div>
              <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginLeft: 11 }}>
                <div style={{ height: '100%', borderRadius: 1, background: c.organic ? tierColor : '#9B6DFF', width: `${c.pct}%` }} />
              </div>
              <div style={{ fontSize: 8, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor, marginLeft: 11, marginTop: 1 }}>{c.pct}%</div>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 8, color: 'rgba(245,240,232,0.28)', fontFamily: F.tenor }}>
              {organicPct >= 90 ? 'Primarily organic yield' : organicPct >= 60 ? 'Mixed yield sources' : 'Incentive-heavy'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PeerComparison ────────────────────────────────────────────────────────────
function PeerComparison({
  entry,
  peerKeys,
  tierColor,
}: {
  entry: CodexProtocolEntry
  peerKeys: string[]
  tierColor: string
}) {
  const TIER_META: Record<string, { label: string; color: string }> = {
    preserve: { label: 'Preserve', color: '#00D4AA' },
    grow: { label: 'Grow', color: '#C9A84C' },
    accelerate: { label: 'Accelerate', color: '#9B6DFF' },
  }

  const peers = peerKeys
    .map(k => CODEX_PROTOCOLS[k])
    .filter(Boolean)
    .filter(p => p.apyRange)

  const all = [entry, ...peers]
  const maxApy = Math.max(...all.map(p => p.apyRange?.current ?? 0))

  return (
    <div>
      <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 10 }}>
        Peer Comparison
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr>
              {['Protocol', 'Tier', 'APY', 'TVL', 'Liquidity'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '4px 8px 8px 0',
                  fontSize: 8, color: 'rgba(245,240,232,0.35)',
                  fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  fontWeight: 600,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((p, i) => {
              const isCurrent = p.key === entry.key
              const tierMeta = TIER_META[p.tier]
              const apyPct = maxApy > 0 ? ((p.apyRange?.current ?? 0) / maxApy) * 100 : 0
              const liquidity = getLiquidityCategory(p.liquidityNote)

              return (
                <tr key={p.key} style={{ background: isCurrent ? `${tierColor}08` : 'transparent' }}>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isCurrent && (
                        <span style={{ width: 3, height: 14, borderRadius: 2, background: tierColor, display: 'inline-block', flexShrink: 0 }} />
                      )}
                      <span style={{
                        fontSize: 11, fontFamily: F.tenor,
                        color: isCurrent ? tierColor : 'rgba(245,240,232,0.75)',
                        fontWeight: isCurrent ? 700 : 400,
                        paddingLeft: isCurrent ? 0 : 9,
                      }}>
                        {p.displayName}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 9, color: tierMeta?.color, fontFamily: F.tenor }}>{tierMeta?.label}</span>
                  </td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', minWidth: 80 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: isCurrent ? tierColor : 'rgba(245,240,232,0.70)', fontFamily: F.tenor, fontWeight: 700, minWidth: 36 }}>
                        {fmt(p.apyRange?.current ?? 0)}%
                      </span>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: isCurrent ? tierColor : 'rgba(245,240,232,0.15)', width: `${apyPct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.50)', fontFamily: F.tenor }}>
                      {p.tvlUsdBn !== undefined ? `$${p.tvlUsdBn >= 1 ? `${fmt(p.tvlUsdBn, 1)}B` : `${fmt(p.tvlUsdBn * 1000, 0)}M`}` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{
                      fontSize: 9, fontFamily: F.tenor,
                      color: liquidity === 'Instant' ? '#00D4AA' : liquidity === 'Hours' ? '#C9A84C' : '#9B6DFF',
                    }}>
                      {liquidity}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      flex: '1 1 0', padding: '10px 12px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 8, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, color: '#f5f0e8', fontFamily: F.cormorant, fontWeight: 600, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── ProtocolKPIPanel (L3 visual dashboard) ────────────────────────────────────
export function ProtocolKPIPanel({ entry }: { entry: CodexProtocolEntry }) {
  const tierColor = TIER_COLOR[entry.tier] ?? '#00D4AA'
  const hasKPI = !!(entry.apyRange && entry.apyHistory && entry.riskScores)

  if (!hasKPI) return null

  const apyRange = entry.apyRange!
  const apyHistory = entry.apyHistory!
  const riskScores = entry.riskScores!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stat cards row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatCard
          label="Protocol TVL"
          value={entry.tvlUsdBn !== undefined
            ? `$${entry.tvlUsdBn >= 1 ? `${fmt(entry.tvlUsdBn, 1)}B` : `${fmt(entry.tvlUsdBn * 1000, 0)}M`}`
            : '—'}
          sub="Total value locked"
        />
        <StatCard
          label="Audits"
          value={`${entry.auditFirms?.length ?? 0}`}
          sub={entry.auditFirms?.slice(0, 2).join(' · ')}
        />
        <StatCard
          label="Since"
          value={entry.launchYear ? `${entry.launchYear}` : '—'}
          sub={entry.launchYear ? `${new Date().getFullYear() - entry.launchYear}yr track record` : undefined}
        />
        <StatCard
          label="Current APY"
          value={`${fmt(apyRange.current)}%`}
          sub={`Range: ${fmt(apyRange.low)}–${fmt(apyRange.high)}%`}
        />
      </div>

      {/* APY Sparkline */}
      <div>
        <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 8 }}>
          12-Month APY History
        </div>
        <div style={{ padding: '12px 8px 4px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
          <ApySparkline history={apyHistory} tierColor={tierColor} entryKey={entry.key} />
        </div>
      </div>

      {/* Risk Radar + Yield Calculator */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto' }}>
          <RiskRadar scores={riskScores} tierColor={tierColor} />
        </div>
        <YieldCalculator entry={entry} tierColor={tierColor} />
      </div>

      {/* Yield Breakdown + Peer Comparison */}
      {(entry.yieldComponents || entry.peerKeys) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {entry.yieldComponents && (
            <YieldBreakdown
              components={entry.yieldComponents}
              tierColor={tierColor}
              entryKey={entry.key}
            />
          )}
          {entry.peerKeys && entry.peerKeys.length > 0 && (
            <div style={{ flex: '2 1 200px', minWidth: 200 }}>
              <PeerComparison entry={entry} peerKeys={entry.peerKeys} tierColor={tierColor} />
            </div>
          )}
        </div>
      )}

    </div>
  )
}
