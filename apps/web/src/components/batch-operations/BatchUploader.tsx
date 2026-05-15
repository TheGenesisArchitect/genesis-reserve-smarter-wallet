'use client'

import type { CSSProperties } from 'react'
import type { BatchUploadRow } from '../../lib/bff.types'

function parseCsv(text: string): BatchUploadRow[] {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length <= 1) return []

    const [, ...rows] = lines
    return rows.map((line, index) => {
        const [recipient = '', amount = '', corridor = 'US-PH', payoutMethod = 'BANK', memo = ''] = line.split(',').map((part) => part.trim())
        return {
            rowNumber: index + 1,
            recipient,
            amount,
            corridor,
            payoutMethod,
            memo,
        }
    })
}

export function BatchUploader({
    onRowsParsed,
}: {
    onRowsParsed: (rows: BatchUploadRow[]) => void
}) {
    const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        const text = await file.text()
        onRowsParsed(parseCsv(text))
    }

    const loadSample = () => {
        onRowsParsed([
            { rowNumber: 1, recipient: 'ops@payroll', amount: '125000000', corridor: 'US-PH', payoutMethod: 'BANK', memo: 'Payroll batch A' },
            { rowNumber: 2, recipient: 'vendor-alpha', amount: '94000000', corridor: 'US-NG', payoutMethod: 'BANK', memo: 'Vendor settlement' },
            { rowNumber: 3, recipient: 'recipient-fail', amount: '30000000', corridor: 'US-IN', payoutMethod: 'BANK', memo: 'Intentional validation failure' },
        ])
    }

    return (
        <section style={S.card}>
            <div style={S.title}>Batch Uploader</div>
            <div style={S.sub}>CSV format: recipient,amount,corridor,payoutMethod,memo</div>
            <div style={S.actions}>
                <label style={S.uploadBtn}>
                    <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFileChange} />
                    Choose CSV
                </label>
                <button type="button" style={S.secondaryBtn} onClick={loadSample}>Load sample</button>
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
    sub: { fontSize: 12, color: '#9CA3AF' },
    actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
    uploadBtn: { borderRadius: 8, background: '#C9A84C', color: '#11131B', padding: '10px 12px', fontWeight: 700, cursor: 'pointer' },
    secondaryBtn: { borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#1F2430', color: '#E5E7EB', padding: '10px 12px', cursor: 'pointer' },
}
