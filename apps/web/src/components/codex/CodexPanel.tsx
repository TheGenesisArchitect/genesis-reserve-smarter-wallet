'use client'

import { useState } from 'react'
import type { CodexProtocolEntry } from '@/lib/codex/types'
import { YieldTypeBadge } from './YieldTypeBadge'
import { CodexDeepDive } from './CodexDeepDive'
import { ApyRangeBar } from './CodexKPIPanel'

interface CodexPanelProps {
  entry: CodexProtocolEntry
  fullWidth?: boolean
  onClose?: () => void
  liveApyPct?: number
}

// ── L2 section row ────────────────────────────────────────────────────────────
function InfoRow({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'rgba(201,168,76,0.80)',
          marginBottom: '3px',
          fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.88)',
          lineHeight: 1.55,
          fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── Risk pill ─────────────────────────────────────────────────────────────────
function RiskPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.75)',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)',
        fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
      }}
    >
      {label}
    </span>
  )
}

// ── L2 CodexPanel ─────────────────────────────────────────────────────────────
export function CodexPanel({ entry, fullWidth = false, onClose, liveApyPct }: CodexPanelProps) {
  const [showDeepDive, setShowDeepDive] = useState(false)

  return (
    <div
      style={{
        background: 'rgba(2,3,5,0.95)',
        border: '1px solid rgba(0,212,170,0.25)',
        borderRadius: '10px',
        padding: '16px',
        position: 'relative',
        maxWidth: fullWidth ? '100%' : '420px',
        width: fullWidth ? '100%' : undefined,
        boxShadow: '0 8px 32px rgba(0,0,0,0.60)',
        boxSizing: 'border-box',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              color: '#00D4AA',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
            }}
          >
            ◈ Codex
          </span>
          <span
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: '11px',
              fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
            }}
          >
            ·
          </span>
          <span
            style={{
              color: 'rgba(255,255,255,0.80)',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
            }}
          >
            {entry.displayName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <YieldTypeBadge type={entry.yieldType} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Codex"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.40)',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: '0 2px',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Plain risk label */}
      <div style={{ marginBottom: '14px' }}>
        <RiskPill label={entry.plainRiskLabel} />
      </div>

      {/* APY range bar — visible before tapping Go Deeper */}
      {entry.apyRange && (
        <ApyRangeBar
          range={entry.apyRange}
          tierColor={
            entry.tier === 'preserve' ? '#00D4AA'
              : entry.tier === 'grow' ? '#C9A84C'
              : '#9B6DFF'
          }
          liveApyPct={liveApyPct}
        />
      )}

      {/* L2 content rows */}
      <InfoRow label="What is it?" text={entry.whatIsIt} />
      <InfoRow label="How does it earn?" text={entry.howItEarns} />
      <InfoRow label="Real risk" text={entry.realRisk} />
      <InfoRow label="Liquidity" text={entry.liquidityNote} />

      {/* Go Deeper CTA */}
      <div
        style={{
          marginTop: '4px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={() => setShowDeepDive(prev => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: '#00D4AA',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
            padding: 0,
          }}
        >
          {showDeepDive ? 'Close' : 'Go Deeper'}
          <span
            style={{
              display: 'inline-block',
              transform: showDeepDive ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              fontSize: '8px',
            }}
          >
            ▼
          </span>
        </button>
      </div>

      {/* L3 deep dive — expands inline */}
      {showDeepDive && (
        <div
          style={{
            marginTop: '16px',
            animation: 'codexSlideIn 0.2s ease',
          }}
        >
          <CodexDeepDive entry={entry} liveApyPct={liveApyPct} />
        </div>
      )}

      <style>{`
        @keyframes codexSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
