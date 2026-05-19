'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useYieldEngine } from '../hooks/useYieldEngine'
import { useVaultPositions } from '../hooks/useVaultPositions'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'

// ── Strategy config ────────────────────────────────────────────────────────────

type StrategyMode = 'conservative' | 'balanced' | 'growth'

const STRATEGY_CONFIG: Record<StrategyMode, {
    label: string
    tagline: string
    description: string
    targetApy: string
    color: string
}> = {
    conservative: {
        label: 'Conservative',
        tagline: 'Capital preservation first',
        description: 'Focuses on stablecoin lending and lowest-risk liquidity pools. Prioritizes protecting your principal with steady, predictable yield.',
        targetApy: '4–6%',
        color: '#00D4AA',
    },
    balanced: {
        label: 'Balanced',
        tagline: 'Optimal risk-adjusted returns',
        description: 'Blends lending markets with curated DeFi vaults. Our default strategy — designed to maximize yield while managing drawdown exposure.',
        targetApy: '8–12%',
        color: '#C9A84C',
    },
    growth: {
        label: 'Growth',
        tagline: 'Maximum yield potential',
        description: 'Allocates to higher-yield protocols and emerging strategies. Best for users comfortable with more volatility in exchange for higher returns.',
        targetApy: '14–20%',
        color: '#9B6DFF',
    },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
    if (!Number.isFinite(n)) return '$0.00'
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
    return `$${n.toFixed(2)}`
}

function fmtCountdownFriendly(secs: number): string {
    if (secs <= 0) return 'Imminent'
    const m = Math.floor(secs / 60)
    const s = secs % 60
    if (m >= 60) {
        const h = Math.floor(m / 60)
        const rm = m % 60
        return `${h}h ${rm}m`
    }
    return `${m}m ${String(s).padStart(2, '0')}s`
}

// ── APY sparkline ──────────────────────────────────────────────────────────────

function ApySparkline({ history }: { history: Array<{ timestamp: number; apy: number }> }) {
    if (history.length < 2) {
        return (
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)', padding: '20px 0', textAlign: 'center', fontFamily: "'Tenor Sans', sans-serif" }}>
                Collecting APY history — populates after first harvest
            </div>
        )
    }

    const W = 400, H = 64, PAD = 4
    const apys = history.map(h => h.apy)
    const min = Math.min(...apys) * 0.97
    const max = Math.max(...apys) * 1.03
    const rng = max - min || 1

    const pts = history.map((h, i) => ({
        x: PAD + (i / (history.length - 1)) * (W - PAD * 2),
        y: H - PAD - ((h.apy - min) / rng) * (H - PAD * 2),
    }))

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const areaPath = `${linePath} L${(W - PAD).toFixed(1)},${H} L${PAD},${H} Z`

    const first = apys[0], last = apys[apys.length - 1]
    const trending = last >= first
    const strokeColor = trending ? '#1ABF6A' : '#C9A84C'

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 64, display: 'block' }}>
            <defs>
                <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#spark-grad)" />
            <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
    )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function AnalyticsDashboard({ accountId }: { accountId?: string }) {
    const [activeTab, setActiveTab] = useState<'earnings' | 'positions' | 'strategy'>('earnings')
    const [planBalance, setPlanBalance] = useState<number | null>(null)
    const [strategy, setStrategy] = useState<StrategyMode>('balanced')
    const [strategyLoading, setStrategyLoading] = useState(false)
    const [strategySaved, setStrategySaved] = useState(false)

    const walletAddr = useActiveWalletAddress()
    const engine = useYieldEngine()
    const { data: positionsData, isLoading: positionsLoading } = useVaultPositions(walletAddr ?? undefined)

    // Load saved strategy preference
    useEffect(() => {
        if (!walletAddr) return
        fetch(`/api/gr/deposit/strategy-preference?walletAddress=${encodeURIComponent(walletAddr)}`)
            .then(r => r.json())
            .then(d => { if (d.strategy) setStrategy(d.strategy as StrategyMode) })
            .catch(() => { })
    }, [walletAddr])

    // Current vault balance — prefer live ticker, fall back to on-chain position
    const currentBalance = engine.liveBalance > 0
        ? engine.liveBalance
        : engine.vaultUsdcBalance > 0
            ? engine.vaultUsdcBalance
            : 0

    const displayBalance = planBalance ?? currentBalance
    const apy = engine.displayApy
    const projMonthly = displayBalance * (apy / 100) * (30 / 365)
    const projYearly = displayBalance * (apy / 100)
    const secsToHarvest = engine.epochState?.secondsToNext ?? 0

    // Save strategy to DB
    const saveStrategy = useCallback(async (mode: StrategyMode) => {
        if (!walletAddr) return
        setStrategy(mode)
        setStrategyLoading(true)
        setStrategySaved(false)
        try {
            await fetch('/api/gr/deposit/strategy-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: walletAddr, strategy: mode }),
            })
            setStrategySaved(true)
            setTimeout(() => setStrategySaved(false), 3000)
        } catch { }
        setStrategyLoading(false)
    }, [walletAddr])

    // Computed insight cards
    const insights = useMemo(() => {
        const MARKET_AVG = 4.5
        const vsMarket = apy - MARKET_AVG
        const topAlloc = (engine.allocations ?? []).reduce<{ name: string; apy: number } | null>(
            (best, a) => (!best || a.apy > best.apy) ? { name: a.name, apy: a.apy } : best,
            null
        )
        const harvestTrend = (() => {
            const h = engine.apyHistory
            if (h.length < 3) return null
            const recent = h.slice(-5)
            const pct = recent[0].apy > 0 ? ((recent[recent.length - 1].apy - recent[0].apy) / recent[0].apy) * 100 : 0
            return { pct, trending: recent[recent.length - 1].apy >= recent[0].apy }
        })()
        return { vsMarket, topAlloc, harvestTrend }
    }, [apy, engine.allocations, engine.apyHistory])

    if (!accountId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '80px 24px', fontFamily: "'Tenor Sans', sans-serif" }}>
                <div style={{ fontSize: 36, opacity: 0.2 }}>◈</div>
                <div style={{ fontSize: 16, color: '#f5f0e8' }}>Connect your wallet</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)' }}>Your yield engine strategy center will appear here.</div>
            </div>
        )
    }

    return (
        <div style={{ padding: 'clamp(20px,3vw,32px) clamp(16px,3vw,32px) 52px', maxWidth: 900, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(201,168,76,0.42)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Yield Intelligence
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.03em', marginBottom: 6 }}>
                    Strategy Center
                </div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)', lineHeight: 1.6 }}>
                    Earnings, positions, and strategy in one place.
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {(['earnings', 'positions', 'strategy'] as const).map(tab => (
                    <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '10px 20px', fontSize: 12, letterSpacing: '0.06em', textTransform: 'capitalize',
                            fontFamily: "'Tenor Sans', sans-serif", background: 'transparent', border: 'none',
                            cursor: 'pointer', color: activeTab === tab ? '#c9a84c' : 'rgba(245,240,232,0.45)',
                            borderBottom: `2px solid ${activeTab === tab ? '#c9a84c' : 'transparent'}`,
                            marginBottom: -1, transition: 'color 0.18s',
                        }}>
                        {tab}
                    </button>
                ))}
            </div>

            {/* ── Earnings ──────────────────────────────────────────────────────── */}
            {activeTab === 'earnings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Hero APY card */}
                    <div style={{
                        background: 'linear-gradient(160deg, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0.03) 60%, rgba(255,255,255,0.015) 100%)',
                        border: '1px solid rgba(201,168,76,0.26)', borderRadius: 20,
                        padding: '28px 28px 24px', position: 'relative', overflow: 'hidden',
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)' }} />

                        <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(201,168,76,0.55)', textTransform: 'uppercase', marginBottom: 10 }}>
                            Live Blended APY
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginBottom: 20, flexWrap: 'wrap' }}>
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 72, fontWeight: 300, color: '#C9A84C', lineHeight: 1, letterSpacing: '-0.02em' }}>
                                {engine.isLoading ? '—' : `${apy.toFixed(2)}%`}
                            </div>
                            <div style={{ paddingBottom: 10 }}>
                                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', marginBottom: 5 }}>
                                    {engine.apySource === 'harvest' ? 'From latest harvest' : engine.apySource === 'snapshot' ? 'From protocol snapshot' : 'Live estimate'}
                                </div>
                                {secsToHarvest > 0 && (
                                    <div style={{ fontSize: 11, color: '#1ABF6A', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1ABF6A', flexShrink: 0, display: 'inline-block' }} />
                                        Yield compounds in {fmtCountdownFriendly(secsToHarvest)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* KPI grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(26,191,106,0.06)', border: '1px solid rgba(26,191,106,0.15)' }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(26,191,106,0.7)', marginBottom: 4 }}>Earned Today</div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#1ABF6A', lineHeight: 1 }}>{engine.yieldTodayDisplay}</div>
                            </div>
                            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', marginBottom: 4 }}>Harvests</div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', lineHeight: 1 }}>{engine.harvestHistory.length}</div>
                            </div>
                            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)' }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.6)', marginBottom: 4 }}>Vault Balance</div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#c9a84c', lineHeight: 1 }}>{fmt$(currentBalance)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Projected earnings + plan-ahead */}
                    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.55)', marginBottom: 4 }}>Projected Earnings</div>
                                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)' }}>Adjust balance to plan ahead</div>
                            </div>
                            {planBalance !== null && (
                                <button type="button" onClick={() => setPlanBalance(null)}
                                    style={{ fontSize: 10, color: 'rgba(201,168,76,0.7)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.06em', flexShrink: 0 }}>
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* Slider */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)' }}>Balance</span>
                                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: planBalance !== null ? '#C9A84C' : '#f5f0e8' }}>
                                    {fmt$(displayBalance)}
                                    {planBalance !== null && <span style={{ fontSize: 10, color: 'rgba(201,168,76,0.5)', marginLeft: 6 }}>plan-ahead</span>}
                                </span>
                            </div>
                            <input type="range"
                                min={0} max={Math.max(100000, currentBalance * 3)} step={100}
                                value={planBalance ?? currentBalance}
                                onChange={e => setPlanBalance(Number(e.target.value))}
                                style={{ width: '100%', accentColor: '#C9A84C', cursor: 'pointer' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(245,240,232,0.28)', marginTop: 4 }}>
                                <span>$0</span>
                                <span>{fmt$(Math.max(100000, currentBalance * 3))}</span>
                            </div>
                        </div>

                        {/* Projection tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(26,191,106,0.05)', border: '1px solid rgba(26,191,106,0.14)' }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(26,191,106,0.7)', marginBottom: 6 }}>Monthly</div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: '#1ABF6A', lineHeight: 1 }}>{fmt$(projMonthly)}</div>
                                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 5 }}>at {apy.toFixed(2)}% APY</div>
                            </div>
                            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.14)' }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)', marginBottom: 6 }}>Yearly</div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: '#C9A84C', lineHeight: 1 }}>{fmt$(projYearly)}</div>
                                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 5 }}>at {apy.toFixed(2)}% APY</div>
                            </div>
                        </div>
                    </div>

                    {/* APY history sparkline */}
                    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.55)' }}>APY History</div>
                            {engine.apyHistory.length >= 2 && (() => {
                                const h = engine.apyHistory
                                const pct = h[0].apy > 0 ? (((h[h.length - 1].apy - h[0].apy) / h[0].apy) * 100).toFixed(1) : '0.0'
                                const up = h[h.length - 1].apy >= h[0].apy
                                return (
                                    <span style={{ fontSize: 11, color: up ? '#1ABF6A' : 'rgba(245,240,232,0.45)' }}>
                                        {up ? `▲ +${pct}%` : `▼ ${pct}%`} trend
                                    </span>
                                )
                            })()}
                        </div>
                        <ApySparkline history={engine.apyHistory} />
                    </div>
                </div>
            )}

            {/* ── Positions ─────────────────────────────────────────────────────── */}
            {activeTab === 'positions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Summary strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                        {[
                            { label: 'Total Deployed', value: fmt$(Number(positionsData?.summary.totalBalanceUsd ?? 0)), color: '#f5f0e8' },
                            { label: 'Blended APY', value: `${Number(positionsData?.summary.blendedApyPct ?? 0).toFixed(2)}%`, color: '#C9A84C' },
                            { label: 'Total Profit', value: fmt$(Number(positionsData?.summary.profitUsd ?? 0)), color: '#1ABF6A' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', marginBottom: 6 }}>{label}</div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color }}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Positions list */}
                    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.55)' }}>Active Positions</div>
                        </div>
                        {positionsLoading ? (
                            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'rgba(245,240,232,0.3)' }}>Loading positions…</div>
                        ) : (positionsData?.positions ?? []).length === 0 ? (
                            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'rgba(245,240,232,0.35)', lineHeight: 1.7 }}>
                                No active positions yet.<br />Deposit USDC and your vault allocations will appear here.
                            </div>
                        ) : (
                            (positionsData?.positions ?? []).map((pos, i, arr) => (
                                <div key={pos.strategyId || `${pos.protocol}-${i}`} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '16px 20px', gap: 12,
                                    borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                    background: 'rgba(255,255,255,0.015)',
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: '#f5f0e8', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.label}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>{pos.protocol} · {pos.chain}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: 13, color: '#C9A84C', marginBottom: 2 }}>{Number(pos.apyPct).toFixed(2)}% APY</div>
                                        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.6)' }}>{fmt$(Number(pos.currentPositionUsd))}</div>
                                        {Number(pos.profitUsd) > 0 && (
                                            <div style={{ fontSize: 10, color: '#1ABF6A', marginTop: 2 }}>+{fmt$(Number(pos.profitUsd))} profit</div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Protocol allocation bars */}
                    {(engine.allocations ?? []).length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px' }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.55)', marginBottom: 16 }}>Protocol Allocation</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {(engine.allocations ?? []).map((a, i) => (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <div>
                                                <span style={{ fontSize: 13, color: '#f5f0e8' }}>{a.name}</span>
                                                <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', marginLeft: 8 }}>{a.pct.toFixed(1)}%</span>
                                            </div>
                                            <span style={{ fontSize: 12, color: '#1ABF6A' }}>{a.apy.toFixed(2)}% APY</span>
                                        </div>
                                        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${a.pct}%`, background: a.bandColor || '#C9A84C', borderRadius: 3, transition: 'width 0.5s ease', opacity: 0.85 }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Strategy ──────────────────────────────────────────────────────── */}
            {activeTab === 'strategy' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Mode selector */}
                    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.55)' }}>Strategy Mode</div>
                            {strategySaved && <span style={{ fontSize: 10, color: '#1ABF6A', letterSpacing: '0.06em' }}>✓ Saved</span>}
                            {strategyLoading && <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)', letterSpacing: '0.06em' }}>Saving…</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)', marginBottom: 20 }}>
                            Choose how your capital is deployed across protocols.
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {(Object.entries(STRATEGY_CONFIG) as [StrategyMode, typeof STRATEGY_CONFIG[StrategyMode]][]).map(([mode, cfg]) => {
                                const active = strategy === mode
                                return (
                                    <button key={mode} type="button" onClick={() => saveStrategy(mode)}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
                                            borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                                            background: active ? `${cfg.color}0d` : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${active ? cfg.color + '40' : 'rgba(255,255,255,0.07)'}`,
                                            transition: 'all 0.18s', fontFamily: "'Tenor Sans', sans-serif",
                                        }}>
                                        <div style={{
                                            width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                                            background: active ? cfg.color : 'rgba(255,255,255,0.12)',
                                            boxShadow: active ? `0 0 10px ${cfg.color}60` : 'none',
                                            transition: 'all 0.18s',
                                        }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontSize: 14, color: active ? cfg.color : '#f5f0e8' }}>{cfg.label}</span>
                                                <span style={{ fontSize: 10, color: active ? cfg.color : 'rgba(245,240,232,0.35)', letterSpacing: '0.08em' }}>{cfg.targetApy} APY</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', marginBottom: active ? 8 : 0 }}>{cfg.tagline}</div>
                                            {active && (
                                                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.65)', lineHeight: 1.65 }}>{cfg.description}</div>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Insight cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

                        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', marginBottom: 8 }}>vs Market Average</div>
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: insights.vsMarket > 0 ? '#1ABF6A' : 'rgba(245,240,232,0.7)', marginBottom: 5, lineHeight: 1 }}>
                                {insights.vsMarket > 0 ? '+' : ''}{insights.vsMarket.toFixed(2)}%
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', lineHeight: 1.5 }}>
                                {insights.vsMarket > 0 ? 'Above' : 'Below'} the 4.5% market average
                            </div>
                        </div>

                        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', marginBottom: 8 }}>Top Protocol</div>
                            {insights.topAlloc ? (
                                <>
                                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: '#C9A84C', marginBottom: 5, lineHeight: 1 }}>{insights.topAlloc.apy.toFixed(2)}%</div>
                                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>{insights.topAlloc.name}</div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)', marginTop: 4 }}>No allocations yet</div>
                            )}
                        </div>

                        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', marginBottom: 8 }}>APY Trend</div>
                            {insights.harvestTrend ? (
                                <>
                                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: insights.harvestTrend.trending ? '#1ABF6A' : '#C9A84C', marginBottom: 5, lineHeight: 1 }}>
                                        {insights.harvestTrend.trending ? '▲' : '▼'} {Math.abs(insights.harvestTrend.pct).toFixed(1)}%
                                    </div>
                                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>Over last 5 harvests</div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)', marginTop: 4 }}>Collecting harvest data…</div>
                            )}
                        </div>
                    </div>

                    {/* LLM Advisor placeholder */}
                    <div style={{
                        padding: '20px 24px', borderRadius: 16,
                        background: 'linear-gradient(160deg, rgba(155,109,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                        border: '1px solid rgba(155,109,255,0.18)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B6DFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: 13, color: '#9B6DFF', letterSpacing: '0.04em' }}>Genesis AI Advisor</div>
                                <div style={{ fontSize: 9, color: 'rgba(155,109,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>Coming Soon</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7 }}>
                            Your personal AI advisor will help you optimize direct deposits, manage yield strategies, analyze spending patterns, and provide actionable recommendations based on your financial goals.
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
