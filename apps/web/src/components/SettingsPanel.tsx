'use client'

import type { CSSProperties } from 'react'
import { useSettings } from '../hooks/useSettings'

export function SettingsPanel({ walletAddress }: { walletAddress?: string }) {
    const { data, isLoading, error } = useSettings(walletAddress)

    return (
        <div style={S.root}>
            <section style={S.panel}>
                <div style={S.title}>Wallet & Network</div>
                {!walletAddress ? <div style={S.empty}>Connect wallet to view settings.</div> : isLoading ? <div style={S.empty}>Loading settings…</div> : error ? <div style={S.error}>Unable to load settings.</div> : data ? (
                    <div style={S.grid2}>
                        <div style={S.card}><div style={S.k}>Wallet</div><div style={S.v}>{data.walletAddress}</div></div>
                        <div style={S.card}><div style={S.k}>Network</div><div style={S.v}>{data.network.network} ({data.network.chainId})</div></div>
                        <div style={S.card}><div style={S.k}>Bundler</div><div style={S.v}>{data.network.bundler}</div></div>
                        <div style={S.card}><div style={S.k}>Paymaster</div><div style={S.v}>{data.network.paymaster}</div></div>
                    </div>
                ) : null}
            </section>

            <section style={S.panel}>
                <div style={S.title}>Contract Registry</div>
                <div style={S.table}>
                    {(data?.contracts ?? []).map((contract) => (
                        <div key={contract.name} style={S.row}>
                            <span>{contract.name}</span>
                            <span style={S.addr}>{contract.address}</span>
                            <span>{contract.status}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>API Key</div>
                <div style={S.card}>
                    <div style={S.k}>{data?.apiKey.label ?? 'Partner API Key'}</div>
                    <div style={S.v}>{data?.apiKey.maskedKey ?? '—'}</div>
                    <div style={S.sub}>Last rotated: {data?.apiKey.lastRotatedAt ? new Date(data.apiKey.lastRotatedAt).toLocaleString() : '—'}</div>
                </div>
            </section>
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    root: { display: 'flex', flexDirection: 'column', gap: 14 },
    panel: { background: '#12141C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' },
    title: { fontFamily: 'JetBrains Mono, monospace', color: '#C9A84C', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11, marginBottom: 10 },
    grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
    card: { border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px' },
    k: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A5650', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
    v: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#F0EDE8', wordBreak: 'break-all' },
    sub: { marginTop: 4, fontSize: 11, color: '#A8A49E' },
    table: { display: 'flex', flexDirection: 'column', gap: 6 },
    row: { display: 'grid', gridTemplateColumns: '220px 1fr 120px', gap: 10, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#F0EDE8' },
    addr: { color: '#A8A49E' },
    empty: { color: '#A8A49E', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
    error: { border: '1px solid rgba(224,64,64,0.25)', background: 'rgba(224,64,64,0.10)', color: '#E04040', borderRadius: 8, padding: '10px 12px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
}
