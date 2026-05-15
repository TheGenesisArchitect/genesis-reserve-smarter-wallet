export interface BffErrorResponse {
    error: string
    detail?: string
}

export interface YieldSnapshot {
    blendedApy?: number
    projected24hYield?: string
    strategyBreakdown?: Record<string, number>
    [key: string]: unknown
}

export interface LedgerEntry {
    id: string
    entryType: string
    amount: string
    createdAt: string
    metadata?: Record<string, unknown>
}

export interface DashboardResponse {
    accountId: string
    balance: unknown
    yield: YieldSnapshot | unknown
    history: LedgerEntry[]
    fetchedAt: string
}

export interface HistoryResponse {
    accountId: string
    entries: LedgerEntry[]
    fetchedAt: string
}

export interface YieldResponse {
    accountId: string
    yield: YieldSnapshot | unknown
    fetchedAt: string
}
