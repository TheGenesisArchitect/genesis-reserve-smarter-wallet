import { z } from 'zod'

const UnknownRecordSchema = z.record(z.string(), z.unknown())

export const BffErrorResponseSchema = z.object({
    error: z.string(),
    detail: z.string().optional(),
})

export const YieldSnapshotSchema = z.object({
    blendedApy: z.number().optional(),
    projected24hYield: z.string().optional(),
    strategyBreakdown: z.record(z.string(), z.number()).optional(),
}).catchall(z.unknown())

export const LedgerEntrySchema = z.object({
    id: z.string(),
    entryType: z.string(),
    amount: z.string(),
    createdAt: z.string(),
    metadata: UnknownRecordSchema.optional(),
})

export const AgenticConnectivitySnapshotSchema = z.object({
    status: z.string(),
    database: z.string(),
    dbTime: z.string(),
    postgresVersion: z.string(),
})

export const AgenticApprovalSnapshotSchema = z.object({
    total: z.number(),
    valid: z.number(),
    invalid: z.number(),
    highRisk: z.number(),
    last24h: z.number(),
    byEnvironment: z.record(z.string(), z.number()),
    lastRequestAt: z.string().nullable().optional(),
})

export const AgenticAuditSnapshotSchema = z.object({
    total: z.number(),
    last24h: z.number(),
    distinctAgentsSeen: z.number(),
    byOutcome: z.record(z.string(), z.number()),
    lastEventAt: z.string().nullable().optional(),
})

export const DashboardCommandCenterSchema = z.object({
    connectivity: AgenticConnectivitySnapshotSchema,
    approvals: AgenticApprovalSnapshotSchema,
    audits: AgenticAuditSnapshotSchema,
    runtime: z.object({
        totalAgents: z.number(),
        running: z.number(),
        paused: z.number(),
        stopped: z.number(),
    }).optional(),
    gtm: z.object({
        totalItems: z.number(),
        inProgress: z.number(),
        blocked: z.number(),
        done: z.number(),
    }).optional(),
})

export const DashboardResponseSchema = z.object({
    accountId: z.string(),
    balance: z.unknown(),
    yield: YieldSnapshotSchema.or(z.unknown()),
    history: z.array(LedgerEntrySchema),
    commandCenter: DashboardCommandCenterSchema.optional(),
    fetchedAt: z.string(),
})

export const AgentUniverseAgentSchema = z.object({
    id: z.string(),
    name: z.string(),
    domain: z.string(),
    mode: z.string(),
    owner: z.string(),
    actionClasses: z.array(z.string()),
    environmentScope: z.array(z.string()),
    kpis: z.array(z.string()),
    runtimeState: z.enum(['RUNNING', 'PAUSED', 'STOPPED']),
    runtimeEnvironment: z.enum(['dev', 'staging', 'prod']),
    runtimeUpdatedAt: z.string().nullable().optional(),
    runtimeReason: z.string().nullable().optional(),
})

export const AgentUniverseRegistryResponseSchema = z.object({
    version: z.string(),
    status: z.string(),
    updatedAt: z.string(),
    agents: z.array(AgentUniverseAgentSchema),
})

export const AgentLifecycleActionResponseSchema = z.object({
    lifecycleEventId: z.string(),
    requestId: z.string(),
    agentId: z.string(),
    action: z.enum(['START', 'PAUSE', 'STOP']),
    fromState: z.enum(['RUNNING', 'PAUSED', 'STOPPED']),
    toState: z.enum(['RUNNING', 'PAUSED', 'STOPPED']),
    targetEnvironment: z.enum(['dev', 'staging', 'prod']),
    status: z.enum(['APPLIED', 'REJECTED']),
})

export const AgentLifecycleStateSnapshotSchema = z.object({
    agentId: z.string(),
    runtimeState: z.enum(['RUNNING', 'PAUSED', 'STOPPED']),
    targetEnvironment: z.enum(['dev', 'staging', 'prod']),
    updatedAt: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    updatedBy: z.string().nullable().optional(),
})

export const AgentLifecycleEventSchema = z.object({
    lifecycle_event_id: z.string(),
    request_id: z.string(),
    action: z.enum(['START', 'PAUSE', 'STOP']),
    from_state: z.enum(['RUNNING', 'PAUSED', 'STOPPED']).nullable(),
    to_state: z.enum(['RUNNING', 'PAUSED', 'STOPPED']),
    target_environment: z.enum(['dev', 'staging', 'prod']),
    status: z.enum(['APPLIED', 'REJECTED']),
    reason: z.string().nullable().optional(),
    created_at: z.string(),
})

export const AgentLifecycleHistoryResponseSchema = z.object({
    state: AgentLifecycleStateSnapshotSchema,
    events: z.array(AgentLifecycleEventSchema),
})

export const LaunchPipelineItemSchema = z.object({
    pipeline_item_id: z.string(),
    track: z.string(),
    stage: z.string(),
    owner: z.string(),
    title: z.string(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE']),
    target_date: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    updated_at: z.string().optional(),
})

export const AgentUniverseLaunchResponseSchema = z.object({
    kpis: DashboardCommandCenterSchema,
    gtmPipeline: z.array(LaunchPipelineItemSchema),
})

export const HistoryResponseSchema = z.object({
    accountId: z.string(),
    entries: z.array(LedgerEntrySchema),
    fetchedAt: z.string(),
})

export const YieldResponseSchema = z.object({
    accountId: z.string(),
    yield: YieldSnapshotSchema.or(z.unknown()),
    fetchedAt: z.string(),
})

export const AccountSummarySchema = z.object({
    accountId: z.string(),
    label: z.string().optional(),
    mode: z.unknown().optional(),
})

export const AccountsResponseSchema = z.object({
    accounts: z.array(AccountSummarySchema),
    activeAccountId: z.string().optional(),
    fetchedAt: z.string(),
})

export const SendQuoteResponseSchema = z.object({
    quoteId: z.string(),
    rate: z.string(),
    spread: z.number(),
    deliveryEstimate: z.string(),
    fee: z.string(),
    netAmount: z.string(),
    expiresAt: z.string(),
}).catchall(z.unknown())

export const ComplianceScreenResponseSchema = z.object({
    sanctioned: z.boolean(),
    screeningStatus: z.string(),
    screeningId: z.string().optional(),
    details: UnknownRecordSchema.optional(),
})

export const SendOrderResponseSchema = z.object({
    orderId: z.string(),
    reservationId: z.string(),
    amount: z.string(),
    fee: z.string(),
    status: z.string(),
    createdAt: z.string(),
}).catchall(z.unknown())

export const FinalizeSendResponseSchema = z.object({
    status: z.string(),
    txHash: z.string().optional(),
    completedAt: z.string(),
}).catchall(z.unknown())

export const RemittanceRecipientSchema = z.object({
    recipientId: z.string(),
    accountId: z.string(),
    displayName: z.string(),
    recipientType: z.enum(['INDIVIDUAL', 'BUSINESS']),
    corridor: z.string(),
    payoutMethod: z.string(),
    recipientAddress: z.string().optional(),
    recipientName: z.string().optional(),
    recipientPhone: z.string().optional(),
    recipientEmail: z.string().optional(),
    bankCode: z.string().optional(),
    bankName: z.string().optional(),
    branchCode: z.string().optional(),
    accountNumber: z.string().optional(),
    accountType: z.enum(['CHECKING', 'SAVINGS', 'MONEYLENDER']).optional(),
    mobileProvider: z.string().optional(),
    mobileNumber: z.string().optional(),
    verificationStatus: z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED']),
    verifiedAt: z.string().optional(),
    memo: z.string().optional(),
    isDefault: z.boolean(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
}).catchall(z.unknown())

export const RecipientsListResponseSchema = z.object({
    accountId: z.string(),
    recipients: z.array(RemittanceRecipientSchema),
    fetchedAt: z.string(),
})

export const StrategyAllocationSummarySchema = z.object({
    name: z.string(),
    deployedUsdc: z.string(),
    pct: z.number(),
    apy: z.number(),
    riskScore: z.number(),
    bandLabel: z.string(),
    bandColor: z.string(),
})

export const YieldHistoryPointSchema = z.object({
    timestamp: z.number(),
    apy: z.number(),
    yieldUsdc: z.string(),
})

export const AnalyticsResponseSchema = z.object({
    accountId: z.string(),
    blendedApy: z.number(),
    totalDeployedUsdc: z.string(),
    liquidBufferUsdc: z.string(),
    earnedTodayUsdc: z.string(),
    earnedAllTimeUsdc: z.string(),
    strategyAllocations: z.array(StrategyAllocationSummarySchema),
    apyHistory: z.array(YieldHistoryPointSchema),
    epochNumber: z.number(),
    secondsToNextHarvest: z.number(),
    fetchedAt: z.string(),
})

export const ScheduledSendFrequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY'])
export const ScheduledSendStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED'])

export const ScheduledSendSchema = z.object({
    id: z.string(),
    accountId: z.string(),
    recipient: z.string(),
    amount: z.string(),
    frequency: ScheduledSendFrequencySchema,
    payoutMethod: z.string(),
    corridor: z.string(),
    memo: z.string().optional(),
    nextExecutionAt: z.string(),
    status: ScheduledSendStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
})

export const ScheduledSendsResponseSchema = z.object({
    accountId: z.string(),
    items: z.array(ScheduledSendSchema),
    fetchedAt: z.string(),
})

export const ScheduledSendMutationResponseSchema = z.object({
    item: ScheduledSendSchema,
    idempotencyKey: z.string(),
})

export const BatchUploadRowSchema = z.object({
    rowNumber: z.number(),
    recipient: z.string(),
    amount: z.string(),
    corridor: z.string(),
    payoutMethod: z.string(),
    memo: z.string().optional(),
})

export const BatchOperationResultSchema = z.object({
    rowNumber: z.number(),
    recipient: z.string(),
    amount: z.string(),
    status: z.enum(['SUCCESS', 'FAILED']),
    message: z.string(),
    orderId: z.string().optional(),
    errorCode: z.string().optional(),
})

export const BatchOperationTotalsSchema = z.object({
    totalRows: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    totalAmount: z.string(),
})

export const BatchOperationResponseSchema = z.object({
    operationId: z.string(),
    accountId: z.string(),
    submittedAt: z.string(),
    totals: BatchOperationTotalsSchema,
    results: z.array(BatchOperationResultSchema),
})

export const ComplianceTierSchema = z.enum(['BASIC', 'ENHANCED', 'INSTITUTIONAL'])

export const ComplianceViewResponseSchema = z.object({
    walletAddress: z.string(),
    kycTier: ComplianceTierSchema,
    sanctioned: z.boolean(),
    pendingReview: z.boolean(),
    amlStatus: z.enum(['CLEAR', 'REVIEW', 'BLOCKED']),
    canDeposit: z.boolean(),
    canSend: z.boolean(),
    dailyLimit: z.number(),
    txLimit: z.number(),
    travelRuleRequired: z.boolean(),
    fetchedAt: z.string(),
})

export const AdminStatCardSchema = z.object({
    key: z.string(),
    label: z.string(),
    value: z.string(),
    delta: z.string().optional(),
})

export const AdminUserSummarySchema = z.object({
    userId: z.string(),
    displayName: z.string(),
    initials: z.string(),
    kycTier: ComplianceTierSchema,
    status: z.enum(['ACTIVE', 'PENDING', 'RESTRICTED']),
    volumeUsdc: z.string(),
})

export const AdminFeatureFlagSchema = z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    enabled: z.boolean(),
})

export const AdminQueueItemSchema = z.object({
    id: z.string(),
    category: z.string(),
    subject: z.string(),
    amountUsdc: z.string().optional(),
    ageLabel: z.string(),
    status: z.enum(['PENDING', 'REVIEW', 'AWAITING', 'ESCALATED']),
})

export const AdminConsoleResponseSchema = z.object({
    stats: z.array(AdminStatCardSchema),
    users: z.array(AdminUserSummarySchema),
    featureFlags: z.array(AdminFeatureFlagSchema),
    queue: z.array(AdminQueueItemSchema),
    fetchedAt: z.string(),
})

export const ContractRegistryEntrySchema = z.object({
    name: z.string(),
    address: z.string(),
    network: z.string(),
    status: z.enum(['LIVE', 'WARNING', 'OFFLINE']),
    warning: z.string().optional(),
})

export const ApiKeySummarySchema = z.object({
    label: z.string(),
    maskedKey: z.string(),
    lastRotatedAt: z.string(),
})

export const NetworkStatusSummarySchema = z.object({
    network: z.string(),
    chainId: z.number(),
    bundler: z.enum(['ONLINE', 'DEGRADED', 'OFFLINE']),
    paymaster: z.enum(['ONLINE', 'DEGRADED', 'OFFLINE']),
    rpc: z.enum(['ONLINE', 'DEGRADED', 'OFFLINE']),
})

export const SettingsResponseSchema = z.object({
    walletAddress: z.string(),
    contracts: z.array(ContractRegistryEntrySchema),
    apiKey: ApiKeySummarySchema,
    network: NetworkStatusSummarySchema,
    fetchedAt: z.string(),
})

export const PipelineProviderSchema = z.enum(['github-actions', 'internal'])
export const PipelineRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED'])
export const PipelinePromotionStateSchema = z.enum(['NONE', 'READY', 'APPROVED', 'DEPLOYED', 'REJECTED'])
export const ReviewTypeSchema = z.enum(['functional', 'qa', 'orchestrator'])
export const ReviewVerdictSchema = z.enum(['approve', 'decline', 'conditional_approve', 'rework_required', 'blocked'])

export const BuildPipelineRunSchema = z.object({
    run_id: z.string(),
    pipeline_item_id: z.string(),
    track: z.string(),
    provider: PipelineProviderSchema,
    workflow_ref: z.string(),
    branch: z.string(),
    commit_sha: z.string().nullable().optional(),
    external_run_id: z.string().nullable().optional(),
    status: PipelineRunStatusSchema,
    promotion_state: PipelinePromotionStateSchema,
    triggered_by: z.string().nullable().optional(),
    target_environment: z.enum(['dev', 'staging', 'prod']),
    metadata: UnknownRecordSchema.optional(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
})

export const BuildPipelineRunEventSchema = z.object({
    run_event_id: z.string(),
    run_id: z.string(),
    event_type: z.string(),
    status: PipelineRunStatusSchema.nullable().optional(),
    notes: z.string().nullable().optional(),
    payload: UnknownRecordSchema.optional(),
    created_at: z.string(),
})

export const BuildPipelineRunDetailResponseSchema = z.object({
    run: BuildPipelineRunSchema,
    events: z.array(BuildPipelineRunEventSchema),
})

export const BuildPipelinePromoteResponseSchema = z.object({
    run: BuildPipelineRunSchema,
    promoted: z.boolean(),
    alreadyPromoted: z.boolean().optional(),
})

export const BuildRunDrilldownResponseSchema = z.object({
    runId: z.string(),
    summary: UnknownRecordSchema,
    details: z.object({
        pipelineItem: UnknownRecordSchema,
        criticalEvents: z.array(z.object({
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        }).catchall(z.unknown())),
        reviewEvents: z.array(UnknownRecordSchema),
    }),
    ecosystemImpact: z.object({
        targetEnvironment: z.string(),
        status: z.string(),
        failedEvents: z.number(),
        riskScore: z.number(),
        blastRadius: z.enum(['low', 'medium', 'high']),
        owner: z.string().nullable(),
        potentiallyImpactedDomains: z.array(z.string()),
        durationMinutes: z.number().nullable(),
    }),
    responsibility: z.object({
        primaryOwner: z.string().nullable(),
        responsibleAgents: z.array(z.string()),
    }),
    optimization: z.object({
        recommendations: z.array(z.string()),
        canOptimize: z.boolean(),
    }),
    fetchedAt: z.string(),
})

export const BuildRunReviewSubmitResponseSchema = z.object({
    runId: z.string(),
    pipelineItemId: z.string(),
    review: z.object({
        runId: z.string(),
        reviewType: ReviewTypeSchema,
        verdict: ReviewVerdictSchema,
        reviewedBy: z.string(),
        reviewedAt: z.string(),
        ecosystemImpact: z.unknown().optional().nullable(),
        optimizationRecommendations: z.array(z.unknown()),
        metadata: UnknownRecordSchema.optional(),
    }),
    event: UnknownRecordSchema,
})

// ─── Vault Upgrade BFF Schemas ───────────────────────────────────────────

export const VaultIntentTierSchema = z.enum(['preserve', 'grow', 'accelerate'])
export const VaultRiskLevelSchema = z.enum(['low', 'medium', 'high'])
export const VaultLiquidityWindowSchema = z.enum(['instant', 'same_day', 'scheduled'])
export const VaultRejectedCandidateSchema = z.object({
    strategyId: z.string(),
    protocol: z.string(),
    chain: z.string(),
    netApyPct: z.string(),
    riskLevel: VaultRiskLevelSchema,
    liquidityWindow: VaultLiquidityWindowSchema,
    feeBps: z.number(),
    paused: z.boolean(),
    availableActions: z.array(z.enum(['lend', 'withdraw'])),
    reason: z.string(),
})

export const VaultScanMetaSchema = z.object({
    pagesFetched: z.number().int().nonnegative(),
    fetchedCandidates: z.number().int().nonnegative(),
    normalizedCandidates: z.number().int().nonnegative(),
    dedupedCandidates: z.number().int().nonnegative(),
    requestedChainScope: z.array(z.string()).optional(),
    effectiveChainScope: z.array(z.string()).optional(),
    watchlistEnabled: z.boolean().optional(),
    watchlistMinApyPct: z.number().nonnegative().optional(),
    watchlistMinCandidates: z.number().int().nonnegative().optional(),
    promotedChains: z.array(z.string()).optional(),
    watchlistCandidateCountsByChain: z.record(z.string(), z.number().int().nonnegative()).optional(),
    candidateCountsByChain: z.record(z.string(), z.number().int().nonnegative()).optional(),
    candidateCountsByProtocol: z.record(z.string(), z.number().int().nonnegative()).optional(),
    postChainScopeCount: z.number().int().nonnegative().optional(),
    postEligibilityCount: z.number().int().nonnegative().optional(),
    postCategoryFilterCount: z.number().int().nonnegative().optional(),
    protocolCount: z.number().int().nonnegative(),
    protocolsTop: z.array(z.string()),
    relaxationLevel: z.number().int().nonnegative().optional(),
    rejectedByReason: z.record(z.string(), z.number().int().nonnegative()).optional(),
    rejectedCandidates: z.array(VaultRejectedCandidateSchema).optional(),
})

export const VaultApiMetaSchema = z.object({
    fetchedAt: z.string(),
    source: z.enum(['genesis', 'deframe', 'hybrid', 'fallback']),
    requestId: z.string().optional(),
    scan: VaultScanMetaSchema.optional(),
})

export const PendleMaturityInfoSchema = z.object({
    expiryDate: z.string(),
    daysUntilExpiry: z.number().int().nonnegative(),
    yieldLockWarning: z.boolean(),
})

export const SuppressionReasonSchema = z.enum(['apy_ceiling', 'accreditation_required', 'maturity_too_near'])

export const StrategySuppressionMetadataSchema = z.object({
    reason: SuppressionReasonSchema,
    details: z.string().optional(),
})

export const VaultStrategySummarySchema = z.object({
    strategyId: z.string(),
    label: z.string(),
    protocol: z.string(),
    chain: z.string(),
    chainId: z.number(),
    netApyPct: z.string(),
    avgApyPct: z.string().optional(),
    inceptionApyPct: z.string().optional(),
    riskLevel: VaultRiskLevelSchema,
    liquidityWindow: VaultLiquidityWindowSchema,
    feeBps: z.number(),
    paused: z.boolean(),
    availableActions: z.array(z.enum(['lend', 'withdraw'])),
    pendleMaturity: PendleMaturityInfoSchema.optional(),
    suppression: StrategySuppressionMetadataSchema.optional(),
    accreditationRequired: z.boolean().optional(),
})

export const VaultStrategiesResponseSchema = z.object({
    intentTier: VaultIntentTierSchema,
    recommendedStrategyId: z.string().nullable(),
    recommendationReason: z.string(),
    strategies: z.array(VaultStrategySummarySchema),
    meta: VaultApiMetaSchema,
})

export const VaultProtocolRegistryItemSchema = z.object({
    protocol: z.string(),
    strategyCount: z.number().int().nonnegative(),
    lendableCount: z.number().int().nonnegative(),
    pausedCount: z.number().int().nonnegative(),
    chains: z.array(z.string()),
    riskBands: z.array(VaultRiskLevelSchema),
    minApyPct: z.number(),
    p50ApyPct: z.number(),
    maxApyPct: z.number(),
    representativeStrategyIds: z.array(z.string()),
    availableForTiers: z.array(VaultIntentTierSchema),
})

export const VaultProtocolRegistryResponseSchema = z.object({
    items: z.array(VaultProtocolRegistryItemSchema),
    meta: z.object({
        fetchedAt: z.string(),
        source: z.enum(['deframe', 'fallback']),
        pagesFetched: z.number().int().nonnegative(),
        fetchedCandidates: z.number().int().nonnegative(),
        effectiveChainScope: z.array(z.string()),
    }),
})

export const VaultStrategyDetailResponseSchema = z.object({
    strategy: VaultStrategySummarySchema,
    deFiDepth: z.object({
        protocolMix: z.array(z.object({ name: z.string(), weightPct: z.string() })),
        chainExposure: z.array(z.object({ chain: z.string(), weightPct: z.string() })),
        apyStability: z.object({
            volatilityBand: z.enum(['low', 'medium', 'high']),
            drawdownPct: z.string(),
        }),
    }),
    meta: VaultApiMetaSchema,
})

export const VaultTxPlanStepSchema = z.object({
    to: z.string(),
    data: z.string(),
    value: z.string(),
    chainId: z.number(),
})

export const VaultDepositPlanResponseSchema = z.object({
    planId: z.string(),
    strategyId: z.string(),
    action: z.literal('lend'),
    amountAtomic: z.string(),
    amountUsd: z.string(),
    isCrossChain: z.boolean(),
    isSameChainSwap: z.boolean(),
    crossChainQuoteId: z.string().nullable(),
    estimatedSettlementSeconds: z.number(),
    transactionPlan: z.array(VaultTxPlanStepSchema),
    meta: VaultApiMetaSchema,
})

export const VaultWithdrawPlanResponseSchema = z.object({
    planId: z.string(),
    strategyId: z.string(),
    action: z.literal('withdraw'),
    amountAtomic: z.string(),
    amountUsd: z.string(),
    availableNowUsd: z.string(),
    scheduledUsd: z.string(),
    projectedApyAfterWithdrawPct: z.string(),
    estimatedSettlementSeconds: z.number(),
    transactionPlan: z.array(VaultTxPlanStepSchema),
    meta: VaultApiMetaSchema,
})

export const VaultPositionSummarySchema = z.object({
    totalBalanceUsd: z.string(),
    principalUsd: z.string(),
    profitUsd: z.string(),
    blendedApyPct: z.string(),
    yieldTodayUsd: z.string(),
    lastUpdatedAt: z.string(),
})

export const VaultPositionItemSchema = z.object({
    strategyId: z.string(),
    label: z.string(),
    protocol: z.string(),
    chain: z.string(),
    chainId: z.number(),
    status: z.enum(['active', 'pending', 'paused']),
    currentPositionUsd: z.string(),
    principalUsd: z.string(),
    profitUsd: z.string(),
    apyPct: z.string(),
    avgApyPct: z.string(),
    inceptionApyPct: z.string(),
    liquidityWindow: VaultLiquidityWindowSchema,
    currentPosition: UnknownRecordSchema.optional(),
})

export const VaultPositionsResponseSchema = z.object({
    walletAddress: z.string(),
    summary: VaultPositionSummarySchema,
    positions: z.array(VaultPositionItemSchema),
    health: z.object({
        circuitBreakerActive: z.boolean(),
        usdcPrice: z.string(),
        alerts: z.array(UnknownRecordSchema),
    }),
    meta: VaultApiMetaSchema,
})

// ─── Yield Monitor BFF Schemas ──────────────────────────────────────────

export const YieldMonitorAlertReasonSchema = z.enum(['promotable_now'])

export const YieldMonitorAlertSchema = z.object({
    strategyId: z.string(),
    protocol: z.string(),
    chain: z.string(),
    netApyPct: z.string(),
    promotableTiers: z.array(VaultIntentTierSchema),
    reason: YieldMonitorAlertReasonSchema,
})

export const YieldMonitorGlobalRangeSchema = z.object({
    minApyPct: z.number(),
    p50ApyPct: z.number(),
    p75ApyPct: z.number(),
    p90ApyPct: z.number(),
    maxApyPct: z.number(),
    totalPositiveApy: z.number().int().nonnegative(),
    activeLendableCount: z.number().int().nonnegative(),
})

export const YieldMonitorChainRangeSchema = z.object({
    chain: z.string(),
    count: z.number().int().nonnegative(),
    minApyPct: z.number(),
    p50ApyPct: z.number(),
    p75ApyPct: z.number(),
    p90ApyPct: z.number(),
    maxApyPct: z.number(),
})

export const YieldMonitorPromotableSummarySchema = z.object({
    preserve: z.number().int().nonnegative(),
    grow: z.number().int().nonnegative(),
    accelerate: z.number().int().nonnegative(),
    totalDistinct: z.number().int().nonnegative(),
})

export const YieldMonitorPausedWatchlistItemSchema = z.object({
    strategy: VaultStrategySummarySchema,
    currentApyPct: z.number(),
    bestEligibleTier: VaultIntentTierSchema.nullable(),
    promotableTiers: z.array(VaultIntentTierSchema),
    blockedReasonsByTier: z.object({
        preserve: z.string().optional(),
        grow: z.string().optional(),
        accelerate: z.string().optional(),
    }),
})

export const YieldMonitorPausedWatchlistSummarySchema = z.object({
    totalPausedPositiveApy: z.number().int().nonnegative(),
    promotableNow: z.number().int().nonnegative(),
})

export const YieldMonitorResponseSchema = z.object({
    globalRange: YieldMonitorGlobalRangeSchema,
    rangesByChain: z.array(YieldMonitorChainRangeSchema),
    promotableSummary: YieldMonitorPromotableSummarySchema,
    alerts: z.array(YieldMonitorAlertSchema),
    topPromotable: z.array(VaultStrategySummarySchema),
    pausedWatchlist: z.object({
        summary: YieldMonitorPausedWatchlistSummarySchema,
        items: z.array(YieldMonitorPausedWatchlistItemSchema),
    }),
    meta: z.object({
        fetchedAt: z.string(),
        source: z.enum(['deframe', 'fallback']),
        pagesFetched: z.number().int().nonnegative(),
        fetchedCandidates: z.number().int().nonnegative(),
    }),
})
