'use client'

import { useEffect, useState } from 'react'

interface GenesisLandingPageProps {
    onLogin: () => void
}

export function GenesisLandingPage({ onLogin }: GenesisLandingPageProps) {
    const [variant, setVariant] = useState<'luxe' | 'private'>('luxe')
    const [visible, setVisible] = useState(false)
    const [ruleReady, setRuleReady] = useState(false)

    useEffect(() => {
        const stored = window.localStorage.getItem('gr_landing_variant')
        if (stored === 'luxe' || stored === 'private') {
            setVariant(stored)
        }
    }, [])

    useEffect(() => {
        window.localStorage.setItem('gr_landing_variant', variant)
    }, [variant])

    useEffect(() => {
        const t1 = setTimeout(() => setVisible(true), 80)
        const t2 = setTimeout(() => setRuleReady(true), 320)
        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
        }
    }, [])

    const stats = [
        { value: '4-11%', label: 'APY' },
        { value: 'Arbitrum', label: 'Network' },
        { value: 'ERC-4626', label: 'Vault' },
        { value: 'Non-Custodial', label: 'Control' },
    ]

    if (variant === 'private') {
        return (
            <PrivateBankLanding
                onLogin={onLogin}
                variant={variant}
                onChangeVariant={setVariant}
            />
        )
    }

    return (
        <div style={S.root}>
            <div style={S.glow} />

            <header style={S.header}>
                <div style={S.headerWordmark}>GENESIS RESERVE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <VariantPicker variant={variant} onChangeVariant={setVariant} />
                    <div style={S.badge}>STAGING</div>
                </div>
            </header>

            <main style={S.main}>
                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(14px)',
                        transitionDelay: '0ms',
                    }}
                >
                    <div style={{
                        width: 84, height: 84, borderRadius: '50%', overflow: 'hidden',
                        boxShadow: '0 0 0 1px rgba(201,168,76,0.15), 0 0 28px rgba(201,168,76,0.22), 0 0 60px rgba(201,168,76,0.09)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 16, flexShrink: 0,
                    }}>
                        <img
                            src="/genesis-logo.png"
                            alt="Genesis Reserve"
                            width={84}
                            height={84}
                            style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
                            onError={(e) => {
                                const el = e.currentTarget.parentElement!
                                el.innerHTML = "<span style=\"font-size:60px;opacity:.88;color:#c9a84c\">◈</span>"
                            }}
                        />
                    </div>
                </section>

                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(14px)',
                        transitionDelay: '80ms',
                    }}
                >
                    <h1 style={S.title}>GENESIS</h1>
                    <div style={S.subtitle}>RESERVE</div>
                </section>

                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transitionDelay: '160ms',
                        marginTop: 20,
                    }}
                >
                    <div
                        style={{
                            ...S.rule,
                            width: ruleReady ? 220 : 0,
                            opacity: ruleReady ? 1 : 0,
                        }}
                    />
                </section>

                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(10px)',
                        transitionDelay: '220ms',
                    }}
                >
                    <p style={S.tagline}>The Operating System for Stablecoins</p>
                </section>

                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(10px)',
                        transitionDelay: '300ms',
                        width: '100%',
                    }}
                >
                    <div style={S.stats}>
                        {stats.map((item) => (
                            <div key={item.label} style={S.statCard}>
                                <div style={S.statValue}>{item.value}</div>
                                <div style={S.statLabel}>{item.label}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(10px)',
                        transitionDelay: '380ms',
                        width: '100%',
                        marginTop: 34,
                    }}
                >
                    <button type="button" style={S.primaryBtn} onClick={onLogin}>
                        Enter Genesis Reserve
                    </button>
                    <button type="button" style={S.secondaryBtn} onClick={onLogin}>
                        Create New Wallet
                    </button>
                </section>

                <section
                    style={{
                        ...S.fade,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(10px)',
                        transitionDelay: '460ms',
                        width: '100%',
                        marginTop: 28,
                    }}
                >
                    <div style={S.trustLine} />
                    <div style={S.trustRow}>
                        <span style={S.trustText}>Secured by Privy</span>
                        <span style={S.dot} />
                        <span style={S.trustText}>Powered by Arbitrum</span>
                        <span style={S.dot} />
                        <span style={S.trustText}>Enterprise Wallet Infra</span>
                    </div>
                </section>
            </main>
        </div>
    )
}

function PrivateBankLanding({
    onLogin,
    variant,
    onChangeVariant,
}: {
    onLogin: () => void
    variant: 'luxe' | 'private'
    onChangeVariant: (next: 'luxe' | 'private') => void
}) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 70)
        return () => clearTimeout(t)
    }, [])

    return (
        <div style={PB.root}>
            <div style={PB.grain} />
            <header style={PB.header}>
                <div style={PB.leftHeaderWordmark}>GENESIS RESERVE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <VariantPicker variant={variant} onChangeVariant={onChangeVariant} />
                    <div style={PB.headerBadge}>PRIVATE BANK VARIANT</div>
                </div>
            </header>

            <main style={PB.main}>
                <div
                    style={{
                        ...PB.content,
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(12px)',
                    }}
                >
                    <div style={PB.kicker}>GENESIS RESERVE</div>
                    <h1 style={PB.title}>Steward Your Capital With Quiet Precision</h1>
                    <p style={PB.copy}>
                        Enterprise-grade wallet onboarding for treasury operators. Sign in, create your secure wallet,
                        and activate programmable USDC reserves in under one minute.
                    </p>

                    <div style={PB.ctaRow}>
                        <button type="button" style={PB.primaryBtn} onClick={onLogin}>
                            Sign In
                        </button>
                        <button type="button" style={PB.secondaryBtn} onClick={onLogin}>
                            Create Wallet
                        </button>
                    </div>

                    <div style={PB.metrics}>
                        <Metric label="SETTLEMENT" value="Arbitrum" />
                        <Metric label="VAULT MODEL" value="ERC-4626" />
                        <Metric label="COMPLIANCE" value="KYC / AML" />
                    </div>
                </div>
            </main>
        </div>
    )
}

function VariantPicker({
    variant,
    onChangeVariant,
}: {
    variant: 'luxe' | 'private'
    onChangeVariant: (next: 'luxe' | 'private') => void
}) {
    return (
        <div style={V.wrap}>
            <button
                type="button"
                onClick={() => onChangeVariant('luxe')}
                style={{ ...V.btn, ...(variant === 'luxe' ? V.btnActive : null) }}
            >
                Luxe
            </button>
            <button
                type="button"
                onClick={() => onChangeVariant('private')}
                style={{ ...V.btn, ...(variant === 'private' ? V.btnActive : null) }}
            >
                Private
            </button>
        </div>
    )
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div style={PB.metricCard}>
            <div style={PB.metricLabel}>{label}</div>
            <div style={PB.metricValue}>{value}</div>
        </div>
    )
}

const S: Record<string, React.CSSProperties> = {
    root: {
        minHeight: '100vh',
        background: '#020305',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    glow: {
        position: 'absolute',
        top: -160,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 760,
        height: 760,
        borderRadius: '50%',
        background:
            'radial-gradient(circle, rgba(201,168,76,0.16) 0%, rgba(201,168,76,0.04) 45%, transparent 72%)',
        pointerEvents: 'none',
    },
    header: {
        width: '100%',
        maxWidth: 520,
        padding: '22px 24px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 1,
    },
    headerWordmark: {
        fontFamily: "'Tenor Sans', sans-serif",
        letterSpacing: '0.34em',
        fontSize: 9,
        color: 'rgba(201,168,76,0.56)',
        textTransform: 'uppercase',
    },
    badge: {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8,
        letterSpacing: '0.16em',
        color: 'rgba(201,168,76,0.52)',
        border: '1px solid rgba(201,168,76,0.20)',
        background: 'rgba(201,168,76,0.08)',
        borderRadius: 4,
        padding: '2px 7px',
    },
    main: {
        flex: 1,
        width: '100%',
        maxWidth: 430,
        padding: '0 28px 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        zIndex: 1,
    },
    fade: {
        transition:
            'opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1)',
    },
    logo: {
        opacity: 0.92,
        marginBottom: 16,
    },
    title: {
        margin: 0,
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 300,
        fontSize: 52,
        letterSpacing: '0.30em',
        lineHeight: 1,
        color: '#f5f0e8',
    },
    subtitle: {
        marginTop: 7,
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 10,
        letterSpacing: '0.65em',
        color: '#c9a84c',
        textTransform: 'uppercase',
    },
    rule: {
        height: 1,
        margin: '0 auto',
        background:
            'linear-gradient(90deg, transparent, rgba(201,168,76,0.72), transparent)',
        transition:
            'width 0.65s cubic-bezier(0.22,1,0.36,1), opacity 0.45s ease',
    },
    tagline: {
        marginTop: 10,
        marginBottom: 0,
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: 'italic',
        fontWeight: 300,
        fontSize: 18,
        color: 'rgba(245,240,232,0.57)',
        letterSpacing: '0.04em',
    },
    stats: {
        marginTop: 22,
        display: 'grid',
        width: '100%',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
    },
    statCard: {
        border: '1px solid rgba(201,168,76,0.14)',
        background: 'rgba(255,255,255,0.022)',
        borderRadius: 10,
        padding: '10px 8px',
    },
    statValue: {
        fontFamily: "'JetBrains Mono', monospace",
        color: '#c9a84c',
        fontSize: 11,
        letterSpacing: '0.03em',
        fontWeight: 500,
    },
    statLabel: {
        marginTop: 4,
        fontFamily: "'Tenor Sans', sans-serif",
        color: 'rgba(245,240,232,0.32)',
        fontSize: 8,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
    },
    primaryBtn: {
        width: '100%',
        border: 'none',
        borderRadius: 14,
        background: 'linear-gradient(135deg, #c9a84c, #a8863c, #c9a84c)',
        color: '#1a1400',
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.17em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        padding: '15px 18px',
        boxShadow: '0 0 20px rgba(201,168,76,0.24), 0 2px 8px rgba(0,0,0,0.42)',
    },
    secondaryBtn: {
        width: '100%',
        marginTop: 12,
        borderRadius: 14,
        background: 'transparent',
        border: '1px solid rgba(201,168,76,0.24)',
        color: '#c9a84c',
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 13,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        padding: '14px 18px',
    },
    trustLine: {
        width: '100%',
        height: 1,
        background: 'rgba(255,255,255,0.06)',
        marginBottom: 14,
    },
    trustRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        flexWrap: 'wrap',
    },
    trustText: {
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 10,
        letterSpacing: '0.06em',
        color: 'rgba(245,240,232,0.36)',
        textTransform: 'uppercase',
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: '50%',
        background: 'rgba(245,240,232,0.2)',
    },
}

const V: Record<string, React.CSSProperties> = {
    wrap: {
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: 999,
        overflow: 'hidden',
        background: 'rgba(7,7,7,0.6)',
    },
    btn: {
        border: 'none',
        background: 'transparent',
        color: 'rgba(245,240,232,0.45)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        letterSpacing: '0.06em',
        padding: '4px 9px',
        cursor: 'pointer',
    },
    btnActive: {
        background: 'rgba(201,168,76,0.16)',
        color: '#d9bb66',
    },
}

const PB: Record<string, React.CSSProperties> = {
    root: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #070B10 0%, #040608 55%, #020305 100%)',
        position: 'relative',
        overflow: 'hidden',
    },
    grain: {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 0.6px, transparent 0.6px)',
        backgroundSize: '3px 3px',
        opacity: 0.3,
    },
    header: {
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: 980,
        margin: '0 auto',
        padding: '24px 24px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    leftHeaderWordmark: {
        fontFamily: "'Tenor Sans', sans-serif",
        color: 'rgba(231,208,138,0.62)',
        letterSpacing: '0.28em',
        fontSize: 10,
    },
    headerBadge: {
        border: '1px solid rgba(201,168,76,0.2)',
        color: 'rgba(201,168,76,0.55)',
        borderRadius: 4,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8,
        letterSpacing: '0.08em',
        padding: '3px 8px',
        whiteSpace: 'nowrap',
    },
    main: {
        minHeight: 'calc(100vh - 56px)',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        position: 'relative',
        zIndex: 1,
    },
    content: {
        width: '100%',
        maxWidth: 760,
        border: '1px solid rgba(201,168,76,0.18)',
        background: 'linear-gradient(140deg, rgba(201,168,76,0.08), rgba(10,10,10,0.7) 35%, rgba(9,9,9,0.86) 100%)',
        borderRadius: 18,
        padding: '40px 34px',
        boxShadow: '0 24px 58px rgba(0,0,0,0.5)',
        transition: 'opacity 0.55s ease, transform 0.55s ease',
    },
    kicker: {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.18em',
        color: 'rgba(201,168,76,0.62)',
        marginBottom: 18,
    },
    title: {
        margin: 0,
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 500,
        fontSize: 'clamp(32px, 5vw, 54px)',
        lineHeight: 1.04,
        letterSpacing: '0.01em',
        color: '#f6efe0',
        maxWidth: 620,
    },
    copy: {
        marginTop: 16,
        marginBottom: 0,
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 15,
        lineHeight: 1.7,
        color: 'rgba(245,240,232,0.62)',
        maxWidth: 620,
    },
    ctaRow: {
        marginTop: 28,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
    },
    primaryBtn: {
        border: 'none',
        borderRadius: 10,
        background: 'linear-gradient(135deg, #d8b95d, #b9933a)',
        color: '#1a1400',
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 12,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        padding: '14px 24px',
        cursor: 'pointer',
        fontWeight: 600,
        minWidth: 180,
    },
    secondaryBtn: {
        border: '1px solid rgba(201,168,76,0.28)',
        borderRadius: 10,
        background: 'transparent',
        color: '#d8b95d',
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 12,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '13px 22px',
        cursor: 'pointer',
        minWidth: 180,
    },
    metrics: {
        marginTop: 28,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
    },
    metricCard: {
        border: '1px solid rgba(201,168,76,0.16)',
        borderRadius: 10,
        padding: '12px 10px',
        background: 'rgba(255,255,255,0.01)',
    },
    metricLabel: {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        letterSpacing: '0.1em',
        color: 'rgba(245,240,232,0.36)',
        marginBottom: 6,
    },
    metricValue: {
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 13,
        color: '#e7cb7a',
    },
}