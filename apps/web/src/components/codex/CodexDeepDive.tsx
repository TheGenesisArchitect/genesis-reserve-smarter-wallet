'use client'

import { useState } from 'react'
import type { CodexProtocolEntry } from '@/lib/codex/types'
import { ProtocolKPIPanel } from './CodexKPIPanel'

const F = {
  tenor: "'Tenor Sans', sans-serif" as const,
  cormorant: "'Cormorant Garamond', serif" as const,
}

// ── Prose section block ───────────────────────────────────────────────────────
function DeepSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'rgba(201,168,76,0.70)', marginBottom: 6,
        fontFamily: F.tenor,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.60, fontFamily: F.cormorant }}>
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
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: colors[index] ?? 'rgba(255,255,255,0.05)',
      border: `1px solid ${borders[index] ?? 'rgba(255,255,255,0.12)'}`,
      marginBottom: 8,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: labelColors[index] ?? 'rgba(255,255,255,0.5)',
        marginBottom: 4, fontFamily: F.tenor,
      }}>
        {labels[index] ?? `Scenario ${index + 1}`}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)', lineHeight: 1.55, fontFamily: F.cormorant }}>
        {text}
      </div>
    </div>
  )
}

// ── Worked example highlight box ──────────────────────────────────────────────
function ExampleBox({ text }: { text: string }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: 'rgba(0,212,170,0.06)',
      border: '1px solid rgba(0,212,170,0.20)',
      borderLeft: '3px solid #00D4AA',
    }}>
      <div style={{
        fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#00D4AA', marginBottom: 6, fontFamily: F.tenor,
      }}>
        Worked Example
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.88)', lineHeight: 1.60, fontFamily: F.cormorant }}>
        {text}
      </div>
    </div>
  )
}

// ── L3 CodexDeepDive ──────────────────────────────────────────────────────────
export function CodexDeepDive({ entry }: { entry: CodexProtocolEntry }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const hasKPI = !!(entry.apyRange && entry.apyHistory && entry.riskScores)

  return (
    <div style={{ paddingTop: 16, borderTop: '1px solid rgba(0,212,170,0.15)' }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <span style={{ color: '#00D4AA', fontSize: 12 }}>◈</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: '#00D4AA', fontFamily: F.tenor,
        }}>
          Deep Dive · {entry.displayName}
        </span>
      </div>

      {/* ── KPI Dashboard (when data available) ── */}
      {hasKPI && (
        <div style={{ marginBottom: 24 }}>
          <ProtocolKPIPanel entry={entry} />
        </div>
      )}

      {/* ── Analyst Notes — collapsible ── */}
      <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setNotesOpen(p => !p)}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px',
            background: notesOpen ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: '#C9A84C', fontFamily: F.tenor, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700 }}>
              Analyst Notes
            </span>
            <span style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor }}>
              Origin · Risk Scenarios · Historical Context
            </span>
          </div>
          <span style={{
            fontSize: 10, color: 'rgba(245,240,232,0.35)',
            display: 'inline-block',
            transform: notesOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}>▼</span>
        </button>

        {notesOpen && (
          <div style={{ padding: '16px 14px', animation: 'codexSlideIn 0.2s ease' }}>

            <DeepSection label="Origin & Track Record">
              {entry.originStory}
            </DeepSection>

            <div style={{ marginBottom: 16 }}>
              <ExampleBox text={entry.workedExample} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'rgba(201,168,76,0.70)', marginBottom: 8, fontFamily: F.tenor,
              }}>
                What Happens If...
              </div>
              {entry.riskScenarios.map((scenario, i) => (
                <ScenarioPill key={i} text={scenario} index={i} />
              ))}
            </div>

            <DeepSection label="Historical Context">
              {entry.historicalContext}
            </DeepSection>

            <DeepSection label="Yield Stability">
              {entry.stabilityNote}
            </DeepSection>

          </div>
        )}
      </div>

    </div>
  )
}
