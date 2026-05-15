'use client'

import type { YieldTypeBadge as YieldTypeBadgeType, YieldTypeMeta } from '@/lib/codex/types'

const YIELD_TYPE_META: Record<YieldTypeBadgeType, YieldTypeMeta> = {
  'lending-rate': {
    label: 'Lending',
    color: '#00D4AA',
    bg: 'rgba(0,212,170,0.10)',
    border: 'rgba(0,212,170,0.30)',
    description: 'Yield from borrowers paying interest on collateralized loans',
  },
  'savings-rate': {
    label: 'Savings',
    color: '#1ABF6A',
    bg: 'rgba(26,191,106,0.10)',
    border: 'rgba(26,191,106,0.30)',
    description: 'Yield from protocol savings reserves or DSR-style mechanisms',
  },
  'tbill-yield': {
    label: 'T-Bill',
    color: '#C9A84C',
    bg: 'rgba(201,168,76,0.10)',
    border: 'rgba(201,168,76,0.30)',
    description: 'Yield from tokenized US Treasury Bills — sovereign-grade income',
  },
  'fixed-rate': {
    label: 'Fixed',
    color: '#9B6DFF',
    bg: 'rgba(155,109,255,0.10)',
    border: 'rgba(155,109,255,0.30)',
    description: 'Locked-in yield rate for a defined maturity period',
  },
  'funding-rate': {
    label: 'Funding',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.30)',
    description: 'Yield from perpetual futures funding rate premiums',
  },
  'institutional': {
    label: 'Institutional',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.10)',
    border: 'rgba(96,165,250,0.30)',
    description: 'Yield from institutional-grade lending to verified borrowers',
  },
  'leveraged-yield': {
    label: 'Leveraged',
    color: '#E84040',
    bg: 'rgba(232,64,64,0.10)',
    border: 'rgba(232,64,64,0.30)',
    description: 'Amplified yield through borrowed capital — higher reward, higher risk',
  },
}

interface YieldTypeBadgeProps {
  type: YieldTypeBadgeType
  className?: string
}

export function YieldTypeBadge({ type, className = '' }: YieldTypeBadgeProps) {
  const meta = YIELD_TYPE_META[type]

  return (
    <span
      className={`yield-type-badge ${className}`}
      title={meta.description}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
      }}
    >
      {meta.label}
    </span>
  )
}

export { YIELD_TYPE_META }
export type { YieldTypeBadgeType }
