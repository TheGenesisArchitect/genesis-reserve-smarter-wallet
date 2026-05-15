'use client'

import type { CSSProperties } from 'react'
import { formatUnits } from 'viem'
import { useAdminConsole } from '../hooks/useAdminConsole'

function fmtUsdc(raw: string) {
    return `$${Number(formatUnits(BigInt(raw || '0'), 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export function AdminConsolePanel() {
    const { data, isLoading, error } = useAdminConsole()

    return (
        <div style={S.root}>
            <section style={S.panel}>
                <div style={S.title}>Admin Stats</div>
                {isLoading ? <div style={S.empty}>Loading admin stats…</div> : error ? <div style={S.error}>Unable to load admin console.</div> : (
                    <div style={S.statsGrid}>
                        {(data?.stats ?? []).map((card) => (
                            <div key={card.key} style={S.card}>
                                <div style={S.cardLabel}>{card.label}</div>
                                <div style={S.cardValue}>{card.value}</div>
                                {card.delta && <div style={S.delta}>{card.delta}</div>}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section style={S.panel}>
                <div style={S.title}>Users</div>
                <div style={S.table}>
                    {(data?.users ?? []).map((user) => (
                        <div key={user.userId} style={S.row}>
                            <span>{user.userId}</span>
                            <span>{user.displayName}</span>
                            <span>{user.kycTier}</span>
                            <span>{user.status}</span>
                            <span>{fmtUsdc(user.volumeUsdc)}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>Feature Flags</div>
                <div style={S.flags}>
                    {(data?.featureFlags ?? []).map((flag) => (
                        <div key={flag.key} style={S.flagRow}>
                            <div>
                                <div style={S.flagKey}>{flag.key}</div>
                                <div style={S.flagDesc}>{flag.description}</div>
                            </div>
                            <span style={{ ...S.badge, ...(flag.enabled ? S.enabled : S.disabled) }}>{flag.enabled ? 'ENABLED' : 'DISABLED'}</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    root: { display: 'flex', flexDirection: 'column', gap: 14 },
    panel: { background: '#12141C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' },
    title: { fontFamily: 'JetBrains Mono, monospace', color: '#C9A84C', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11, marginBottom: 10 },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 },
    card: { border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px' },
    cardLabel: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A5650', textTransform: 'uppercase' },
    cardValue: { marginTop: 6, color: '#F0EDE8', fontSize: 18, fontWeight: 700 },
    delta: { marginTop: 4, color: '#18C870', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    table: { display: 'flex', flexDirection: 'column', gap: 6 },
    row: { display: 'grid', gridTemplateColumns: '120px 1.4fr 120px 120px 140px', gap: 10, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#F0EDE8' },
    flags: { display: 'flex', flexDirection: 'column', gap: 8 },
    flagRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' },
    flagKey: { color: '#F0EDE8', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
    flagDesc: { color: '#A8A49E', fontSize: 11 },
    badge: { borderRadius: 999, padding: '3px 8px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
    enabled: { color: '#18C870', background: 'rgba(24,200,112,0.12)', border: '1px solid rgba(24,200,112,0.25)' },
    disabled: { color: '#F0A020', background: 'rgba(240,160,32,0.12)', border: '1px solid rgba(240,160,32,0.25)' },
    empty: { color: '#A8A49E', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
    error: { border: '1px solid rgba(224,64,64,0.25)', background: 'rgba(224,64,64,0.10)', color: '#E04040', borderRadius: 8, padding: '10px 12px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
}
