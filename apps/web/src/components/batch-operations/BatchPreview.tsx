'use client'

import type { CSSProperties } from 'react'
import { formatUnits } from 'viem'
import type { BatchUploadRow } from '../../lib/bff.types'

function fmtUsdc(raw: string) {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) return '$0.00'
    const isBaseUnits = numeric > 100000
    return `$${Number(formatUnits(BigInt(isBaseUnits ? raw : String(Math.round(numeric * 1_000_000))), 6)).toFixed(2)}`
}

export function BatchPreview({ rows }: { rows: BatchUploadRow[] }) {
    if (rows.length === 0) {
        return <div style={S.empty}>Upload a CSV to preview pending rows.</div>
    }

    return (
        <section style={S.card}>
            <div style={S.title}>Batch Preview</div>
            <div style={S.table}>
                <div style={S.header}>
                    <span>Row</span>
                    <span>Recipient</span>
                    <span>Amount</span>
                    <span>Corridor</span>
                    <span>Payout</span>
                </div>
                {rows.map((row) => (
                    <div key={row.rowNumber} style={S.row}>
                        <span>{row.rowNumber}</span>
                        <span>{row.recipient}</span>
                        <span>{fmtUsdc(row.amount)}</span>
                        <span>{row.corridor}</span>
                        <span>{row.payoutMethod}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

const S: Record<string, CSSProperties> = {
    card: {
        background: '#161821',
        border: '1px solid rgba(201,168,76,0.16)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    title: { fontSize: 16, fontWeight: 700, color: '#F0EDE8' },
    table: { display: 'flex', flexDirection: 'column', gap: 6 },
    header: {
        display: 'grid',
        gridTemplateColumns: '70px 1.6fr 120px 120px 120px',
        gap: 12,
        color: '#6B7280',
        fontSize: 11,
        textTransform: 'uppercase',
        fontFamily: 'JetBrains Mono, monospace',
    },
    row: {
        display: 'grid',
        gridTemplateColumns: '70px 1.6fr 120px 120px 120px',
        gap: 12,
        padding: '10px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        color: '#E5E7EB',
        fontSize: 12,
    },
    empty: {
        textAlign: 'center',
        color: '#9CA3AF',
        padding: '26px 12px',
        border: '1px dashed rgba(255,255,255,0.12)',
        borderRadius: 12,
    },
}
