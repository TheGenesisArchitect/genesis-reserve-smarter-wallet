'use client'

/**
 * Genesis Reserve — Shared Design System Primitives
 * Import from this file to keep visual consistency across all pages.
 */

import type { ReactNode } from 'react'

// ── Design tokens ────────────────────────────────────────────────────
export const PANEL_BASE = {
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.014) 100%)',
    boxShadow: '0 12px 34px rgba(0,0,0,0.24)',
} as const

export const COLOR = {
    gold: '#C9A84C',
    gold2: '#E8CB6E',
    goldDark: '#8A6E2A',
    cream: '#F5F0E8',
    bg: '#020305',
    bg0: '#040608',
    bg1: '#070B10',
    bg2: '#0D1117',
    bg3: '#141B22',
    bg4: '#1C2530',
    surface: '#040608',
    teal: '#00D4AA',
    violet: '#9B6DFF',
    blue: '#4A9EFF',
    green: '#1ABF6A',
    red: '#E84040',
    amber: '#F0A020',
    muted: '#7A7670',
    goldRgb: '201,168,76',
    tealRgb: '0,212,170',
    greenRgb: '26,191,106',
    redRgb: '232,64,64',
} as const

// ── SectionPanel ─────────────────────────────────────────────────────
export function SectionPanel({
    title,
    eyebrow,
    action,
    children,
    highlight = false,
    noPadding = false,
}: {
    title: string
    eyebrow?: string
    action?: ReactNode
    children: ReactNode
    highlight?: boolean
    noPadding?: boolean
}) {
    return (
        <section
            style={{
                ...PANEL_BASE,
                border: highlight ? '1px solid rgba(201,168,76,0.24)' : PANEL_BASE.border,
                marginBottom: 14,
                padding: noPadding ? 0 : '18px 20px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 14,
                    padding: noPadding ? '16px 20px 0' : 0,
                }}
            >
                <div>
                    {eyebrow && (
                        <div
                            style={{
                                fontSize: 9,
                                letterSpacing: '0.14em',
                                color: 'rgba(245,240,232,0.34)',
                                textTransform: 'uppercase',
                                marginBottom: 4,
                            }}
                        >
                            {eyebrow}
                        </div>
                    )}
                    <div style={{ fontSize: 15, letterSpacing: '0.04em', color: '#f5f0e8' }}>{title}</div>
                </div>
                {action}
            </div>
            <div style={{ padding: noPadding ? '0 0 0' : 0 }}>{children}</div>
        </section>
    )
}

// ── StatusPill ───────────────────────────────────────────────────────
export function StatusPill({
    label,
    tone = 'neutral',
}: {
    label: string
    tone?: 'neutral' | 'accent' | 'success'
}) {
    const colors =
        tone === 'accent'
            ? { color: '#c9a84c', bg: 'rgba(201,168,76,0.12)', border: 'rgba(201,168,76,0.28)' }
            : tone === 'success'
                ? { color: '#4caf50', bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.28)' }
                : { color: 'rgba(245,240,232,0.62)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.14)' }
    return (
        <span
            style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                borderRadius: 999,
                padding: '4px 10px',
                color: colors.color,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    )
}

// ── ActionButton ─────────────────────────────────────────────────────
export function ActionButton({
    label,
    onClick,
    secondary = false,
    disabled = false,
}: {
    label: string
    onClick: () => void
    secondary?: boolean
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '9px 12px',
                borderRadius: 10,
                border: secondary ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(201,168,76,0.3)',
                background: secondary ? 'rgba(255,255,255,0.04)' : 'rgba(201,168,76,0.12)',
                color: secondary ? 'rgba(245,240,232,0.74)' : '#c9a84c',
                fontSize: 11,
                letterSpacing: '0.08em',
                fontFamily: "'Tenor Sans', sans-serif",
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </button>
    )
}

// ── PageHeader ───────────────────────────────────────────────────────
export function PageHeader({
    eyebrow,
    title,
    pills,
}: {
    eyebrow: string
    title: string
    pills?: ReactNode
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
                <div
                    style={{
                        fontSize: 10,
                        letterSpacing: '0.18em',
                        color: 'rgba(245,240,232,0.35)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                    }}
                >
                    {eyebrow}
                </div>
                <div
                    style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: 30,
                        fontWeight: 300,
                        color: '#f5f0e8',
                        letterSpacing: '0.04em',
                    }}
                >
                    {title}
                </div>
            </div>
            {pills && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {pills}
                </div>
            )}
        </div>
    )
}
