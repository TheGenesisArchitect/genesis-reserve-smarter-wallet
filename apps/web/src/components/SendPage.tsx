'use client'

import { useState } from 'react'
import { SendFlow } from './SendFlow'

interface SendPageProps {
  accountId?: string
}

const STEPS = ['Recipient & Amount', 'Compliance Review', 'Confirm & Send', 'Complete']

export function SendPage({ accountId }: SendPageProps) {
  const [activeStep, setActiveStep] = useState(0)

  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 680, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, gap: 0 }}>
        {STEPS.map((label, i) => {
          const done = i < activeStep
          const current = i === activeStep
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: done ? 'rgba(76,175,80,0.2)' : current ? '#c9a84c' : 'rgba(255,255,255,0.07)',
                  border: done ? '1px solid rgba(76,175,80,0.4)' : current ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11,
                  color: done ? '#4caf50' : current ? '#1a1400' : 'rgba(245,240,232,0.35)',
                  fontFamily: "'Tenor Sans', sans-serif",
                  transition: 'all 0.3s',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{
                  fontSize: 11,
                  color: done ? '#4caf50' : current ? '#f5f0e8' : 'rgba(245,240,232,0.35)',
                  letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  transition: 'color 0.3s',
                }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: done ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.1)', margin: '0 12px', transition: 'background 0.3s' }} />
              )}
            </div>
          )
        })}
      </div>

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
