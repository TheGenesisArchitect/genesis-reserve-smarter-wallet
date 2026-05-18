'use client'

import { useEffect, useRef, useState } from 'react'
import { GenesisCard } from './WalletHome'
import { LinkedCardVisual } from './LinkedCardVisual'
import type { LinkedCardMeta } from './LinkedCardVisual'

// ─────────────────────────────────────────────────────────────────────────────
// TapToPayModal — fullscreen payment-ready view.
//
// Shows the active card large, with a pulsing NFC animation below it and
// swipe-to-switch navigation. Attempts the Web Payment Request API for
// Google Pay / Apple Pay where available.
// ─────────────────────────────────────────────────────────────────────────────

export type TapCard = {
  id: string
  isGenesis: boolean
  cardholderName: string
  frozen?: boolean
  linkedMeta?: LinkedCardMeta
}

type PayState = 'ready' | 'processing' | 'approved' | 'unsupported'

// ── NFC pulse animation ────────────────────────────────────────────────────────
function NfcRings({ active }: { active: boolean }) {
  return (
    <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes tap-ring {
          0%   { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(2.0); opacity: 0; }
        }
      `}</style>

      {/* Core NFC icon */}
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 2 }}>
        <path d="M6 12a6 6 0 0 1 6-6" stroke="rgba(255,255,255,0.45)" strokeWidth={1.8} strokeLinecap="round" />
        <path d="M4 12a8 8 0 0 1 8-8" stroke="rgba(255,255,255,0.3)" strokeWidth={1.8} strokeLinecap="round" />
        <path d="M8.5 12a3.5 3.5 0 0 1 3.5-3.5" stroke="rgba(255,255,255,0.6)" strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={12} cy={12} r={2} fill="white" />
      </svg>

      {/* Animated rings */}
      {active && [1, 2, 3].map(i => (
        <div key={i} style={{
          position: 'absolute',
          borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.3)',
          animation: 'tap-ring 2s ease-out infinite',
          animationDelay: `${(i - 1) * 0.65}s`,
          width: 26, height: 26,
        }} />
      ))}
    </div>
  )
}

// ── Card carousel ─────────────────────────────────────────────────────────────
function CardSlide({ card, width, height }: { card: TapCard; width: number; height: number }) {
  if (card.isGenesis) {
    return (
      <GenesisCard
        width={width} height={height}
        cardholder={card.cardholderName}
        frozen={card.frozen}
      />
    )
  }
  if (card.linkedMeta) {
    return (
      <LinkedCardVisual
        card={{ ...card.linkedMeta, frozen: card.frozen }}
        width={width} height={height}
      />
    )
  }
  return null
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function TapToPayModal({ cards, defaultCardId, onClose }: {
  cards: TapCard[]
  defaultCardId?: string
  onClose: () => void
}) {
  const [activeIdx, setActiveIdx] = useState(() => {
    if (!defaultCardId) return 0
    const i = cards.findIndex(c => c.id === defaultCardId)
    return i >= 0 ? i : 0
  })
  const [payState, setPayState] = useState<PayState>('ready')
  const touchStartX = useRef<number | null>(null)

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Swipe left/right to switch cards
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 48) {
      if (dx < 0 && activeIdx < cards.length - 1) setActiveIdx(i => i + 1)
      if (dx > 0 && activeIdx > 0) setActiveIdx(i => i - 1)
    }
    touchStartX.current = null
  }

  // Attempt native wallet payment via Web Payments API
  async function handlePayPress() {
    if (typeof window === 'undefined' || !('PaymentRequest' in window)) {
      setPayState('unsupported')
      return
    }
    setPayState('processing')
    try {
      const PaymentRequest = (window as any).PaymentRequest
      const methods = [
        {
          supportedMethods: 'https://google.com/pay',
          data: {
            apiVersion: 2, apiVersionMinor: 0,
            environment: 'TEST',
            merchantInfo: { merchantName: 'Genesis Reserve' },
            allowedPaymentMethods: [{
              type: 'CARD',
              parameters: { allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'], allowedCardNetworks: ['AMEX', 'DISCOVER', 'MASTERCARD', 'VISA'] },
            }],
          },
        },
      ]
      const details = { total: { label: 'Genesis Reserve', amount: { currency: 'USD', value: '0.00' } } }
      const req = new PaymentRequest(methods, details)
      const canPay = await req.canMakePayment()
      if (!canPay) { setPayState('unsupported'); return }
      await req.show()
      setPayState('approved')
    } catch {
      setPayState('ready')
    }
  }

  const activeCard = cards[activeIdx]
  const cardW = Math.min(340, typeof window !== 'undefined' ? window.innerWidth - 32 : 340)
  const cardH = Math.round(cardW * 0.605)

  const stateLabel = {
    ready:       'Hold to reader',
    processing:  'Contacting wallet…',
    approved:    'Payment approved ✓',
    unsupported: 'Hold device near reader',
  }[payState]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#050505',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 72, paddingBottom: 44,
        fontFamily: "'Tenor Sans', sans-serif",
        overflowY: 'auto',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.65)', fontSize: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        ×
      </button>

      {/* Card */}
      <div style={{
        transform: payState === 'processing' ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        marginBottom: 40,
        boxShadow: payState === 'approved' ? '0 0 60px rgba(0,212,170,0.35)' : '0 40px 80px rgba(0,0,0,0.9)',
        borderRadius: 20,
      }}>
        {activeCard && <CardSlide card={activeCard} width={cardW} height={cardH} />}
      </div>

      {/* NFC ring + label */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <NfcRings active={payState === 'ready' || payState === 'unsupported'} />
        <div style={{
          fontSize: 16, fontWeight: 500, letterSpacing: '0.02em',
          color: payState === 'approved' ? '#00D4AA' : 'rgba(255,255,255,0.82)',
          transition: 'color 0.3s',
        }}>
          {stateLabel}
        </div>
        {payState === 'ready' && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
            Swipe to switch cards
          </div>
        )}
      </div>

      {/* Card dots */}
      {cards.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
          {cards.map((_, i) => (
            <button
              key={i} type="button"
              onClick={() => setActiveIdx(i)}
              style={{
                width: i === activeIdx ? 22 : 8, height: 8, borderRadius: 4,
                background: i === activeIdx ? '#C9A84C' : 'rgba(255,255,255,0.2)',
                border: 'none', cursor: 'pointer',
                transition: 'all 0.25s',
              }}
            />
          ))}
        </div>
      )}

      {/* Action area */}
      <div style={{ position: 'absolute', bottom: 40, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Launch digital wallet — attempts Google Pay / Apple Pay */}
        <button
          type="button"
          onClick={handlePayPress}
          disabled={payState !== 'ready'}
          style={{
            padding: '14px 20px', borderRadius: 14,
            background: payState === 'ready' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${payState === 'ready' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'}`,
            color: payState === 'ready' ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.3)',
            fontSize: 13, letterSpacing: '0.06em', cursor: payState === 'ready' ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: 16 }}>⊙</span>
          Launch Digital Wallet
        </button>

        {/* Phase 2 hint */}
        <div style={{
          padding: '11px 16px', borderRadius: 12,
          background: 'rgba(201,168,76,0.04)',
          border: '1px solid rgba(201,168,76,0.12)',
          fontSize: 10, color: 'rgba(201,168,76,0.5)',
          textAlign: 'center', lineHeight: 1.7,
          letterSpacing: '0.04em',
        }}>
          Phase 2 · Full hardware NFC tap-to-pay via Apple Wallet &amp; Google Wallet provisioning
        </div>
      </div>
    </div>
  )
}
