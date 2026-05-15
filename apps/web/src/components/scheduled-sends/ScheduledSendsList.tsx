'use client'

import type { CSSProperties } from 'react'
import { formatUnits } from 'viem'
import type { ScheduledSend } from '../../lib/bff.types'

function fmtUsdc(raw: string) {
    return `$${Number(formatUnits(BigInt(raw || '0'), 6)).toFixed(2)}`
}

function fmtNext(date: string) {
    return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function ScheduledSendsList({
    items,
    busyId,
    onEdit,
    onTogglePause,
    onCancel,
}: {
    items: ScheduledSend[]
    busyId?: string | null
    onEdit: (item: ScheduledSend) => void
    onTogglePause: (item: ScheduledSend) => void
    onCancel: (item: ScheduledSend) => void
}) {
    if (items.length === 0) {
        return <div style={S.empty}>No scheduled sends created yet.</div>
    }

    return (
        <div style={S.grid}>
            {items.map((item) => {
                const isBusy = busyId === item.id
                const isCancelled = item.status === 'CANCELLED'
                const canPause = item.status !== 'CANCELLED'
                const pauseLabel = item.status === 'PAUSED' ? 'Resume' : 'Pause'

                return (
                    <article key={item.id} style={S.card}>
                        <div style={S.topRow}>
                            <div>
                                <div style={S.amount}>{fmtUsdc(item.amount)}</div>
                                <div style={S.recipient}>{item.recipient}</div>
                            </div>
                            <span style={{ ...S.status, ...(item.status === 'ACTIVE' ? S.active : item.status === 'PAUSED' ? S.paused : S.cancelled) }}>
                                {item.status}
                            </span>
                        </div>

                        <div style={S.metaGrid}>
                            <div>
                                <div style={S.metaLabel}>Frequency</div>
                                <div style={S.metaValue}>{item.frequency}</div>
                            </div>
                            <div>
                                <div style={S.metaLabel}>Corridor</div>
                                <div style={S.metaValue}>{item.corridor}</div>
                            </div>
                            <div>
                                <div style={S.metaLabel}>Payout</div>
                                <div style={S.metaValue}>{item.payoutMethod}</div>
                            </div>
                            <div>
                                <div style={S.metaLabel}>Next execution</div>
                                <div style={S.metaValue}>{fmtNext(item.nextExecutionAt)}</div>
                            </div>
                        </div>

                        {item.memo && <div style={S.memo}>{item.memo}</div>}

                        <div style={S.actions}>
                            <button type="button" style={S.secondaryBtn} onClick={() => onEdit(item)} disabled={isBusy || isCancelled}>
                                Edit
                            </button>
                            <button type="button" style={S.secondaryBtn} onClick={() => onTogglePause(item)} disabled={isBusy || !canPause}>
                                {isBusy ? 'Working…' : pauseLabel}
                            </button>
                            <button type="button" style={S.dangerBtn} onClick={() => onCancel(item)} disabled={isBusy || isCancelled}>
                                Cancel
                            </button>
                        </div>
                    </article>
                )
            })}
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 14,
    },
    card: {
        background: '#161821',
        border: '1px solid rgba(201,168,76,0.16)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    topRow: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
    },
    amount: {
        fontSize: 22,
        fontWeight: 700,
        color: '#F0EDE8',
        fontFamily: 'JetBrains Mono, monospace',
    },
    recipient: {
        fontSize: 12,
        color: '#9CA3AF',
        wordBreak: 'break-word',
        fontFamily: 'JetBrains Mono, monospace',
    },
    status: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        fontFamily: 'JetBrains Mono, monospace',
    },
    active: {
        color: '#18C870',
        background: 'rgba(24,200,112,0.12)',
        border: '1px solid rgba(24,200,112,0.25)',
    },
    paused: {
        color: '#F0A020',
        background: 'rgba(240,160,32,0.12)',
        border: '1px solid rgba(240,160,32,0.25)',
    },
    cancelled: {
        color: '#f87171',
        background: 'rgba(248,113,113,0.12)',
        border: '1px solid rgba(248,113,113,0.25)',
    },
    metaGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
    },
    metaLabel: {
        fontSize: 10,
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: 'JetBrains Mono, monospace',
    },
    metaValue: {
        marginTop: 2,
        fontSize: 12,
        color: '#D1D5DB',
        fontFamily: 'JetBrains Mono, monospace',
    },
    memo: {
        fontSize: 12,
        color: '#C9A84C',
        background: 'rgba(201,168,76,0.08)',
        borderRadius: 8,
        padding: '8px 10px',
    },
    actions: {
        display: 'flex',
        gap: 8,
        marginTop: 'auto',
    },
    secondaryBtn: {
        flex: 1,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: '#1F2430',
        color: '#E5E7EB',
        padding: '10px 12px',
        cursor: 'pointer',
    },
    dangerBtn: {
        flex: 1,
        borderRadius: 8,
        border: '1px solid rgba(248,113,113,0.35)',
        background: 'rgba(248,113,113,0.12)',
        color: '#f87171',
        padding: '10px 12px',
        cursor: 'pointer',
    },
    empty: {
        textAlign: 'center',
        color: '#9CA3AF',
        padding: '26px 12px',
        border: '1px dashed rgba(255,255,255,0.12)',
        borderRadius: 12,
    },
}
