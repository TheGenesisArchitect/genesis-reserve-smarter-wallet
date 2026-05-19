'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useComplianceGate, KYCTier, TIER_LIMITS } from '../hooks/useComplianceGate'
import { KYCUpgradeFlow } from './KYCUpgradeFlow'
import type { NotificationPrefs } from '../app/api/gr/notifications/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAddr(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const TIER_COLOR: Record<KYCTier, string> = {
    [KYCTier.NONE]: 'rgba(245,240,232,0.25)',
    [KYCTier.BASIC]: '#C9A84C',
    [KYCTier.ENHANCED]: '#1ABF6A',
    [KYCTier.INSTITUTIONAL]: '#9B6DFF',
}

const TIER_LABEL: Record<KYCTier, string> = {
    [KYCTier.NONE]: 'Not Verified',
    [KYCTier.BASIC]: 'Basic',
    [KYCTier.ENHANCED]: 'Enhanced',
    [KYCTier.INSTITUTIONAL]: 'Institutional',
}

const TIER_CAPABILITIES: Record<KYCTier, string[]> = {
    [KYCTier.NONE]: [],
    [KYCTier.BASIC]: ['Deposit funds', 'Withdraw funds', 'View balances'],
    [KYCTier.ENHANCED]: ['Deposit & withdraw', 'Send to any address', 'International remittance', '$25,000 daily limit'],
    [KYCTier.INSTITUTIONAL]: ['All operations', '$250,000 per transaction', '$1M daily limit', 'Priority support'],
}

const NOTIF_ROWS: { key: keyof NotificationPrefs; label: string; sub: string }[] = [
    { key: 'depositAlerts',  label: 'Deposits & Funding',  sub: 'Add money, incoming transfers' },
    { key: 'sendAlerts',     label: 'Transfers Sent',      sub: 'Outgoing sends and remittances' },
    { key: 'cashoutAlerts',  label: 'Cash Outs',           sub: 'Withdrawals to linked card' },
    { key: 'securityAlerts', label: 'Security Alerts',     sub: 'New sign-ins, KYC updates' },
    { key: 'marketing',      label: 'Product Updates',     sub: 'New features and Genesis news' },
]

const DEFAULTS: NotificationPrefs = {
    depositAlerts: true, sendAlerts: true,
    cashoutAlerts: true, securityAlerts: true, marketing: false,
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
    return (
        <div
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
            style={{
                width: 42, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                background: enabled ? '#1ABF6A' : 'rgba(255,255,255,0.1)',
                position: 'relative', transition: 'background 0.2s',
            }}
        >
            <div style={{
                position: 'absolute', top: 3,
                left: enabled ? 21 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.18s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
        </div>
    )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
    return (
        <div style={{
            fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.3)',
            textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif",
            marginBottom: 10,
        }}>
            {label}
        </div>
    )
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

export function SettingsPanel({ walletAddress }: { walletAddress?: string }) {
    const { user, logout } = usePrivy()
    const compliance = useComplianceGate()

    // Wallet address copy
    const [copied, setCopied] = useState(false)
    const handleCopy = useCallback(() => {
        if (!walletAddress) return
        navigator.clipboard.writeText(walletAddress).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [walletAddress])

    // KYC panel
    const [showKYC, setShowKYC] = useState(false)

    // Notification preferences
    const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS)
    const [prefsLoading, setPrefsLoading] = useState(true)

    useEffect(() => {
        if (!walletAddress) return
        setPrefsLoading(true)
        fetch(`/api/gr/notifications?accountId=${encodeURIComponent(walletAddress)}`)
            .then(r => r.json())
            .then(d => { if (d?.data) setPrefs(d.data) })
            .catch(() => {})
            .finally(() => setPrefsLoading(false))
    }, [walletAddress])

    const handleToggle = useCallback((key: keyof NotificationPrefs, value: boolean) => {
        const next = { ...prefs, [key]: value }
        setPrefs(next)
        if (!walletAddress) return
        fetch('/api/gr/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: walletAddress, ...next }),
        }).catch(() => {})
    }, [prefs, walletAddress])

    const canUpgrade = !compliance.isLoading && compliance.tier < KYCTier.INSTITUTIONAL
    const tierColor = TIER_COLOR[compliance.tier]
    const tierLimits = TIER_LIMITS[compliance.tier]

    // ── KYC full-screen overlay ───────────────────────────────────────────────
    if (showKYC) {
        return (
            <div style={{ padding: '0 0 48px' }}>
                <div style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 18, padding: '22px 20px',
                }}>
                    <KYCUpgradeFlow
                        currentTier={compliance.tier}
                        onBack={() => setShowKYC(false)}
                    />
                </div>
            </div>
        )
    }

    // ── Main settings ─────────────────────────────────────────────────────────
    if (!walletAddress) {
        return (
            <div style={{ padding: '32px 24px', textAlign: 'center', fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>
                Connect your wallet to view settings.
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 0 48px', fontFamily: "'Tenor Sans', sans-serif" }}>

            {/* ── Wallet ──────────────────────────────────────────────────── */}
            <section style={panel}>
                <SectionHead label="Wallet" />

                {/* Address display */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{
                        fontFamily: 'monospace', fontSize: 22, fontWeight: 600,
                        color: '#f5f0e8', letterSpacing: '0.06em', marginBottom: 4,
                    }}>
                        {fmtAddr(walletAddress)}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(245,240,232,0.3)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                        {walletAddress}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        onClick={handleCopy}
                        style={{
                            padding: '8px 18px', borderRadius: 20, cursor: 'pointer',
                            background: copied ? 'rgba(26,191,106,0.12)' : 'rgba(255,255,255,0.05)',
                            border: copied ? '1px solid rgba(26,191,106,0.3)' : '1px solid rgba(255,255,255,0.1)',
                            color: copied ? '#1ABF6A' : 'rgba(245,240,232,0.6)',
                            fontSize: 11, fontFamily: "'Tenor Sans', sans-serif",
                            letterSpacing: '0.06em', transition: 'all 0.2s',
                        }}
                    >
                        {copied ? '✓ Copied' : 'Copy Address'}
                    </button>

                    {/* Network badge */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: 11, color: 'rgba(245,240,232,0.5)',
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1ABF6A', flexShrink: 0 }} />
                        Arbitrum One
                    </div>
                </div>
            </section>

            {/* ── Identity & KYC ──────────────────────────────────────────── */}
            <section style={panel}>
                <SectionHead label="Identity & KYC" />

                {/* Tier badge row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: tierColor, flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 14, color: '#f5f0e8' }}>
                                {TIER_LABEL[compliance.tier]}
                            </span>
                            <span style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                background: `${tierColor}22`,
                                border: `1px solid ${tierColor}44`,
                                color: tierColor, letterSpacing: '0.06em',
                            }}>
                                Tier {compliance.tier}
                            </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', paddingLeft: 16 }}>
                            ${tierLimits.txLimit.toLocaleString()} per tx · ${tierLimits.dailyLimit.toLocaleString()} daily
                        </div>
                    </div>
                    {canUpgrade && (
                        <button
                            onClick={() => setShowKYC(true)}
                            style={{
                                padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                                background: '#c9a84c', color: '#1a1400',
                                border: 'none', fontSize: 11,
                                fontFamily: "'Tenor Sans', sans-serif",
                                fontWeight: 600, letterSpacing: '0.06em',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Upgrade →
                        </button>
                    )}
                    {!canUpgrade && !compliance.isLoading && (
                        <div style={{ fontSize: 11, color: '#9B6DFF', letterSpacing: '0.04em' }}>Max tier</div>
                    )}
                </div>

                {/* Capabilities */}
                {TIER_CAPABILITIES[compliance.tier].length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {TIER_CAPABILITIES[compliance.tier].map(cap => (
                            <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(245,240,232,0.5)' }}>
                                <span style={{ color: tierColor, fontSize: 10 }}>✓</span>
                                {cap}
                            </div>
                        ))}
                    </div>
                )}
                {compliance.tier === KYCTier.NONE && !compliance.isLoading && (
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', lineHeight: 1.6 }}>
                        Complete identity verification to access deposits, withdrawals, and transfers.
                    </div>
                )}
            </section>

            {/* ── Notifications ───────────────────────────────────────────── */}
            <section style={panel}>
                <SectionHead label="Notifications" />

                {prefsLoading ? (
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.3)', padding: '8px 0' }}>Loading preferences…</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {NOTIF_ROWS.map((row, i) => (
                            <div
                                key={row.key}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '13px 0',
                                    borderBottom: i < NOTIF_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: 13, color: '#f5f0e8', marginBottom: 2 }}>{row.label}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>{row.sub}</div>
                                </div>
                                <Toggle
                                    enabled={prefs[row.key]}
                                    onChange={v => handleToggle(row.key, v)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Account ─────────────────────────────────────────────────── */}
            <section style={panel}>
                <SectionHead label="Account" />

                {/* Linked auth methods */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {user?.email?.address && (
                        <div style={authRow}>
                            <span style={authIcon}>✉</span>
                            <span style={{ fontSize: 13, color: '#f5f0e8' }}>{user.email.address}</span>
                            <span style={authBadge}>Email</span>
                        </div>
                    )}
                    {(user?.linkedAccounts ?? [])
                        .filter(a => a.type !== 'wallet' && a.type !== 'smart_wallet')
                        .map((a, i) => (
                            <div key={i} style={authRow}>
                                <span style={authIcon}>
                                    {a.type === 'google_oauth' ? 'G' : a.type === 'twitter_oauth' ? 'X' : a.type === 'discord_oauth' ? 'D' : '⚬'}
                                </span>
                                <span style={{ fontSize: 13, color: '#f5f0e8' }}>
                                    {'username' in a ? String(a.username) : ('email' in a ? String(a.email) : a.type.replace('_oauth', ''))}
                                </span>
                                <span style={authBadge}>{a.type.replace('_oauth', '').replace('_', ' ')}</span>
                            </div>
                        ))
                    }
                </div>

                <button
                    onClick={logout}
                    style={{
                        width: '100%', padding: '12px', borderRadius: 30,
                        background: 'transparent',
                        border: '1px solid rgba(232,64,64,0.25)',
                        color: 'rgba(232,64,64,0.7)',
                        cursor: 'pointer', fontSize: 11,
                        fontFamily: "'Tenor Sans', sans-serif",
                        letterSpacing: '0.08em', transition: 'all 0.2s',
                    }}
                >
                    Sign Out
                </button>
            </section>

            {/* ── Legal ───────────────────────────────────────────────────── */}
            <section style={panel}>
                <SectionHead label="Legal" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                        { label: 'Terms of Service', href: '/legal/terms' },
                        { label: 'Privacy Policy',   href: '/legal/privacy' },
                        { label: 'Cookie Policy',    href: '/legal/cookies' },
                    ].map(l => (
                        <a
                            key={l.label}
                            href={l.href}
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: 13, color: 'rgba(245,240,232,0.55)',
                                textDecoration: 'none', padding: '4px 0',
                            }}
                        >
                            {l.label}
                            <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.2)' }}>→</span>
                        </a>
                    ))}
                </div>
                <div style={{ marginTop: 14, fontSize: 10, color: 'rgba(245,240,232,0.2)', letterSpacing: '0.06em' }}>
                    Genesis Reserve · v{process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'}
                </div>
            </section>

        </div>
    )
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: '16px 18px',
}

const authRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
}

const authIcon: React.CSSProperties = {
    width: 26, height: 26, borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, color: 'rgba(245,240,232,0.5)',
    flexShrink: 0, textAlign: 'center', lineHeight: '26px',
}

const authBadge: React.CSSProperties = {
    marginLeft: 'auto',
    fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'rgba(245,240,232,0.25)',
    padding: '2px 6px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.06)',
}
