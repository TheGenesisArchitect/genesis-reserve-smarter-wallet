import type {
    BatchOperationResponse,
    BatchUploadRow,
    ScheduledSend,
    ScheduledSendFrequency,
    ScheduledSendMutationResponse,
    ScheduledSendsResponse,
    ScheduledSendStatus,
} from '../../../../lib/bff.types'

type MockStore = {
    scheduled: ScheduledSend[]
    scheduledIdempotency: Map<string, ScheduledSendMutationResponse>
    batchIdempotency: Map<string, BatchOperationResponse>
}

const globalStore = globalThis as typeof globalThis & {
    __genesisMockWorkflowStore?: MockStore
}

function nextExecutionFor(frequency: ScheduledSendFrequency) {
    const now = Date.now()
    const delta = frequency === 'DAILY' ? 24 * 60 * 60 * 1000 : frequency === 'WEEKLY' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
    return new Date(now + delta).toISOString()
}

function seedScheduled(): ScheduledSend[] {
    const now = new Date().toISOString()
    return [
        {
            id: 'sched_seed_payroll',
            accountId: 'pta-demo-main',
            recipient: 'ops@partner-payroll',
            amount: '250000000',
            frequency: 'WEEKLY',
            payoutMethod: 'BANK',
            corridor: 'US-PH',
            memo: 'Payroll reserve',
            nextExecutionAt: nextExecutionFor('WEEKLY'),
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: 'sched_seed_vendor',
            accountId: 'pta-demo-main',
            recipient: 'vendor:liquidity-desk',
            amount: '125000000',
            frequency: 'MONTHLY',
            payoutMethod: 'BANK',
            corridor: 'US-NG',
            memo: 'Vendor settlement',
            nextExecutionAt: nextExecutionFor('MONTHLY'),
            status: 'PAUSED',
            createdAt: now,
            updatedAt: now,
        },
    ]
}

function getStore(): MockStore {
    if (!globalStore.__genesisMockWorkflowStore) {
        globalStore.__genesisMockWorkflowStore = {
            scheduled: seedScheduled(),
            scheduledIdempotency: new Map(),
            batchIdempotency: new Map(),
        }
    }

    return globalStore.__genesisMockWorkflowStore
}

function normalizeAccountId(accountId?: string) {
    return accountId || 'pta-demo-main'
}

function scheduledId() {
    return `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function batchId() {
    return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function orderId() {
    return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function listScheduledSends(accountId?: string): ScheduledSendsResponse {
    const store = getStore()
    const resolved = normalizeAccountId(accountId)

    return {
        accountId: resolved,
        items: store.scheduled.filter((item) => item.accountId === resolved),
        fetchedAt: new Date().toISOString(),
    }
}

export function createScheduledSend(input: {
    accountId?: string
    recipient: string
    amount: string
    frequency: ScheduledSendFrequency
    payoutMethod?: string
    corridor?: string
    memo?: string
    idempotencyKey: string
}): ScheduledSendMutationResponse {
    const store = getStore()
    const existing = store.scheduledIdempotency.get(input.idempotencyKey)
    if (existing) return existing

    const now = new Date().toISOString()
    const item: ScheduledSend = {
        id: scheduledId(),
        accountId: normalizeAccountId(input.accountId),
        recipient: input.recipient,
        amount: input.amount,
        frequency: input.frequency,
        payoutMethod: input.payoutMethod || 'BANK',
        corridor: input.corridor || 'US-PH',
        memo: input.memo,
        nextExecutionAt: nextExecutionFor(input.frequency),
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
    }

    store.scheduled = [item, ...store.scheduled]

    const response = {
        item,
        idempotencyKey: input.idempotencyKey,
    }

    store.scheduledIdempotency.set(input.idempotencyKey, response)
    return response
}

export function updateScheduledSend(input: {
    id: string
    frequency?: ScheduledSendFrequency
    amount?: string
    recipient?: string
    payoutMethod?: string
    corridor?: string
    memo?: string
    status?: ScheduledSendStatus
    idempotencyKey: string
}): ScheduledSendMutationResponse | null {
    const store = getStore()
    const existing = store.scheduledIdempotency.get(input.idempotencyKey)
    if (existing) return existing

    const index = store.scheduled.findIndex((item) => item.id === input.id)
    if (index === -1) return null

    const current = store.scheduled[index]
    const nextFrequency = input.frequency || current.frequency
    const item: ScheduledSend = {
        ...current,
        recipient: input.recipient ?? current.recipient,
        amount: input.amount ?? current.amount,
        frequency: nextFrequency,
        payoutMethod: input.payoutMethod ?? current.payoutMethod,
        corridor: input.corridor ?? current.corridor,
        memo: input.memo ?? current.memo,
        status: input.status ?? current.status,
        nextExecutionAt: nextExecutionFor(nextFrequency),
        updatedAt: new Date().toISOString(),
    }

    store.scheduled[index] = item

    const response = {
        item,
        idempotencyKey: input.idempotencyKey,
    }
    store.scheduledIdempotency.set(input.idempotencyKey, response)
    return response
}

export function cancelScheduledSend(id: string, idempotencyKey: string): ScheduledSendMutationResponse | null {
    return updateScheduledSend({ id, status: 'CANCELLED', idempotencyKey })
}

export function submitBatchOperation(input: {
    accountId?: string
    rows: BatchUploadRow[]
    idempotencyKey: string
}): BatchOperationResponse {
    const store = getStore()
    const existing = store.batchIdempotency.get(input.idempotencyKey)
    if (existing) return existing

    const results = input.rows.map((row) => {
        const amount = Number(row.amount)
        const recipient = row.recipient.trim()
        const hasError = !recipient || !Number.isFinite(amount) || amount <= 0 || recipient.toLowerCase().includes('fail')

        if (hasError) {
            return {
                rowNumber: row.rowNumber,
                recipient: row.recipient,
                amount: row.amount,
                status: 'FAILED' as const,
                message: !recipient ? 'Recipient required' : amount <= 0 ? 'Amount must be positive' : 'Recipient blocked by validation rules',
                errorCode: !recipient ? 'RECIPIENT_REQUIRED' : amount <= 0 ? 'INVALID_AMOUNT' : 'RECIPIENT_BLOCKED',
            }
        }

        return {
            rowNumber: row.rowNumber,
            recipient: row.recipient,
            amount: row.amount,
            status: 'SUCCESS' as const,
            message: 'Queued for remittance execution',
            orderId: orderId(),
        }
    })

    const totalAmount = input.rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0).toString()
    const successCount = results.filter((row) => row.status === 'SUCCESS').length
    const failureCount = results.length - successCount

    const response: BatchOperationResponse = {
        operationId: batchId(),
        accountId: normalizeAccountId(input.accountId),
        submittedAt: new Date().toISOString(),
        totals: {
            totalRows: results.length,
            successCount,
            failureCount,
            totalAmount,
        },
        results,
    }

    store.batchIdempotency.set(input.idempotencyKey, response)
    return response
}
