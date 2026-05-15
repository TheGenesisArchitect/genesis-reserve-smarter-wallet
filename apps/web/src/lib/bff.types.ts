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

export interface AgenticConnectivitySnapshot {
    status: string
    database: string
    dbTime: string
    postgresVersion: string
}

export interface AgenticApprovalSnapshot {
    total: number
    valid: number
    invalid: number
    highRisk: number
    last24h: number
    byEnvironment: Record<string, number>
    lastRequestAt?: string | null
}

export interface AgenticAuditSnapshot {
    total: number
    last24h: number
    distinctAgentsSeen: number
    byOutcome: Record<string, number>
    lastEventAt?: string | null
}

export interface DashboardCommandCenter {
    connectivity: AgenticConnectivitySnapshot
    approvals: AgenticApprovalSnapshot
    audits: AgenticAuditSnapshot
    runtime?: {
        totalAgents: number
        running: number
        paused: number
        stopped: number
    }
    gtm?: {
        totalItems: number
        inProgress: number
        blocked: number
        done: number
    }
}

export interface DashboardResponse {
    accountId: string
    balance: unknown
    yield: YieldSnapshot | unknown
    history: LedgerEntry[]
    commandCenter?: DashboardCommandCenter
    fetchedAt: string
}

export interface AgentUniverseAgent {
    id: string
    name: string
    domain: string
    mode: string
    owner: string
    actionClasses: string[]
    environmentScope: string[]
    kpis: string[]
    runtimeState: 'RUNNING' | 'PAUSED' | 'STOPPED'
    runtimeEnvironment: 'dev' | 'staging' | 'prod'
    runtimeUpdatedAt?: string | null
    runtimeReason?: string | null
}

export interface AgentUniverseRegistryResponse {
    version: string
    status: string
    updatedAt: string
    agents: AgentUniverseAgent[]
}

export interface AgentLifecycleActionResponse {
    lifecycleEventId: string
    requestId: string
    agentId: string
    action: 'START' | 'PAUSE' | 'STOP'
    fromState: 'RUNNING' | 'PAUSED' | 'STOPPED'
    toState: 'RUNNING' | 'PAUSED' | 'STOPPED'
    targetEnvironment: 'dev' | 'staging' | 'prod'
    status: 'APPLIED' | 'REJECTED'
}

export interface AgentLifecycleStateSnapshot {
    agentId: string
    runtimeState: 'RUNNING' | 'PAUSED' | 'STOPPED'
    targetEnvironment: 'dev' | 'staging' | 'prod'
    updatedAt?: string | null
    reason?: string | null
    updatedBy?: string | null
}

export interface AgentLifecycleEvent {
    lifecycle_event_id: string
    request_id: string
    action: 'START' | 'PAUSE' | 'STOP'
    from_state: 'RUNNING' | 'PAUSED' | 'STOPPED' | null
    to_state: 'RUNNING' | 'PAUSED' | 'STOPPED'
    target_environment: 'dev' | 'staging' | 'prod'
    status: 'APPLIED' | 'REJECTED'
    reason?: string | null
    created_at: string
}

export interface AgentLifecycleHistoryResponse {
    state: AgentLifecycleStateSnapshot
    events: AgentLifecycleEvent[]
}

export interface LaunchPipelineItem {
    pipeline_item_id: string
    track: string
    stage: string
    owner: string
    title: string
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'
    target_date?: string | null
    metadata?: Record<string, unknown>
    updated_at?: string
}

export interface AgentUniverseLaunchResponse {
    kpis: DashboardCommandCenter
    gtmPipeline: LaunchPipelineItem[]
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

export interface AccountSummary {
    accountId: string
    label?: string
    mode?: unknown
}

export interface AccountsResponse {
    accounts: AccountSummary[]
    activeAccountId?: string
    fetchedAt: string
}

// ─── Send Flow Types ───────────────────────────────────────────────────────

export interface SendQuoteResponse {
    quoteId: string
    rate: string
    spread: number
    deliveryEstimate: string
    fee: string
    netAmount: string
    expiresAt: string
    [key: string]: unknown
}

export interface ComplianceScreenResponse {
    sanctioned: boolean
    screeningStatus: string
    screeningId?: string
    details?: Record<string, unknown>
}

export interface SendOrderResponse {
    orderId: string
    reservationId: string
    amount: string
    fee: string
    status: string
    createdAt: string
    [key: string]: unknown
}

export interface FinalizeSendResponse {
    status: string
    txHash?: string
    completedAt: string
    [key: string]: unknown
}

// ─── Remittance Recipients Types ───────────────────────────────────────────

export interface RemittanceRecipient {
    recipientId: string
    accountId: string
    displayName: string
    recipientType: 'INDIVIDUAL' | 'BUSINESS'
    corridor: string
    payoutMethod: string
    recipientAddress?: string
    recipientName?: string
    recipientPhone?: string
    recipientEmail?: string
    bankCode?: string
    bankName?: string
    branchCode?: string
    accountNumber?: string
    accountType?: 'CHECKING' | 'SAVINGS' | 'MONEYLENDER'
    mobileProvider?: string
    mobileNumber?: string
    verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED'
    verifiedAt?: string
    memo?: string
    isDefault: boolean
    status: string
    createdAt: string
    updatedAt: string
    [key: string]: unknown
}

export interface RecipientsListResponse {
    accountId: string
    recipients: RemittanceRecipient[]
    fetchedAt: string
}

// ─── Analytics Types ───────────────────────────────────────────────────────

export interface StrategyAllocationSummary {
    name: string
    deployedUsdc: string
    pct: number
    apy: number
    riskScore: number
    bandLabel: string
    bandColor: string
}

export interface YieldHistoryPoint {
    timestamp: number
    apy: number
    yieldUsdc: string
}

export interface AnalyticsResponse {
    accountId: string
    blendedApy: number
    totalDeployedUsdc: string
    liquidBufferUsdc: string
    earnedTodayUsdc: string
    earnedAllTimeUsdc: string
    strategyAllocations: StrategyAllocationSummary[]
    apyHistory: YieldHistoryPoint[]
    epochNumber: number
    secondsToNextHarvest: number
    fetchedAt: string
}

// ─── Scheduled Sends Types ────────────────────────────────────────────────

export type ScheduledSendFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type ScheduledSendStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED'

export interface ScheduledSend {
    id: string
    accountId: string
    recipient: string
    amount: string
    frequency: ScheduledSendFrequency
    payoutMethod: string
    corridor: string
    memo?: string
    nextExecutionAt: string
    status: ScheduledSendStatus
    createdAt: string
    updatedAt: string
}

export interface ScheduledSendsResponse {
    accountId: string
    items: ScheduledSend[]
    fetchedAt: string
}

export interface ScheduledSendMutationResponse {
    item: ScheduledSend
    idempotencyKey: string
}

// ─── Batch Operations Types ───────────────────────────────────────────────

export interface BatchUploadRow {
    rowNumber: number
    recipient: string
    amount: string
    corridor: string
    payoutMethod: string
    memo?: string
}

export interface BatchOperationResult {
    rowNumber: number
    recipient: string
    amount: string
    status: 'SUCCESS' | 'FAILED'
    message: string
    orderId?: string
    errorCode?: string
}

export interface BatchOperationTotals {
    totalRows: number
    successCount: number
    failureCount: number
    totalAmount: string
}

export interface BatchOperationResponse {
    operationId: string
    accountId: string
    submittedAt: string
    totals: BatchOperationTotals
    results: BatchOperationResult[]
}

// ─── Compliance View Types ────────────────────────────────────────────────

export type ComplianceTier = 'BASIC' | 'ENHANCED' | 'INSTITUTIONAL'

export interface ComplianceViewResponse {
    walletAddress: string
    kycTier: ComplianceTier
    sanctioned: boolean
    pendingReview: boolean
    amlStatus: 'CLEAR' | 'REVIEW' | 'BLOCKED'
    canDeposit: boolean
    canSend: boolean
    dailyLimit: number
    txLimit: number
    travelRuleRequired: boolean
    fetchedAt: string
}

// ─── Partner Admin Types ──────────────────────────────────────────────────

export interface AdminStatCard {
    key: string
    label: string
    value: string
    delta?: string
}

export interface AdminUserSummary {
    userId: string
    displayName: string
    initials: string
    kycTier: ComplianceTier
    status: 'ACTIVE' | 'PENDING' | 'RESTRICTED'
    volumeUsdc: string
}

export interface AdminFeatureFlag {
    key: string
    label: string
    description: string
    enabled: boolean
}

export interface AdminQueueItem {
    id: string
    category: string
    subject: string
    amountUsdc?: string
    ageLabel: string
    status: 'PENDING' | 'REVIEW' | 'AWAITING' | 'ESCALATED'
}

export interface AdminConsoleResponse {
    stats: AdminStatCard[]
    users: AdminUserSummary[]
    featureFlags: AdminFeatureFlag[]
    queue: AdminQueueItem[]
    fetchedAt: string
}

// ─── Settings View Types ──────────────────────────────────────────────────

export interface ContractRegistryEntry {
    name: string
    address: string
    network: string
    status: 'LIVE' | 'WARNING' | 'OFFLINE'
    warning?: string
}

export interface ApiKeySummary {
    label: string
    maskedKey: string
    lastRotatedAt: string
}

export interface NetworkStatusSummary {
    network: string
    chainId: number
    bundler: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
    paymaster: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
    rpc: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
}

export interface SettingsResponse {
    walletAddress: string
    contracts: ContractRegistryEntry[]
    apiKey: ApiKeySummary
    network: NetworkStatusSummary
    fetchedAt: string
}

// ─── Agentic Build Drilldown Types ────────────────────────────────────────

export type PipelineProvider = 'github-actions' | 'internal'
export type PipelineRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
export type PipelinePromotionState = 'NONE' | 'READY' | 'APPROVED' | 'DEPLOYED' | 'REJECTED'
export type ReviewType = 'functional' | 'qa' | 'orchestrator'
export type ReviewVerdict = 'approve' | 'decline' | 'conditional_approve' | 'rework_required' | 'blocked'

export interface BuildPipelineRun {
    run_id: string
    pipeline_item_id: string
    track: string
    provider: PipelineProvider
    workflow_ref: string
    branch: string
    commit_sha?: string | null
    external_run_id?: string | null
    status: PipelineRunStatus
    promotion_state: PipelinePromotionState
    triggered_by?: string | null
    target_environment: 'dev' | 'staging' | 'prod'
    metadata?: Record<string, unknown>
    started_at?: string | null
    completed_at?: string | null
    created_at: string
    updated_at: string
}

export interface BuildPipelineRunEvent {
    run_event_id: string
    run_id: string
    event_type: string
    status?: PipelineRunStatus | null
    notes?: string | null
    payload?: Record<string, unknown>
    created_at: string
}

export interface BuildPipelineRunDetailResponse {
    run: BuildPipelineRun
    events: BuildPipelineRunEvent[]
}

export interface BuildPipelinePromoteResponse {
    run: BuildPipelineRun
    promoted: boolean
    alreadyPromoted?: boolean
}

export interface BuildRunDrilldownResponse {
    runId: string
    summary: Record<string, unknown>
    details: {
        pipelineItem: Record<string, unknown>
        criticalEvents: Array<Record<string, unknown> & { severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }>
        reviewEvents: Record<string, unknown>[]
    }
    ecosystemImpact: {
        targetEnvironment: string
        status: string
        failedEvents: number
        riskScore: number
        blastRadius: 'low' | 'medium' | 'high'
        owner: string | null
        potentiallyImpactedDomains: string[]
        durationMinutes: number | null
    }
    responsibility: {
        primaryOwner: string | null
        responsibleAgents: string[]
    }
    optimization: {
        recommendations: string[]
        canOptimize: boolean
    }
    fetchedAt: string
}

export interface BuildRunReviewSubmitResponse {
    runId: string
    pipelineItemId: string
    review: {
        runId: string
        reviewType: ReviewType
        verdict: ReviewVerdict
        reviewedBy: string
        reviewedAt: string
        ecosystemImpact?: unknown
        optimizationRecommendations: unknown[]
        metadata?: Record<string, unknown>
    }
    event: Record<string, unknown>
}

// ─── Vault Upgrade BFF Types ─────────────────────────────────────────────

export type VaultIntentTier = 'preserve' | 'grow' | 'accelerate'
export type VaultRiskLevel = 'low' | 'medium' | 'high'
export type VaultLiquidityWindow = 'instant' | 'same_day' | 'scheduled'

export interface VaultRejectedCandidate {
    strategyId: string
    protocol: string
    chain: string
    netApyPct: string
    riskLevel: VaultRiskLevel
    liquidityWindow: VaultLiquidityWindow
    feeBps: number
    paused: boolean
    availableActions: Array<'lend' | 'withdraw'>
    reason: string
}

export interface VaultScanMeta {
    pagesFetched: number
    fetchedCandidates: number
    normalizedCandidates: number
    dedupedCandidates: number
    requestedChainScope?: string[]
    effectiveChainScope?: string[]
    watchlistEnabled?: boolean
    watchlistMinApyPct?: number
    watchlistMinCandidates?: number
    promotedChains?: string[]
    watchlistCandidateCountsByChain?: Record<string, number>
    candidateCountsByChain?: Record<string, number>
    candidateCountsByProtocol?: Record<string, number>
    postChainScopeCount?: number
    postEligibilityCount?: number
    postCategoryFilterCount?: number
    protocolCount: number
    protocolsTop: string[]
    relaxationLevel?: number
    rejectedByReason?: Record<string, number>
    rejectedCandidates?: VaultRejectedCandidate[]
}

export interface VaultApiMeta {
    fetchedAt: string
    source: 'genesis' | 'deframe' | 'hybrid' | 'fallback'
    requestId?: string
    scan?: VaultScanMeta
}

export interface PendleMaturityInfo {
    expiryDate: string // ISO 8601 date string
    daysUntilExpiry: number
    yieldLockWarning: boolean // true if expiry < 30 days
}

export type SuppressionReason = 'apy_ceiling' | 'accreditation_required' | 'maturity_too_near'

export interface StrategySuppressionMetadata {
    reason: SuppressionReason
    details?: string // e.g., "APY 8.5% exceeds protocol ceiling of 8%"
}

export interface VaultStrategySummary {
    strategyId: string
    label: string
    protocol: string
    chain: string
    chainId: number
    netApyPct: string
    avgApyPct?: string
    inceptionApyPct?: string
    riskLevel: VaultRiskLevel
    liquidityWindow: VaultLiquidityWindow
    feeBps: number
    paused: boolean
    availableActions: Array<'lend' | 'withdraw'>
    pendleMaturity?: PendleMaturityInfo
    suppression?: StrategySuppressionMetadata
    accreditationRequired?: boolean // Maple protocol requirement
}

export interface VaultStrategiesResponse {
    intentTier: VaultIntentTier
    recommendedStrategyId: string | null
    recommendationReason: string
    strategies: VaultStrategySummary[]
    meta: VaultApiMeta
}

export interface VaultProtocolRegistryItem {
    protocol: string
    strategyCount: number
    lendableCount: number
    pausedCount: number
    chains: string[]
    riskBands: VaultRiskLevel[]
    minApyPct: number
    p50ApyPct: number
    maxApyPct: number
    representativeStrategyIds: string[]
    availableForTiers: VaultIntentTier[]
}

export interface VaultProtocolRegistryResponse {
    items: VaultProtocolRegistryItem[]
    meta: {
        fetchedAt: string
        source: 'deframe' | 'fallback'
        pagesFetched: number
        fetchedCandidates: number
        effectiveChainScope: string[]
    }
}

export interface VaultStrategyDetailResponse {
    strategy: VaultStrategySummary
    deFiDepth: {
        protocolMix: Array<{ name: string; weightPct: string }>
        chainExposure: Array<{ chain: string; weightPct: string }>
        apyStability: {
            volatilityBand: 'low' | 'medium' | 'high'
            drawdownPct: string
        }
    }
    meta: VaultApiMeta
}

export interface VaultTxPlanStep {
    to: string
    data: string
    value: string
    chainId: number
}

export interface VaultDepositPlanResponse {
    planId: string
    strategyId: string
    action: 'lend'
    amountAtomic: string
    amountUsd: string
    isCrossChain: boolean
    isSameChainSwap: boolean
    crossChainQuoteId: string | null
    estimatedSettlementSeconds: number
    transactionPlan: VaultTxPlanStep[]
    meta: VaultApiMeta
}

export interface VaultWithdrawPlanResponse {
    planId: string
    strategyId: string
    action: 'withdraw'
    amountAtomic: string
    amountUsd: string
    availableNowUsd: string
    scheduledUsd: string
    projectedApyAfterWithdrawPct: string
    estimatedSettlementSeconds: number
    transactionPlan: VaultTxPlanStep[]
    meta: VaultApiMeta
}

export interface VaultPositionSummary {
    totalBalanceUsd: string
    principalUsd: string
    profitUsd: string
    blendedApyPct: string
    yieldTodayUsd: string
    lastUpdatedAt: string
}

export interface VaultPositionItem {
    strategyId: string
    label: string
    protocol: string
    chain: string
    chainId: number
    status: 'active' | 'pending' | 'paused'
    currentPositionUsd: string
    principalUsd: string
    profitUsd: string
    apyPct: string
    avgApyPct: string
    inceptionApyPct: string
    liquidityWindow: VaultLiquidityWindow
    currentPosition?: Record<string, unknown>
}

export interface VaultPositionsResponse {
    walletAddress: string
    summary: VaultPositionSummary
    positions: VaultPositionItem[]
    health: {
        circuitBreakerActive: boolean
        usdcPrice: string
        alerts: Array<Record<string, unknown>>
    }
    meta: VaultApiMeta
}

// ─── Yield Monitor BFF Types ─────────────────────────────────────────────

export type YieldMonitorAlertReason = 'promotable_now'

export interface YieldMonitorAlert {
    strategyId: string
    protocol: string
    chain: string
    netApyPct: string
    promotableTiers: VaultIntentTier[]
    reason: YieldMonitorAlertReason
}

export interface YieldMonitorGlobalRange {
    minApyPct: number
    p50ApyPct: number
    p75ApyPct: number
    p90ApyPct: number
    maxApyPct: number
    totalPositiveApy: number
    activeLendableCount: number
}

export interface YieldMonitorChainRange {
    chain: string
    count: number
    minApyPct: number
    p50ApyPct: number
    p75ApyPct: number
    p90ApyPct: number
    maxApyPct: number
}

export interface YieldMonitorPromotableSummary {
    preserve: number
    grow: number
    accelerate: number
    totalDistinct: number
}

export interface YieldMonitorPausedWatchlistItem {
    strategy: VaultStrategySummary
    currentApyPct: number
    bestEligibleTier: VaultIntentTier | null
    promotableTiers: VaultIntentTier[]
    blockedReasonsByTier: Partial<Record<VaultIntentTier, string>>
}

export interface YieldMonitorPausedWatchlistSummary {
    totalPausedPositiveApy: number
    promotableNow: number
}

export interface YieldMonitorResponse {
    globalRange: YieldMonitorGlobalRange
    rangesByChain: YieldMonitorChainRange[]
    promotableSummary: YieldMonitorPromotableSummary
    alerts: YieldMonitorAlert[]
    topPromotable: VaultStrategySummary[]
    pausedWatchlist: {
        summary: YieldMonitorPausedWatchlistSummary
        items: YieldMonitorPausedWatchlistItem[]
    }
    meta: {
        fetchedAt: string
        source: 'deframe' | 'fallback'
        pagesFetched: number
        fetchedCandidates: number
    }
}
