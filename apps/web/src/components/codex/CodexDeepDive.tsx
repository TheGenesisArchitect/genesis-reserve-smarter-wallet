'use client'

import type { CodexProtocolEntry } from '@/lib/codex/types'

interface CodexDeepDiveProps {
  entry: CodexProtocolEntry
}

// ── Section block ─────────────────────────────────────────────────────────────
function DeepSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(201,168,76,0.70)',
          marginBottom: '6px',
          fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.82)',
          lineHeight: 1.60,
          fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ── Risk scenario pill ────────────────────────────────────────────────────────
function ScenarioPill({ text, index }: { text: string; index: number }) {
  const colors = ['rgba(232,64,64,0.15)', 'rgba(245,158,11,0.15)', 'rgba(155,109,255,0.15)']
  const borders = ['rgba(232,64,64,0.30)', 'rgba(245,158,11,0.30)', 'rgba(155,109,255,0.30)']
  const labelColors = ['#E84040', '#F59E0B', '#9B6DFF']
  const labels = ['High Impact', 'Moderate', 'Edge Case']

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '8px',
        background: colors[index] ?? 'rgba(255,255,255,0.05)',
        border: `1px solid ${borders[index] ?? 'rgba(255,255,255,0.12)'}`,
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: labelColors[index] ?? 'rgba(255,255,255,0.5)',
          marginBottom: '4px',
          fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
        }}
      >
        {labels[index] ?? `Scenario ${index + 1}`}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.80)',
          lineHeight: 1.55,
          fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── Worked example highlight box ──────────────────────────────────────────────
function ExampleBox({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: '8px',
        background: 'rgba(0,212,170,0.06)',
        border: '1px solid rgba(0,212,170,0.20)',
        borderLeft: '3px solid #00D4AA',
      }}
    >
      <div
        style={{
          fontSize: '8px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#00D4AA',
          marginBottom: '6px',
          fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
        }}
      >
        Worked Example
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.88)',
          lineHeight: 1.60,
          fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── L3 CodexDeepDive ──────────────────────────────────────────────────────────
export function CodexDeepDive({ entry }: CodexDeepDiveProps) {
  return (
    <div
      style={{
        paddingTop: '16px',
        borderTop: '1px solid rgba(0,212,170,0.15)',
      }}
    >
      {/* Deep dive header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '20px',
        }}
      >
        <span style={{ color: '#00D4AA', fontSize: '12px' }}>◈</span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: '#00D4AA',
            fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
          }}
        >
          Deep Dive · {entry.displayName}
        </span>
      </div>

      {/* Origin story */}
      <DeepSection label="Origin & Track Record">
        {entry.originStory}
      </DeepSection>

      {/* Worked example */}
      <div style={{ marginBottom: '16px' }}>
        <ExampleBox text={entry.workedExample} />
      </div>

      {/* Risk scenarios */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.70)',
            marginBottom: '8px',
            fontFamily: 'var(--font-tenor), "Tenor Sans", sans-serif',
          }}
        >
          What Happens If...
        </div>
        {entry.riskScenarios.map((scenario, i) => (
          <ScenarioPill key={i} text={scenario} index={i} />
        ))}
      </div>

      {/* Historical context */}
      <DeepSection label="Historical Context">
        {entry.historicalContext}
      </DeepSection>

      {/* Stability note */}
      <DeepSection label="Yield Stability">
        {entry.stabilityNote}
      </DeepSection>
    </div>
  )
}
