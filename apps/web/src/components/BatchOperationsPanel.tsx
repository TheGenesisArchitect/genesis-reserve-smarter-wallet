'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { BatchUploader } from './batch-operations/BatchUploader'
import { BatchPreview } from './batch-operations/BatchPreview'
import { BatchSubmit } from './batch-operations/BatchSubmit'
import { BatchResults } from './batch-operations/BatchResults'
import { ResultExport } from './batch-operations/ResultExport'
import type { BatchOperationResponse, BatchUploadRow } from '../lib/bff.types'

export function BatchOperationsPanel({ accountId }: { accountId?: string }) {
    const [rows, setRows] = useState<BatchUploadRow[]>([])
    const [result, setResult] = useState<BatchOperationResponse | null>(null)

    return (
        <div style={S.root}>
            <div style={S.header}>
                <div>
                    <div style={S.title}>Batch Operations</div>
                    <div style={S.sub}>Upload a CSV, preview rows, submit idempotently, and export row-level results.</div>
                </div>
                <ResultExport result={result} />
            </div>

            {!accountId && <div style={S.warn}>Resolve an account before submitting a batch.</div>}

            <div style={S.grid}>
                <BatchUploader onRowsParsed={setRows} />
                <BatchSubmit accountId={accountId} rows={rows} onSubmitted={setResult} />
            </div>

            <BatchPreview rows={rows} />
            <BatchResults result={result} />
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    root: { display: 'flex', flexDirection: 'column', gap: 16 },
    header: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
    title: { fontSize: 18, fontWeight: 700, color: '#F0EDE8' },
    sub: { fontSize: 12, color: '#9CA3AF' },
    warn: { color: '#F0A020', background: 'rgba(240,160,32,0.12)', border: '1px solid rgba(240,160,32,0.25)', borderRadius: 10, padding: '12px 14px' },
    grid: { display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 },
}
