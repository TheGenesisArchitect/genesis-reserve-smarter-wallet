'use client'

import type { CSSProperties } from 'react'
import { useDashboardSnapshot } from '../hooks/useDashboardSnapshot'
import type { DashboardResponse } from '../lib/bff.types'

function formatUSDC(raw: string) {
    const parsed = Number(raw) / 1e6
    if (!Number.isFinite(parsed)) return '$0.00'
    return `$${parsed.toFixed(2)}`
}

function extractBalancePreview(balance: DashboardResponse['balance']) {
    if (!balance || typeof balance !== 'object') {
        return { available: '0', reserved: '0', invested: '0' }
    }
    const record = balance as Record<string, unknown>
    return {
        available: String(record.available ?? record.available_usdc ?? '0'),
        reserved: String(record.reserved ?? record.reserved_usdc ?? '0'),
        invested: String(record.invested ?? record.invested_usdc ?? '0'),
    }
}

function parseUsdcAtomic(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function toSignedAtomic(entry: DashboardResponse['history'][number]): number {
    const amount = parseUsdcAtomic(entry.amount)
    const normalized = entry.entryType.toLowerCase()

    if (
        normalized.includes('credit') ||
        normalized.includes('deposit') ||
        normalized.includes('harvest') ||
        normalized.includes('yield')
    ) {
        return amount
    }

    if (
        normalized.includes('debit') ||
        normalized.includes('withdraw') ||
        normalized.includes('send') ||
        normalized.includes('reserve')
    ) {
        return -amount
    }

    return 0
}

interface TrendPoint {
    label: string
    totalAtomic: number
}

function buildSevenDayTrend(history: DashboardResponse['history'] | undefined, currentTotalAtomic: number): TrendPoint[] {
    const now = new Date()
    const days: Array<{ key: string; label: string }> = []

    for (let offset = 6; offset >= 0; offset -= 1) {
        const d = new Date(now)
        d.setDate(now.getDate() - offset)
        const key = d.toISOString().slice(0, 10)
        const label = d.toLocaleDateString(undefined, { weekday: 'short' })
        days.push({ key, label })
    }

    const dailyDelta = new Map<string, number>()
    for (const day of days) {
        dailyDelta.set(day.key, 0)
    }

    for (const entry of history ?? []) {
        const createdKey = new Date(entry.createdAt).toISOString().slice(0, 10)
        if (!dailyDelta.has(createdKey)) continue
        dailyDelta.set(createdKey, (dailyDelta.get(createdKey) ?? 0) + toSignedAtomic(entry))
    }

    const totalRecentDelta = Array.from(dailyDelta.values()).reduce((acc, value) => acc + value, 0)
    let running = Math.max(0, currentTotalAtomic - totalRecentDelta)

    return days.map((day) => {
        running += dailyDelta.get(day.key) ?? 0
        return {
            label: day.label,
            totalAtomic: Math.max(0, running),
        }
    })
}

function toSparklinePoints(values: number[], width: number, height: number): string {
    if (values.length === 0) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(1, max - min)
    const xStep = values.length > 1 ? width / (values.length - 1) : width

    return values
        .map((value, index) => {
            const x = index * xStep
            const y = height - ((value - min) / span) * height
            return `${x},${y}`
        })
        .join(' ')
}

function formatMetric(value: number | undefined) {
    if (value === undefined || !Number.isFinite(value)) return '0'
    const safeValue: number = value
    return new Intl.NumberFormat().format(safeValue)
}

function formatTimestamp(value: string | null | undefined) {
    if (!value) return 'n/a'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? 'n/a' : parsed.toLocaleTimeString()
}

interface Props {
    accountId?: string
}

export function DashboardSnapshotPanel({ accountId }: Props) {
    const { data, isLoading, error } = useDashboardSnapshot(accountId)

    if (!accountId) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>BFF Dashboard Snapshot</div>
                <div style={S.emptyState}>Connect wallet and resolve account to load dashboard data.</div>
            </section>
        )
    }

    if (isLoading) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>BFF Dashboard Snapshot</div>
                <div style={S.emptyState}>Loading aggregate dashboard...</div>
            </section>
        )
    }

    if (error) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>BFF Dashboard Snapshot</div>
                <div style={S.error}>Unable to load dashboard aggregate.</div>
            </section>
        )
    }

    const preview = extractBalancePreview(data?.balance)
    const currentTotalAtomic =
        parseUsdcAtomic(preview.available) +
        parseUsdcAtomic(preview.reserved) +
        parseUsdcAtomic(preview.invested)
    const trend = buildSevenDayTrend(data?.history, currentTotalAtomic)
    const trendValues = trend.map((point) => point.totalAtomic)
    const sparkline = toSparklinePoints(trendValues, 100, 34)
    const trendStart = trendValues[0] ?? 0
    const trendEnd = trendValues[trendValues.length - 1] ?? 0
    const trendDeltaPct = trendStart > 0 ? ((trendEnd - trendStart) / trendStart) * 100 : 0
    const commandCenter = data?.commandCenter

    return (
        <section style={S.panel}>
            <div style={S.panelTitle}>BFF Dashboard Snapshot</div>
            <div style={S.kvGrid}>
                <div style={S.kvItem}>
                    <div style={S.kvKey}>Account</div>
                    <div style={S.kvVal}>{data?.accountId ?? accountId}</div>
                </div>
                <div style={S.kvItem}>
                    <div style={S.kvKey}>Available</div>
                    <div style={S.kvVal}>{formatUSDC(preview.available)}</div>
                </div>
                <div style={S.kvItem}>
                    <div style={S.kvKey}>Reserved</div>
                    <div style={S.kvVal}>{formatUSDC(preview.reserved)}</div>
                </div>
                <div style={S.kvItem}>
                    <div style={S.kvKey}>Invested</div>
                    <div style={S.kvVal}>{formatUSDC(preview.invested)}</div>
                </div>
            </div>
            <div style={S.trendWrap}>
                <div style={S.trendHeader}>
                    <span style={S.trendLabel}>7D Balance Trend</span>
                    <span style={trendDeltaPct >= 0 ? S.trendPositive : S.trendNegative}>
                        {trendDeltaPct >= 0 ? '+' : ''}{trendDeltaPct.toFixed(2)}%
                    </span>
                </div>
                <svg viewBox="0 0 100 34" preserveAspectRatio="none" style={S.sparklineSvg}>
                    <polyline fill="none" stroke="rgba(201,168,76,0.25)" strokeWidth="1.5" points={`0,33 100,33`} />
                    <polyline fill="none" stroke="#C9A84C" strokeWidth="2" points={sparkline} />
                </svg>
                <div style={S.trendAxis}>
                    {trend.map((point) => (
                        <span key={point.label}>{point.label}</span>
                    ))}
                </div>
            </div>
            {commandCenter ? (
                <div style={S.opsWrap}>
                    <div style={S.opsHeader}>
                        <span style={S.trendLabel}>Command Center</span>
                        <span style={commandCenter.connectivity.status === 'ok' ? S.statusOk : S.statusWarn}>
                            {commandCenter.connectivity.status.toUpperCase()}
                        </span>
                    </div>
                    <div style={S.opsGrid}>
                        <div style={S.kvItem}>
                            <div style={S.kvKey}>Approvals 24H</div>
                            <div style={S.kvVal}>{formatMetric(commandCenter.approvals.last24h)}</div>
                        </div>
                        <div style={S.kvItem}>
                            <div style={S.kvKey}>High Risk Queue</div>
                            <div style={S.kvVal}>{formatMetric(commandCenter.approvals.highRisk)}</div>
                        </div>
                        <div style={S.kvItem}>
                            <div style={S.kvKey}>Audit Events 24H</div>
                            <div style={S.kvVal}>{formatMetric(commandCenter.audits.last24h)}</div>
                        </div>
                        <div style={S.kvItem}>
                            <div style={S.kvKey}>Active Agents</div>
                            <div style={S.kvVal}>{formatMetric(commandCenter.audits.distinctAgentsSeen)}</div>
                        </div>
                    </div>
                    <div style={S.opsMetaRow}>
                        <span>DB: {commandCenter.connectivity.database}</span>
                        <span>Last audit: {formatTimestamp(commandCenter.audits.lastEventAt)}</span>
                    </div>
                </div>
            ) : null}
            <div style={S.mutedNote}>
                Fetched: {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'n/a'}
            </div>
        </section>
    )
}

const S: Record<string, CSSProperties> = {
    panel: {
        background: '#12141C',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '14px 16px',
    },
    panelTitle: {
        fontFamily: 'JetBrains Mono, monospace',
        color: '#C9A84C',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontSize: 11,
        marginBottom: 10,
    },
    kvGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
    },
    kvItem: {
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '10px 12px',
    },
    kvKey: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        color: '#5A5650',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 4,
    },
    kvVal: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        color: '#F0EDE8',
    },
    trendWrap: {
        marginTop: 12,
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '10px 12px',
    },
    trendHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    trendLabel: {
        color: '#5A5650',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    },
    trendPositive: {
        color: '#1FA774',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
    },
    trendNegative: {
        color: '#E04040',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
    },
    sparklineSvg: {
        width: '100%',
        height: 34,
        display: 'block',
    },
    trendAxis: {
        marginTop: 6,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: 4,
        color: '#5A5650',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        textAlign: 'center',
    },
    mutedNote: {
        marginTop: 10,
        color: '#5A5650',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
    },
    opsWrap: {
        marginTop: 12,
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '10px 12px',
    },
    opsHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    opsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
    },
    statusOk: {
        color: '#1FA774',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
    },
    statusWarn: {
        color: '#E0A040',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
    },
    opsMetaRow: {
        marginTop: 8,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        color: '#5A5650',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        flexWrap: 'wrap',
    },
    emptyState: {
        color: '#A8A49E',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
    },
    error: {
        marginTop: 10,
        border: '1px solid rgba(224,64,64,0.25)',
        background: 'rgba(224,64,64,0.10)',
        color: '#E04040',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
    },
}
