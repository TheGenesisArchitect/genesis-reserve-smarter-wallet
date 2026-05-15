'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSubmitPipelineRunReview } from '../hooks/useAgentBuildContracts'
import { useAgentLifecycleControl } from '../hooks/useAgentLifecycleControl'
import { useAgentLifecycleHistory, useAgentUniverseLaunch, useAgentUniverseRegistry, useBuildPipelineRunDrilldown } from '../hooks/useAgentUniverse'
import type { AgentLifecycleEvent, AgentUniverseAgent, LaunchPipelineItem, ReviewVerdict } from '../lib/bff.types'

const TRACK_LABELS: Record<string, string> = {
    'gtm': 'GTM Pipeline',
    'product-management': 'Product Management',
    'optimization-engineering': 'Optimization Engineering',
}

function badgeStyle(status: AgentUniverseAgent['runtimeState']): CSSProperties {
    if (status === 'RUNNING') return S.runtimeRunning
    if (status === 'PAUSED') return S.runtimePaused
    return S.runtimeStopped
}

function toTrackGroups(items: LaunchPipelineItem[]) {
    const map = new Map<string, LaunchPipelineItem[]>()
    for (const item of items) {
        const key = item.track || 'general'
        const list = map.get(key) ?? []
        list.push(item)
        map.set(key, list)
    }
    return map
}

function fmtStamp(value: string | null | undefined) {
    if (!value) return 'n/a'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? 'n/a' : parsed.toLocaleString()
}

function trackSummary(items: LaunchPipelineItem[]) {
    return {
        total: items.length,
        inProgress: items.filter((item) => item.status === 'IN_PROGRESS').length,
        blocked: items.filter((item) => item.status === 'BLOCKED').length,
        done: items.filter((item) => item.status === 'DONE').length,
    }
}

function eventTone(event: AgentLifecycleEvent): CSSProperties {
    if (event.status === 'REJECTED') return S.eventRejected
    if (event.action === 'STOP') return S.eventStop
    if (event.action === 'PAUSE') return S.eventPause
    return S.eventStart
}

export function AgentUniversePanel() {
    const registryQuery = useAgentUniverseRegistry()
    const launchQuery = useAgentUniverseLaunch()
    const lifecycleMutation = useAgentLifecycleControl()

    const [selectedEnvironment, setSelectedEnvironment] = useState<'dev' | 'staging' | 'prod'>('staging')
    const [controlReason, setControlReason] = useState('Launch control operation')
    const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>()
    const [approvalBy, setApprovalBy] = useState('platform-owner')
    const [approvalTicketId, setApprovalTicketId] = useState('')
    const [inboxRunId, setInboxRunId] = useState('')
    const [inboxReviewer, setInboxReviewer] = useState('platform-owner')
    const [inboxNotes, setInboxNotes] = useState('')
    const [qaVerdict, setQaVerdict] = useState<ReviewVerdict>('approve')
    const [orchestratorVerdict, setOrchestratorVerdict] = useState<ReviewVerdict>('approve')

    const lifecycleHistoryQuery = useAgentLifecycleHistory(selectedAgentId)
    const drilldownQuery = useBuildPipelineRunDrilldown(inboxRunId || undefined)
    const reviewMutation = useSubmitPipelineRunReview()

    useEffect(() => {
        const firstAgentId = registryQuery.data?.agents?.[0]?.id
        if (!selectedAgentId && firstAgentId) {
            setSelectedAgentId(firstAgentId)
        }
    }, [registryQuery.data?.agents, selectedAgentId])

    const trackGroups = useMemo(() => {
        return toTrackGroups(launchQuery.data?.gtmPipeline ?? [])
    }, [launchQuery.data?.gtmPipeline])

    const kpis = launchQuery.data?.kpis
    const selectedAgent = (registryQuery.data?.agents ?? []).find((agent) => agent.id === selectedAgentId)
    const selectedTrackSummary = trackSummary(launchQuery.data?.gtmPipeline ?? [])
    const recentEvents = lifecycleHistoryQuery.data?.events ?? []
    const stopRequiresApproval = selectedEnvironment === 'prod'
    const hasApprovalEnvelope = approvalBy.trim().length > 0 && approvalTicketId.trim().length > 0
    const inboxReady = inboxRunId.trim().length > 0 && inboxReviewer.trim().length > 0

    const submitInboxReview = (reviewType: 'functional' | 'qa' | 'orchestrator', verdict: ReviewVerdict) => {
        if (!inboxReady) return
        reviewMutation.mutate({
            runId: inboxRunId.trim(),
            reviewType,
            verdict,
            reviewedBy: inboxReviewer.trim(),
            notes: inboxNotes.trim() || undefined,
            optimizationRecommendations: [],
            metadata: {
                source: 'approval-inbox',
                environment: selectedEnvironment,
            },
        })
    }

    const onLifecycleAction = (agentId: string, action: 'START' | 'PAUSE' | 'STOP') => {
        if (action === 'STOP' && stopRequiresApproval && !hasApprovalEnvelope) {
            return
        }

        lifecycleMutation.mutate({
            agentId,
            action,
            targetEnvironment: selectedEnvironment,
            reason: controlReason,
            requestedBy: 'owner-copilot',
            ownerApproval: action === 'STOP' && stopRequiresApproval ? {
                approvedBy: approvalBy,
                approvedAt: new Date().toISOString(),
                ticketId: approvalTicketId,
            } : undefined,
        })
    }

    return (
        <div style={S.root}>
            <section className="genesis-glass-panel" style={S.heroPanel}>
                <div style={S.heroHead}>
                    <div>
                        <div style={S.sectionLabel}>AGENTIC UNIVERSE</div>
                        <h2 style={S.heroTitle}>Command Center for Product Scale, Optimization, and GTM Launch</h2>
                    </div>
                    <div style={S.controlsBlock}>
                        <label style={S.label}>Target Environment</label>
                        <select
                            value={selectedEnvironment}
                            onChange={(event) => setSelectedEnvironment(event.target.value as 'dev' | 'staging' | 'prod')}
                            style={S.select}
                        >
                            <option value="dev">Dev</option>
                            <option value="staging">Staging</option>
                            <option value="prod">Prod</option>
                        </select>
                    </div>
                </div>
                <div style={S.reasonRow}>
                    <label style={S.label}>Control Reason</label>
                    <input
                        value={controlReason}
                        onChange={(event) => setControlReason(event.target.value)}
                        style={S.input}
                        placeholder="Operational reason for lifecycle action"
                    />
                </div>
                {lifecycleMutation.isError ? (
                    <div style={S.errorBox}>Lifecycle action failed. Validate approval requirements for high-risk operations.</div>
                ) : null}
                {stopRequiresApproval ? (
                    <div style={S.approvalEnvelope}>
                        <div style={S.subSectionTitle}>Owner Approval Envelope</div>
                        <div style={S.approvalGrid}>
                            <div style={S.fieldCol}>
                                <label style={S.label}>Approved By</label>
                                <input value={approvalBy} onChange={(event) => setApprovalBy(event.target.value)} style={S.input} />
                            </div>
                            <div style={S.fieldCol}>
                                <label style={S.label}>Ticket ID</label>
                                <input value={approvalTicketId} onChange={(event) => setApprovalTicketId(event.target.value)} style={S.input} placeholder="CHG-123 / INC-456" />
                            </div>
                        </div>
                        <div style={S.approvalHint}>Prod stop actions require owner approval metadata before execution.</div>
                    </div>
                ) : null}
            </section>

            <section style={S.kpiGrid}>
                <div className="genesis-glass-panel" style={S.kpiCard}>
                    <div style={S.kpiLabel}>Runtime Agents</div>
                    <div style={S.kpiValue}>{kpis?.runtime?.totalAgents ?? 0}</div>
                    <div style={S.kpiMeta}>Running {kpis?.runtime?.running ?? 0} · Paused {kpis?.runtime?.paused ?? 0} · Stopped {kpis?.runtime?.stopped ?? 0}</div>
                </div>
                <div className="genesis-glass-panel" style={S.kpiCard}>
                    <div style={S.kpiLabel}>Approval and Audit</div>
                    <div style={S.kpiValue}>{kpis?.approvals?.last24h ?? 0}</div>
                    <div style={S.kpiMeta}>Approvals 24h · Audit events {kpis?.audits?.last24h ?? 0}</div>
                </div>
                <div className="genesis-glass-panel" style={S.kpiCard}>
                    <div style={S.kpiLabel}>Launch Pipeline</div>
                    <div style={S.kpiValue}>{kpis?.gtm?.totalItems ?? 0}</div>
                    <div style={S.kpiMeta}>In Progress {kpis?.gtm?.inProgress ?? 0} · Blocked {kpis?.gtm?.blocked ?? 0}</div>
                </div>
            </section>

            <section className="genesis-glass-panel" style={S.sectionPanel}>
                <div style={S.sectionTitle}>Mission Board</div>
                <div style={S.missionGrid}>
                    <div style={S.missionCard}>
                        <div style={S.missionLabel}>Execution</div>
                        <div style={S.missionValue}>{selectedTrackSummary.inProgress}</div>
                        <div style={S.missionMeta}>workstreams actively progressing</div>
                    </div>
                    <div style={S.missionCard}>
                        <div style={S.missionLabel}>Blocked</div>
                        <div style={S.missionValue}>{selectedTrackSummary.blocked}</div>
                        <div style={S.missionMeta}>items requiring intervention</div>
                    </div>
                    <div style={S.missionCard}>
                        <div style={S.missionLabel}>Completed</div>
                        <div style={S.missionValue}>{selectedTrackSummary.done}</div>
                        <div style={S.missionMeta}>launch items closed</div>
                    </div>
                </div>
            </section>

            <section className="genesis-glass-panel" style={S.sectionPanel}>
                <div style={S.sectionTitle}>Agent Registry and Controls</div>
                {registryQuery.isLoading ? <div style={S.empty}>Loading agents...</div> : null}
                {registryQuery.isError ? <div style={S.errorBox}>Unable to load agent registry runtime.</div> : null}
                <div style={S.agentGrid}>
                    {(registryQuery.data?.agents ?? []).map((agent) => (
                        <article key={agent.id} style={{ ...S.agentCard, ...(selectedAgentId === agent.id ? S.agentCardActive : null) }} onClick={() => setSelectedAgentId(agent.id)}>
                            <div style={S.agentHead}>
                                <div>
                                    <div style={S.agentName}>{agent.name}</div>
                                    <div style={S.agentMeta}>{agent.domain} · {agent.mode}</div>
                                </div>
                                <span style={{ ...S.runtimeBadge, ...badgeStyle(agent.runtimeState) }}>{agent.runtimeState}</span>
                            </div>
                            <div style={S.agentKpi}>KPIs: {agent.kpis.slice(0, 2).join(' · ')}</div>
                            <div style={S.actionRow}>
                                <button style={S.controlBtn} onClick={() => onLifecycleAction(agent.id, 'START')}>Start</button>
                                <button style={S.controlBtn} onClick={() => onLifecycleAction(agent.id, 'PAUSE')}>Pause</button>
                                <button style={{ ...S.controlBtnDanger, ...(stopRequiresApproval && !hasApprovalEnvelope ? S.controlBtnDisabled : null) }} onClick={() => onLifecycleAction(agent.id, 'STOP')}>Stop</button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section style={S.detailGrid}>
                <div className="genesis-glass-panel" style={S.sectionPanel}>
                    <div style={S.sectionTitle}>Approval Inbox and Selected Agent</div>
                    <div style={S.approvalInboxGrid}>
                        <div style={S.inboxCard}>
                            <div style={S.missionLabel}>High Risk Queue</div>
                            <div style={S.inboxValue}>{kpis?.approvals?.highRisk ?? 0}</div>
                        </div>
                        <div style={S.inboxCard}>
                            <div style={S.missionLabel}>Prod Requests</div>
                            <div style={S.inboxValue}>{kpis?.approvals?.byEnvironment?.prod ?? 0}</div>
                        </div>
                    </div>
                    <div style={S.inboxActionPanel}>
                        <div style={S.subSectionTitle}>Actionable Review Inbox</div>
                        <div style={S.inboxActionGrid}>
                            <div style={S.fieldCol}>
                                <label style={S.label}>Run ID</label>
                                <input
                                    value={inboxRunId}
                                    onChange={(event) => setInboxRunId(event.target.value)}
                                    style={S.input}
                                    placeholder="run_xxx"
                                />
                            </div>
                            <div style={S.fieldCol}>
                                <label style={S.label}>Reviewer</label>
                                <input
                                    value={inboxReviewer}
                                    onChange={(event) => setInboxReviewer(event.target.value)}
                                    style={S.input}
                                    placeholder="platform-owner"
                                />
                            </div>
                        </div>
                        <div style={S.reasonRow}>
                            <label style={S.label}>Inbox Note</label>
                            <input
                                value={inboxNotes}
                                onChange={(event) => setInboxNotes(event.target.value)}
                                style={S.input}
                                placeholder="Reason, risk, or disposition note"
                            />
                        </div>
                        <div style={S.inboxActionRow}>
                            <button
                                type="button"
                                style={{ ...S.controlBtn, ...(inboxReady ? null : S.controlBtnDisabled) }}
                                onClick={() => submitInboxReview('functional', 'approve')}
                            >
                                Functional Approve
                            </button>
                            <button
                                type="button"
                                style={{ ...S.controlBtnDanger, ...(inboxReady ? null : S.controlBtnDisabled) }}
                                onClick={() => submitInboxReview('functional', 'decline')}
                            >
                                Functional Decline
                            </button>
                            <button
                                type="button"
                                style={{ ...S.controlBtn, ...(inboxReady ? null : S.controlBtnDisabled) }}
                                onClick={() => submitInboxReview('qa', qaVerdict)}
                            >
                                QA Review
                            </button>
                            <button
                                type="button"
                                style={{ ...S.controlBtn, ...(inboxReady ? null : S.controlBtnDisabled) }}
                                onClick={() => submitInboxReview('orchestrator', orchestratorVerdict)}
                            >
                                Orchestrator Review
                            </button>
                        </div>
                        <div style={S.inboxActionGrid}>
                            <div style={S.fieldCol}>
                                <label style={S.label}>QA Verdict</label>
                                <select value={qaVerdict} onChange={(event) => setQaVerdict(event.target.value as ReviewVerdict)} style={S.select}>
                                    <option value="approve">approve</option>
                                    <option value="conditional_approve">conditional_approve</option>
                                    <option value="rework_required">rework_required</option>
                                    <option value="blocked">blocked</option>
                                </select>
                            </div>
                            <div style={S.fieldCol}>
                                <label style={S.label}>Orchestrator Verdict</label>
                                <select value={orchestratorVerdict} onChange={(event) => setOrchestratorVerdict(event.target.value as ReviewVerdict)} style={S.select}>
                                    <option value="approve">approve</option>
                                    <option value="conditional_approve">conditional_approve</option>
                                    <option value="rework_required">rework_required</option>
                                    <option value="blocked">blocked</option>
                                </select>
                            </div>
                        </div>
                        {drilldownQuery.data ? (
                            <div style={S.approvalHint}>
                                Run status {String(drilldownQuery.data.summary.status ?? 'n/a')} · Risk {drilldownQuery.data.ecosystemImpact.riskScore}
                                {' '}· Reviews {drilldownQuery.data.details.reviewEvents.length}
                            </div>
                        ) : null}
                        {reviewMutation.isError ? (
                            <div style={S.errorBox}>Inbox action failed. Validate run_id and reviewer inputs.</div>
                        ) : null}
                        {reviewMutation.isSuccess ? (
                            <div style={S.approvalHint}>
                                Inbox action recorded: {reviewMutation.data.review.reviewType} · {reviewMutation.data.review.verdict}
                            </div>
                        ) : null}
                    </div>
                    {selectedAgent ? (
                        <div style={S.selectedAgentPanel}>
                            <div style={S.subSectionTitle}>{selectedAgent.name}</div>
                            <div style={S.selectedAgentMeta}>{selectedAgent.domain} · owner {selectedAgent.owner} · mode {selectedAgent.mode}</div>
                            <div style={S.selectedAgentMeta}>Runtime {selectedAgent.runtimeState} in {selectedAgent.runtimeEnvironment} · updated {fmtStamp(selectedAgent.runtimeUpdatedAt)}</div>
                            <div style={S.selectedAgentMeta}>Reason: {selectedAgent.runtimeReason || 'none'}</div>
                        </div>
                    ) : <div style={S.empty}>Select an agent to inspect control history.</div>}
                </div>

                <div className="genesis-glass-panel" style={S.sectionPanel}>
                    <div style={S.sectionTitle}>Workflow Timeline and Audit Playback</div>
                    {lifecycleHistoryQuery.isLoading ? <div style={S.empty}>Loading lifecycle history...</div> : null}
                    {lifecycleHistoryQuery.isError ? <div style={S.errorBox}>Unable to load lifecycle history.</div> : null}
                    <div style={S.timelineList}>
                        {recentEvents.length === 0 ? <div style={S.empty}>No lifecycle events recorded yet.</div> : recentEvents.map((event) => (
                            <div key={event.lifecycle_event_id} style={S.timelineItem}>
                                <div style={S.timelineHead}>
                                    <span style={{ ...S.timelineBadge, ...eventTone(event) }}>{event.action}</span>
                                    <span style={S.timelineStamp}>{fmtStamp(event.created_at)}</span>
                                </div>
                                <div style={S.timelineMeta}>{event.from_state || 'n/a'} to {event.to_state} · {event.target_environment} · {event.status}</div>
                                <div style={S.timelineMeta}>{event.reason || 'No operator note provided.'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="genesis-glass-panel" style={S.sectionPanel}>
                <div style={S.sectionTitle}>Build Through GTM</div>
                <div style={S.trackGrid}>
                    {Array.from(trackGroups.entries()).map(([track, items]) => (
                        <article key={track} style={S.trackCard}>
                            <div style={S.trackTitle}>{TRACK_LABELS[track] || track}</div>
                            <div style={S.trackList}>
                                {items.map((item) => (
                                    <div key={item.pipeline_item_id} style={S.trackItem}>
                                        <span style={S.trackItemTitle}>{item.title}</span>
                                        <span style={S.trackItemState}>{item.status}</span>
                                    </div>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    heroPanel: {
        padding: '16px 18px',
    },
    heroHead: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
    },
    sectionLabel: {
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#C9A84C',
        fontSize: 11,
    },
    heroTitle: {
        marginTop: 6,
        fontSize: 20,
        lineHeight: 1.2,
        color: '#F0EDE8',
        fontFamily: 'Sora, sans-serif',
        fontWeight: 600,
        maxWidth: 680,
    },
    controlsBlock: {
        minWidth: 180,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    fieldCol: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    label: {
        fontSize: 11,
        color: '#A8A49E',
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    },
    select: {
        background: 'rgba(17,19,27,0.8)',
        border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: 8,
        color: '#F0EDE8',
        padding: '8px 10px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
    },
    reasonRow: {
        marginTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    input: {
        background: 'rgba(17,19,27,0.8)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#F0EDE8',
        padding: '10px 12px',
        fontFamily: 'Sora, sans-serif',
        fontSize: 13,
    },
    approvalEnvelope: {
        marginTop: 12,
        border: '1px solid rgba(201,168,76,0.18)',
        borderRadius: 10,
        padding: '12px',
        background: 'rgba(201,168,76,0.05)',
    },
    subSectionTitle: {
        color: '#F0EDE8',
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 8,
    },
    approvalGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
    },
    approvalHint: {
        marginTop: 8,
        color: '#A8A49E',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
    },
    kpiGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
    },
    missionGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
    },
    missionCard: {
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '12px',
        background: 'rgba(11,13,20,0.45)',
    },
    missionLabel: {
        fontSize: 11,
        color: '#A8A49E',
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    },
    missionValue: {
        marginTop: 8,
        color: '#F0EDE8',
        fontSize: 24,
        fontWeight: 700,
    },
    missionMeta: {
        marginTop: 4,
        color: '#A8A49E',
        fontSize: 12,
    },
    kpiCard: {
        padding: '14px 16px',
    },
    kpiLabel: {
        fontSize: 11,
        color: '#A8A49E',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontFamily: 'JetBrains Mono, monospace',
    },
    kpiValue: {
        marginTop: 6,
        fontSize: 26,
        color: '#F0EDE8',
        fontFamily: 'Sora, sans-serif',
        fontWeight: 700,
    },
    kpiMeta: {
        marginTop: 6,
        fontSize: 12,
        color: '#A8A49E',
    },
    sectionPanel: {
        padding: '14px 16px',
    },
    sectionTitle: {
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.08em',
        color: '#C9A84C',
        textTransform: 'uppercase',
        fontSize: 12,
        marginBottom: 10,
    },
    empty: {
        color: '#A8A49E',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
    },
    errorBox: {
        marginTop: 8,
        border: '1px solid rgba(224,64,64,0.35)',
        background: 'rgba(224,64,64,0.12)',
        color: '#E04040',
        borderRadius: 8,
        padding: '10px 12px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
    },
    agentGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
    },
    agentCard: {
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'rgba(11,13,20,0.5)',
        cursor: 'pointer',
    },
    agentCardActive: {
        border: '1px solid rgba(201,168,76,0.32)',
        boxShadow: '0 0 0 1px rgba(201,168,76,0.08) inset',
    },
    agentHead: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    agentName: {
        color: '#F0EDE8',
        fontWeight: 600,
        fontSize: 14,
    },
    agentMeta: {
        marginTop: 2,
        color: '#A8A49E',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
    },
    runtimeBadge: {
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    },
    runtimeRunning: {
        border: '1px solid rgba(24,200,112,0.3)',
        background: 'rgba(24,200,112,0.12)',
        color: '#18C870',
    },
    runtimePaused: {
        border: '1px solid rgba(240,160,32,0.3)',
        background: 'rgba(240,160,32,0.12)',
        color: '#F0A020',
    },
    runtimeStopped: {
        border: '1px solid rgba(224,64,64,0.35)',
        background: 'rgba(224,64,64,0.12)',
        color: '#E04040',
    },
    agentKpi: {
        marginTop: 8,
        color: '#A8A49E',
        fontSize: 11,
    },
    actionRow: {
        marginTop: 10,
        display: 'flex',
        gap: 8,
    },
    controlBtn: {
        border: '1px solid rgba(201,168,76,0.3)',
        background: 'rgba(201,168,76,0.12)',
        color: '#E8C96C',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
    },
    controlBtnDanger: {
        border: '1px solid rgba(224,64,64,0.35)',
        background: 'rgba(224,64,64,0.12)',
        color: '#E04040',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
    },
    controlBtnDisabled: {
        opacity: 0.45,
        cursor: 'not-allowed',
    },
    detailGrid: {
        display: 'grid',
        gridTemplateColumns: '1.1fr 1.4fr',
        gap: 10,
    },
    approvalInboxGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
        marginBottom: 10,
    },
    inboxCard: {
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'rgba(11,13,20,0.45)',
    },
    inboxValue: {
        marginTop: 8,
        color: '#F0EDE8',
        fontSize: 22,
        fontWeight: 700,
    },
    inboxActionPanel: {
        border: '1px solid rgba(201,168,76,0.18)',
        borderRadius: 10,
        padding: '12px',
        background: 'rgba(201,168,76,0.04)',
        marginBottom: 10,
    },
    inboxActionGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
    },
    inboxActionRow: {
        marginTop: 10,
        marginBottom: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
    },
    selectedAgentPanel: {
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '12px',
        background: 'rgba(11,13,20,0.45)',
    },
    selectedAgentMeta: {
        marginTop: 6,
        color: '#A8A49E',
        fontSize: 12,
    },
    timelineList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    timelineItem: {
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'rgba(11,13,20,0.45)',
    },
    timelineHead: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        alignItems: 'center',
    },
    timelineBadge: {
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    },
    eventStart: {
        color: '#18C870',
        border: '1px solid rgba(24,200,112,0.3)',
        background: 'rgba(24,200,112,0.12)',
    },
    eventPause: {
        color: '#F0A020',
        border: '1px solid rgba(240,160,32,0.3)',
        background: 'rgba(240,160,32,0.12)',
    },
    eventStop: {
        color: '#E04040',
        border: '1px solid rgba(224,64,64,0.35)',
        background: 'rgba(224,64,64,0.12)',
    },
    eventRejected: {
        color: '#F0A020',
        border: '1px solid rgba(240,160,32,0.3)',
        background: 'rgba(240,160,32,0.12)',
    },
    timelineStamp: {
        color: '#A8A49E',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
    },
    timelineMeta: {
        marginTop: 6,
        color: '#A8A49E',
        fontSize: 12,
    },
    trackGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
    },
    trackCard: {
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'rgba(11,13,20,0.5)',
    },
    trackTitle: {
        color: '#F0EDE8',
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 8,
    },
    trackList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    trackItem: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
    },
    trackItemTitle: {
        color: '#A8A49E',
        fontSize: 11,
        maxWidth: 220,
    },
    trackItemState: {
        color: '#C9A84C',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
    },
}
