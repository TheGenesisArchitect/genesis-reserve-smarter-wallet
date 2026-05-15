'use client'

import type { CSSProperties } from 'react'
import { useRecipients } from '../hooks/useRecipients'
import type { RemittanceRecipient } from '../lib/bff.types'

interface Props {
    accountId?: string
    corridor?: string
    onSelectRecipient?: (recipient: RemittanceRecipient) => void
}

export function RecipientBookPanel({ accountId, corridor, onSelectRecipient }: Props) {
    const { data, isLoading, error } = useRecipients(accountId, corridor)

    if (!accountId) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>Saved Recipients</div>
                <div style={S.emptyState}>Connect wallet and resolve account to view saved recipients.</div>
            </section>
        )
    }

    if (isLoading) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>Saved Recipients</div>
                <div style={S.emptyState}>Loading recipients...</div>
            </section>
        )
    }

    if (error) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>Saved Recipients</div>
                <div style={S.error}>Unable to load recipients. Try again later.</div>
            </section>
        )
    }

    const recipients = data?.recipients ?? []

    if (recipients.length === 0) {
        return (
            <section style={S.panel}>
                <div style={S.panelTitle}>Saved Recipients</div>
                <div style={S.emptyState}>No saved recipients yet. Recipient book will appear here.</div>
            </section>
        )
    }

    return (
        <section style={S.panel}>
            <div style={S.panelTitle}>Saved Recipients ({recipients.length})</div>
            <div style={S.recipientList}>
                {recipients.map(recipient => (
                    <div
                        key={recipient.recipientId}
                        style={S.recipientCard}
                        onClick={() => onSelectRecipient?.(recipient)}
                        role="button"
                        tabIndex={0}
                    >
                        <div style={S.recipientHeader}>
                            <div style={S.recipientName}>{recipient.displayName}</div>
                            {recipient.isDefault && <span style={S.defaultBadge}>DEFAULT</span>}
                        </div>
                        <div style={S.recipientMeta}>
                            <span style={S.metaLabel}>{recipient.corridor}</span>
                            <span style={S.metaSep}>·</span>
                            <span style={S.metaLabel}>{recipient.payoutMethod}</span>
                        </div>
                        {recipient.recipientName && (
                            <div style={S.recipientDetail}>{recipient.recipientName}</div>
                        )}
                        {recipient.bankName && (
                            <div style={S.recipientDetail}>{recipient.bankName}</div>
                        )}
                        {recipient.mobileNumber && (
                            <div style={S.recipientDetail}>{recipient.mobileNumber}</div>
                        )}
                        <div style={S.recipientFooter}>
                            <span style={S.verificationStatus}>
                                {recipient.verificationStatus === 'VERIFIED' && '✓ Verified'}
                                {recipient.verificationStatus === 'PENDING' && '⏳ Pending'}
                                {recipient.verificationStatus === 'UNVERIFIED' && '◯ Unverified'}
                                {recipient.verificationStatus === 'FAILED' && '✗ Failed'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            <div style={S.timestamp}>
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
        marginBottom: 12,
        fontWeight: 600,
    },
    recipientList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    recipientCard: {
        background: '#1A1D25',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    recipientHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    recipientName: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        color: '#F0EDE8',
        fontWeight: 600,
    },
    defaultBadge: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        background: '#18C870',
        color: '#0a0604',
        padding: '2px 6px',
        borderRadius: 3,
        fontWeight: 700,
        letterSpacing: '0.06em',
    },
    recipientMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    metaLabel: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        color: '#5A5650',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    metaSep: {
        color: '#3A3830',
    },
    recipientDetail: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        color: '#8A7E6A',
        marginBottom: 4,
    },
    recipientFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(255,255,255,0.03)',
        paddingTop: 6,
        marginTop: 6,
    },
    verificationStatus: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        color: '#5A5650',
    },
    emptyState: {
        color: '#A8A49E',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        textAlign: 'center',
        padding: '20px 0',
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
        textAlign: 'center',
    },
    timestamp: {
        marginTop: 10,
        color: '#5A5650',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
    },
}
