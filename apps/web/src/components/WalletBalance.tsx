// genesis-privy/src/components/WalletBalance.tsx [FIXED v2]
// Now consumes useYieldEngine — all mock data removed.
'use client'
import { useYieldEngine } from '../hooks/useYieldEngine'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'

export function WalletBalance() {
  const address = useActiveWalletAddress()
  const engine = useYieldEngine()

  const dollars = Math.floor(engine.liveBalance).toLocaleString('en-US')
  const cents = (engine.liveBalance % 1).toFixed(4).slice(1)

  if (!address) {
    return (
      <div style={S.card}>
        <div style={S.label}>AVAILABLE BALANCE</div>
        <div style={{ ...S.amount, color: 'rgba(240,237,232,0.3)' }}>$—</div>
        <div style={{ fontSize: 12, color: '#5A5650', marginTop: 6 }}>Connect wallet to see balance</div>
      </div>
    )
  }

  return (
    <div style={S.card}>
      <div style={S.label}>AVAILABLE BALANCE</div>

      {/* Live balance */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={S.amount}>${dollars}</span>
        <span style={S.cents}>{cents}</span>
      </div>

      {/* Yield ticker */}
      <div style={S.yieldRow}>
        <div style={S.pulseDot} className="animate-pulse-slow" />
        <span style={S.yieldText}>
          {engine.isLoading ? '+$0.0000' : engine.yieldTodayDisplay} today
        </span>
        <span style={S.apyBadge}>
          {engine.displayApy.toFixed(2)}% APY
        </span>
      </div>

      {/* Live allocation bar — from StrategyRouter.getStrategyAllocations() */}
      <div style={S.allocBar}>
        {engine.allocations.filter(a => a.isActive).map(a => (
          <div
            key={a.adapter}
            title={`${a.name}: ${a.pct.toFixed(0)}%`}
            style={{ flex: a.pct, background: a.bandColor, height: '100%', borderRadius: 1, transition: 'flex 0.4s ease' }}
          />
        ))}
      </div>

      {/* Allocation labels */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginTop: 4 }}>
        {engine.allocations.filter(a => a.isActive).map(a => (
          <span key={a.adapter} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: a.bandColor }}>
            {a.name} {a.pct.toFixed(0)}%
          </span>
        ))}
      </div>

      {/* Circuit breaker alert */}
      {engine.circuitBreakerActive && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#E04040', fontFamily: 'JetBrains Mono, monospace' }}>
          ⚠ CIRCUIT BREAKER ACTIVE
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  card: {
    background: 'linear-gradient(135deg, rgba(201,168,76,0.09) 0%, rgba(201,168,76,0.03) 100%)',
    border: '1px solid rgba(201,168,76,0.20)', borderRadius: 16, padding: '18px 20px',
    fontFamily: 'Sora, sans-serif',
  },
  label: {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A5650',
    letterSpacing: '0.10em', marginBottom: 4,
  },
  amount: { fontFamily: 'JetBrains Mono, monospace', fontSize: 44, fontWeight: 700, color: '#F0EDE8', lineHeight: 1 },
  cents: { fontFamily: 'JetBrains Mono, monospace', fontSize: 26, color: '#A8A49E' },
  yieldRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 },
  pulseDot: { width: 6, height: 6, borderRadius: '50%', background: '#18C870', flexShrink: 0 },
  yieldText: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#18C870', flex: 1 },
  apyBadge: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A5650' },
  allocBar: { display: 'flex', gap: 1.5, height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 10 },
}
