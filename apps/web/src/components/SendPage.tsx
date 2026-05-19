'use client'

import { useState, useEffect } from 'react'
import { SendFlow } from './SendFlow'

interface SendPageProps {
  accountId?: string
}

const STEPS = ['Recipient & Amount', 'Compliance Review', 'Confirm & Send', 'Complete']
const STEPS_SHORT = ['Recipient', 'Compliance', 'Confirm', 'Done']

export function SendPage({ accountId }: SendPageProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [viewW, setViewW] = useState(600)

  useEffect(() => {
    const update = () => setViewW(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const px = viewW < 400 ? 16 : 24
  const showLabels = viewW >= 480
  const labels = viewW >= 600 ? STEPS : STEPS_SHORT

  return (
    <div style={{ padding: `24px ${px}px 48px`, maxWidth: 680, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>
          Transfer
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em', marginBottom: 6 }}>
          Send
        </div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>
          Send ETH, USDC, or USDT to any address · Arbitrum One · sub-cent fees
        </div>
      </div>

      {/* ── Step progress bar ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 0 }}>
        {STEPS.map((_, i) => {
          const done = i < activeStep
          const current = i === activeStep
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: showLabels ? 6 : 0, flexShrink: 0 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: done ? 'rgba(76,175,80,0.2)' : current ? '#c9a84c' : 'rgba(255,255,255,0.07)',
                  border: done ? '1px solid rgba(76,175,80,0.4)' : current ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10,
                  color: done ? '#4caf50' : current ? '#1a1400' : 'rgba(245,240,232,0.35)',
                  fontFamily: "'Tenor Sans', sans-serif",
                  transition: 'all 0.3s',
                  flexShrink: 0,
                }}>
                  {done ? '✓' : i + 1}
                </div>
                {showLabels && (
                  <span style={{
                    fontSize: 10,
                    color: done ? '#4caf50' : current ? '#f5f0e8' : 'rgba(245,240,232,0.35)',
                    letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    transition: 'color 0.3s',
                  }}>
                    {labels[i]}
                  </span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: done ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.1)', margin: `0 ${showLabels ? 10 : 6}px`, transition: 'background 0.3s' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Current step label (mobile only) ─────────────────────────── */}
      {!showLabels && (
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', marginBottom: 16, letterSpacing: '0.04em' }}>
          Step {activeStep + 1} of {STEPS.length} — {STEPS[activeStep]}
        </div>
      )}

      {/* ── Info row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Fee', value: '0.42%' },
          { label: 'Settlement', value: '< 60 sec' },
          { label: 'Network', value: 'Arbitrum' },
        ].map(item => (
          <div key={item.label} style={{
            flex: 1, padding: '12px 14px',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            textAlign: 'center' as const,
          }}>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 14, color: '#c9a84c', fontFamily: "'Cormorant Garamond', serif" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── SendFlow ─────────────────────────────────────────────────── */}
      <SendFlow accountId={accountId} onStepChange={setActiveStep} />
    </div>
  )
}
