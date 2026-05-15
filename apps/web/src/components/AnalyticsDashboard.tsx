// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/components/AnalyticsDashboard.tsx
//
// Analytics dashboard combining BFF aggregate data (useAnalytics) with
// on-chain live data (useYieldEngine) for real-time strategy + APY views.
//
// Sections:
//   1. KPI Header  — Blended APY · Deployed · Earned Today · Epoch
//   2. APY ROI Chart — SVG sparkline from harvest / BFF apy history
//   3. Strategy Allocation Bars — per-adapter deployed %, APY, risk badges
//   4. Risk / Return Scatter — SVG 2D plot (riskScore × APY per strategy)
//   5. Harvest Event Log — recent harvest events with yield per epoch
// ─────────────────────────────────────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useAnalytics } from '../hooks/useAnalytics'
import { useYieldEngine } from '../hooks/useYieldEngine'
import type { StrategyAllocationSummary, YieldHistoryPoint } from '../lib/bff.types'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtUsdc(raw: string | number): string {
    const n = typeof raw === 'number' ? raw : parseFloat(raw) / 1e6
    if (!Number.isFinite(n)) return '$0.00'
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
    return `$${n.toFixed(2)}`
}

function fmtApy(apy: number): string {
    return `${apy.toFixed(2)}%`
}

function fmtCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

function parseUsdcAtomic(raw: string): number {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
}

interface DailyVolumePoint {
    key: string
    label: string
    totalAtomic: number
}

function buildDailyVolume(history: YieldHistoryPoint[]): DailyVolumePoint[] {
    const now = new Date()
    const days: DailyVolumePoint[] = []

    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        days.push({
            key: d.toISOString().slice(0, 10),
            label: d.toLocaleDateString(undefined, { weekday: 'short' }),
            totalAtomic: 0,
        })
    }

    const byDay = new Map(days.map((d) => [d.key, d]))
    for (const point of history) {
        const dayKey = new Date(point.timestamp * 1000).toISOString().slice(0, 10)
        const day = byDay.get(dayKey)
        if (!day) continue
        day.totalAtomic += parseUsdcAtomic(point.yieldUsdc)
    }

    return days
}

// ── SVG ROI Sparkline ─────────────────────────────────────────────────────────

function RoiSparkline({ history }: { history: YieldHistoryPoint[] }) {
    const W = 540, H = 80, PAD = 8, PT_R = 2.5

    if (history.length < 2) {
        return (
            <div style={S.chartEmpty}>
                Collecting APY history — harvests populate this chart every 15 min
            </div>
        )
    }

    const apys = history.map(h => h.apy)
    const min = Math.min(...apys) * 0.97
    const max = Math.max(...apys) * 1.03
    const rng = max - min || 1

    const pts = history.map((h, i) => {
        const x = PAD + (i / (history.length - 1)) * (W - PAD * 2)
        const y = H - PAD - ((h.apy - min) / rng) * (H - PAD * 2)
        return { x, y, h }
    })

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const areaPath = `${linePath} L${(W - PAD).toFixed(1)},${H} L${PAD},${H} Z`

    const firstApy = apys[0]
    const lastApy = apys[apys.length - 1]
    const trend = lastApy >= firstApy ? '#18C870' : '#f87171'
    const trendPct = firstApy ? (((lastApy - firstApy) / firstApy) * 100).toFixed(1) : '0.0'
    const trendLabel = lastApy >= firstApy ? `▲ +${trendPct}%` : `▼ ${trendPct}%`

    return (
        <div>
            <div style={S.chartHeader}>
                <span style={S.chartTitle}>APY Trend (last {history.length} harvests)</span>
                <span style={{ ...S.chartBadge, color: trend }}>{trendLabel}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} style={S.svg}>
                <defs>
                    <linearGradient id="roi-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#C9A84C" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#roi-grad)" />
                <path d={linePath} fill="none" stroke="#C9A84C" strokeWidth={1.5} strokeLinejoin="round" />
                {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={PT_R} fill="#C9A84C" opacity={0.8} />
                ))}
                {/* Min/max labels */}
                <text x={PAD} y={H - 2} fontSize={9} fill="#5A5650" fontFamily="JetBrains Mono, monospace">
                    {fmtApy(min)}
                </text>
                <text x={PAD} y={12} fontSize={9} fill="#5A5650" fontFamily="JetBrains Mono, monospace">
                    {fmtApy(max)}
                </text>
            </svg>
        </div>
    )
}

// ── Strategy Allocation Bar ───────────────────────────────────────────────────

function StrategyBar({ alloc, maxPct }: { alloc: StrategyAllocationSummary; maxPct: number }) {
    const barWidth = maxPct > 0 ? (alloc.pct / maxPct) * 100 : 0
    const riskColor = alloc.riskScore < 30 ? '#18C870' : alloc.riskScore < 60 ? '#F0A020' : '#f87171'

    return (
        <div style={S.allocRow}>
            <div style={S.allocMeta}>
                <span style={{ ...S.allocBand, background: alloc.bandColor + '22', color: alloc.bandColor }}>
                    {alloc.bandLabel}
                </span>
                <span style={S.allocName}>{alloc.name}</span>
            </div>
            <div style={S.allocBar}>
                <div style={{ ...S.allocBarFill, width: `${barWidth}%`, background: alloc.bandColor }} />
            </div>
            <div style={S.allocStats}>
                <span style={S.statVal}>{fmtUsdc(alloc.deployedUsdc)}</span>
                <span style={S.statSep}>·</span>
                <span style={{ ...S.statVal, color: '#18C870' }}>{fmtApy(alloc.apy)} APY</span>
                <span style={S.statSep}>·</span>
                <span style={{ ...S.statVal, color: riskColor }}>Risk {alloc.riskScore}</span>
                <span style={S.statSep}>·</span>
                <span style={{ ...S.pctLabel }}>{alloc.pct.toFixed(1)}%</span>
            </div>
        </div>
    )
}

// ── Risk / Return Scatter ─────────────────────────────────────────────────────

function RiskReturnScatter({ allocations }: { allocations: StrategyAllocationSummary[] }) {
    const W = 320, H = 160, PAD = 32

    if (allocations.length === 0) {
        return <div style={S.chartEmpty}>No strategy data available</div>
    }

    const risks = allocations.map(a => a.riskScore)
    const apys = allocations.map(a => a.apy)
    const maxRisk = Math.max(...risks, 100)
    const maxApy = Math.max(...apys, 10) * 1.2

    const toX = (r: number) => PAD + (r / maxRisk) * (W - PAD * 2)
    const toY = (a: number) => H - PAD - (a / maxApy) * (H - PAD * 2)

    return (
        <div>
            <div style={S.chartHeader}>
                <span style={S.chartTitle}>Risk vs. Return</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ ...S.svg, height: 160 }}>
                {/* Grid lines */}
                <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2A2820" strokeWidth={1} />
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2A2820" strokeWidth={1} />
                {/* Axis labels */}
                <text x={W / 2} y={H - 4} fontSize={9} fill="#5A5650" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
                    Risk Score →
                </text>
                <text x={8} y={H / 2} fontSize={9} fill="#5A5650" textAnchor="middle"
                    transform={`rotate(-90, 8, ${H / 2})`} fontFamily="JetBrains Mono, monospace">
                    APY →
                </text>
                {/* Points */}
                {allocations.map((a, i) => (
                    <g key={i}>
                        <circle
                            cx={toX(a.riskScore)}
                            cy={toY(a.apy)}
                            r={7 + (a.pct / 100) * 10}
                            fill={a.bandColor}
                            opacity={0.75}
                        />
                        <text
                            x={toX(a.riskScore)}
                            y={toY(a.apy) - 10}
                            fontSize={8}
                            fill="#D4C4A0"
                            textAnchor="middle"
                            fontFamily="JetBrains Mono, monospace"
                        >
                            {a.name.split('V')[0]}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    )
}

// ── Harvest Event Log ─────────────────────────────────────────────────────────

function HarvestLog({ harvestHistory }: { harvestHistory: Array<{ timestamp: number; apy: number; yieldUsdc: string }> }) {
    if (harvestHistory.length === 0) {
        return (
            <section style={S.card}>
                <div style={S.cardTitle}>Recent Harvests</div>
                <div style={S.chartEmpty}>No harvest events yet. First harvest in this epoch.</div>
            </section>
        )
    }

    return (
        <section style={S.card}>
            <div style={S.cardTitle}>Recent Harvests</div>
            <div style={S.harvestTable}>
                <div style={S.harvestHeader}>
                    <span>Time</span>
                    <span>APY</span>
                    <span>Yield (USDC)</span>
                </div>
                {harvestHistory.slice(0, 8).map((h, i) => (
                    <div key={i} style={S.harvestRow}>
                        <span style={S.harvestTime}>
                            {new Date(h.timestamp * 1000).toLocaleTimeString('en-US', {
                                hour: '2-digit', minute: '2-digit',
                            })}
                        </span>
                        <span style={{ ...S.harvestApy }}>
                            {fmtApy(h.apy)}
                        </span>
                        <span style={S.harvestYield}>
                            {fmtUsdc(h.yieldUsdc)}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    )
}

function DailyVolumeBars({ volume }: { volume: DailyVolumePoint[] }) {
    if (volume.length === 0) {
        return <div style={S.chartEmpty}>No volume data available</div>
    }

    const maxAtomic = Math.max(...volume.map((d) => d.totalAtomic), 1)
    const totalAtomic = volume.reduce((acc, d) => acc + d.totalAtomic, 0)

    return (
        <div>
            <div style={S.chartHeader}>
                <span style={S.chartTitle}>Daily Volume (last 7 days)</span>
                <span style={S.chartBadge}>{fmtUsdc(totalAtomic)}</span>
            </div>
            <div style={S.volumeGrid}>
                {volume.map((point) => {
                    const h = Math.max(4, Math.round((point.totalAtomic / maxAtomic) * 78))
                    return (
                        <div key={point.key} style={S.volumeCol}>
                            <div style={S.volumeBarWrap}>
                                <div style={{ ...S.volumeBar, height: `${h}px` }} title={`${point.label}: ${fmtUsdc(point.totalAtomic)}`} />
                            </div>
                            <span style={S.volumeLabel}>{point.label}</span>
                            <span style={S.volumeValue}>{fmtUsdc(point.totalAtomic)}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnalyticsDashboard({ accountId }: { accountId?: string }) {
    const { data: bff, isLoading: bffLoading, error: bffError } = useAnalytics(accountId)
    const engine = useYieldEngine()

    // Merge: prefer BFF strategy allocations, fall back to on-chain
    const strategyAllocations: StrategyAllocationSummary[] = useMemo(() => {
        if (bff?.strategyAllocations && bff.strategyAllocations.length > 0) {
            return bff.strategyAllocations
        }
        return (engine.allocations ?? []).map(a => ({
            name: a.name,
            deployedUsdc: a.deployedUsdc,
            pct: a.pct,
            apy: a.apy,
            riskScore: a.riskScore,
            bandLabel: a.bandLabel,
            bandColor: a.bandColor,
        }))
    }, [bff?.strategyAllocations, engine.allocations])

    // Merge: prefer BFF apy history, fall back to on-chain harvest history
    const apyHistory: YieldHistoryPoint[] = useMemo(() => {
        if (bff?.apyHistory && bff.apyHistory.length > 0) return bff.apyHistory
        return (engine.apyHistory ?? []).map(h => ({
            timestamp: h.timestamp,
            apy: h.apy,
            yieldUsdc: h.yieldUsdc,
        }))
    }, [bff?.apyHistory, engine.apyHistory])

    // KPI values: BFF where available, on-chain as fallback
    const blendedApy = bff?.blendedApy ?? engine.displayApy
    const totalDeployed = bff?.totalDeployedUsdc ?? ''
    const liquidBuffer = bff?.liquidBufferUsdc ?? ''
    const earnedToday = bff?.earnedTodayUsdc ?? ''
    const earnedAllTime = bff?.earnedAllTimeUsdc ?? ''
    const epochNum = bff?.epochNumber ?? engine.epochState?.epochNumber ?? 0
    const secsToHarvest = bff?.secondsToNextHarvest ?? engine.epochState?.secondsToNext ?? 0
    const maxPct = Math.max(...strategyAllocations.map(a => a.pct), 1)
    const dailyVolume = useMemo(() => buildDailyVolume(apyHistory), [apyHistory])

    if (!accountId) {
        return (
            <section style={S.empty}>
                <div style={S.emptyIcon}>📊</div>
                <div style={S.emptyTitle}>Connect your wallet to view analytics</div>
                <div style={S.emptyMuted}>Account, yield, and strategy data will appear here.</div>
            </section>
        )
    }

    return (
        <div style={S.root}>

            {/* ── KPI Strip ─────────────────────────────────────────────────── */}
            <div style={S.kpiStrip}>
                <div style={S.kpi}>
                    <div style={S.kpiLabel}>Blended APY</div>
                    <div style={{ ...S.kpiVal, color: '#C9A84C' }}>{fmtApy(blendedApy)}</div>
                    <div style={S.kpiSub}>{engine.apySource?.toUpperCase() ?? 'BFF'}</div>
                </div>
                <div style={S.kpiDivider} />
                <div style={S.kpi}>
                    <div style={S.kpiLabel}>Total Deployed</div>
                    <div style={S.kpiVal}>{totalDeployed ? fmtUsdc(totalDeployed) : '—'}</div>
                    <div style={S.kpiSub}>Across strategies</div>
                </div>
                <div style={S.kpiDivider} />
                <div style={S.kpi}>
                    <div style={S.kpiLabel}>Earned Today</div>
                    <div style={{ ...S.kpiVal, color: '#18C870' }}>
                        {earnedToday ? fmtUsdc(earnedToday) : `$${engine.yieldTodayDisplay ?? '0.00'}`}
                    </div>
                    <div style={S.kpiSub}>All time: {earnedAllTime ? fmtUsdc(earnedAllTime) : '—'}</div>
                </div>
                <div style={S.kpiDivider} />
                <div style={S.kpi}>
                    <div style={S.kpiLabel}>Next Harvest</div>
                    <div style={{ ...S.kpiVal, color: secsToHarvest < 120 ? '#18C870' : '#D4C4A0' }}>
                        {fmtCountdown(secsToHarvest)}
                    </div>
                    <div style={S.kpiSub}>Epoch #{epochNum}</div>
                </div>
                {engine.circuitBreakerActive && (
                    <>
                        <div style={S.kpiDivider} />
                        <div style={{ ...S.kpi, alignItems: 'center' }}>
                            <div style={S.kpiLabel}>&nbsp;</div>
                            <div style={S.circuitBreaker}>⚠ CIRCUIT BREAKER ACTIVE</div>
                        </div>
                    </>
                )}
            </div>

            {/* ── BFF status row ─────────────────────────────────────────────── */}
            {bffLoading && (
                <div style={S.statusRow}>Loading BFF analytics data…</div>
            )}
            {bffError && (
                <div style={{ ...S.statusRow, color: '#f87171' }}>
                    BFF analytics unavailable — showing on-chain data only
                </div>
            )}
            {bff && (
                <div style={S.statusRow}>
                    BFF sync: {new Date(bff.fetchedAt).toLocaleTimeString()} &nbsp;·&nbsp;
                    Liquid buffer: {fmtUsdc(liquidBuffer)}
                </div>
            )}

            {/* ── APY ROI Chart ──────────────────────────────────────────────── */}
            <section style={S.card}>
                <div style={S.cardTitle}>APY Performance</div>
                <RoiSparkline history={apyHistory} />
            </section>

            <section style={S.card}>
                <div style={S.cardTitle}>Volume</div>
                <DailyVolumeBars volume={dailyVolume} />
            </section>

            {/* ── Strategy Allocations ───────────────────────────────────────── */}
            <section style={S.card}>
                <div style={S.cardTitle}>Strategy Allocations</div>
                {strategyAllocations.length === 0 ? (
                    <div style={S.chartEmpty}>
                        {engine.isLoading ? 'Loading on-chain allocations…' : 'No active strategy allocations'}
                    </div>
                ) : (
                    <div style={S.allocList}>
                        {strategyAllocations.map((a, i) => (
                            <StrategyBar key={i} alloc={a} maxPct={maxPct} />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Risk / Return + Harvest Log side by side ───────────────────── */}
            <div style={S.twoCol}>
                <section style={S.card}>
                    <div style={S.cardTitle}>Risk vs. Return</div>
                    <RiskReturnScatter allocations={strategyAllocations} />
                </section>
                <HarvestLog harvestHistory={apyHistory} />
            </div>
        </div>
    )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
    root: {
        display: 'flex', flexDirection: 'column', gap: 16, padding: 4,
    },
    // KPI strip
    kpiStrip: {
        display: 'flex', alignItems: 'stretch', gap: 0,
        background: '#1A1912', border: '1px solid #2A2820',
        borderRadius: 10, overflow: 'hidden',
    },
    kpi: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: '14px 18px', gap: 3,
    },
    kpiLabel: {
        fontSize: 10, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.08em', textTransform: 'uppercase',
    },
    kpiVal: {
        fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
        color: '#D4C4A0', lineHeight: 1.1,
    },
    kpiSub: {
        fontSize: 10, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
    },
    kpiDivider: {
        width: 1, background: '#2A2820', flexShrink: 0,
    },
    circuitBreaker: {
        fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
        color: '#f87171', background: '#f871711a', border: '1px solid #f87171',
        borderRadius: 4, padding: '3px 8px', letterSpacing: '0.06em',
    },
    // Cards
    card: {
        background: '#1A1912', border: '1px solid #2A2820',
        borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
    },
    cardTitle: {
        fontSize: 11, color: '#C9A84C', fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
    },
    // Charts
    svg: {
        width: '100%', height: 80, display: 'block',
    },
    chartHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
    },
    chartTitle: {
        fontSize: 11, color: '#8A7E6A', fontFamily: 'JetBrains Mono, monospace',
    },
    chartBadge: {
        fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
    },
    chartEmpty: {
        fontSize: 11, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center', padding: '20px 0',
    },
    volumeGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: 8,
        alignItems: 'end',
    },
    volumeCol: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },
    volumeBarWrap: {
        width: '100%',
        height: 82,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    volumeBar: {
        width: 18,
        borderRadius: 4,
        background: 'linear-gradient(180deg, #C9A84C 0%, #8A6F2A 100%)',
        minHeight: 4,
    },
    volumeLabel: {
        fontSize: 10,
        color: '#5A5650',
        fontFamily: 'JetBrains Mono, monospace',
    },
    volumeValue: {
        fontSize: 9,
        color: '#8A7E6A',
        fontFamily: 'JetBrains Mono, monospace',
    },
    // Strategy allocation
    allocList: {
        display: 'flex', flexDirection: 'column', gap: 10,
    },
    allocRow: {
        display: 'flex', flexDirection: 'column', gap: 4,
    },
    allocMeta: {
        display: 'flex', alignItems: 'center', gap: 8,
    },
    allocBand: {
        fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
        border: '1px solid transparent', borderRadius: 3, padding: '1px 5px',
        letterSpacing: '0.06em',
    },
    allocName: {
        fontSize: 12, color: '#D4C4A0', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
    },
    allocBar: {
        height: 6, background: '#2A2820', borderRadius: 3, overflow: 'hidden',
    },
    allocBarFill: {
        height: '100%', borderRadius: 3, transition: 'width 0.6s ease',
        opacity: 0.85,
    },
    allocStats: {
        display: 'flex', alignItems: 'center', gap: 6,
    },
    statVal: {
        fontSize: 11, color: '#8A7E6A', fontFamily: 'JetBrains Mono, monospace',
    },
    statSep: {
        fontSize: 10, color: '#3A3830',
    },
    pctLabel: {
        fontSize: 11, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
    },
    // Two-col layout
    twoCol: {
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
    },
    // Harvest log
    harvestTable: {
        display: 'flex', flexDirection: 'column', gap: 2,
    },
    harvestHeader: {
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        fontSize: 10, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        borderBottom: '1px solid #2A2820', paddingBottom: 6, marginBottom: 4,
    },
    harvestRow: {
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
        padding: '3px 0', borderBottom: '1px solid #1E1D18',
    },
    harvestTime: { color: '#8A7E6A' },
    harvestApy: { color: '#C9A84C' },
    harvestYield: { color: '#18C870' },
    // Status row
    statusRow: {
        fontSize: 10, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right' as const, letterSpacing: '0.06em',
    },
    // Empty state
    empty: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '60px 20px',
    },
    emptyIcon: { fontSize: 40 },
    emptyTitle: {
        fontSize: 16, fontWeight: 600, color: '#D4C4A0',
        fontFamily: 'JetBrains Mono, monospace',
    },
    emptyMuted: {
        fontSize: 12, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace',
    },
}
