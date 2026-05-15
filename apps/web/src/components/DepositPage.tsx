'use client'

import { DepositFlow } from './DepositFlow'
import type { ViewKey } from './AppShell'

interface DepositPageProps {
  onNavigate?: (v: ViewKey) => void
}

export function DepositPage({ onNavigate }: DepositPageProps) {
  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 720, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>
          Fund Your Account
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em', marginBottom: 6 }}>
          Add Money
        </div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>
          Fund your Genesis Reserve vault — earn yield from the moment your deposit settles
        </div>
      </div>

      {/* ── Trust row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        {[
          { icon: '⚡', label: 'Fastest deposits', sub: 'CCTP in ~24 seconds' },
          { icon: '💰', label: 'No minimum amounts', sub: 'Any USDC amount' },
          { icon: '◈', label: 'Yield starts immediately', sub: '5.30% APY blended' },
        ].map(item => (
          <div key={item.label} style={{
            flex: 1, padding: '12px 14px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 16, marginBottom: 5 }}>{item.icon}</div>
            <div style={{ fontSize: 11, color: '#f5f0e8', marginBottom: 2, letterSpacing: '0.02em' }}>{item.label}</div>
            <div style={{ fontSize: 10, color: '#c9a84c' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* ── DepositFlow ──────────────────────────────────────────────── */}
      <DepositFlow onNavigateSwap={() => onNavigate?.('swap')} />

    </div>
  )
}
