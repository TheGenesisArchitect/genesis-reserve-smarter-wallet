import { NextResponse } from 'next/server'
import { createScheduledSend, listScheduledSends } from '../_lib/mockWorkflows'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const accountId = url.searchParams.get('accountId') || undefined
    return NextResponse.json(listScheduledSends(accountId), {
        headers: {
            'cache-control': 'private, max-age=15',
        },
    })
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || body.idempotencyKey || `sched-create-${Date.now()}`

        if (!body?.recipient || !body?.amount || !body?.frequency) {
            return NextResponse.json(
                {
                    error: 'invalid_scheduled_send',
                    detail: 'recipient, amount, and frequency are required.',
                },
                { status: 400 }
            )
        }

        return NextResponse.json(createScheduledSend({
            accountId: body.accountId,
            recipient: String(body.recipient),
            amount: String(body.amount),
            frequency: body.frequency,
            payoutMethod: body.payoutMethod,
            corridor: body.corridor,
            memo: body.memo,
            idempotencyKey,
        }))
    } catch (error) {
        return NextResponse.json(
            {
                error: 'scheduled_send_create_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
