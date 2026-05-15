'use client'

import type { CSSProperties } from 'react'
import type { BatchOperationResponse } from '../../lib/bff.types'

export function ResultExport({ result }: { result: BatchOperationResponse | null }) {
    const exportCsv = () => {
        if (!result) return
        const header = 'rowNumber,recipient,amount,status,message,orderId,errorCode'
        const rows = result.results.map((row) => [
            row.rowNumber,
            row.recipient,
            row.amount,
            row.status,
            row.message.replaceAll(',', ' '),
            row.orderId || '',
            row.errorCode || '',
        ].join(','))
        const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${result.operationId}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <button type="button" style={{ ...S.button, opacity: result ? 1 : 0.45 }} disabled={!result} onClick={exportCsv}>
            Export results CSV
        </button>
    )
}

const S: Record<string, CSSProperties> = {
    button: {
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: '#1F2430',
        color: '#E5E7EB',
        padding: '10px 12px',
        cursor: 'pointer',
    },
}
