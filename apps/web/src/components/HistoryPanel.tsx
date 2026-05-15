'use client'

import type { CSSProperties } from 'react'
import { useHistoryEntries } from '../hooks/useHistoryEntries'
import type { LedgerEntry } from '../lib/bff.types'

function formatAmount(raw: string) {
    const n = parseFloat(raw) / 1e6
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
}

interface Props {
    accountId?: string
    /** Max entries to display. Defaults to 20. */
    limit?: number
}

export function HistoryPanel({ accountId, limit = 20 }: Props) {
    const { data, isLoading, error } = useHistoryEntries(accountId, limit)
    const entries: LedgerEntry[] = data?.entries ?? []

    return (
        <section style={S.panel}>
            <div style={S.panelTitle}>Transaction History</div>

            {!accountId ? (
                <div style={S.emptyState}>Resolve account to view history.</div>
            ) : isLoading ? (
                <div style={S.emptyState}>Loading…</div>
            ) : error ? (
                <div style={S.error}>Unable to load transaction history.</div>
            ) : entries.length === 0 ? (
                <div style={S.emptyState}>No transactions yet.</div>
            ) : (
                <div style={S.tableWrap}>
                    {entries.map((e) => (
                        <div key={e.id} style={S.tableRow}>
                            <span style={S.colTime}>
                                {new Date(e.createdAt).toLocaleDateString()}
                            </span>
                            <span
                                style={{
                                    ...S.colAmount,
                                    color: e.entryType === 'credit' ? '#10b981' : '#f87171',
                                }}
                            >
                                {formatAmount(e.amount)}
                            </span>
                            <span style={S.colType}>{e.entryType.toUpperCase()}</span>
                        </div>
                    ))}
                </div>
            )}
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
    tableWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    tableRow: {
        display: 'grid',
        gridTemplateColumns: '90px 90px 70px',
        gap: 10,
        alignItems: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '8px 10px',
    },
    colTime: {
        color: '#A8A49E',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
    },
    colAmount: {
        fontSize: 12,
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
    },
    colType: {
        color: '#C9A84C',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
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
