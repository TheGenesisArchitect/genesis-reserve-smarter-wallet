'use client'

import { useState, useCallback } from 'react'
import type { CodexProtocolEntry } from '@/lib/codex/types'
import { CodexPanel } from './CodexPanel'

interface CodexChipProps {
  entry: CodexProtocolEntry
  /** Compact mode — used on strategy cards where space is constrained */
  compact?: boolean
  /** When true, the expanded panel fills the available container width instead of capping at 420px */
  fullWidth?: boolean
  className?: string
  /** Live APY from the yield monitor — overrides the static apyRange.current in the range bar */
  liveApyPct?: number
}

export function CodexChip({ entry, compact = false, fullWidth = false, className = '', liveApyPct }: CodexChipProps) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(prev => !prev)
  }, [])

  return (
    <div
      className={`codex-chip-root ${className}`}
      style={{ display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : undefined }}
    >
      {/* Teal ◈ chip — always visible, one tap to expand */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Codex: learn about ${entry.displayName}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: compact ? '2px 8px' : '3px 10px',
          borderRadius: '20px',
          border: '1px solid rgba(0,212,170,0.35)',
          background: open ? 'rgba(0,212,170,0.15)' : 'rgba(0,212,170,0.08)',
          color: '#00D4AA',
          fontSize: compact ? '10px' : '11px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
          cursor: 'pointer',
          transition: 'background 0.15s ease, border-color 0.15s ease',
          whiteSpace: 'nowrap',
          outline: 'none',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = 'rgba(0,212,170,0.18)'
          el.style.borderColor = 'rgba(0,212,170,0.55)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = open ? 'rgba(0,212,170,0.15)' : 'rgba(0,212,170,0.08)'
          el.style.borderColor = 'rgba(0,212,170,0.35)'
        }}
      >
        <span style={{ fontSize: compact ? '9px' : '10px' }}>◈</span>
        Codex
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            fontSize: '8px',
            opacity: 0.7,
          }}
        >
          ▼
        </span>
      </button>

      {/* L2 inline panel — slides open below the chip */}
      {open && (
        <div
          style={{
            marginTop: '8px',
            animation: 'codexSlideIn 0.2s ease',
          }}
        >
          <CodexPanel entry={entry} fullWidth={fullWidth} onClose={() => setOpen(false)} liveApyPct={liveApyPct} />
        </div>
      )}

      <style>{`
        @keyframes codexSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
