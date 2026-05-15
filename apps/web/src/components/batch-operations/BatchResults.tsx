'use client'

import type { CSSProperties } from 'react'
import { formatUnits } from 'viem'
import type { BatchOperationResponse } from '../../lib/bff.types'

function fmtUsdc(raw: string) {
    return `$${Number(formatUnits(BigInt(raw || '0'), 6)).toFixed(2)}`
}

export function BatchResults({ result }: { result: BatchOperationResponse | null }) {
    if (!result) {
        return <div style={S.empty}>Submitted batch results will appear here.</div>
    }

    return (
        <section style={S.card}>
            <div style={S.header}>
                <div>
                    <div style={S.title}>Batch Results</div>
                    <div style={S.sub}>{result.operationId} · {new Date(result.submittedAt).toLocaleString()}</div>
                </div>
                <div style={S.summary}>
                    <span style={S.ok}>{result.totals.successCount} success</span>
                    <span style={S.fail}>{result.totals.failureCount} failed</span>
                    <span style={S.total}>{fmtUsdc(result.totals.totalAmount)}</span>
                </div>
            </div>
            <div style={S.list}>
                {result.results.map((row) => (
                    <div key={row.rowNumber} style={S.row}>
                        <div>
                            <div style={S.rowTitle}>Row {row.rowNumber} · {row.recipient}</div>
                            <div style={S.rowSub}>{fmtUsdc(row.amount)} · {row.message}</div>
                        </div>
                        <span style={{ ...S.badge, ...(row.status === 'SUCCESS' ? S.okBadge : S.failBadge) }}>{row.status}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

const S: Record<string, CSSProperties> = {
    card: { background: '#161821', border: '1px solid rgba(201,168,76,0.16)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
    header: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
    title: { fontSize: 16, fontWeight: 700, color: '#F0EDE8' },
    sub: { fontSize: 12, color: '#9CA3AF', fontFamily: 'JetBrains Mono, monospace' },
    summary: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    ok: { color: '#18C870', fontSize: 12, fontWeight: 700 },
    fail: { color: '#f87171', fontSize: 12, fontWeight: 700 },
    total: { color: '#C9A84C', fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' },
    list: { display: 'flex', flexDirection: 'column', gap: 8 },
    row: { display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' },
    rowTitle: { color: '#F0EDE8', fontSize: 13, fontWeight: 600 },
    rowSub: { color: '#9CA3AF', fontSize: 12 },
    badge: { borderRadius: 999, padding: '4px 8px', height: 'fit-content', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' },
    okBadge: { color: '#18C870', background: 'rgba(24,200,112,0.12)', border: '1px solid rgba(24,200,112,0.25)' },
    failBadge: { color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' },
    empty: { textAlign: 'center', color: '#9CA3AF', padding: '26px 12px', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 12 },
}
