import { NextResponse } from 'next/server'
import { cancelScheduledSend, updateScheduledSend } from '../../_lib/mockWorkflows'

type RouteContext = {
    params: {
        id: string
    }
}

export async function PUT(request: Request, context: RouteContext) {
    try {
        const body = await request.json()
        const idempotencyKey = request.headers.get('idempotency-key') || body.idempotencyKey || `sched-update-${Date.now()}`
        const result = updateScheduledSend({
            id: context.params.id,
            recipient: body.recipient,
            amount: body.amount ? String(body.amount) : undefined,
            frequency: body.frequency,
            payoutMethod: body.payoutMethod,
            corridor: body.corridor,
            memo: body.memo,
            status: body.status,
            idempotencyKey,
        })

        if (!result) {
            return NextResponse.json({ error: 'scheduled_send_not_found' }, { status: 404 })
        }

        return NextResponse.json(result)
    } catch (error) {
        return NextResponse.json(
            {
                error: 'scheduled_send_update_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const idempotencyKey = request.headers.get('idempotency-key') || `sched-cancel-${Date.now()}`
    const result = cancelScheduledSend(context.params.id, idempotencyKey)

    if (!result) {
        return NextResponse.json({ error: 'scheduled_send_not_found' }, { status: 404 })
    }

    return NextResponse.json(result)
}
