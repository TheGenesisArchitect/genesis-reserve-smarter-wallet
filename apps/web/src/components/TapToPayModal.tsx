'use client'

import { useEffect, useRef, useState } from 'react'
import { GenesisCard } from './WalletHome'
import { LinkedCardVisual } from './LinkedCardVisual'
import type { LinkedCardMeta } from './LinkedCardVisual'

export type TapCard = {
  id: string
  isGenesis: boolean
  cardholderName: string
  frozen?: boolean
  linkedMeta?: LinkedCardMeta
}

type PayState = 'ready' | 'processing' | 'approved' | 'failed' | 'cancelled'

// ── Detect digital wallet availability ────────────────────────────────────────

function detectWalletSupport(): { hasGooglePay: boolean; hasApplePay: boolean; hasAny: boolean } {
  if (typeof window === 'undefined') return { hasGooglePay: false, hasApplePay: false, hasAny: false }
  const hasGooglePay = 'PaymentRequest' in window
  const hasApplePay = 'ApplePaySession' in window && (window as any).ApplePaySession?.canMakePayments?.() === true
  return { hasGooglePay, hasApplePay, hasAny: hasGooglePay || hasApplePay }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.message.includes('cancel')) return 'cancelled'
    if (err.message.includes('NotSupportedError') || err.message.includes('not supported')) return 'not_supported'
    if (err.message.includes('SecurityError')) return 'security'
    return err.message
  }
  return 'unknown'
}

// ── NFC pulse animation ────────────────────────────────────────────────────────
function NfcRings({ active, color = 'rgba(255,255,255,0.3)' }: { active: boolean; color?: string }) {
  return (
    <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes tap-ring {
          0%   { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(2.0); opacity: 0; }
        }
      `}</style>
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 2 }}>
        <path d="M6 12a6 6 0 0 1 6-6" stroke="rgba(255,255,255,0.45)" strokeWidth={1.8} strokeLinecap="round" />
        <path d="M4 12a8 8 0 0 1 8-8" stroke="rgba(255,255,255,0.3)" strokeWidth={1.8} strokeLinecap="round" />
        <path d="M8.5 12a3.5 3.5 0 0 1 3.5-3.5" stroke="rgba(255,255,255,0.6)" strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={12} cy={12} r={2} fill="white" />
      </svg>
      {active && [1, 2, 3].map(i => (
        <div key={i} style={{
          position: 'absolute', borderRadius: '50%',
          border: `1.5px solid ${color}`,
          animation: 'tap-ring 2s ease-out infinite',
          animationDelay: `${(i - 1) * 0.65}s`,
          width: 26, height: 26,
        }} />
      ))}
    </div>
  )
}

// ── Card slide ─────────────────────────────────────────────────────────────────
function CardSlide({ card, width, height }: { card: TapCard; width: number; height: number }) {
  if (card.isGenesis) {
    return <GenesisCard width={width} height={height} cardholder={card.cardholderName} frozen={card.frozen} />
  }
  if (card.linkedMeta) {
    return <LinkedCardVisual card={{ ...card.linkedMeta, frozen: card.frozen }} width={width} height={height} />
  }
  return null
}

// ── Main modal ─────────────────────────────────────────────────────────────────
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
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [walletSupport] = useState(detectWalletSupport)
  const touchStartX = useRef<number | null>(null)

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Swipe to switch cards
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

  // Attempt Google Pay via Web Payments API
  async function handleGooglePay() {
    if (!('PaymentRequest' in window)) {
      setErrorDetail('Google Pay is not available in this browser.')
      setPayState('failed')
      return
    }
    setPayState('processing')
    setErrorDetail(null)
    try {
      const methods = [{
        supportedMethods: 'https://google.com/pay',
        data: {
          apiVersion: 2,
          apiVersionMinor: 0,
          environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'TEST',
          merchantInfo: {
            merchantName: 'Genesis Reserve',
            merchantId: process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID ?? '',
          },
          allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['AMEX', 'DISCOVER', 'MASTERCARD', 'VISA'],
            },
          }],
        },
      }]
      const details = { total: { label: 'Genesis Reserve', amount: { currency: 'USD', value: '0.00' } } }
      const req = new (window as any).PaymentRequest(methods, details)
      const canPay = await req.canMakePayment()
      if (!canPay) {
        setErrorDetail('Google Pay is not set up on this device. Add a card to Google Wallet first.')
        setPayState('failed')
        return
      }
      await req.show()
      setPayState('approved')
    } catch (err) {
      const reason = getErrorMessage(err)
      if (reason === 'cancelled') {
        setPayState('cancelled')
      } else if (reason === 'not_supported') {
        setErrorDetail('Google Pay is not available in this browser or environment.')
        setPayState('failed')
      } else {
        setErrorDetail(`Payment could not be completed. ${reason !== 'unknown' ? reason : 'Please try again or use a different payment method.'}`)
        setPayState('failed')
      }
    }
  }

  // Attempt Apple Pay via ApplePaySession
  async function handleApplePay() {
    const ApplePaySession = (window as any).ApplePaySession
    if (!ApplePaySession) {
      setErrorDetail('Apple Pay is not available on this device.')
      setPayState('failed')
      return
    }
    if (!ApplePaySession.canMakePayments()) {
      setErrorDetail('Apple Pay is not set up on this device. Add a card to Apple Wallet first.')
      setPayState('failed')
      return
    }
    setPayState('processing')
    setErrorDetail(null)
    try {
      const request = {
        countryCode: 'US',
        currencyCode: 'USD',
        supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
        merchantCapabilities: ['supports3DS'],
        total: { label: 'Genesis Reserve', amount: '0.00' },
      }
      const session = new ApplePaySession(3, request)
      session.onvalidatemerchant = async (event: any) => {
        // Merchant validation requires a server-side endpoint in production
        // For now, gracefully abort with a clear message
        session.abort()
        setErrorDetail('Apple Pay merchant validation is not yet configured. Full Apple Pay support is coming in Phase 2.')
        setPayState('failed')
      }
      session.onpaymentauthorized = (event: any) => {
        session.completePayment(ApplePaySession.STATUS_SUCCESS)
        setPayState('approved')
      }
      session.oncancel = () => {
        setPayState('cancelled')
      }
      session.begin()
    } catch (err) {
      setErrorDetail(`Apple Pay could not be started. ${getErrorMessage(err) !== 'unknown' ? getErrorMessage(err) : 'Please try again.'}`)
      setPayState('failed')
    }
  }

  const activeCard = cards[activeIdx]
  const cardW = Math.min(340, typeof window !== 'undefined' ? window.innerWidth - 32 : 340)
  const cardH = Math.round(cardW * 0.605)
  const isFrozen = activeCard?.frozen === true

  const ringColor = payState === 'approved' ? 'rgba(0,212,170,0.45)' : payState === 'failed' ? 'rgba(232,64,64,0.35)' : 'rgba(255,255,255,0.3)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#050505',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 72, paddingBottom: 140,
        fontFamily: "'Tenor Sans', sans-serif",
        overflowY: 'auto',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Close */}
      <button type="button" onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20,
        width: 40, height: 40, borderRadius: 20,
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.65)', fontSize: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}>
        ×
      </button>

      {/* Card */}
      <div style={{
        transform: payState === 'processing' ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        marginBottom: 36,
        boxShadow: payState === 'approved'
          ? '0 0 60px rgba(0,212,170,0.35)'
          : payState === 'failed'
            ? '0 0 40px rgba(232,64,64,0.18)'
            : '0 40px 80px rgba(0,0,0,0.9)',
        borderRadius: 20,
      }}>
        {activeCard && <CardSlide card={activeCard} width={cardW} height={cardH} />}
      </div>

      {/* NFC + status */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {payState !== 'failed' && (
          <NfcRings active={payState === 'ready' || payState === 'cancelled'} color={ringColor} />
        )}
        {payState === 'failed' && (
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#E84040" strokeWidth={2} strokeLinecap="round">
              <circle cx={12} cy={12} r={10} />
              <line x1={12} y1={8} x2={12} y2={12} />
              <line x1={12} y1={16} x2={12.01} y2={16} />
            </svg>
          </div>
        )}

        <div style={{
          fontSize: 15, letterSpacing: '0.02em',
          color: payState === 'approved' ? '#00D4AA' : payState === 'failed' ? '#E84040' : payState === 'cancelled' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.82)',
          transition: 'color 0.3s',
          textAlign: 'center',
        }}>
          {payState === 'ready' && 'Hold near reader'}
          {payState === 'processing' && 'Contacting wallet…'}
          {payState === 'approved' && 'Payment approved ✓'}
          {payState === 'failed' && 'Payment unavailable'}
          {payState === 'cancelled' && 'Cancelled'}
        </div>

        {/* Error detail */}
        {payState === 'failed' && errorDetail && (
          <div style={{
            maxWidth: 300, textAlign: 'center', fontSize: 12,
            color: 'rgba(245,240,232,0.5)', lineHeight: 1.65,
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(232,64,64,0.06)',
            border: '1px solid rgba(232,64,64,0.15)',
          }}>
            {errorDetail}
          </div>
        )}

        {/* Cancelled hint */}
        {payState === 'cancelled' && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
            Tap a button below to try again
          </div>
        )}

        {/* Ready hint */}
        {payState === 'ready' && cards.length > 1 && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
            Swipe to switch cards
          </div>
        )}

        {/* Frozen warning */}
        {isFrozen && (
          <div style={{ fontSize: 11, color: '#E84040', letterSpacing: '0.06em', marginTop: 4 }}>
            This card is frozen — unfreeze to pay
          </div>
        )}
      </div>

      {/* Card dots */}
      {cards.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          {cards.map((_, i) => (
            <button key={i} type="button" onClick={() => setActiveIdx(i)} style={{
              width: i === activeIdx ? 22 : 8, height: 8, borderRadius: 4,
              background: i === activeIdx ? '#C9A84C' : 'rgba(255,255,255,0.2)',
              border: 'none', cursor: 'pointer', transition: 'all 0.25s',
            }} />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px 32px', background: 'linear-gradient(0deg, #050505 70%, transparent 100%)', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Retry / dismiss when failed */}
        {(payState === 'failed' || payState === 'cancelled') && (
          <button type="button" onClick={() => { setPayState('ready'); setErrorDetail(null) }}
            style={{
              padding: '13px 20px', borderRadius: 12,
              background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)',
              color: '#c9a84c', fontSize: 13, letterSpacing: '0.06em',
              cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif",
            }}>
            Try Again
          </button>
        )}

        {/* Digital wallet buttons — only when ready or cancelled */}
        {(payState === 'ready' || payState === 'cancelled') && !isFrozen && (
          <div style={{ display: 'flex', gap: 8 }}>
            {walletSupport.hasApplePay && (
              <button type="button" onClick={handleApplePay}
                style={{
                  flex: 1, padding: '13px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.75)', fontSize: 13, letterSpacing: '0.04em',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Tenor Sans', sans-serif",
                }}>
                <ApplePayIcon />
                Apple Pay
              </button>
            )}
            {walletSupport.hasGooglePay && (
              <button type="button" onClick={handleGooglePay}
                style={{
                  flex: 1, padding: '13px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.75)', fontSize: 13, letterSpacing: '0.04em',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Tenor Sans', sans-serif",
                }}>
                <GooglePayIcon />
                Google Pay
              </button>
            )}
            {!walletSupport.hasAny && (
              <div style={{
                flex: 1, padding: '13px 16px', borderRadius: 12, textAlign: 'center',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6,
              }}>
                No digital wallet detected on this device.<br />Hold your physical card near the reader.
              </div>
            )}
          </div>
        )}

        {/* Phase 2 notice */}
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.10)',
          fontSize: 10, color: 'rgba(201,168,76,0.45)',
          textAlign: 'center', lineHeight: 1.6, letterSpacing: '0.04em',
        }}>
          Phase 2 · Full hardware NFC via Apple Wallet &amp; Google Wallet card provisioning
        </div>
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function ApplePayIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 38 16" fill="currentColor">
      <path d="M7.2 2.1c-.5.6-1.3 1-2.1 1-.1-.8.3-1.6.8-2.1C6.4.4 7.3 0 8 0c.1.8-.2 1.6-.8 2.1zM8 3.2c-1.2 0-2.2.7-2.8.7-.6 0-1.5-.7-2.5-.6C1.4 3.4.3 4.1 0 5.2c-.7 2 .5 5 1.1 6.6.5 1.3 1.1 2.7 2 2.7.9 0 1.3-.6 2.4-.6 1.1 0 1.4.6 2.4.6.9 0 1.5-1.3 2-2.7l.1-.2c-.9-.5-1.5-1.4-1.5-2.5 0-1 .5-1.9 1.3-2.4-.5-.7-1.2-1.1-1.8-1.1zM17.4 1.3h-3.8v9.2h1.5V7.3h2.3c2.1 0 3.5-1.1 3.5-3 0-1.9-1.4-3-3.5-3zm-.2 4.8h-2.1V2.5h2.1c1.4 0 2.2.6 2.2 1.8 0 1.2-.8 1.8-2.2 1.8zM25 10.6c-.7 0-1.3-.3-1.6-.9h-.1v2.7h-1.4V5.5H23v.9h.1c.3-.6 1-.9 1.7-.9 1.4 0 2.4 1.1 2.4 2.6s-1 2.5-2.2 2.5zm-.4-4c-.9 0-1.5.7-1.5 1.6 0 .9.6 1.6 1.5 1.6.9 0 1.5-.7 1.5-1.6 0-.9-.6-1.6-1.5-1.6zM29.5 5.5h1.4v5h-1.4v-5zm.7-2.1c.5 0 .8.3.8.8s-.3.8-.8.8-.8-.3-.8-.8.3-.8.8-.8zM33 10.5h-1.4V3.1H33v7.4zM37.3 5.5v1.1h-.7c-.8 0-1.2.4-1.2 1.2v2.7H34V5.5h1.3v.7h.1c.2-.5.7-.8 1.2-.8h.7z" />
    </svg>
  )
}

function GooglePayIcon() {
  return (
    <svg width="24" height="14" viewBox="0 0 48 20" fill="none">
      <text x="0" y="15" fontSize="14" fontFamily="sans-serif" fill="currentColor" fontWeight="500">G Pay</text>
    </svg>
  )
}
