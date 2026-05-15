'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useBatchOperations } from '../../hooks/useBatchOperations'
import type { BatchOperationResponse, BatchUploadRow } from '../../lib/bff.types'

export function BatchSubmit({
    accountId,
    rows,
    onSubmitted,
}: {
    accountId?: string
    rows: BatchUploadRow[]
    onSubmitted: (result: BatchOperationResponse) => void
}) {
    const mutation = useBatchOperations()
    const totalRows = rows.length
    const readyRows = useMemo(() => rows.filter((row) => row.recipient && Number(row.amount) > 0).length, [rows])
    const progress = totalRows === 0 ? 0 : Math.round((readyRows / totalRows) * 100)
    const canSubmit = Boolean(accountId && totalRows > 0)

    const submit = async () => {
        if (!canSubmit) return
        const result = await mutation.mutateAsync({ accountId, rows })
        onSubmitted(result)
    }

    return (
        <section style={S.card}>
            <div style={S.title}>Batch Submit</div>
            <div style={S.sub}>Idempotent submission with row-level success/failure reporting.</div>
            <div style={S.progressTrack}>
                <div style={{ ...S.progressFill, width: `${progress}%` }} />
            </div>
            <div style={S.progressMeta}>{readyRows}/{totalRows} rows ready</div>
            {mutation.error && <div style={S.error}>{mutation.error instanceof Error ? mutation.error.message : 'Batch submit failed.'}</div>}
            <button type="button" style={{ ...S.button, opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit || mutation.isPending} onClick={submit}>
                {mutation.isPending ? 'Submitting…' : 'Submit batch'}
            </button>
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
    sub: { fontSize: 12, color: '#9CA3AF' },
    progressTrack: { width: '100%', height: 10, background: '#0F1218', borderRadius: 999, overflow: 'hidden' },
    progressFill: { height: '100%', background: 'linear-gradient(90deg, #C9A84C, #18C870)' },
    progressMeta: { fontSize: 12, color: '#D1D5DB', fontFamily: 'JetBrains Mono, monospace' },
    button: { alignSelf: 'flex-start', background: '#C9A84C', color: '#11131B', border: 'none', borderRadius: 8, padding: '11px 14px', fontWeight: 700, cursor: 'pointer' },
    error: { color: '#f87171', fontSize: 12 },
}
