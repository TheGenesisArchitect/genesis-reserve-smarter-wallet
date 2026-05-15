'use client'

import type { CSSProperties } from 'react'
import { useComplianceView } from '../hooks/useComplianceView'

export function ComplianceViewPanel({ walletAddress }: { walletAddress?: string }) {
    const { data, isLoading, error } = useComplianceView(walletAddress)

    return (
        <section style={S.panel}>
            <div style={S.title}>Compliance Status</div>

            {!walletAddress ? (
                <div style={S.empty}>Connect wallet to view compliance details.</div>
            ) : isLoading ? (
                <div style={S.empty}>Loading compliance status…</div>
            ) : error ? (
                <div style={S.error}>Unable to load compliance view.</div>
            ) : data ? (
                <>
                    <div style={S.kvGrid}>
                        <div style={S.kvItem}><div style={S.k}>Wallet</div><div style={S.v}>{`${data.walletAddress.slice(0, 8)}...${data.walletAddress.slice(-6)}`}</div></div>
                        <div style={S.kvItem}><div style={S.k}>Tier</div><div style={S.v}>{data.kycTier}</div></div>
                        <div style={S.kvItem}><div style={S.k}>AML Status</div><div style={S.v}>{data.amlStatus}</div></div>
                        <div style={S.kvItem}><div style={S.k}>Sanctioned</div><div style={S.v}>{data.sanctioned ? 'YES' : 'NO'}</div></div>
                        <div style={S.kvItem}><div style={S.k}>Can Deposit</div><div style={S.v}>{data.canDeposit ? 'YES' : 'NO'}</div></div>
                        <div style={S.kvItem}><div style={S.k}>Can Send</div><div style={S.v}>{data.canSend ? 'YES' : 'NO'}</div></div>
                        <div style={S.kvItem}><div style={S.k}>Daily Limit</div><div style={S.v}>${data.dailyLimit.toLocaleString()}</div></div>
                        <div style={S.kvItem}><div style={S.k}>Per Tx Limit</div><div style={S.v}>${data.txLimit.toLocaleString()}</div></div>
                    </div>
                    <div style={S.note}>Travel Rule: {data.travelRuleRequired ? 'Required' : 'Not required'} · Updated {new Date(data.fetchedAt).toLocaleTimeString()}</div>
                </>
            ) : (
                <div style={S.empty}>No compliance data available.</div>
            )}
        </section>
    )
}

const S: Record<string, CSSProperties> = {
    panel: { background: '#12141C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' },
    title: { fontFamily: 'JetBrains Mono, monospace', color: '#C9A84C', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11, marginBottom: 10 },
    kvGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
    kvItem: { border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px' },
    k: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A5650', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
    v: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#F0EDE8' },
    note: { marginTop: 10, color: '#5A5650', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    empty: { color: '#A8A49E', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
    error: { border: '1px solid rgba(224,64,64,0.25)', background: 'rgba(224,64,64,0.10)', color: '#E04040', borderRadius: 8, padding: '10px 12px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
}
