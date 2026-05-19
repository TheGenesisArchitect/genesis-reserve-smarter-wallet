'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { loadStripe } from '@stripe/stripe-js'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { useGenesisVault } from '../hooks/useGenesisVault'
import { useComplianceGate } from '../hooks/useComplianceGate'
import { useAutoKYCActivate } from '../hooks/useAutoKYCActivate'
import { useVaultStrategies } from '../hooks/useVaultStrategies'
import { useVaultDepositPlan } from '../hooks/useVaultDepositPlan'
import { useCCTPTransfer } from '../hooks/useCCTPTransfer'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { useSmartAccount } from '../hooks/useSmartAccount'
import type { VaultIntentTier, VaultStrategySummary } from '../lib/bff.types'
import type { CctpChainKey } from '../config/cctp'

type StrategyId = string

interface PendingTierInfo {
  tierKey: string
  tierName: string
  strategyId?: string | null
  strategyLabel?: string | null
  tierColor: string
  yieldRange: string
  badge: string
}

const TIER_COLOR_RGBA: Record<string, string> = {
  preserve: '0,212,170',
  grow: '201,168,76',
  accelerate: '155,109,255',
}

const CHAIN_SCOPE_BY_TIER: Record<VaultIntentTier, string[]> = {
  preserve: ['arbitrum', 'ethereum'],
  grow: ['arbitrum', 'ethereum', 'base', 'optimism'],
  accelerate: ['arbitrum', 'ethereum', 'base', 'optimism', 'polygon', 'sonic'],
}

const TIER_RISK_GATE: Record<VaultIntentTier, VaultStrategySummary['riskLevel'][]> = {
  preserve: ['low'],
  grow: ['low', 'medium'],
  accelerate: ['low', 'medium', 'high'],
}

function parseApy(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function pendleChainParam(chain?: string): string {
  const normalized = (chain || 'arbitrum').trim().toLowerCase()
  if (normalized === 'ethereum' || normalized === 'mainnet') return 'ethereum'
  if (normalized === 'arb' || normalized === 'arbitrum one') return 'arbitrum'
  return normalized
}

function buildPendleUrl(chain?: string): string {
  return `https://app.pendle.finance/trade/markets?chain=${encodeURIComponent(pendleChainParam(chain))}`
}

function getStrategyLabel(strategyId: StrategyId | null, strategiesById: Record<string, VaultStrategySummary>): string {
  if (!strategyId) return 'Not selected'
  return strategiesById[strategyId]?.label ?? strategyId
}

function resolveStrategyIdFromPreference(raw: string | null | undefined, strategies: VaultStrategySummary[]): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null

  const exact = strategies.find((strategy) => strategy.strategyId.toLowerCase() === value.toLowerCase())
  if (exact) return exact.strategyId
  return null
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

function toIntentTier(tierKey?: string): VaultIntentTier {
  if (tierKey === 'preserve' || tierKey === 'grow' || tierKey === 'accelerate') return tierKey
  return 'grow'
}

function toRiskLabel(risk: VaultStrategySummary['riskLevel']): string {
  if (risk === 'low') return 'Low Risk'
  if (risk === 'medium') return 'Medium Risk'
  return 'High Risk'
}

function formatStrategyApy(strategy?: VaultStrategySummary): string {
  if (!strategy) return 'Live APY'
  return `${strategy.netApyPct}% APY`
}

async function loadServerStrategyPreference(walletAddress: string): Promise<string | null> {
  const response = await fetch(`/api/gr/deposit/strategy-preference?walletAddress=${encodeURIComponent(walletAddress)}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) return null

  const payload = await response.json().catch(() => ({})) as { data?: { strategy?: string | null } }
  return payload?.data?.strategy ?? null
}

async function persistServerStrategyPreference(walletAddress: string, strategy: string) {
  await fetch('/api/gr/deposit/strategy-preference', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `strategy-pref-${walletAddress}-${Date.now()}`,
    },
    body: JSON.stringify({ walletAddress, strategy, updatedBy: 'wallet-ui' }),
  })
}

type DepositIntentResult =
  | { ok: true }
  | { ok: false; blocked: true; code: string; detail: string }
  | { ok: false; blocked: false }

async function submitDepositIntent(args: {
  walletAddress: string
  strategyId: string
  amount: string
}): Promise<DepositIntentResult> {
  let res: Response
  try {
    res = await fetch('/api/gr/deposit/intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `deposit-intent-${args.walletAddress}-${Date.now()}`,
      },
      body: JSON.stringify({
        walletAddress: args.walletAddress,
        strategy: args.strategyId,
        amount: args.amount,
        source: 'wallet-usdc',
        metadata: {
          flow: 'deposit',
          method: 'usdc-wallet',
        },
      }),
    })
  } catch {
    // Network error — do not block deposit
    return { ok: false, blocked: false }
  }

  if (res.ok || res.status === 202) return { ok: true }

  // Compliance/gate-level errors must surface to the user
  if (res.status === 403) {
    const payload = await res.json().catch(() => ({})) as { error?: string; detail?: string }
    return {
      ok: false,
      blocked: true,
      code: payload.error ?? 'accreditation_required',
      detail: payload.detail ?? 'This strategy requires investor accreditation.',
    }
  }

  // Other server errors — do not block deposit
  return { ok: false, blocked: false }
}

function TierInfoBanner({
  info,
  liveStrategy,
  onDismiss,
}: {
  info: PendingTierInfo
  liveStrategy?: VaultStrategySummary
  onDismiss: () => void
}) {
  const rgb = TIER_COLOR_RGBA[info.tierKey] ?? '201,168,76'

  return (
    <div style={{
      padding: '18px 20px',
      borderRadius: 16,
      position: 'relative',
      background: `rgba(${rgb}, 0.06)`,
      border: `1px solid rgba(${rgb}, 0.22)`,
    }}>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: 10,
          right: 14,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(245,240,232,0.3)',
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ×
      </button>

      <div
        style={{
          display: 'inline-block',
          marginBottom: 8,
          padding: '2px 10px',
          borderRadius: 20,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          background: `rgba(${rgb}, 0.12)`,
          border: `1px solid rgba(${rgb}, 0.25)`,
          color: info.tierColor,
        }}
      >
        {info.badge}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8' }}>
          {info.tierName}
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: info.tierColor }}>
          {info.yieldRange}
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase' }}>
          APY target
        </div>
      </div>

      {(liveStrategy || info.strategyLabel || info.strategyId) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            marginBottom: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#f5f0e8', fontFamily: "'Tenor Sans', sans-serif", marginBottom: 2 }}>
              {liveStrategy?.label || info.strategyLabel || info.strategyId || 'Strategy'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)' }}>
              {liveStrategy ? `${liveStrategy.protocol} · ${liveStrategy.chain}` : 'Live strategy routing'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#c9a84c', fontFamily: "'Tenor Sans', sans-serif" }}>
              {formatStrategyApy(liveStrategy)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>
              {liveStrategy ? toRiskLabel(liveStrategy.riskLevel) : 'Risk adaptive'}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(76,175,80,0.05)',
          border: '1px solid rgba(76,175,80,0.15)',
        }}
      >
        <span style={{ color: '#4caf50', flexShrink: 0, fontSize: 14, marginTop: 1 }}>◈</span>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.55)', lineHeight: 1.7 }}>
          <strong style={{ color: '#f5f0e8' }}>Only the amount you choose is put to work.</strong>{' '}
          Your remaining balance stays in your vault and accessible at any time. Enter your deposit amount below to continue.
        </div>
      </div>
    </div>
  )
}

function StrategySelector({
  selectedStrategy,
  onChange,
  strategies,
  sourceLabel,
}: {
  selectedStrategy: StrategyId | null
  onChange: (strategyId: StrategyId) => void
  strategies: VaultStrategySummary[]
  sourceLabel?: string
}) {
  return (
    <div style={{ ...S.card, padding: '16px 16px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 10 }}>
        <div style={S.label}>Choose Your Strategy</div>
        <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Strategy Desk {sourceLabel ? `· ${sourceLabel}` : ''}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {strategies.map((strategy) => {
          const active = selectedStrategy === strategy.strategyId
          const displayLabel = strategy.label
          const displayApy = formatStrategyApy(strategy)
          const displayRisk = toRiskLabel(strategy.riskLevel)
          const displaySubtitle = `${strategy.protocol} · ${strategy.chain}`

          return (
            <button
              key={strategy.strategyId}
              type="button"
              onClick={() => onChange(strategy.strategyId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 12,
                border: active ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.1)',
                background: active ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
                color: '#f5f0e8',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontFamily: "'Tenor Sans', sans-serif" }}>{displayLabel}</div>
                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.42)', marginTop: 2 }}>{displaySubtitle}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#c9a84c', fontFamily: "'Tenor Sans', sans-serif" }}>{displayApy}</div>
                <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>{displayRisk}</div>
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(245,240,232,0.32)' }}>
        Your selection is saved for this wallet and can be changed any time.
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  label: {
    fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)',
    textTransform: 'uppercase' as const, marginBottom: 6,
    fontFamily: "'Tenor Sans', sans-serif",
  },
  input: {
    width: '100%', padding: '13px 14px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f5f0e8', fontSize: 15,
    fontFamily: "'Tenor Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box' as const,
  },
  card: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18, padding: '22px 20px',
  } as React.CSSProperties,
  btnGold: {
    width: '100%', padding: '15px', borderRadius: 30,
    background: '#c9a84c', color: '#1a1400',
    border: 'none', cursor: 'pointer',
    fontSize: 12, letterSpacing: '0.12em',
    fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600,
  } as React.CSSProperties,
  btnGhost: {
    width: '100%', padding: '12px', borderRadius: 30,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(245,240,232,0.5)', cursor: 'pointer', fontSize: 11,
    fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.06em',
  } as React.CSSProperties,
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, color: 'rgba(245,240,232,0.55)',
    fontFamily: "'Tenor Sans', sans-serif",
    padding: '11px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.055)',
  } as React.CSSProperties,
}

// ── Amount selector ───────────────────────────────────────────────────────────
function AmountSelector({ amount, onChange }: { amount: string; onChange: (v: string) => void }) {
  const PRESETS = ['1', '5', '25', '100', '250']
  return (
    <div>
      <div style={S.label}>Amount (USD)</div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'rgba(245,240,232,0.3)' }}>$</span>
        <input
          type="number" min="0.25" step="0.25"
          style={{ ...S.input, paddingLeft: 30, fontSize: 22, fontFamily: "'Cormorant Garamond', serif" }}
          placeholder="0.00" value={amount}
          onChange={e => onChange(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {PRESETS.map(p => (
          <button key={p} type="button" onClick={() => onChange(p)} style={{
            flex: 1, padding: '7px 0', borderRadius: 20, fontSize: 11,
            background: amount === p ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
            border: amount === p ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.08)',
            color: amount === p ? '#c9a84c' : 'rgba(245,240,232,0.4)',
            cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif",
          }}>
            ${p}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Yield preview ─────────────────────────────────────────────────────────────
function YieldPreview({ amount, apyPct }: { amount: number; apyPct?: string | number }) {
  if (amount <= 0) return null
  const apyRate = typeof apyPct === 'string' ? Number(apyPct) / 100 : typeof apyPct === 'number' ? apyPct / 100 : 0
  const daily = (amount * apyRate) / 365
  const annual = amount * apyRate
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(76,175,80,0.06)', border: '1px solid rgba(76,175,80,0.15)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(76,175,80,0.7)', textTransform: 'uppercase', marginBottom: 8 }}>
        Yield Projection {apyRate > 0 ? `· ${(apyRate * 100).toFixed(2)}% APY` : '· Live APY'}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Daily</div>
          <div style={{ fontSize: 16, color: '#4caf50', fontFamily: "'Cormorant Garamond', serif" }}>+${daily.toFixed(4)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Monthly</div>
          <div style={{ fontSize: 16, color: '#4caf50', fontFamily: "'Cormorant Garamond', serif" }}>+${(daily * 30).toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Annual</div>
          <div style={{ fontSize: 16, color: '#4caf50', fontFamily: "'Cormorant Garamond', serif" }}>+${annual.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ amount, method, reference, txHash, strategyLabel, strategyProtocol, strategyChain, strategyDeskSource, onReset }: {
  amount: string; method: string; reference: string; txHash?: string; strategyLabel: string; strategyProtocol?: string; strategyChain?: string; strategyDeskSource?: string; onReset: () => void
}) {
  const isPendle = (strategyProtocol || '').toLowerCase() === 'pendle'
  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>✓</div>
      <div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', marginBottom: 6 }}>Deposit Received</div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.45)', lineHeight: 1.8 }}>
          ${parseFloat(amount).toFixed(2)} is being processed via {method}.<br />
          Funds will appear in your vault shortly.
        </div>
      </div>
      <div style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.22)', textAlign: 'left' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'rgba(201,168,76,0.78)', textTransform: 'uppercase', marginBottom: 6 }}>
          Strategy Desk Receipt
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#f5f0e8' }}>{strategyLabel}</div>
          <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase' }}>
            {strategyDeskSource ? `source ${strategyDeskSource}` : 'source fallback'}
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(245,240,232,0.42)', lineHeight: 1.6 }}>
          Only your entered amount is activated. Remaining vault balance stays liquid and available.
        </div>
      </div>
      <div style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
        {[
          { k: 'Amount', v: `$${parseFloat(amount).toFixed(2)}` },
          { k: 'Method', v: method },
          { k: 'Strategy', v: strategyLabel },
          { k: 'Reference', v: reference },
          { k: 'Status', v: 'Processing' },
        ].map((r, i, arr) => (
          <div key={r.k} style={{ ...S.row, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.055)' : 'none' }}>
            <span style={{ color: 'rgba(245,240,232,0.35)' }}>{r.k}</span>
            <span style={{ color: r.k === 'Status' ? '#4caf50' : '#f5f0e8' }}>{r.v}</span>
          </div>
        ))}
      </div>
      {txHash && (
        <a href={`https://arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#c9a84c', fontFamily: 'monospace', textDecoration: 'none', padding: '7px 16px', borderRadius: 20, border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(201,168,76,0.07)' }}>
          View on Arbiscan ↗
        </a>
      )}
      {isPendle && (
        <a
          href={buildPendleUrl(strategyChain)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11,
            color: '#8ee79a',
            textDecoration: 'none',
            padding: '7px 16px',
            borderRadius: 20,
            border: '1px solid rgba(76,175,80,0.32)',
            background: 'rgba(76,175,80,0.08)',
            fontFamily: "'Tenor Sans', sans-serif",
            letterSpacing: '0.04em',
          }}
        >
          Check on Pendle ↗
        </a>
      )}
      <button style={S.btnGhost} onClick={onReset}>Add More Money</button>
    </div>
  )
}

// ── Processing screen ─────────────────────────────────────────────────────────
function ProcessingScreen({ label }: { label: string }) {
  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 24px' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.15)', borderTopColor: '#c9a84c', animation: 'spin 1s linear infinite' }} />
      <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.55)', fontFamily: "'Tenor Sans', sans-serif" }}>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── 1. Card Deposit — powered by Privy × Stripe ─────────────────────────────
// Lazy singleton — Stripe only loads when the card deposit tab is actually mounted.
// Avoids Stripe Radar beacon firing on every Add Money page load.
let _cardStripePromise: ReturnType<typeof loadStripe> | null = null
function getCardStripe() {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!pk) return null
  if (!_cardStripePromise) _cardStripePromise = loadStripe(pk)
  return _cardStripePromise
}

function CardDeposit({ onSuccess, selectedStrategySummary }: { onSuccess: (amount: string, ref: string) => void; selectedStrategySummary?: VaultStrategySummary }) {
  const { login, authenticated } = usePrivy()
  const walletAddress = useActiveWalletAddress()

  return (
    <Elements stripe={getCardStripe()}>
      <StripeCardDepositForm
        onSuccess={onSuccess}
        selectedStrategySummary={selectedStrategySummary}
        login={login}
        authenticated={authenticated}
        walletAddress={walletAddress}
      />
    </Elements>
  )
}

function StripeCardDepositForm({
  onSuccess,
  selectedStrategySummary,
  login,
  authenticated,
  walletAddress,
}: {
  onSuccess: (amount: string, ref: string) => void
  selectedStrategySummary?: VaultStrategySummary
  login: () => void
  authenticated: boolean
  walletAddress?: `0x${string}`
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [amount, setAmount] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [billingZip, setBillingZip] = useState('')
  const [phase, setPhase] = useState<'idle' | 'processing'>('idle')
  const [error, setError] = useState('')

  const numAmt = parseFloat(amount) || 0
  const canSubmit = numAmt >= 0.25 && !!stripe && !!elements && cardholderName.trim() !== '' && billingZip.trim() !== ''

  async function handleSubmit() {
    if (!authenticated) {
      login()
      return
    }
    if (!walletAddress) {
      setError('No wallet connected — please log in first')
      return
    }
    if (!canSubmit) {
      setError('Complete the card fields and enter at least $0.25.')
      return
    }

    setError('')
    setPhase('processing')

    try {
      const intentRes = await fetch('/api/gr/deposit/stripe-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmt.toFixed(2) }),
      })
      const intentData = await intentRes.json()
      if (!intentRes.ok || !intentData.clientSecret) {
        setError(intentData.error || 'Unable to create Stripe payment intent.')
        setPhase('idle')
        return
      }

      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        setError('Card input unavailable. Refresh and try again.')
        setPhase('idle')
        return
      }

      const result = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: cardholderName.trim(),
            address: { postal_code: billingZip.trim() },
          },
        },
      })

      if (result.error) {
        setError(result.error.message || 'Payment failed. Please check your card and try again.')
        setPhase('idle')
        return
      }

      if (result.paymentIntent?.status === 'succeeded') {
        onSuccess(numAmt.toFixed(2), intentData.referenceId ?? `STRIPE-${Date.now().toString(36).toUpperCase()}`)
        return
      }

      setError('Payment could not be completed. Please try again.')
      setPhase('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected payment error.')
      setPhase('idle')
    }
  }

  const cardStyle = {
    base: {
      color: '#f5f0e8',
      fontFamily: "'Tenor Sans', sans-serif",
      fontSize: '16px',
      '::placeholder': { color: 'rgba(245,240,232,0.35)' },
      iconColor: '#c9a84c',
    },
    invalid: {
      color: '#ff8a80',
      iconColor: '#ff8a80',
    },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AmountSelector amount={amount} onChange={setAmount} />
      <YieldPreview amount={numAmt} apyPct={selectedStrategySummary?.netApyPct} />

      <div style={{ ...S.card, display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f5f0e8' }}>Card Payment</div>

        <label style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Cardholder Name
          <input
            type="text"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            placeholder="Jane Doe"
            style={S.input}
          />
        </label>

        <div style={{ ...S.card, padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <CardElement options={{ style: cardStyle, hidePostalCode: true }} />
        </div>

        <label style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          ZIP code
          <input
            type="text"
            value={billingZip}
            onChange={(e) => setBillingZip(e.target.value)}
            placeholder="90210"
            maxLength={10}
            style={S.input}
          />
        </label>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!authenticated || phase === 'processing' || !canSubmit}
          style={{
            ...S.btnGold,
            opacity: !authenticated || phase === 'processing' || !canSubmit ? 0.65 : 1,
            cursor: !authenticated || phase === 'processing' || !canSubmit ? 'not-allowed' : 'pointer',
          }}
        >
          {authenticated
            ? phase === 'processing'
              ? 'Processing Card Payment…'
              : numAmt >= 0.25
                ? `Pay $${numAmt.toFixed(2)} with Card →`
                : 'Enter an amount of $0.25 or more'
            : 'Connect Wallet to Continue →'}
        </button>

        <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', lineHeight: 1.6 }}>
          Card payment is handled by Stripe. Your card data is sent directly to Stripe and is not stored by Genesis Reserve.
        </div>
      </div>
    </div>
  )
}
// ── 2. Linked Card Deposit — charge saved card via Stripe off-session ─────────
type LinkedCard = {
  id: string
  accountId: string
  cardholderName: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  fundingEligible: boolean
  status: string
}

function LinkedCardDeposit({ onSuccess, selectedStrategySummary }: { onSuccess: (amount: string, ref: string) => void; selectedStrategySummary?: VaultStrategySummary }) {
  const { login, authenticated } = usePrivy()
  const walletAddress = useActiveWalletAddress()
  return (
    <Elements stripe={getCardStripe()}>
      <LinkedCardDepositForm
        onSuccess={onSuccess}
        selectedStrategySummary={selectedStrategySummary}
        login={login}
        authenticated={authenticated}
        walletAddress={walletAddress}
      />
    </Elements>
  )
}

function LinkedCardDepositForm({
  onSuccess,
  selectedStrategySummary,
  login,
  authenticated,
  walletAddress,
}: {
  onSuccess: (amount: string, ref: string) => void
  selectedStrategySummary?: VaultStrategySummary
  login: () => void
  authenticated: boolean
  walletAddress?: `0x${string}`
}) {
  const stripe = useStripe()
  const [cards, setCards] = useState<LinkedCard[]>([])
  const [loadingCards, setLoadingCards] = useState(true)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle' | 'processing' | 'polling'>('idle')
  const [error, setError] = useState('')
  const cardPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const numAmt = parseFloat(amount) || 0
  const canSubmit = numAmt >= 0.50 && !!selectedCardId && phase === 'idle'

  useEffect(() => {
    if (!walletAddress) { setLoadingCards(false); return }
    setLoadingCards(true)
    setCards([])
    setSelectedCardId(null)
    fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then(data => {
        const list: LinkedCard[] = (data?.data ?? []).filter(
          (c: LinkedCard) => c.status === 'verified' && c.fundingEligible
        )
        setCards(list)
        setSelectedCardId(list[0]?.id ?? null)
      })
      .catch(() => {})
      .finally(() => setLoadingCards(false))
  }, [walletAddress])

  async function handleCharge() {
    if (!authenticated) { login(); return }
    if (!walletAddress || !selectedCardId || numAmt < 0.50) return
    setError('')
    setPhase('processing')

    try {
      const res = await fetch('/api/gr/funding/add-money', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `linked-card-${walletAddress}-${Date.now()}`,
        },
        body: JSON.stringify({
          accountId: walletAddress,
          linkedCardId: selectedCardId,
          amount: { amount: numAmt.toFixed(2), currency: 'USD' },
          ...(walletAddress ? { destinationAddress: walletAddress } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.error?.message || 'Card charge failed. Please try again.')
        setPhase('idle')
        return
      }

      const tx = data?.data

      // Handle Stripe 3DS challenge
      if (tx?.status === 'requires_action' && tx?.challenge?.clientSecret && stripe) {
        const result = await stripe.confirmCardPayment(tx.challenge.clientSecret)
        if (result.error) {
          setError(result.error.message || '3D Secure verification failed.')
          setPhase('idle')
          return
        }
      }

      // If Circle is delivering USDC, poll until confirmed before proceeding
      if (tx?.circlePaymentId && tx?.onChainStatus === 'pending') {
        setPhase('polling')
        const fundingId = tx.id
        cardPollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/gr/funding/${encodeURIComponent(fundingId)}`)
            const pollData = await pollRes.json()
            const pollTx = pollData?.data
            if (!pollTx) return
            if (pollTx.status === 'failed') {
              clearInterval(cardPollRef.current!); setError('USDC delivery failed. Contact support.'); setPhase('idle'); return
            }
            const done = !pollTx.circlePaymentId || pollTx.onChainStatus !== 'pending'
            if (done) { clearInterval(cardPollRef.current!); onSuccess(numAmt.toFixed(2), fundingId) }
          } catch { /* keep polling on transient errors */ }
        }, 2000)
        return
      }

      onSuccess(numAmt.toFixed(2), tx?.id ?? `FUND-${Date.now().toString(36).toUpperCase()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error during charge.')
      setPhase('idle')
    }
  }

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 30, opacity: 0.2 }}>💳</div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>Connect your wallet to use a linked card</div>
        <button style={{ ...S.btnGold, width: 'auto', padding: '12px 32px' }} onClick={login}>Connect Wallet</button>
      </div>
    )
  }

  if (loadingCards) return <ProcessingScreen label="Loading your cards…" />

  if (cards.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '28px 0', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>💳</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: '#f5f0e8' }}>No Linked Cards</div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.42)', lineHeight: 1.8, maxWidth: 260 }}>
          Link a debit card on the Cards page to deposit funds directly from your bank.
        </div>
      </div>
    )
  }

  const selectedCard = cards.find(c => c.id === selectedCardId)
  const fee = numAmt > 0 ? numAmt * 0.029 + 0.30 : 0
  const net = Math.max(0, numAmt - fee)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AmountSelector amount={amount} onChange={setAmount} />
      <YieldPreview amount={numAmt} apyPct={selectedStrategySummary?.netApyPct} />

      <div style={{ ...S.card, padding: '16px 16px 14px' }}>
        <div style={S.label}>Select Card</div>
        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          {cards.map(card => {
            const active = card.id === selectedCardId
            const brandLabel = card.brand.charAt(0).toUpperCase() + card.brand.slice(1)
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedCardId(card.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  background: active ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)',
                  border: active ? '1px solid rgba(201,168,76,0.45)' : '1px solid rgba(255,255,255,0.1)',
                  color: '#f5f0e8',
                }}
              >
                <span style={{ fontSize: 22, color: active ? '#c9a84c' : 'rgba(245,240,232,0.3)', flexShrink: 0 }}>
                  {card.brand.toLowerCase() === 'mastercard' ? '◉' : '▣'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontFamily: "'Tenor Sans', sans-serif" }}>
                    {brandLabel} ···· {card.last4}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)', marginTop: 2 }}>
                    {card.cardholderName} · {card.expMonth.toString().padStart(2, '0')}/{card.expYear}
                  </div>
                </div>
                {active && <span style={{ fontSize: 14, color: '#c9a84c' }}>✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {numAmt >= 0.50 && (
        <div style={{ ...S.card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { k: 'Charge amount', v: `$${numAmt.toFixed(2)}`, hi: false },
            { k: 'Processing fee (2.9% + $0.30)', v: `-$${fee.toFixed(2)}`, hi: false, red: true },
            { k: 'Net deposited', v: `$${net.toFixed(2)}`, hi: true },
          ].map(r => (
            <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: r.hi ? '#f5f0e8' : 'rgba(245,240,232,0.45)' }}>
              <span>{r.k}</span>
              <span style={{ fontFamily: "'Tenor Sans', sans-serif", color: r.red ? '#e57373' : undefined }}>{r.v}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleCharge}
        disabled={!canSubmit}
        style={{ ...S.btnGold, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
      >
        {phase === 'processing'
          ? 'Processing…'
          : selectedCard
            ? numAmt >= 0.50
              ? `Charge ${selectedCard.brand.charAt(0).toUpperCase() + selectedCard.brand.slice(1)} ···· ${selectedCard.last4} · $${numAmt.toFixed(2)} →`
              : 'Enter amount ($0.50 minimum)'
            : 'Select a card to continue'}
      </button>

      <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.25)', textAlign: 'center', lineHeight: 1.6 }}>
        Charged via Stripe · Saved card on file · 2.9% + $0.30 processing fee
      </div>
    </div>
  )
}

function BankTransfer({ onSuccess, selectedStrategySummary }: { onSuccess: (amount: string, ref: string) => void; selectedStrategySummary?: VaultStrategySummary }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'ach' | 'wire'>('ach')
  const [copied, setCopied] = useState<string | null>(null)
  const numAmt = parseFloat(amount) || 0

  const reference = `GR-${Date.now().toString(36).toUpperCase()}`

  const ROUTING = '021000021'   // Example — replace with actual
  const ACCOUNT = '4892017563'  // Example — replace with actual
  const SWIFT = 'CHASUS33'

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const fields = method === 'ach'
    ? [
      { label: 'Bank Name', value: 'JPMorgan Chase' },
      { label: 'Routing (ABA)', value: ROUTING },
      { label: 'Account Number', value: ACCOUNT },
      { label: 'Account Name', value: 'Genesis Reserve LLC' },
      { label: 'Reference / Memo', value: reference },
    ]
    : [
      { label: 'Bank Name', value: 'JPMorgan Chase' },
      { label: 'SWIFT / BIC', value: SWIFT },
      { label: 'Account Number', value: ACCOUNT },
      { label: 'Account Name', value: 'Genesis Reserve LLC' },
      { label: 'Reference / Memo', value: reference },
    ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AmountSelector amount={amount} onChange={setAmount} />
      <YieldPreview amount={numAmt} apyPct={selectedStrategySummary?.netApyPct} />

      {/* ACH vs Wire toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['ach', 'wire'] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)} style={{
            flex: 1, padding: '11px', borderRadius: 12, cursor: 'pointer',
            background: method === m ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.03)',
            border: method === m ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.08)',
            color: method === m ? '#c9a84c' : 'rgba(245,240,232,0.4)',
            fontFamily: "'Tenor Sans', sans-serif",
          }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>{m === 'ach' ? 'ACH Transfer' : 'Wire Transfer'}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{m === 'ach' ? '1–3 business days · Free' : 'Same day · Fees may apply'}</div>
          </button>
        ))}
      </div>

      {/* Routing details */}
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase' }}>
          {method === 'ach' ? 'ACH Routing Details' : 'Wire Instructions'}
        </div>
        {fields.map((f, i) => (
          <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < fields.length - 1 ? '1px solid rgba(255,255,255,0.055)' : 'none', cursor: 'pointer' }}
            onClick={() => copy(f.label, f.value)}>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>{f.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: f.label === 'Reference / Memo' ? '#c9a84c' : '#f5f0e8', fontFamily: f.label.includes('Number') || f.label.includes('Routing') || f.label.includes('SWIFT') || f.label.includes('Reference') ? 'monospace' : "'Tenor Sans', sans-serif" }}>
                {f.value}
              </span>
              <span style={{ fontSize: 10, color: copied === f.label ? '#4caf50' : 'rgba(201,168,76,0.4)' }}>
                {copied === f.label ? '✓' : '⎘'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', lineHeight: 1.8 }}>
          <strong style={{ color: '#c9a84c' }}>Important:</strong> Include the Reference code exactly as shown. Funds are automatically matched and converted to USDC upon receipt.
          {method === 'ach' && ' ACH typically settles in 1–3 business days.'}
          {method === 'wire' && ' Domestic wires arrive same day if sent before 4PM ET.'}
        </div>
      </div>

      <button style={{ ...S.btnGold, opacity: numAmt >= 0.25 ? 1 : 0.4 }} disabled={numAmt < 0.25}
        onClick={() => onSuccess(amount, reference)}>
        I&apos;ve Initiated the Transfer ✓
      </button>
    </div>
  )
}

// ── 3. USDC Wallet Deposit ────────────────────────────────────────────────────
function USDCWalletDeposit({
  selectedStrategy,
  strategyDeskSource,
  selectedStrategySummary,
}: {
  selectedStrategy: StrategyId | null
  strategyDeskSource?: string
  selectedStrategySummary?: VaultStrategySummary
}) {
  const { login, authenticated } = usePrivy()
  const walletAddress = useActiveWalletAddress() ?? null
  const smartAccount = useSmartAccount()
  const complianceAddress = smartAccount.smartAddress ?? walletAddress
  const { walletUsdcBalance, deposit, isVaultReady, isLoading: vaultLoading } = useGenesisVault()
  const { canDeposit, complianceError } = useComplianceGate(complianceAddress)
  useAutoKYCActivate(walletAddress)
  useAutoKYCActivate(smartAccount.smartAddress)
  const depositPlanner = useVaultDepositPlan()

  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'idle' | 'processing' | 'success' | 'error' | 'blocked'>('idle')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [plannerToast, setPlannerToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const walletBal = parseFloat(walletUsdcBalance || '0')
  const numAmt = parseFloat(amount) || 0
  const canSubmit = numAmt > 0 && numAmt <= walletBal && canDeposit && isVaultReady && !!selectedStrategy
  const canPlan = Boolean(complianceAddress && selectedStrategySummary?.strategyId && numAmt > 0)

  useEffect(() => {
    if (!depositPlanner.isSuccess) return

    setPlannerToast({
      tone: 'success',
      message: 'Deposit plan built. Review route details before you execute.',
    })

    const timer = window.setTimeout(() => setPlannerToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [depositPlanner.isSuccess, depositPlanner.data])

  useEffect(() => {
    if (!depositPlanner.isError) return

    setPlannerToast({
      tone: 'error',
      message: 'Deposit plan is temporarily unavailable. Please try again.',
    })

    const timer = window.setTimeout(() => setPlannerToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [depositPlanner.isError, depositPlanner.error])

  async function handleDeposit() {
    if (!authenticated) { login(); return }
    setStep('processing')

    try {
      if (complianceAddress && selectedStrategy) {
        const intentResult = await submitDepositIntent({
          walletAddress: complianceAddress,
          strategyId: selectedStrategy,
          amount,
        })

        if (!intentResult.ok && intentResult.blocked) {
          setBlockReason(intentResult.detail)
          setStep('blocked')
          return
        }
        // Non-blocking intent capture failures (network/server) fall through
      }

      const hash = await deposit(amount)
      setTxHash(hash || '')
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed')
      setStep('error')
    }
  }

  if (step === 'processing') return <ProcessingScreen label="Approving & depositing USDC…" />

  if (step === 'blocked') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', padding: '32px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(229,115,115,0.1)', border: '1px solid rgba(229,115,115,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⛔</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8' }}>
          Accreditation Required
        </div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)', lineHeight: 1.8, maxWidth: 280 }}>
          {blockReason}
        </div>
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(229,115,115,0.06)', border: '1px solid rgba(229,115,115,0.18)', fontSize: 11, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 280, textAlign: 'left' }}>
          Accredited investor status is verified by Genesis Reserve compliance. Please contact support or select a different strategy.
        </div>
        <button style={{ ...S.btnGhost, width: 'auto', padding: '12px 28px' }} onClick={() => { setStep('idle'); setBlockReason('') }}>
          Choose a Different Strategy
        </button>
      </div>
    )
  }

  if (step === 'success') {
    const isPendle = (selectedStrategySummary?.protocol || '').toLowerCase() === 'pendle'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', padding: '24px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✓</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8' }}>Deposit Confirmed</div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.45)' }}>
          Your USDC is now earning yield in the vault via {selectedStrategySummary?.label ?? 'your selected strategy'}
        </div>
        <div style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.22)', textAlign: 'left' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'rgba(201,168,76,0.78)', textTransform: 'uppercase', marginBottom: 6 }}>
            Strategy Desk Receipt
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#f5f0e8' }}>
              {selectedStrategySummary?.label ?? selectedStrategy ?? 'Not selected'}
            </div>
            <div style={{ fontSize: 10, color: '#c9a84c' }}>
              {selectedStrategySummary ? `${selectedStrategySummary.netApyPct}% APY` : ''}
            </div>
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(245,240,232,0.45)' }}>
            {selectedStrategySummary ? `${selectedStrategySummary.protocol} · ${selectedStrategySummary.chain}` : ''}
            {strategyDeskSource ? ` · source ${strategyDeskSource}` : ''}
          </div>
        </div>
        {txHash && (
          <a href={`https://arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#c9a84c', fontFamily: 'monospace', textDecoration: 'none', padding: '7px 14px', borderRadius: 20, border: '1px solid rgba(201,168,76,0.25)' }}>
            View on Arbiscan ↗
          </a>
        )}
        {isPendle && (
          <a
            href={buildPendleUrl(selectedStrategySummary?.chain)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: '#8ee79a',
              textDecoration: 'none',
              padding: '7px 14px',
              borderRadius: 20,
              border: '1px solid rgba(76,175,80,0.32)',
              background: 'rgba(76,175,80,0.08)',
              fontFamily: "'Tenor Sans', sans-serif",
              letterSpacing: '0.04em',
            }}
          >
            Check on Pendle ↗
          </a>
        )}
        <button style={S.btnGhost} onClick={() => { setStep('idle'); setAmount(''); setTxHash('') }}>Deposit More</button>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 30, opacity: 0.2 }}>◈</div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>Connect your wallet to deposit USDC</div>
        <button style={{ ...S.btnGold, width: 'auto', padding: '12px 32px' }} onClick={login}>Connect Wallet</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {complianceError && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>{complianceError}</div>
      )}

      {canDeposit && !isVaultReady && !vaultLoading && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.22)', fontSize: 12, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, animation: 'spin 1.6s linear infinite' }}>⚙</span>
          Finalizing account setup… Your first deposit will be ready shortly.
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={S.label}>Amount (USDC)</div>
          <button type="button" onClick={() => setAmount(walletUsdcBalance)}
            style={{ fontSize: 11, color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>
            MAX ${walletBal.toFixed(2)}
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'rgba(245,240,232,0.3)' }}>$</span>
          <input type="number" style={{ ...S.input, paddingLeft: 30, fontSize: 22, fontFamily: "'Cormorant Garamond', serif" }}
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        {numAmt > walletBal && walletBal > 0 && (
          <div style={{ fontSize: 11, color: '#e57373', marginTop: 4 }}>Insufficient USDC balance</div>
        )}
      </div>

      <YieldPreview amount={numAmt} apyPct={selectedStrategySummary?.netApyPct} />

      {plannerToast && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: plannerToast.tone === 'success' ? 'rgba(76,175,80,0.07)' : 'rgba(229,115,115,0.08)',
          border: plannerToast.tone === 'success' ? '1px solid rgba(76,175,80,0.22)' : '1px solid rgba(229,115,115,0.28)',
          color: plannerToast.tone === 'success' ? '#8ee79a' : '#e9a1a1',
          fontSize: 11,
          lineHeight: 1.55,
          animation: 'slideUp 220ms ease-out',
        }}>
          {plannerToast.message}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (!complianceAddress || !selectedStrategySummary?.strategyId) return
          const amountAtomic = toUsdcAtomic(amount)
          if (!amountAtomic || amountAtomic === '0') return

          depositPlanner.mutate({
            walletAddress: complianceAddress,
            strategyId: selectedStrategySummary.strategyId,
            amountAtomic,
          })
        }}
        disabled={!canPlan || depositPlanner.isPending}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid rgba(201,168,76,0.26)',
          background: 'rgba(201,168,76,0.08)',
          color: '#c9a84c',
          fontSize: 11,
          letterSpacing: '0.08em',
          fontFamily: "'Tenor Sans', sans-serif",
          cursor: 'pointer',
          opacity: canPlan ? 1 : 0.6,
        }}
      >
        {depositPlanner.isPending ? 'Building Deposit Plan...' : 'Preview Deposit Plan'}
      </button>

      {depositPlanner.data && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(201,168,76,0.06)',
          border: '1px solid rgba(201,168,76,0.22)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: '#f5f0e8' }}>
              Plan ready for {selectedStrategySummary?.label ?? selectedStrategy ?? 'selected strategy'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase' }}>
              source {depositPlanner.data.meta.source}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)', lineHeight: 1.6 }}>
            Estimated settlement: ~{Math.max(1, Math.round(depositPlanner.data.estimatedSettlementSeconds / 60))} min
            {' · '}
            planned steps: {depositPlanner.data.transactionPlan.length}
          </div>
        </div>
      )}

      {!selectedStrategy && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>
          Please select one strategy before depositing.
        </div>
      )}

      {step === 'error' && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>{error}</div>}

      <button style={{ ...S.btnGold, opacity: canSubmit ? 1 : 0.4 }} disabled={!canSubmit} onClick={handleDeposit}>
        Deposit to {selectedStrategySummary?.label ?? selectedStrategy ?? 'Selected strategy'} →
      </button>

      <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.2)', textAlign: 'center' }}>
        ⚡ Gas fees covered by Genesis Reserve
      </div>
    </div>
  )
}

// ── 4. Crypto Convert placeholder ────────────────────────────────────────────
function CryptoConvert({ onNavigateSwap }: { onNavigateSwap?: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 0', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⇄</div>
      <div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8', marginBottom: 6 }}>Swap to USDC</div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', lineHeight: 1.8, maxWidth: 280 }}>
          Convert ETH or other crypto directly to USDC via Uniswap V3 on Arbitrum — then deposit to your vault.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <button style={S.btnGold} onClick={onNavigateSwap}>Open Swap →</button>
        <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.2)' }}>Best rates · No slippage above 0.5% · Arbitrum One</div>
      </div>
    </div>
  )
}

// ── 0. CCTP Deposit — PRIMARY on-ramp ────────────────────────────────────────
function CCTPDeposit({
  onSuccess,
  selectedStrategySummary,
}: {
  onSuccess: (amount: string, ref: string, relayTxHash?: string) => void
  selectedStrategySummary?: VaultStrategySummary
}) {
  const { login, authenticated } = usePrivy()
  const cctp = useCCTPTransfer()

  const [amount, setAmount] = useState('')
  const [sourceChain, setSourceChain] = useState<CctpChainKey | 'arbitrum'>('ethereum')
  const numAmt = parseFloat(amount) || 0
  const walletAddress = useActiveWalletAddress()

  // Arbitrum address is the same as the user's wallet (Privy embedded EOA)
  const arbitrumAddress = walletAddress ?? ''

  // When relay completes, surface success
  useEffect(() => {
    if (cctp.phase === 'minted' && cctp.mintedAmount) {
      const ref = `CCTP-${(cctp.relayTxHash ?? cctp.burnTxHash ?? '').slice(2, 10).toUpperCase()}`
      onSuccess(cctp.mintedAmount, ref, cctp.relayTxHash ?? undefined)
    }
  }, [cctp.phase, cctp.mintedAmount, cctp.relayTxHash, cctp.burnTxHash, onSuccess])

  if (cctp.phase === 'approving') return <ProcessingScreen label="Approving USDC…" />
  if (cctp.phase === 'burning') return <ProcessingScreen label="Burning USDC on source chain…" />
  if (cctp.phase === 'relaying') return <ProcessingScreen label="Circle attesting transfer (~24 s)…" />

  if (cctp.phase === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>
          {cctp.error}
        </div>
        <button style={S.btnGhost} onClick={cctp.reset}>Try Again</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AmountSelector amount={amount} onChange={setAmount} />
      <YieldPreview amount={numAmt} apyPct={selectedStrategySummary?.netApyPct} />

      {/* ── Source chain selector ──────────────────────────────────── */}
      <div>
        <div style={S.label}>From Chain</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {(['ethereum', 'base', 'arbitrum'] as const).map(ch => (
            <button
              key={ch}
              type="button"
              onClick={() => setSourceChain(ch)}
              style={{
                flex: 1, padding: '11px', borderRadius: 12, cursor: 'pointer',
                background: sourceChain === ch ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.03)',
                border: sourceChain === ch ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.08)',
                color: sourceChain === ch ? '#c9a84c' : 'rgba(245,240,232,0.4)',
                fontFamily: "'Tenor Sans', sans-serif",
              }}
            >
              <div style={{ fontSize: 12, marginBottom: 2 }}>{ch === 'ethereum' ? 'Ethereum' : ch === 'base' ? 'Base' : 'Arbitrum'}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{ch === 'ethereum' ? 'ETH Mainnet' : ch === 'base' ? 'Base L2' : 'Already here'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Arbitrum redirect banner ──────────────────────────────── */}
      {sourceChain === 'arbitrum' ? (
        <div style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#c9a84c', fontFamily: "'Tenor Sans', sans-serif" }}>Already on Arbitrum?</div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.55)', lineHeight: 1.7 }}>
            You don&apos;t need to bridge. Switch to the <strong style={{ color: '#f5f0e8' }}>USDC Wallet</strong> tab above to deposit your Arbitrum USDC directly into the vault — no bridging, no extra gas.
          </div>
        </div>
      ) : (
        <>
          {/* ── Best option banner ─────────────────────────────────── */}
          <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20 }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#4caf50', fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, marginBottom: 2 }}>Fastest & Cheapest Option</div>
              <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.6)', lineHeight: 1.5 }}>
                No minimum amounts • ~24 seconds • Genesis pays gas • Start earning yield immediately
              </div>
            </div>
          </div>

          {/* ── How it works ──────────────────────────────────────── */}
          <div style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, color: '#f5f0e8', fontFamily: "'Tenor Sans', sans-serif" }}>Circle CCTP</div>
              <div style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', fontSize: 10, fontWeight: 700, color: '#c9a84c', letterSpacing: '0.06em' }}>~24 s</div>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)' }}>Burn-and-mint · Native USDC · Genesis pays Arbitrum gas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['1', `Burn USDC on ${sourceChain === 'ethereum' ? 'Ethereum' : 'Base'} — you sign once`],
                ['2', 'Circle attests the burn (~24 s fast path)'],
                ['3', 'Genesis relayer mints USDC to your Arbitrum wallet'],
              ].map(([n, text]) => (
                <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#c9a84c', fontWeight: 700 }}>{n}</div>
                  <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', lineHeight: 1.6, paddingTop: 1 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!authenticated) { login(); return }
              if (!arbitrumAddress) return
              void cctp.burn({ amountUsdc: numAmt.toFixed(2), sourceChain: sourceChain as CctpChainKey, arbitrumAddress })
            }}
            style={{ ...S.btnGold, opacity: (authenticated && numAmt >= 1) ? 1 : 0.5 }}
          >
            {authenticated
              ? numAmt >= 1
                ? `Transfer ${numAmt.toFixed(2)} USDC via CCTP →`
                : 'Enter amount (min $1.00)'
              : 'Connect Wallet to Continue →'}
          </button>
        </>
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(245,240,232,0.18)', lineHeight: 1.8 }}>
        Native USDC · No wrapping · Powered by Circle CCTP v2
      </div>
    </div>
  )
}

// ── DepositFlow (main export) ─────────────────────────────────────────────────
type Method = 'cctp' | 'linked-card' | 'card' | 'bank' | 'usdc' | 'crypto'
const CARD_DEPOSIT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CARD_DEPOSIT === 'true'

interface DepositFlowProps {
  onNavigateSwap?: () => void
}

const METHODS: Array<{ key: Method; icon: string; label: string; sub: string; featured?: boolean }> = [
  { key: 'cctp', icon: '⚡', label: 'USDC Transfer', sub: 'Fastest · No minimum', featured: true },
  { key: 'linked-card', icon: '💳', label: 'Linked Card', sub: 'Saved debit card' },
  { key: 'usdc', icon: '◈', label: 'Arbitrum USDC', sub: 'From your wallet' },
  { key: 'bank', icon: '🏦', label: 'Bank Transfer', sub: 'ACH · Wire' },
  { key: 'crypto', icon: '⇄', label: 'Crypto Swap', sub: 'ETH → USDC' },
]

if (CARD_DEPOSIT_ENABLED) {
  METHODS.splice(1, 0, { key: 'card', icon: '💳', label: 'Card', sub: 'Visa · Mastercard' })
}

// ── Horizontal method drawer ──────────────────────────────────────────────────
function MethodDrawer({
  method, onChange,
}: { method: Method; onChange: (m: Method) => void }) {
  const [open, setOpen] = useState(false)
  const active = METHODS.find(m => m.key === method)!

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      {/* ── Collapsed pill ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: 12, padding: '13px 16px', borderRadius: open ? '16px 16px 0 0' : 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(201,168,76,0.25)',
          borderBottom: open ? '1px solid transparent' : '1px solid rgba(201,168,76,0.25)',
          cursor: 'pointer', transition: 'border-radius 0.22s',
        }}
      >
        {/* Drag handle dots */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, flexShrink: 0 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 3.5 }}>
              {[0, 1].map(j => (
                <div key={j} style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(201,168,76,0.45)' }} />
              ))}
            </div>
          ))}
        </div>

        {/* Active method */}
        <span style={{ fontSize: 18, lineHeight: 1 }}>{active.icon}</span>
        <div style={{ flex: 1, textAlign: 'left', position: 'relative' }}>
          {active.featured && (
            <div style={{
              position: 'absolute',
              top: -6,
              left: 0,
              fontSize: 7,
              color: '#4caf50',
              fontWeight: 'bold',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              ★ Best Option
            </div>
          )}
          <div style={{ fontSize: 13, color: '#f5f0e8', fontFamily: "'Tenor Sans', sans-serif" }}>{active.label}</div>
          <div style={{ fontSize: 10, color: '#c9a84c', marginTop: 1 }}>{active.sub}</div>
        </div>

        {/* Action hint + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.25)', textTransform: 'uppercase' }}>
            Change
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(201,168,76,0.55)" strokeWidth="2" strokeLinecap="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s ease' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* ── Expanded drawer ────────────────────────────────────────── */}
      <div style={{
        overflow: 'hidden',
        maxHeight: open ? 140 : 0,
        transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1)',
        background: 'rgba(255,255,255,0.025)',
        borderLeft: '1px solid rgba(201,168,76,0.25)',
        borderRight: '1px solid rgba(201,168,76,0.25)',
        borderBottom: open ? '1px solid rgba(201,168,76,0.25)' : 'none',
        borderRadius: '0 0 16px 16px',
      }}>
        <div style={{
          display: 'flex', gap: 0, padding: '12px 10px',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {METHODS.map((m, i) => {
            const isActive = m.key === method
            const isFeatured = m.featured
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => { onChange(m.key); setOpen(false) }}
                style={{
                  flex: '0 0 auto', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 5, padding: '10px 16px',
                  borderRadius: 12, cursor: 'pointer',
                  background: isActive ? 'rgba(201,168,76,0.12)' : isFeatured ? 'rgba(76,175,80,0.08)' : 'transparent',
                  border: isActive ? '1px solid rgba(201,168,76,0.35)' : isFeatured ? '1px solid rgba(76,175,80,0.25)' : '1px solid transparent',
                  marginRight: i < METHODS.length - 1 ? 6 : 0,
                  transition: 'all 0.15s',
                  minWidth: 88,
                  position: 'relative',
                }}
              >
                {isFeatured && (
                  <div style={{
                    position: 'absolute',
                    top: -2,
                    right: 8,
                    fontSize: 8,
                    color: '#4caf50',
                    fontWeight: 'bold',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    Best
                  </div>
                )}
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                <span style={{ fontSize: 11, color: isActive ? '#f5f0e8' : isFeatured ? '#4caf50' : 'rgba(245,240,232,0.45)', fontFamily: "'Tenor Sans', sans-serif", whiteSpace: 'nowrap' }}>
                  {m.label}
                </span>
                <span style={{ fontSize: 9, color: isActive ? '#c9a84c' : isFeatured ? '#4caf50' : 'rgba(245,240,232,0.25)', whiteSpace: 'nowrap' }}>
                  {m.sub}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* hide scrollbar */}
      <style>{`.method-drawer-scroll::-webkit-scrollbar{display:none}`}</style>
    </div>
  )
}

export function DepositFlow({ onNavigateSwap }: DepositFlowProps) {
  const walletAddress = useActiveWalletAddress()
  const [method, setMethod] = useState<Method>('cctp')
  const [success, setSuccess] = useState<{ amount: string; ref: string; txHash?: string } | null>(null)
  const [strategyToast, setStrategyToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [tierBanner, setTierBanner] = useState<PendingTierInfo | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem('gr:pending-tier')
      if (!raw) return null
      return JSON.parse(raw) as PendingTierInfo
    } catch {
      return null
    }
  })
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem('gr:pending-tier')
      if (!raw) return null
      const info = JSON.parse(raw) as PendingTierInfo
      return (info?.strategyId || null) as string | null
    } catch {
      return null
    }
  })

  const walletAddressLower = walletAddress?.toLowerCase() ?? null
  const intentTier = toIntentTier(tierBanner?.tierKey)
  const chainScope = CHAIN_SCOPE_BY_TIER[intentTier]
  const { data: strategyDesk } = useVaultStrategies(intentTier, chainScope)

  const rankedStrategies = useMemo(() => {
    const allowedRisk = TIER_RISK_GATE[intentTier]
    return [...(strategyDesk?.strategies ?? [])]
      .filter((strategy) => allowedRisk.includes(strategy.riskLevel))
      .sort((a, b) => parseApy(b.netApyPct) - parseApy(a.netApyPct))
  }, [strategyDesk?.strategies, intentTier])

  const strategiesById = useMemo(() => {
    const map: Record<string, VaultStrategySummary> = {}
    for (const strategy of rankedStrategies) {
      map[strategy.strategyId] = strategy
    }
    return map
  }, [rankedStrategies])

  const selectedStrategySummary = selectedStrategy ? strategiesById[selectedStrategy] : undefined

  const deskRecommendedKey = useMemo<StrategyId | null>(() => {
    const id = strategyDesk?.recommendedStrategyId
    if (id && strategiesById[id]) return id
    return rankedStrategies[0]?.strategyId ?? null
  }, [strategyDesk?.recommendedStrategyId, strategiesById, rankedStrategies])

  const tierBannerStrategyId = useMemo(() => {
    return resolveStrategyIdFromPreference(tierBanner?.strategyId ?? null, rankedStrategies)
  }, [tierBanner?.strategyId, rankedStrategies])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('gr:pending-tier')
    }
  }, [])

  useEffect(() => {
    const fallback = deskRecommendedKey ?? rankedStrategies[0]?.strategyId ?? null

    if (!walletAddressLower) {
      setSelectedStrategy((prev) => {
        if (prev && strategiesById[prev]) return prev
        return tierBannerStrategyId ?? fallback
      })
      return
    }

    const key = `gr:strategy:${walletAddressLower}`
    const savedLocal = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    const savedLocalResolved = resolveStrategyIdFromPreference(savedLocal, rankedStrategies)

    setSelectedStrategy((prev) => {
      if (prev && strategiesById[prev]) return prev
      return tierBannerStrategyId ?? savedLocalResolved ?? fallback
    })

    let cancelled = false

    const hydratePreference = async () => {
      try {
        const serverPrefRaw = await loadServerStrategyPreference(walletAddressLower)
        const serverPrefResolved = resolveStrategyIdFromPreference(serverPrefRaw, rankedStrategies)
        if (!cancelled && serverPrefResolved) {
          setSelectedStrategy((prev) => {
            if (prev && strategiesById[prev]) return prev
            return serverPrefResolved
          })
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, serverPrefResolved)
          }
        }
      } catch {
        // Keep local strategy if backend preference lookup fails.
      }
    }

    void hydratePreference()

    return () => {
      cancelled = true
    }
  }, [walletAddressLower, tierBannerStrategyId, deskRecommendedKey, rankedStrategies, strategiesById])

  useEffect(() => {
    if (!selectedStrategy || !deskRecommendedKey || selectedStrategy === deskRecommendedKey) return

    const savedSummary = strategiesById[selectedStrategy]
    const deskSummary = strategiesById[deskRecommendedKey]
    if (!savedSummary || !deskSummary) return

    const yieldDelta = parseApy(deskSummary.netApyPct) - parseApy(savedSummary.netApyPct)

    if (yieldDelta >= 2) {
      setSelectedStrategy(deskRecommendedKey)
      setStrategyToast({
        tone: 'success',
        message: `Upgraded to ${deskSummary.label} — ${yieldDelta.toFixed(1)}% more yield than your previous selection.`,
      })
    }
  }, [selectedStrategy, deskRecommendedKey, strategiesById])

  useEffect(() => {
    if (!strategyToast) return
    const timer = window.setTimeout(() => setStrategyToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [strategyToast])

  useEffect(() => {
    if (!walletAddressLower || !selectedStrategy || typeof window === 'undefined') {
      return
    }

    const key = `gr:strategy:${walletAddressLower}`
    window.localStorage.setItem(key, selectedStrategy)

    void persistServerStrategyPreference(walletAddressLower, selectedStrategy).catch(() => {
      setStrategyToast({
        tone: 'error',
        message: 'Strategy selected locally. Cloud sync is temporarily unavailable.',
      })
    })
  }, [walletAddressLower, selectedStrategy])

  function handleStrategySelect(next: StrategyId) {
    setSelectedStrategy(next)
    setStrategyToast({
      tone: 'success',
      message: `Strategy selected: ${getStrategyLabel(next, strategiesById)}`,
    })
  }

  const methodLabel = METHODS.find(m => m.key === method)?.label ?? 'Deposit'

  useEffect(() => {
    if (method === 'card' && !CARD_DEPOSIT_ENABLED) {
      setMethod('usdc')
    }
  }, [method])

  if (success) {
    return (
      <SuccessScreen
        amount={success.amount}
        method={methodLabel}
        reference={success.ref}
        txHash={success.txHash}
        strategyLabel={selectedStrategySummary?.label ?? getStrategyLabel(selectedStrategy, strategiesById)}
        strategyProtocol={selectedStrategySummary?.protocol}
        strategyChain={selectedStrategySummary?.chain}
        strategyDeskSource={strategyDesk?.meta.source}
        onReset={() => setSuccess(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {tierBanner && (
        <TierInfoBanner
          info={tierBanner}
          liveStrategy={tierBannerStrategyId ? strategiesById[tierBannerStrategyId] : undefined}
          onDismiss={() => setTierBanner(null)}
        />
      )}

      {strategyToast && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: strategyToast.tone === 'success' ? 'rgba(76,175,80,0.07)' : 'rgba(229,115,115,0.08)',
          border: strategyToast.tone === 'success' ? '1px solid rgba(76,175,80,0.22)' : '1px solid rgba(229,115,115,0.28)',
          color: strategyToast.tone === 'success' ? '#8ee79a' : '#e9a1a1',
          fontSize: 11,
          lineHeight: 1.55,
          animation: 'slideUp 220ms ease-out',
        }}>
          {strategyToast.message}
        </div>
      )}

      {/* Method drawer */}
      <MethodDrawer method={method} onChange={setMethod} />

      {(method === 'cctp' || method === 'bank' || method === 'usdc' || method === 'linked-card' || (CARD_DEPOSIT_ENABLED && method === 'card')) && (
        <>
          {tierBanner?.strategyLabel && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'rgba(201,168,76,0.72)', textTransform: 'uppercase', marginBottom: 6 }}>
                Vault Handoff
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ fontSize: 13, color: '#f5f0e8' }}>
                  {tierBanner.strategyLabel}
                </div>
                {deskRecommendedKey && (
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.42)' }}>
                    Desk routing: {getStrategyLabel(deskRecommendedKey, strategiesById)}
                  </div>
                )}
              </div>
            </div>
          )}

          <StrategySelector
            selectedStrategy={selectedStrategy}
            onChange={handleStrategySelect}
            strategies={rankedStrategies}
            sourceLabel={strategyDesk?.meta.source}
          />
        </>
      )}

      {/* Active method content — CCTP is primary */}
      {method === 'cctp' && (
        <CCTPDeposit
          onSuccess={(amt, ref, relayTxHash) => setSuccess({ amount: amt, ref, txHash: relayTxHash })}
          selectedStrategySummary={selectedStrategySummary}
        />
      )}
      {method === 'linked-card' && <LinkedCardDeposit onSuccess={(amt, ref) => setSuccess({ amount: amt, ref })} selectedStrategySummary={selectedStrategySummary} />}
      {CARD_DEPOSIT_ENABLED && method === 'card' && <CardDeposit onSuccess={(amt, ref) => setSuccess({ amount: amt, ref })} selectedStrategySummary={selectedStrategySummary} />}
      {method === 'bank' && <BankTransfer onSuccess={(amt, ref) => setSuccess({ amount: amt, ref })} selectedStrategySummary={selectedStrategySummary} />}
      {method === 'usdc' && (
        <USDCWalletDeposit
          selectedStrategy={selectedStrategy}
          strategyDeskSource={strategyDesk?.meta.source}
          selectedStrategySummary={selectedStrategySummary}
        />
      )}
      {method === 'crypto' && <CryptoConvert onNavigateSwap={onNavigateSwap} />}
    </div>
  )
}
