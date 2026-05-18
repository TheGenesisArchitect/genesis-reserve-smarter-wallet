'use client'

import { useEffect, useMemo, useState } from 'react'
import { useVaultPositions } from '../hooks/useVaultPositions'
import { useVaultWithdrawPlan } from '../hooks/useVaultWithdrawPlan'
import { useGenesisVault } from '../hooks/useGenesisVault'
import type { VaultPositionItem } from '../lib/bff.types'
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

function fmtUsd(v: string | number) {
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysUntil(isoDate: string): number {
    return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000)
}

function formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Liquidity badge ────────────────────────────────────────────────────────────
const LIQUIDITY_CONFIG = {
    instant:   { label: 'Instant',    color: '#00D4AA', bg: 'rgba(0,212,170,0.10)',  border: 'rgba(0,212,170,0.25)' },
    same_day:  { label: '24h Queue',  color: '#C9A84C', bg: 'rgba(201,168,76,0.10)', border: 'rgba(201,168,76,0.25)' },
    scheduled: { label: 'At Maturity',color: '#9B6DFF', bg: 'rgba(155,109,255,0.10)',border: 'rgba(155,109,255,0.25)' },
}

function LiquidityBadge({ window: w }: { window: VaultPositionItem['liquidityWindow'] }) {
    const cfg = LIQUIDITY_CONFIG[w] ?? LIQUIDITY_CONFIG.instant
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 20,
            background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
            fontFamily: "'Sora', sans-serif",
        }}>
            {cfg.label}
        </span>
    )
}

// ── Step indicator ─────────────────────────────────────────────────────────────
type Step = 'select' | 'confirm' | 'processing' | 'success' | 'error'

export function WithdrawFlow({ walletAddress, compact = false, onNavigate }: WithdrawFlowProps) {
    const { data: positionsData, isLoading: positionsLoading } = useVaultPositions(walletAddress)
    const withdrawPlanner = useVaultWithdrawPlan()
    const { withdraw, walletUsdcBalance } = useGenesisVault()

    const positions = positionsData?.positions ?? []
    const selectablePositions = compact ? positions.slice(0, 3) : positions

    const [selectedStrategyId, setSelectedStrategyId] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState(compact ? '25' : '100')
    const [step, setStep] = useState<Step>('select')
    const [txHash, setTxHash] = useState('')
    const [errorMsg, setErrorMsg] = useState('')

    const activeStrategyId = selectedStrategyId || selectablePositions[0]?.strategyId || ''
    const activePosition = useMemo(
        () => selectablePositions.find(p => p.strategyId === activeStrategyId) ?? selectablePositions[0],
        [selectablePositions, activeStrategyId]
    )

    const liquidityWindow = activePosition?.liquidityWindow ?? 'instant'
    const plan = withdrawPlanner.data

    // Auto-fetch plan when position or amount changes
    useEffect(() => {
        if (!walletAddress || !activeStrategyId || !withdrawAmount) return
        const amountAtomic = toUsdcAtomic(withdrawAmount)
        if (!amountAtomic || amountAtomic === '0') return
        withdrawPlanner.mutate({
            walletAddress,
            strategyId: activeStrategyId,
            amountAtomic,
            liquidityWindow,
            maturityDate: activePosition?.pendleMaturity?.expiryDate,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeStrategyId, withdrawAmount, liquidityWindow])

    const totalBalance = Number(positionsData?.summary.totalBalanceUsd ?? '0')
    const blendedApy = Number(positionsData?.summary.blendedApyPct ?? '0')
    const profit = Number(positionsData?.summary.profitUsd ?? '0')

    const canWithdrawNow = plan?.canWithdrawNow ?? (liquidityWindow === 'instant')
    const isMaturityLocked = liquidityWindow === 'scheduled' && !canWithdrawNow
    const lockedUntil = plan?.lockedUntil ?? activePosition?.pendleMaturity?.expiryDate ?? null
    const daysLocked = lockedUntil ? daysUntil(lockedUntil) : 0

    async function handleExecuteWithdraw() {
        if (!canWithdrawNow || !withdrawAmount) return
        setStep('processing')
        setErrorMsg('')
        try {
            const hash = await withdraw(withdrawAmount)
            setTxHash(hash)
            setStep('success')
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Withdrawal failed. Please try again.')
            setStep('error')
        }
    }

    // ── Success screen ─────────────────────────────────────────────────────────
    if (step === 'success') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '20px 18px', borderRadius: 14, background: 'rgba(26,191,106,0.08)', border: '1px solid rgba(26,191,106,0.25)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                    <div style={{ fontSize: 14, color: '#1ABF6A', fontWeight: 600, fontFamily: "'Sora', sans-serif", marginBottom: 4 }}>
                        Withdrawal Complete
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.6)', marginBottom: 12 }}>
                        ${fmtUsd(withdrawAmount)} USDC is back in your wallet
                    </div>
                    {txHash && (
                        <a href={`https://arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 10, color: '#4A9EFF', fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none' }}>
                            ↗ View on Arbiscan
                        </a>
                    )}
                </div>

                {/* Off-ramp options */}
                <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 12, fontFamily: "'Sora', sans-serif" }}>
                        What would you like to do with your USDC?
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button type="button" onClick={() => onNavigate?.('send')}
                            style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.28)', color: '#C9A84C', fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 600, cursor: 'pointer', textAlign: 'left', letterSpacing: '0.04em' }}>
                            → Send to bank or external wallet
                        </button>
                        <button type="button" onClick={() => onNavigate?.('deposit')}
                            style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.22)', color: '#00D4AA', fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 600, cursor: 'pointer', textAlign: 'left', letterSpacing: '0.04em' }}>
                            → Re-deploy into a different strategy
                        </button>
                        <button type="button" onClick={() => setStep('select')}
                            style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(245,240,232,0.55)', fontSize: 11, fontFamily: "'Sora', sans-serif", cursor: 'pointer', textAlign: 'left', letterSpacing: '0.04em' }}>
                            → Keep as USDC in wallet
                        </button>
                    </div>
                </div>

                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', textAlign: 'center' }}>
                    Wallet USDC balance: ${fmtUsd(walletUsdcBalance)}
                </div>
            </div>
        )
    }

    // ── Error screen ───────────────────────────────────────────────────────────
    if (step === 'error') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(232,64,64,0.07)', border: '1px solid rgba(232,64,64,0.25)', color: '#E84040', fontSize: 12 }}>
                    {errorMsg}
                </div>
                <button type="button" onClick={() => setStep('select')}
                    style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(245,240,232,0.7)', fontSize: 11, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
                    ← Try Again
                </button>
            </div>
        )
    }

    // ── Processing screen ──────────────────────────────────────────────────────
    if (step === 'processing') {
        return (
            <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', fontFamily: "'Sora', sans-serif", letterSpacing: '0.06em' }}>
                    Submitting withdrawal…
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(245,240,232,0.3)' }}>
                    Confirm in your wallet if prompted
                </div>
            </div>
        )
    }

    // ── Main flow ──────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* KPI row — only in full view */}
            {!compact && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(201,168,76,0.65)', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>Total Vault</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#f5f0e8' }}>${fmtUsd(totalBalance)}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>Blended APY</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#c9a84c' }}>{blendedApy.toFixed(2)}%</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(26,191,106,0.05)', border: '1px solid rgba(26,191,106,0.15)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(26,191,106,0.75)', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>Profit</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#1ABF6A' }}>${fmtUsd(profit)}</div>
                    </div>
                </div>
            )}

            {/* Main card */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: compact ? 12 : 16, padding: compact ? '12px 14px' : '18px 18px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(201,168,76,0.7)', textTransform: 'uppercase', fontFamily: "'Sora', sans-serif" }}>
                        Withdraw Funds
                    </div>
                    {activePosition && <LiquidityBadge window={liquidityWindow} />}
                </div>

                {positionsLoading ? (
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', padding: '8px 0' }}>Syncing vault positions…</div>
                ) : selectablePositions.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)', lineHeight: 1.75 }}>
                        No active vault positions found. Deposit first to enable withdrawals.
                    </div>
                ) : (
                    <>
                        {/* Pool selector + amount */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 8, marginBottom: 12 }}>
                            <select value={activeStrategyId} onChange={e => setSelectedStrategyId(e.target.value)}
                                style={{ width: '100%', padding: '10px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#f5f0e8', fontSize: 12, fontFamily: "'Sora', sans-serif" }}>
                                {selectablePositions.map(p => (
                                    <option key={p.strategyId} value={p.strategyId}>{p.label}</option>
                                ))}
                            </select>
                            <input type="number" min="0" step="0.01" value={withdrawAmount}
                                onChange={e => setWithdrawAmount(e.target.value)}
                                placeholder="Amount"
                                style={{ width: '100%', padding: '10px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#f5f0e8', fontSize: 12, fontFamily: "'Sora', sans-serif' " }} />
                        </div>

                        {/* Position details */}
                        {activePosition && (
                            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: '#f5f0e8', fontWeight: 500, marginBottom: 3 }}>{activePosition.label}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)' }}>{activePosition.protocol} · {activePosition.chain}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 12, color: '#C9A84C', fontWeight: 600 }}>{Number(activePosition.apyPct).toFixed(2)}% APY</div>
                                        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.55)', marginTop: 2 }}>
                                            ${fmtUsd(activePosition.currentPositionUsd)} deposited
                                        </div>
                                    </div>
                                </div>
                                {activePosition.poolUrl && (
                                    <a href={activePosition.poolUrl} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'inline-block', marginTop: 8, fontSize: 10, color: 'rgba(245,240,232,0.4)', textDecoration: 'none', borderBottom: '1px solid rgba(245,240,232,0.15)' }}>
                                        ↗ View pool
                                    </a>
                                )}
                            </div>
                        )}

                        {/* ── Path A: INSTANT ────────────────────────────────── */}
                        {liquidityWindow === 'instant' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.18)' }}>
                                    <div style={{ fontSize: 11, color: '#00D4AA', fontWeight: 600, marginBottom: 2 }}>Instant withdrawal</div>
                                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.55)', lineHeight: 1.65 }}>
                                        USDC returns to your wallet on the same transaction. No queue, no waiting.
                                    </div>
                                </div>
                                <button type="button" onClick={handleExecuteWithdraw}
                                    disabled={!withdrawAmount || withdrawAmount === '0'}
                                    style={{ padding: '12px 14px', borderRadius: 11, background: '#00D4AA', color: '#020305', fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', opacity: !withdrawAmount || withdrawAmount === '0' ? 0.4 : 1 }}>
                                    Withdraw ${withdrawAmount || '0'} Now →
                                </button>
                            </div>
                        )}

                        {/* ── Path B: SAME-DAY / QUEUED ──────────────────────── */}
                        {liquidityWindow === 'same_day' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)' }}>
                                    <div style={{ fontSize: 11, color: '#C9A84C', fontWeight: 600, marginBottom: 2 }}>24-hour settlement</div>
                                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.55)', lineHeight: 1.65 }}>
                                        This pool processes withdrawals in a daily redemption queue. Your USDC will arrive within 24 hours of confirmation.
                                    </div>
                                </div>
                                {plan && (
                                    <div style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: 'rgba(245,240,232,0.5)' }}>
                                        Est. settlement: ~{Math.ceil(plan.estimatedSettlementSeconds / 3600)}h · Projected APY after: {plan.projectedApyAfterWithdrawPct}%
                                    </div>
                                )}
                                <button type="button" onClick={handleExecuteWithdraw}
                                    disabled={!withdrawAmount || withdrawAmount === '0'}
                                    style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(201,168,76,0.15)', color: '#C9A84C', fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid rgba(201,168,76,0.35)', cursor: 'pointer', opacity: !withdrawAmount || withdrawAmount === '0' ? 0.4 : 1 }}>
                                    Queue Withdrawal →
                                </button>
                            </div>
                        )}

                        {/* ── Path C: MATURITY / SCHEDULED ───────────────────── */}
                        {liquidityWindow === 'scheduled' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {isMaturityLocked && lockedUntil ? (
                                    <>
                                        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(155,109,255,0.07)', border: '1px solid rgba(155,109,255,0.25)' }}>
                                            <div style={{ fontSize: 11, color: '#9B6DFF', fontWeight: 600, marginBottom: 4 }}>Locked until maturity</div>
                                            <div style={{ fontSize: 13, color: '#f5f0e8', fontFamily: "'Cormorant Garamond', serif", marginBottom: 4 }}>
                                                {formatDate(lockedUntil)}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.50)', lineHeight: 1.65 }}>
                                                {daysLocked > 0
                                                    ? `${daysLocked} day${daysLocked !== 1 ? 's' : ''} remaining. Your funds and all accrued yield will be redeemable on the maturity date.`
                                                    : 'Maturity reached — redemption available below.'}
                                            </div>
                                        </div>
                                        <button type="button" disabled
                                            style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(155,109,255,0.08)', color: 'rgba(155,109,255,0.45)', fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 600, letterSpacing: '0.06em', border: '1px solid rgba(155,109,255,0.18)', cursor: 'not-allowed' }}>
                                            Unlocks {formatDate(lockedUntil)}
                                        </button>
                                        {activePosition?.pendleMaturity?.yieldLockWarning && (
                                            <div style={{ fontSize: 10, color: 'rgba(201,168,76,0.75)', padding: '8px 12px', borderRadius: 8, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                                                ⚡ Selling PT tokens before maturity on secondary markets (e.g. Pendle) may be possible but will forfeit remaining yield.
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(26,191,106,0.06)', border: '1px solid rgba(26,191,106,0.20)' }}>
                                            <div style={{ fontSize: 11, color: '#1ABF6A', fontWeight: 600, marginBottom: 2 }}>Maturity reached</div>
                                            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.55)', lineHeight: 1.65 }}>
                                                This position has reached maturity. You can now redeem your principal and all accrued yield.
                                            </div>
                                        </div>
                                        <button type="button" onClick={handleExecuteWithdraw}
                                            disabled={!withdrawAmount || withdrawAmount === '0'}
                                            style={{ padding: '12px 14px', borderRadius: 11, background: '#1ABF6A', color: '#020305', fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', opacity: !withdrawAmount || withdrawAmount === '0' ? 0.4 : 1 }}>
                                            Redeem at Maturity →
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom nav — full view only */}
            {!compact && (
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => onNavigate?.('vaults')}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(201,168,76,0.28)', background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontSize: 11, letterSpacing: '0.08em', fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
                        Back to Vaults
                    </button>
                    <button type="button" onClick={() => onNavigate?.('deposit')}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: 'rgba(245,240,232,0.72)', fontSize: 11, letterSpacing: '0.08em', fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
                        Add Money
                    </button>
                </div>
            )}
        </div>
    )
}
