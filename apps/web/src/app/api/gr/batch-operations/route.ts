import { NextResponse } from 'next/server'
import { submitBatchOperation } from '../_lib/mockWorkflows'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || body.idempotencyKey || `batch-${Date.now()}`

        if (!Array.isArray(body?.rows) || body.rows.length === 0) {
            return NextResponse.json(
                {
                    error: 'invalid_batch_request',
                    detail: 'rows must be a non-empty array.',
                },
                { status: 400 }
            )
        }

        return NextResponse.json(submitBatchOperation({
            accountId: body.accountId,
            rows: body.rows,
            idempotencyKey,
        }))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'batch_submit_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
