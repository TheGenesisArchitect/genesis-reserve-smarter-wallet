'use client'

import { useEffect, useMemo, useState } from 'react'
import { useVaultPositions } from '../hooks/useVaultPositions'
import { useVaultWithdrawPlan } from '../hooks/useVaultWithdrawPlan'
import type { ViewKey } from './AppShell'

interface WithdrawFlowProps {
    walletAddress?: `0x${string}`
    compact?: boolean
    onNavigate?: (v: ViewKey) => void
}

function toUsdcAtomic(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return '0'

    const normalized = trimmed.replace(/,/g, '')
    const [wholeRaw, fracRaw = ''] = normalized.split('.')
    const whole = wholeRaw.replace(/\D/g, '')
    const frac = fracRaw.replace(/\D/g, '').slice(0, 6).padEnd(6, '0')

    if (!whole && !frac) return '0'
    return `${whole || '0'}${frac}`.replace(/^0+(?=\d)/, '')
}

export function WithdrawFlow({ walletAddress, compact = false, onNavigate }: WithdrawFlowProps) {
    const { data: positionsData, isLoading: positionsLoading } = useVaultPositions(walletAddress)
    const withdrawPlanner = useVaultWithdrawPlan()

    const positions = positionsData?.positions ?? []
    const selectablePositions = compact ? positions.slice(0, 3) : positions
    const [selectedStrategyId, setSelectedStrategyId] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState(compact ? '25' : '100')
    const [toast, setToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

    const activeStrategyId = selectedStrategyId || selectablePositions[0]?.strategyId || ''
    const activeStrategy = useMemo(
        () => selectablePositions.find((p) => p.strategyId === activeStrategyId) ?? selectablePositions[0],
        [selectablePositions, activeStrategyId]
    )

    const totalBalance = Number(positionsData?.summary.totalBalanceUsd ?? '0')
    const blendedApy = Number(positionsData?.summary.blendedApyPct ?? '0')
    const profit = Number(positionsData?.summary.profitUsd ?? '0')

    useEffect(() => {
        if (!withdrawPlanner.isSuccess) return
        setToast({
            tone: 'success',
            message: 'Withdraw plan built successfully. Review settlement timing before execution.',
        })

        const timer = window.setTimeout(() => setToast(null), 3200)
        return () => window.clearTimeout(timer)
    }, [withdrawPlanner.isSuccess, withdrawPlanner.data])

    useEffect(() => {
        if (!withdrawPlanner.isError) return
        setToast({
            tone: 'error',
            message: 'Withdraw plan is temporarily unavailable. Please try again.',
        })

        const timer = window.setTimeout(() => setToast(null), 3800)
        return () => window.clearTimeout(timer)
    }, [withdrawPlanner.isError, withdrawPlanner.error])

    return (
        <>
            {toast && (
                <div style={{
                    marginBottom: 10,
                    padding: compact ? '8px 10px' : '10px 12px',
                    borderRadius: 10,
                    background: toast.tone === 'success' ? 'rgba(76,175,80,0.07)' : 'rgba(229,115,115,0.08)',
                    border: toast.tone === 'success' ? '1px solid rgba(76,175,80,0.22)' : '1px solid rgba(229,115,115,0.28)',
                    color: toast.tone === 'success' ? '#8ee79a' : '#e9a1a1',
                    fontSize: compact ? 10 : 11,
                    lineHeight: 1.55,
                    animation: 'slideUp 220ms ease-out',
                }}>
                    {toast.message}
                </div>
            )}

            {!compact && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(201,168,76,0.65)', textTransform: 'uppercase', marginBottom: 4 }}>Total Vault</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#f5f0e8' }}>
                            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Blended APY</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#c9a84c' }}>{blendedApy.toFixed(2)}%</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(76,175,80,0.05)', border: '1px solid rgba(76,175,80,0.15)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(76,175,80,0.75)', textTransform: 'uppercase', marginBottom: 4 }}>Profit</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#4caf50' }}>
                            ${profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: compact ? 12 : 16, padding: compact ? '12px 14px' : '18px 18px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 10 }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(201,168,76,0.7)', textTransform: 'uppercase' }}>
                        Strategy Desk Withdraw Planner
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        source {positionsData?.meta.source ?? 'fallback'}
                    </div>
                </div>

                {positionsLoading ? (
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)' }}>Syncing vault positions...</div>
                ) : selectablePositions.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)', lineHeight: 1.7 }}>
                        No active vault positions found for this wallet yet. Deposit first to enable strategy-aware withdraw planning.
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 8, marginBottom: 10 }}>
                            <select
                                value={activeStrategyId}
                                onChange={(e) => setSelectedStrategyId(e.target.value)}
                                style={{ width: '100%', padding: compact ? '9px 10px' : '10px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#f5f0e8', fontSize: 12, fontFamily: "'Tenor Sans', sans-serif" }}
                            >
                                {selectablePositions.map((position) => (
                                    <option key={position.strategyId} value={position.strategyId}>
                                        {position.label}
                                    </option>
                                ))}
                            </select>

                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                placeholder="Amount"
                                style={{ width: '100%', padding: compact ? '9px 10px' : '10px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#f5f0e8', fontSize: 12, fontFamily: "'Tenor Sans', sans-serif" }}
                            />
                        </div>

                        {activeStrategy && (
                            <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: '#f5f0e8' }}>{activeStrategy.label}</div>
                                        <div style={{ marginTop: 2, fontSize: 10, color: 'rgba(245,240,232,0.4)' }}>
                                            {activeStrategy.protocol} · {activeStrategy.chain}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: '#c9a84c' }}>{Number(activeStrategy.apyPct).toFixed(2)}% APY</div>
                                        <div style={{ marginTop: 2, fontSize: 10, color: 'rgba(245,240,232,0.45)' }}>
                                            ${Number(activeStrategy.currentPositionUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                if (!walletAddress || !activeStrategyId) return
                                const amountAtomic = toUsdcAtomic(withdrawAmount)
                                if (!amountAtomic || amountAtomic === '0') return

                                withdrawPlanner.mutate({
                                    walletAddress,
                                    strategyId: activeStrategyId,
                                    amountAtomic,
                                })
                            }}
                            disabled={withdrawPlanner.isPending || !walletAddress || !activeStrategyId}
                            style={{
                                width: '100%',
                                padding: compact ? '9px 12px' : '11px 12px',
                                borderRadius: compact ? 10 : 12,
                                background: 'rgba(201,168,76,0.12)',
                                border: '1px solid rgba(201,168,76,0.3)',
                                color: '#c9a84c',
                                cursor: 'pointer',
                                fontSize: 11,
                                letterSpacing: compact ? '0.08em' : '0.1em',
                                fontFamily: "'Tenor Sans', sans-serif",
                                textTransform: compact ? 'none' : 'uppercase',
                                opacity: withdrawPlanner.isPending ? 0.75 : 1,
                            }}
                        >
                            {withdrawPlanner.isPending ? (compact ? 'Building Withdraw Plan...' : 'Building plan...') : 'Build Withdraw Plan'}
                        </button>

                        {withdrawPlanner.data && (
                            <div style={{ marginTop: 10, padding: compact ? '9px 10px' : '11px 12px', borderRadius: 10, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.22)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                    <div style={{ fontSize: 11, color: '#f5f0e8' }}>
                                        Plan ready{activeStrategy ? ` for ${activeStrategy.label}` : ''}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase' }}>
                                        source {withdrawPlanner.data.meta.source}
                                    </div>
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)', lineHeight: 1.65 }}>
                                    Estimated settlement: ~{Math.max(1, Math.round(withdrawPlanner.data.estimatedSettlementSeconds / 60))} min
                                    {' · '}
                                    projected APY after withdraw: {withdrawPlanner.data.projectedApyAfterWithdrawPct}%
                                </div>
                                {!compact && (
                                    <div style={{ marginTop: 5, fontSize: 10, color: 'rgba(245,240,232,0.4)' }}>
                                        Planned steps: {withdrawPlanner.data.transactionPlan.length}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {!compact && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                        type="button"
                        onClick={() => onNavigate?.('vaults')}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(201,168,76,0.28)', background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontSize: 11, letterSpacing: '0.08em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}
                    >
                        Back to Vaults
                    </button>
                    <button
                        type="button"
                        onClick={() => onNavigate?.('deposit')}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: 'rgba(245,240,232,0.72)', fontSize: 11, letterSpacing: '0.08em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}
                    >
                        Add Money
                    </button>
                </div>
            )}
        </>
    )
}
