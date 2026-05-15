'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useYieldMonitor } from '../hooks/useYieldMonitor'
import { PageHeader } from './ds'
import { getCodexEntry } from '@/lib/codex/protocols'
import { getChainEntry } from '@/lib/codex/chains'
import { CodexChip } from './codex/CodexChip'
import type { YieldMonitorAlert, YieldMonitorPausedWatchlistItem } from '../lib/bff.types'

const PROMOTABLE_OPEN_STORAGE_KEY = 'gr_yield_monitor_promotable_open'
const PAUSED_OPEN_STORAGE_KEY = 'gr_yield_monitor_paused_open'

function readStoredPanelState(storageKey: string, fallback: boolean): boolean {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(storageKey)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
}

function fmtPct(value: number): string {
    return `${value.toFixed(2)}%`
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function hashSeed(input: string): number {
    let h = 2166136261
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i)
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
    }
    return Math.abs(h >>> 0)
}

function buildSparklinePoints(key: string, apyPct: number): number[] {
    const seed = hashSeed(key)
    const floor = clamp(apyPct * 0.72, 0.05, Math.max(0.35, apyPct * 0.95))
    const ceil = clamp(apyPct * 1.18, floor + 0.08, Math.max(1, apyPct * 1.8))
    const span = Math.max(0.1, ceil - floor)
    const out: number[] = []
    for (let i = 0; i < 14; i += 1) {
        const wave = Math.sin((i + (seed % 11)) * 0.7) * 0.16
        const drift = ((seed % 23) - 11) * 0.0009 * i
        const noise = ((seed >> (i % 12)) % 9 - 4) * 0.012
        const base = apyPct * (0.92 + (i / 13) * 0.14)
        out.push(clamp(base * (1 + wave + drift + noise), floor, ceil))
    }
    return out
}

// ── Tier badge pill ──────────────────────────────────────────────────────────
const TIER_STYLE: Record<string, { color: string; bg: string; border: string }> = {
    preserve: { color: '#00D4AA', bg: 'rgba(0,212,170,0.12)', border: 'rgba(0,212,170,0.30)' },
    grow:     { color: '#C9A84C', bg: 'rgba(201,168,76,0.12)', border: 'rgba(201,168,76,0.30)' },
    accelerate: { color: '#9B6DFF', bg: 'rgba(155,109,255,0.12)', border: 'rgba(155,109,255,0.30)' },
}

function TierBadge({ tier }: { tier: string }) {
    const style = TIER_STYLE[tier] ?? TIER_STYLE.grow
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: style.color, background: style.bg, border: `1px solid ${style.border}`,
            borderRadius: 4, padding: '2px 7px',
            fontFamily: "'Tenor Sans', sans-serif",
            whiteSpace: 'nowrap',
        }}>
            {tier}
        </span>
    )
}

// ── Chain Drawer — full-width educational + strategy panel ───────────────────
function ChainDrawer({
    chain,
    chainRow,
    alerts,
    pausedItems,
    onClose,
    onNavigate,
}: {
    chain: string
    chainRow: ChainRangeRow
    alerts: YieldMonitorAlert[]
    pausedItems: YieldMonitorPausedWatchlistItem[]
    onClose: () => void
    onNavigate?: (view: string) => void
}) {
    const chainEntry = getChainEntry(chain)
    const name = formatChainName(chain)
    const color = chainTierColor(chainRow.p50ApyPct)

    const chainAlerts = alerts.filter((a) => a.chain === chain)
    const chainPaused = pausedItems.filter((i) => i.strategy.chain === chain)

    function handleAllocate(alert: YieldMonitorAlert) {
        const tierKey = alert.promotableTiers[0] ?? 'grow'
        const tierColors: Record<string, string> = {
            preserve: '#00D4AA', grow: '#C9A84C', accelerate: '#9B6DFF',
        }
        try {
            window.localStorage.setItem('gr:pending-tier', JSON.stringify({
                tierKey,
                tierName: tierKey.charAt(0).toUpperCase() + tierKey.slice(1),
                strategyId: alert.strategyId,
                strategyLabel: `${alert.protocol} on ${alert.chain}`,
                tierColor: tierColors[tierKey] ?? '#C9A84C',
                yieldRange: `${alert.netApyPct}%`,
                badge: name,
            }))
        } catch { /* localStorage unavailable */ }
        onNavigate?.('vaults')
    }

    return (
        <div style={{
            marginTop: 12,
            borderRadius: 14,
            border: `1px solid ${color}35`,
            borderTop: `3px solid ${color}`,
            background: 'rgba(2,3,5,0.97)',
            overflow: 'hidden',
            animation: 'chainDrawerIn 0.22s ease',
        }}>
            <style>{`@keyframes chainDrawerIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>

            {/* ── Header ───────────────────────────────────────────────── */}
            <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${color}18` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                            <span style={{ color, fontSize: 13 }}>◈</span>
                            <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                                textTransform: 'uppercase', color,
                                fontFamily: "'Tenor Sans', sans-serif",
                            }}>
                                {name} · Chain Intelligence
                            </span>
                        </div>
                        {chainEntry && (
                            <p style={{
                                fontSize: 15, color: 'rgba(245,240,232,0.82)',
                                fontFamily: "'Cormorant Garamond', serif",
                                lineHeight: 1.5, margin: 0, fontWeight: 300,
                            }}>
                                {chainEntry.tagline}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close chain drawer"
                        style={{
                            background: 'none', border: 'none',
                            color: 'rgba(245,240,232,0.40)', cursor: 'pointer',
                            fontSize: 20, lineHeight: 1, padding: '0 2px', flexShrink: 0,
                        }}
                    >×</button>
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div style={{ padding: '20px' }}>

                {/* Education panels */}
                {chainEntry && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                        <div style={{
                            flex: '1 1 220px',
                            padding: '14px 16px', borderRadius: 10,
                            background: `${color}09`,
                            border: `1px solid ${color}22`,
                            borderLeft: `3px solid ${color}`,
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color, marginBottom: 8, fontFamily: "'Tenor Sans', sans-serif" }}>
                                Why This Chain Yields
                            </div>
                            <p style={{ fontSize: 13, color: 'rgba(245,240,232,0.80)', fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.65, margin: 0 }}>
                                {chainEntry.yieldContext}
                            </p>
                        </div>
                        <div style={{
                            flex: '1 1 220px',
                            padding: '14px 16px', borderRadius: 10,
                            background: 'rgba(201,168,76,0.06)',
                            border: '1px solid rgba(201,168,76,0.20)',
                            borderLeft: '3px solid #C9A84C',
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: 8, fontFamily: "'Tenor Sans', sans-serif" }}>
                                Genesis Advantage
                            </div>
                            <p style={{ fontSize: 13, color: 'rgba(245,240,232,0.80)', fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.65, margin: 0 }}>
                                {chainEntry.genesisNote}
                            </p>
                        </div>
                        <div style={{
                            flex: '1 1 220px',
                            padding: '14px 16px', borderRadius: 10,
                            background: 'rgba(232,64,64,0.05)',
                            border: '1px solid rgba(232,64,64,0.18)',
                            borderLeft: '3px solid rgba(232,64,64,0.60)',
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#E84040', marginBottom: 8, fontFamily: "'Tenor Sans', sans-serif" }}>
                                Risk Context
                            </div>
                            <p style={{ fontSize: 13, color: 'rgba(245,240,232,0.80)', fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.65, margin: 0 }}>
                                {chainEntry.riskNote}
                            </p>
                        </div>
                    </div>
                )}

                {/* Top opportunities on this chain */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.40)', fontFamily: "'Tenor Sans', sans-serif" }}>
                        Top Opportunities on {name}
                    </div>
                    <div style={{
                        fontSize: 10, color, background: `${color}14`,
                        border: `1px solid ${color}30`, borderRadius: 20,
                        padding: '2px 10px', fontFamily: "'Tenor Sans', sans-serif",
                    }}>
                        {chainAlerts.length} promotable
                    </div>
                </div>

                {chainAlerts.length === 0 ? (
                    <div style={{
                        padding: '20px', textAlign: 'center', borderRadius: 10,
                        border: '1px dashed rgba(255,255,255,0.10)',
                        background: 'rgba(255,255,255,0.02)',
                    }}>
                        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.42)', marginBottom: 6 }}>
                            No promotable strategies on {name} right now.
                        </div>
                        {chainPaused.length > 0 && (
                            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.30)' }}>
                                {chainPaused.length} paused {chainPaused.length === 1 ? 'strategy' : 'strategies'} in watchlist — check the section below.
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {chainAlerts.slice(0, 5).map((alert) => {
                            const codexEntry = getCodexEntry(alert.protocol)
                            return (
                                <div key={alert.strategyId} style={{
                                    borderRadius: 12,
                                    border: `1px solid rgba(255,255,255,0.08)`,
                                    background: 'rgba(255,255,255,0.025)',
                                    overflow: 'hidden',
                                }}>
                                    {/* Strategy header */}
                                    <div style={{
                                        padding: '12px 14px',
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between', gap: 12,
                                    }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 14, color: '#f5f0e8',
                                                fontFamily: "'Cormorant Garamond', serif",
                                                fontWeight: 500, marginBottom: 6,
                                            }}>
                                                {alert.protocol}
                                                <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.40)', fontFamily: "'Tenor Sans', sans-serif", marginLeft: 6 }}>
                                                    · USDC
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                                {alert.promotableTiers.map((tier) => (
                                                    <TierBadge key={tier} tier={tier} />
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{
                                                    fontSize: 22, fontFamily: "'Cormorant Garamond', serif",
                                                    color, lineHeight: 1,
                                                }}>
                                                    {alert.netApyPct}%
                                                </div>
                                                <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.32)', textTransform: 'uppercase', letterSpacing: '0.10em', fontFamily: "'Tenor Sans', sans-serif" }}>
                                                    APY
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAllocate(alert)}
                                                style={{
                                                    padding: '6px 14px',
                                                    borderRadius: 6,
                                                    border: `1px solid ${color}60`,
                                                    background: `${color}18`,
                                                    color: '#f5f0e8',
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    letterSpacing: '0.10em',
                                                    textTransform: 'uppercase',
                                                    fontFamily: "'Tenor Sans', sans-serif",
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                Allocate →
                                            </button>
                                        </div>
                                    </div>
                                    {/* ◈ Codex chip — full width, below the strategy header */}
                                    {codexEntry && (
                                        <div style={{ padding: '0 14px 12px' }}>
                                            <CodexChip entry={codexEntry} compact fullWidth />
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Footer CTA */}
                <div style={{
                    marginTop: 20, paddingTop: 16,
                    borderTop: `1px solid ${color}15`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.38)', fontFamily: "'Tenor Sans', sans-serif" }}>
                        ◈ Tap any Codex chip to learn about the protocol behind each yield
                    </div>
                    {onNavigate && (
                        <button
                            type="button"
                            onClick={() => onNavigate('vaults')}
                            style={{
                                padding: '8px 18px', borderRadius: 8,
                                border: 'none', background: color,
                                color: '#1a1400', fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.10em', textTransform: 'uppercase',
                                fontFamily: "'Tenor Sans', sans-serif",
                                cursor: 'pointer',
                            }}
                        >
                            Strategy Desk →
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Chain name display formatter ────────────────────────────────────────────
const CHAIN_DISPLAY_NAMES: Record<string, string> = {
    ethereum: 'Ethereum',
    'ethereum mainnet': 'Ethereum',
    arbitrum: 'Arbitrum',
    'arbitrum one': 'Arbitrum',
    base: 'Base',
    polygon: 'Polygon',
    'polygon pos': 'Polygon',
    optimism: 'Optimism',
    gnosis: 'Gnosis',
    avalanche: 'Avalanche',
    'avalanche c-chain': 'Avalanche',
    bsc: 'BSC',
    'binance': 'BSC',
    'bnb chain': 'BNB Chain',
    'bnb-chain': 'BNB Chain',
    solana: 'Solana',
    scroll: 'Scroll',
    linea: 'Linea',
    era: 'zkSync Era',
    'zksync era': 'zkSync Era',
    mantle: 'Mantle',
    blast: 'Blast',
    mode: 'Mode',
}

function formatChainName(raw: string): string {
    const lower = raw.toLowerCase().trim()
    if (CHAIN_DISPLAY_NAMES[lower]) return CHAIN_DISPLAY_NAMES[lower]
    // Title-case fallback for any unmapped chain
    return raw
        .split(/[\s-_]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
}

// Tier color based on median APY
function chainTierColor(p50: number): string {
    if (p50 > 18) return '#9B6DFF'
    if (p50 > 9) return '#C9A84C'
    return '#00D4AA'
}

// Display-safe APY — caps at 200% with a "+" suffix for anything truncated
function fmtApyCapped(value: number): string {
    if (value >= 200) return '200%+'
    return fmtPct(value)
}

// ── Chain range card component ──────────────────────────────────────────────
interface ChainRangeRow {
    chain: string
    count: number
    minApyPct: number
    p50ApyPct: number
    p75ApyPct: number
    p90ApyPct: number
    maxApyPct: number
}

function ChainCard({ row, isSelected, onClick }: { row: ChainRangeRow; isSelected: boolean; onClick: () => void }) {
    const name = formatChainName(row.chain)
    const color = chainTierColor(row.p50ApyPct)
    const displayMax = Math.min(row.maxApyPct, 200)
    const scale = displayMax > 0 ? 100 / displayMax : 1
    const p50W = Math.min(100, row.p50ApyPct * scale)
    const p90W = Math.min(100, row.p90ApyPct * scale)

    return (
        <button
            type="button"
            onClick={onClick}
            aria-expanded={isSelected}
            style={{
                borderRadius: 12,
                border: isSelected ? `1px solid ${color}70` : `1px solid ${color}28`,
                borderLeft: `3px solid ${color}`,
                background: isSelected ? `${color}0E` : 'rgba(255,255,255,0.025)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'border-color 0.15s ease, background 0.15s ease',
                outline: 'none',
                boxShadow: isSelected ? `0 0 0 1px ${color}20` : 'none',
            }}
        >
            {/* Header: chain name + active count */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        color: 'rgba(245,240,232,0.92)',
                        fontFamily: "'Tenor Sans', sans-serif",
                    }}>
                        {name}
                    </span>
                </div>
                <span style={{
                    fontSize: 10,
                    color: 'rgba(245,240,232,0.40)',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontFamily: "'Tenor Sans', sans-serif",
                    letterSpacing: '0.04em',
                }}>
                    {row.count} active
                </span>
            </div>

            {/* APY range bar */}
            <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                {/* P90 fill — lighter */}
                <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${p90W}%`,
                    background: color,
                    opacity: 0.28,
                    borderRadius: 3,
                }} />
                {/* P50 fill — solid */}
                <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${p50W}%`,
                    background: color,
                    opacity: 0.85,
                    borderRadius: 3,
                }} />
            </div>

            {/* Stat row: Min / Median / P90 / Max */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                {[
                    { label: 'Min', value: row.minApyPct },
                    { label: 'Median', value: row.p50ApyPct },
                    { label: 'P90', value: row.p90ApyPct },
                    { label: 'Max', value: row.maxApyPct, highlight: true },
                ].map((stat) => (
                    <div key={stat.label} style={{ textAlign: 'center' }}>
                        <div style={{
                            fontSize: 13,
                            fontFamily: "'Cormorant Garamond', serif",
                            color: stat.highlight ? color : 'rgba(245,240,232,0.85)',
                            fontWeight: stat.highlight ? 600 : 300,
                            lineHeight: 1.2,
                        }}>
                            {fmtApyCapped(stat.value)}
                        </div>
                        <div style={{
                            fontSize: 8,
                            color: 'rgba(245,240,232,0.30)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.10em',
                            marginTop: 2,
                            fontFamily: "'Tenor Sans', sans-serif",
                        }}>
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>
            {/* Tap indicator */}
            <div style={{
                fontSize: 9, color: isSelected ? color : 'rgba(245,240,232,0.25)',
                textTransform: 'uppercase', letterSpacing: '0.10em',
                fontFamily: "'Tenor Sans', sans-serif",
                textAlign: 'right',
                transition: 'color 0.15s ease',
            }}>
                {isSelected ? '◈ Open' : '◈ Tap to explore'}
            </div>
        </button>
    )
}

function tierTone(tiers: string[]): { line: string; fill: string } {
    if (tiers.includes('accelerate')) {
        return { line: '#22d3ee', fill: 'rgba(34,211,238,0.14)' }
    }
    if (tiers.includes('grow')) {
        return { line: '#18c870', fill: 'rgba(24,200,112,0.14)' }
    }
    if (tiers.includes('preserve')) {
        return { line: '#c9a84c', fill: 'rgba(201,168,76,0.14)' }
    }
    return { line: '#a1a1aa', fill: 'rgba(161,161,170,0.14)' }
}

function Sparkline({ seedKey, apyPct, tones }: { seedKey: string; apyPct: number; tones: string[] }) {
    const points = buildSparklinePoints(seedKey, apyPct)
    const tone = tierTone(tones)
    const w = 150
    const h = 34
    const min = Math.min(...points)
    const max = Math.max(...points)
    const range = Math.max(0.0001, max - min)
    const line = points
        .map((value, i) => {
            const x = (i / (points.length - 1)) * w
            const y = h - ((value - min) / range) * h
            return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')
    const area = `${line} ${w},${h} 0,${h}`

    return (
        <svg viewBox={`0 0 ${w} ${h}`} width={150} height={34} style={S.sparkSvg} aria-hidden="true">
            <polyline points={area} fill={tone.fill} stroke="none" />
            <polyline points={line} fill="none" stroke={tone.line} strokeWidth="1.6" />
        </svg>
    )
}

export function YieldMonitorPanel({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
    const { data, isLoading, error } = useYieldMonitor()
    const [promotableOpen, setPromotableOpen] = useState(() =>
        readStoredPanelState(PROMOTABLE_OPEN_STORAGE_KEY, true)
    )
    const [pausedOpen, setPausedOpen] = useState(() =>
        readStoredPanelState(PAUSED_OPEN_STORAGE_KEY, false)
    )
    const [drilldownId, setDrilldownId] = useState<string | null>(null)
    const [selectedChain, setSelectedChain] = useState<string | null>(null)
    const [progressionOpen, setProgressionOpen] = useState(false)

    useEffect(() => {
        window.localStorage.setItem(PROMOTABLE_OPEN_STORAGE_KEY, String(promotableOpen))
    }, [promotableOpen])

    useEffect(() => {
        window.localStorage.setItem(PAUSED_OPEN_STORAGE_KEY, String(pausedOpen))
    }, [pausedOpen])

    if (isLoading) {
        return (
            <div style={S.wrap}>
                <PageHeader eyebrow="Research Center" title="Yield Monitor" />
                <div style={S.sub}>Loading live monitor snapshot...</div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div style={S.wrap}>
                <PageHeader eyebrow="Research Center" title="Yield Monitor" />
                <div style={S.err}>Unable to load Yield Monitor right now.</div>
            </div>
        )
    }

    // Compute outside JSX so there are no stale-closure issues in onClick handlers
    const sortedChains = data.rangesByChain
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 9)

    const selectedChainRow = selectedChain
        ? (sortedChains.find((r) => r.chain === selectedChain) ?? null)
        : null

    return (
        <div style={S.wrap}>
            <PageHeader eyebrow="Research Center" title="Yield Monitor" />

            {/* ── Market Intelligence Command Card ──────────────────────────────────── */}
            <div style={{
                marginTop: 20, borderRadius: 14,
                border: '1px solid rgba(201,168,76,0.22)',
                borderTop: '3px solid #C9A84C',
                background: 'rgba(255,255,255,0.018)',
                overflow: 'hidden',
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>

                    {/* ── APY Distribution ─────────────────────────────────────────── */}
                    <div style={{ flex: '1 1 260px', padding: '22px 24px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={S.cmdPanelLabel}>APY Distribution</div>
                        <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', fontFamily: "'Tenor Sans', sans-serif", marginBottom: 6 }}>
                                P90 Yield
                            </div>
                            <div style={{
                                fontFamily: "'Cormorant Garamond', serif",
                                fontSize: 54, fontWeight: 300, lineHeight: 1,
                                color: data.globalRange.p90ApyPct > 9 ? '#C9A84C' : '#00D4AA',
                            }}>
                                {fmtPct(data.globalRange.p90ApyPct)}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 22 }}>
                            {([
                                { label: 'Median', value: fmtPct(data.globalRange.p50ApyPct), color: '#00D4AA' },
                                { label: 'Floor', value: fmtPct(data.globalRange.minApyPct), color: 'rgba(245,240,232,0.55)' },
                                { label: 'Max', value: fmtApyCapped(data.globalRange.maxApyPct), color: '#C9A84C' },
                            ] as { label: string; value: string; color: string }[]).map((stat) => (
                                <div key={stat.label}>
                                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: stat.color, lineHeight: 1.2 }}>
                                        {stat.value}
                                    </div>
                                    <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(245,240,232,0.30)', fontFamily: "'Tenor Sans', sans-serif", marginTop: 3 }}>
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Market Pulse ──────────────────────────────────────────────── */}
                    <div style={{ flex: '1 1 260px', padding: '22px 24px' }}>
                        <div style={S.cmdPanelLabel}>Market Pulse</div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 18 }}>
                            <div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 46, fontWeight: 300, lineHeight: 1, color: '#1ABF6A' }}>
                                    {data.globalRange.activeLendableCount}
                                </div>
                                <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(245,240,232,0.35)', fontFamily: "'Tenor Sans', sans-serif", marginTop: 4 }}>
                                    Active
                                </div>
                            </div>
                            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.08)', flexShrink: 0, marginBottom: 14 }} />
                            <div>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 46, fontWeight: 300, lineHeight: 1, color: '#C9A84C' }}>
                                    {data.promotableSummary.totalDistinct}
                                </div>
                                <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(245,240,232,0.35)', fontFamily: "'Tenor Sans', sans-serif", marginTop: 4 }}>
                                    Promotable
                                </div>
                            </div>
                        </div>
                        {/* Tier coverage segmented bar */}
                        {(() => {
                            const tierTotal = data.promotableSummary.preserve + data.promotableSummary.grow + data.promotableSummary.accelerate
                            const segments = [
                                { key: 'P', label: 'Preserve', count: data.promotableSummary.preserve, color: '#00D4AA' },
                                { key: 'G', label: 'Grow', count: data.promotableSummary.grow, color: '#C9A84C' },
                                { key: 'A', label: 'Accelerate', count: data.promotableSummary.accelerate, color: '#9B6DFF' },
                            ]
                            return (
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(245,240,232,0.30)', fontFamily: "'Tenor Sans', sans-serif", marginBottom: 7 }}>
                                        Tier Coverage
                                    </div>
                                    <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 8 }}>
                                        {segments.map((seg) => (
                                            <div key={seg.key} style={{
                                                flex: tierTotal > 0 ? seg.count / tierTotal : 1 / 3,
                                                background: seg.color,
                                                opacity: seg.count > 0 ? 0.85 : 0.15,
                                                minWidth: seg.count > 0 ? 4 : 0,
                                                borderRadius: 3,
                                            }} />
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        {segments.map((seg) => (
                                            <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: seg.color, opacity: seg.count > 0 ? 1 : 0.3 }} />
                                                <span style={{ fontSize: 9, color: seg.count > 0 ? 'rgba(245,240,232,0.65)' : 'rgba(245,240,232,0.28)', fontFamily: "'Tenor Sans', sans-serif" }}>
                                                    {seg.label} {seg.count}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })()}
                        {/* Freshness indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#1ABF6A', flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.38)', fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.04em' }}>
                                {data.meta.source} · {new Date(data.meta.fetchedAt).toLocaleTimeString()}
                            </span>
                        </div>
                    </div>

                </div>
            </div>

            <section style={S.card}>
                <button
                    type="button"
                    onClick={() => setProgressionOpen((prev) => !prev)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, gap: 12 }}
                >
                    <div>
                        <div style={{ fontSize: 12, color: '#c9a84c', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}>
                            Progression Next Steps
                        </div>
                        {!progressionOpen && (
                            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.38)', marginTop: 4, fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.04em' }}>
                                4-step workflow · Currently: {data.globalRange.activeLendableCount > 0 ? 'In Motion' : 'Awaiting Data'} · ◈ tap to expand
                            </div>
                        )}
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)', flexShrink: 0, marginTop: 2 }}>
                        {progressionOpen ? '▲' : '▼'}
                    </span>
                </button>
                {progressionOpen && (
                    <div style={{ ...S.progressGrid, marginTop: 12 }}>
                        <div style={S.progressCard}>
                            <div style={S.progressStep}>01 · Scan</div>
                            <div style={S.progressText}>Keep all-chain monitor scans running and track APY drift bands.</div>
                            <div style={S.progressStatus}>Ready</div>
                        </div>
                        <div style={S.progressCard}>
                            <div style={S.progressStep}>02 · Evaluate</div>
                            <div style={S.progressText}>Review unpaused lendable opportunities plus paused watchlist blockers.</div>
                            <div style={S.progressStatus}>{data.globalRange.activeLendableCount > 0 ? 'In Motion' : 'Awaiting Data'}</div>
                        </div>
                        <div style={S.progressCard}>
                            <div style={S.progressStep}>03 · Promote</div>
                            <div style={S.progressText}>Promote tier-ready items to Preserve, Grow, or Accelerate.</div>
                            <div style={S.progressStatus}>{data.promotableSummary.totalDistinct > 0 ? 'Actionable' : 'Low Signal'}</div>
                        </div>
                        <div style={S.progressCard}>
                            <div style={S.progressStep}>04 · Execute</div>
                            <div style={S.progressText}>Execute allocation from Strategy Desk after analytics confirmation.</div>
                            <div style={S.progressStatus}>Operator Gate</div>
                        </div>
                    </div>
                )}
            </section>

            <section style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={S.cardTitle}>Active APY Ranges by Chain</div>
                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.08em' }}>
                        ◈ Tap any chain to explore
                    </div>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: 10,
                }}>
                    {sortedChains.map((row) => (
                        <ChainCard
                            key={row.chain}
                            row={row}
                            isSelected={selectedChain === row.chain}
                            onClick={() => setSelectedChain(
                                (prev) => prev === row.chain ? null : row.chain
                            )}
                        />
                    ))}
                </div>

                {selectedChain !== null && selectedChainRow !== null && (
                    <ChainDrawer
                        chain={selectedChain}
                        chainRow={selectedChainRow}
                        alerts={data.alerts}
                        pausedItems={data.pausedWatchlist.items}
                        onClose={() => setSelectedChain(null)}
                        onNavigate={onNavigate}
                    />
                )}
            </section>

            <section style={S.card}>
                <button
                    type="button"
                    onClick={() => setPromotableOpen((prev) => !prev)}
                    style={S.drawerToggle}
                >
                    <span style={{ fontSize: 12, color: '#c9a84c', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Promotable Alerts (Unpaused + Lendable)
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.6)' }}>
                        {data.alerts.length} alerts {promotableOpen ? '▲' : '▼'}
                    </span>
                </button>

                {promotableOpen && (
                    <div style={S.promotableBody}>
                        <div style={S.sparkLegendRow}>
                            <span style={S.sparkLegendItem}><i style={{ ...S.legendDot, background: '#c9a84c' }} /> Preserve</span>
                            <span style={S.sparkLegendItem}><i style={{ ...S.legendDot, background: '#18c870' }} /> Grow</span>
                            <span style={S.sparkLegendItem}><i style={{ ...S.legendDot, background: '#22d3ee' }} /> Accelerate</span>
                            <span style={S.sparkLegendItem}><i style={{ ...S.legendDot, background: '#a1a1aa' }} /> Blocked</span>
                        </div>
                        {data.alerts.length === 0 ? (
                            <div style={S.sub}>No promotable alerts in this snapshot.</div>
                        ) : (
                            <div style={S.promotableScroll}>
                                {data.alerts.slice(0, 12).map((alert) => {
                                    const alertCodexEntry = getCodexEntry(alert.protocol)
                                    return (
                                        <div key={alert.strategyId} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {/* Header row: protocol info + sparkline side by side */}
                                            <div style={S.alertRow}>
                                                <div>
                                                    <div style={S.alertMain}>{alert.protocol} · {alert.chain}</div>
                                                    <div style={S.alertSub}>{alert.strategyId}</div>
                                                </div>
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <Sparkline seedKey={alert.strategyId} apyPct={parseFloat(alert.netApyPct) || 0} tones={alert.promotableTiers} />
                                                    <div style={S.alertApy}>{alert.netApyPct}% APY</div>
                                                    <div style={S.alertSub}>Tiers: {alert.promotableTiers.join(', ')}</div>
                                                </div>
                                            </div>
                                            {/* ◈ Codex chip below the row — full container width when panel opens */}
                                            {alertCodexEntry && (
                                                <div style={{ padding: '6px 2px 2px' }}>
                                                    <CodexChip entry={alertCodexEntry} compact fullWidth />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section style={S.card}>
                <button
                    type="button"
                    onClick={() => setPausedOpen((prev) => !prev)}
                    style={S.drawerToggle}
                >
                    <span style={{ fontSize: 12, color: '#c9a84c', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Paused Yield Watchlist
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.6)' }}>
                        {data.pausedWatchlist.summary.totalPausedPositiveApy} paused · {data.pausedWatchlist.summary.promotableNow} promotable now {pausedOpen ? '▲' : '▼'}
                    </span>
                </button>

                {pausedOpen && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                        {data.pausedWatchlist.items.length === 0 ? (
                            <div style={S.sub}>No paused positive-APY strategies in this snapshot.</div>
                        ) : (
                            data.pausedWatchlist.items.map((item) => {
                                const isOpen = drilldownId === item.strategy.strategyId
                                return (
                                    <div key={item.strategy.strategyId} style={S.watchRow}>
                                        <button
                                            type="button"
                                            onClick={() => setDrilldownId((prev) => (prev === item.strategy.strategyId ? null : item.strategy.strategyId))}
                                            style={S.watchRowHeader}
                                        >
                                            <div>
                                                <div style={S.alertMain}>{item.strategy.label}</div>
                                                <div style={S.alertSub}>{item.strategy.protocol} · {item.strategy.chain} · paused</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <Sparkline seedKey={item.strategy.strategyId} apyPct={item.currentApyPct} tones={item.promotableTiers} />
                                                <div style={S.alertApy}>{item.currentApyPct.toFixed(2)}% APY</div>
                                                <div style={S.alertSub}>
                                                    Eligible: {item.promotableTiers.length > 0 ? item.promotableTiers.join(', ') : 'none'} {isOpen ? '▲' : '▼'}
                                                </div>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div style={S.watchDrilldown}>
                                                <div style={S.kpiLabel}>Research Drilldown</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 8 }}>
                                                    <div style={S.kpiCard}>
                                                        <div style={S.kpiLabel}>Risk</div>
                                                        <div style={S.kpiValue}>{item.strategy.riskLevel}</div>
                                                    </div>
                                                    <div style={S.kpiCard}>
                                                        <div style={S.kpiLabel}>Liquidity</div>
                                                        <div style={S.kpiValue}>{item.strategy.liquidityWindow}</div>
                                                    </div>
                                                    <div style={S.kpiCard}>
                                                        <div style={S.kpiLabel}>Fee (bps)</div>
                                                        <div style={S.kpiValue}>{item.strategy.feeBps}</div>
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                                                    {(['preserve', 'grow', 'accelerate'] as const).map((tier) => (
                                                        <div key={tier} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                                            <span style={{ color: 'rgba(245,240,232,0.62)', textTransform: 'capitalize' }}>{tier}</span>
                                                            <span style={{ color: item.promotableTiers.includes(tier) ? '#18c870' : 'rgba(245,240,232,0.5)' }}>
                                                                {item.promotableTiers.includes(tier)
                                                                    ? 'eligible if unpaused'
                                                                    : (item.blockedReasonsByTier[tier] ?? 'blocked')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* ◈ Codex Academy — embedded education for this paused strategy */}
                                                {(() => {
                                                    const watchCodexEntry = getCodexEntry(item.strategy.protocol)
                                                    return watchCodexEntry ? (
                                                        <div style={{ marginTop: 14 }}>
                                                            <CodexChip entry={watchCodexEntry} compact fullWidth />
                                                        </div>
                                                    ) : null
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </section>
        </div>
    )
}

function Kpi({ label, value }: { label: string; value: string }) {
    return (
        <div style={S.kpiCard}>
            <div style={S.kpiLabel}>{label}</div>
            <div style={S.kpiValue}>{value}</div>
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    wrap: {
        padding: '28px 28px 40px',
        maxWidth: 1120,
        margin: '0 auto',
        fontFamily: "'Tenor Sans', sans-serif",
    },
    kicker: {
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        color: 'rgba(245,240,232,0.4)',
        marginBottom: 4,
    },
    title: {
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 32,
        fontWeight: 300,
        color: '#f5f0e8',
    },
    sub: {
        fontSize: 12,
        color: 'rgba(245,240,232,0.58)',
        marginTop: 6,
    },
    err: {
        marginTop: 12,
        color: '#f87171',
        fontSize: 12,
    },
    headerRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 14,
        marginBottom: 18,
    },
    metaBox: {
        border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: 12,
        padding: '10px 12px',
        background: 'rgba(201,168,76,0.06)',
    },
    metaItem: {
        fontSize: 10,
        color: 'rgba(245,240,232,0.65)',
        lineHeight: 1.5,
    },
    grid4: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
        marginBottom: 14,
    },
    kpiCard: {
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        padding: '12px 14px',
    },
    kpiLabel: {
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(245,240,232,0.4)',
        marginBottom: 4,
    },
    kpiValue: {
        fontSize: 20,
        color: '#f5f0e8',
        fontFamily: "'Cormorant Garamond', serif",
    },
    card: {
        marginTop: 14,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        padding: '14px',
    },
    cardTitle: {
        fontSize: 12,
        color: '#c9a84c',
        marginBottom: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },
    tableWrap: {
        overflowX: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 11,
        color: 'rgba(245,240,232,0.78)',
    },
    alertRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        padding: '10px 12px',
    },
    alertMain: {
        fontSize: 12,
        color: '#f5f0e8',
    },
    alertSub: {
        fontSize: 10,
        color: 'rgba(245,240,232,0.45)',
    },
    alertApy: {
        fontSize: 12,
        color: '#18c870',
    },
    sparkSvg: {
        display: 'block',
        marginBottom: 4,
        opacity: 0.95,
    },
    sparkLegendRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 10,
    },
    promotableBody: {
        marginTop: 10,
    },
    promotableScroll: {
        display: 'grid',
        gap: 8,
        maxHeight: 'min(52vh, 420px)',
        overflowY: 'auto',
        paddingRight: 4,
    },
    sparkLegendItem: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        color: 'rgba(245,240,232,0.62)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
    },
    legendDot: {
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 999,
    },
    progressGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 8,
    },
    progressCard: {
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        background: 'linear-gradient(180deg, rgba(201,168,76,0.08), rgba(255,255,255,0.02))',
        padding: '10px 12px',
    },
    progressStep: {
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#c9a84c',
    },
    progressText: {
        marginTop: 5,
        fontSize: 11,
        color: 'rgba(245,240,232,0.72)',
        minHeight: 32,
        lineHeight: 1.3,
    },
    progressStatus: {
        marginTop: 8,
        fontSize: 10,
        color: 'rgba(245,240,232,0.45)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
    },
    cmdPanelLabel: {
        fontSize: 9,
        letterSpacing: '0.16em',
        textTransform: 'uppercase' as const,
        color: 'rgba(245,240,232,0.35)',
        fontFamily: "'Tenor Sans', sans-serif",
        marginBottom: 16,
    },
    drawerToggle: {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
    },
    watchRow: {
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.015)',
    },
    watchRowHeader: {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
    },
    watchDrilldown: {
        borderTop: '1px dashed rgba(255,255,255,0.08)',
        padding: '10px 12px 12px',
    },
}
