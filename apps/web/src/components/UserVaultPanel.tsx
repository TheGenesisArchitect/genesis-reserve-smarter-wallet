'use client'

// UserVaultPanel — shows the authenticated user's live vault position.
// Reads on-chain share balance + mode, drives the yield ticker, and
// presents a per-pool earnings breakdown. Rendered above the pool cards.

import { useMemo } from 'react'
import { useGenesisVault, type VaultMode } from '../hooks/useGenesisVault'
import { useYieldTicker } from '../hooks/useYieldTicker'
import type { ViewKey } from './AppShell'

// ── Pool metadata ─────────────────────────────────────────────────────────────

interface PoolMeta {
  name: string
  label: string
  color: string
  apyFloor: number
  apyCeil: number
  description: string
  memberCap: number    // Locked committed yield ceiling
  mgmtFeePct: number  // Annual management fee
}

const POOL_META: Record<VaultMode, PoolMeta> = {
  0: { name: 'Preserve',   label: 'Flexible Reserve',  color: '#00D4AA', apyFloor: 4,  apyCeil: 6,   description: 'Capital-protected · T-Bills · Stable',                    memberCap: 5.0,  mgmtFeePct: 0.60 },
  1: { name: 'Grow',       label: 'Income Vault',      color: '#c9a84c', apyFloor: 6,  apyCeil: 12,  description: 'Multi-protocol · Morpho + Aave · Weekly distributions',   memberCap: 8.0,  mgmtFeePct: 0.85 },
  2: { name: 'Accelerate', label: 'Growth Mode',       color: '#9B6DFF', apyFloor: 13, apyCeil: 22,  description: 'Max yield · Balancer · Priority execution',                memberCap: 12.0, mgmtFeePct: 1.10 },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: color ?? '#fff', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>
      )}
    </div>
  )
}

function ProgressBar({ label, valuePct, color }: { label: string; valuePct: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}>
        <span style={{ textTransform: 'uppercase' }}>{label}</span>
        <span>{valuePct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: '100%', borderRadius: 2, background: color, width: `${Math.min(100, valuePct)}%`, transition: 'width 1s ease' }} />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNavigate }: { onNavigate?: (v: ViewKey) => void }) {
  return (
    <div style={{
      border: '1px solid rgba(201,168,76,0.18)',
      borderRadius: 12,
      padding: '20px 24px',
      background: 'rgba(201,168,76,0.04)',
      marginBottom: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
          No active position
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          Select a pool below and deposit USDC to start earning.
        </div>
      </div>
      {onNavigate && (
        <button
          onClick={() => onNavigate('deposit')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: '1px solid rgba(201,168,76,0.4)',
            background: 'rgba(201,168,76,0.12)',
            color: '#c9a84c',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
          }}
        >
          Start Earning →
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function UserVaultPanel({
  onNavigate,
  isMobile = false,
}: {
  onNavigate?: (v: ViewKey) => void
  isMobile?: boolean
}) {
  const { usdcBalance, vaultMode, isVaultReady, isLoading } = useGenesisVault()
  const balanceNum = parseFloat(usdcBalance) || 0
  const ticker = useYieldTicker(balanceNum, isVaultReady && balanceNum > 0)

  const pool = vaultMode !== null ? POOL_META[vaultMode] : null

  // Earnings projected at the committed member cap — not the raw ticker APY.
  // This ensures what the user sees matches what the blended basket guarantees.
  const memberCap   = pool?.memberCap ?? 8.0
  const liveApy     = ticker.apy > 0 ? ticker.apy : (pool?.apyFloor ?? 6)
  const displayApy  = Math.min(liveApy, memberCap)   // cap-bounded display APY
  const earnDaily   = balanceNum * (displayApy / 100) / 365.25
  const earnMonthly = earnDaily * 30.44
  const earnAnnual  = balanceNum * (displayApy / 100)

  // How far through the cap the current live APY sits (0–100%)
  const capProgressPct = useMemo(() => {
    if (memberCap <= 0) return 0
    return Math.min(100, (liveApy / memberCap) * 100)
  }, [liveApy, memberCap])

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
        background: 'rgba(255,255,255,0.02)',
        height: 90,
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
    )
  }

  // ── No position yet ────────────────────────────────────────────────────────
  if (!isVaultReady || balanceNum === 0) {
    return <EmptyState onNavigate={onNavigate} />
  }

  const color = pool?.color ?? '#c9a84c'

  return (
    <div style={{
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: isMobile ? '16px' : '20px 24px',
      background: `linear-gradient(135deg, ${color}08 0%, rgba(10,10,14,0.0) 100%)`,
      marginBottom: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Subtle glow accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
      }} />

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
            <span style={{ fontSize: 11, color, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
              {pool?.name ?? 'Grow'} Pool · {pool?.label ?? 'Income Vault'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
            {pool?.description}
          </div>
        </div>

        {/* Live balance + ticker */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            ${ticker.liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: color, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            {ticker.yieldTodayDisplay} today
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap: isMobile ? '14px 20px' : '0 32px',
        marginBottom: 18,
      }}>
        <StatBox
          label="Your Cap"
          value={`${memberCap.toFixed(1)}%`}
          sub="committed yield"
          color={color}
        />
        <StatBox
          label="Daily"
          value={`$${earnDaily.toFixed(4)}`}
          sub="earnings / day"
        />
        <StatBox
          label="Monthly"
          value={`$${earnMonthly.toFixed(2)}`}
          sub="est. at cap"
        />
        <StatBox
          label="Annual"
          value={`$${earnAnnual.toFixed(2)}`}
          sub="est. at cap"
        />
      </div>

      {/* ── Cap utilisation bar ──────────────────────────────────────────── */}
      {pool && (
        <div style={{ marginBottom: 14 }}>
          <ProgressBar
            label={`Engine yield vs your ${memberCap.toFixed(1)}% cap — ${liveApy.toFixed(2)}% current`}
            valuePct={capProgressPct}
            color={color}
          />
        </div>
      )}

      {/* ── Action row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={() => onNavigate?.('deposit')}
          style={{
            padding: '7px 16px',
            borderRadius: 7,
            border: `1px solid ${color}50`,
            background: `${color}15`,
            color,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          + Add Funds
        </button>
        <button
          onClick={() => onNavigate?.('vault-withdraw')}
          style={{
            padding: '7px 16px',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          Withdraw
        </button>
      </div>
    </div>
  )
}
