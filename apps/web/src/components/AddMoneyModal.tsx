'use client'

import { useEffect, useRef, useState } from 'react'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { openTransakWidget } from '../lib/transak'
import type { TransakOrderData } from '../lib/transak'

const MIN_USD = 5
const PRESETS = [25, 50, 100, 250]

type Step = 'pick' | 'success' | 'error'

type LinkedCard = {
  id: string
  cardholderName: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  status: string
}

function normBrand(brand: string): 'visa' | 'mastercard' | 'amex' | 'other' {
  const b = brand.toLowerCase()
  if (b.includes('visa')) return 'visa'
  if (b.includes('master')) return 'mastercard'
  if (b.includes('amex') || b.includes('american')) return 'amex'
  return 'other'
}

function CardBrandBadge({ brand }: { brand: string }) {
  const n = normBrand(brand)
  if (n === 'visa') return (
    <span style={{ fontFamily: "'Arial Black', sans-serif", fontSize: 9, fontWeight: 900, color: '#1A1F71', background: '#fff', borderRadius: 3, padding: '1px 4px', letterSpacing: '0.04em' }}>VISA</span>
  )
  if (n === 'mastercard') return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 22, height: 14, verticalAlign: 'middle', flexShrink: 0 }}>
      <span style={{ position: 'absolute', left: 0, width: 14, height: 14, borderRadius: '50%', background: '#EB001B', opacity: 0.9 }} />
      <span style={{ position: 'absolute', left: 7, width: 14, height: 14, borderRadius: '50%', background: '#F79E1B', opacity: 0.9 }} />
    </span>
  )
  if (n === 'amex') return (
    <span style={{ fontFamily: 'sans-serif', fontSize: 8, fontWeight: 700, color: '#fff', background: '#2E77BC', borderRadius: 3, padding: '1px 4px' }}>AMEX</span>
  )
  return <span style={{ fontSize: 13 }}>💳</span>
}

function getCardsFromStorage(accountId: string): LinkedCard[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(`gr:cards:v1:${accountId.toLowerCase()}`)
    if (!raw) return []
    const stored = JSON.parse(raw) as Array<{
      id: string; holderName: string; isLinked?: boolean
      brand: string; last4: string; expiry: string
    }>
    return stored.filter(c => c.isLinked).map(c => {
      const [mm, yy] = (c.expiry ?? '01/99').split('/')
      return { id: c.id, cardholderName: c.holderName, brand: c.brand, last4: c.last4, expMonth: parseInt(mm, 10) || 1, expYear: 2000 + (parseInt(yy, 10) || 30), status: 'verified' }
    })
  } catch { return [] }
}

export function AddMoneyModal({
  onClose,
  onSuccess,
  onLinkCard,
}: {
  accountId?: string
  onClose: () => void
  onSuccess?: () => void
  onLinkCard?: () => void
}) {
  const walletAddress = useActiveWalletAddress()
  const accountId = walletAddress ?? ''

  const [step, setStep] = useState<Step>('pick')
  const [amount, setAmount] = useState('')
  const [transakOpen, setTransakOpen] = useState(false)
  const [transakOrder, setTransakOrder] = useState<TransakOrderData | null>(null)
  const transakCleanupRef = useRef<(() => void) | null>(null)

  const [linkedCards, setLinkedCards] = useState<LinkedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [cardsLoading, setCardsLoading] = useState(true)

  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const canBuy = amountNum >= MIN_USD && !!walletAddress && !transakOpen

  // Fetch linked debit cards
  useEffect(() => {
    if (!accountId) { setCardsLoading(false); return }
    fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(accountId)}`)
      .then(r => r.json())
      .then(data => {
        const apiCards: LinkedCard[] = (data?.data ?? []).filter(
          (c: LinkedCard) => c.status !== 'removed' && c.status !== 'blocked'
        )
        const stored = getCardsFromStorage(accountId)
        const merged = [...stored]
        apiCards.forEach(c => { if (!merged.find(x => x.id === c.id)) merged.push(c) })
        setLinkedCards(merged)
        setSelectedCardId(prev => prev ?? merged[0]?.id ?? null)
      })
      .catch(() => {
        const stored = getCardsFromStorage(accountId)
        setLinkedCards(stored)
        setSelectedCardId(prev => prev ?? stored[0]?.id ?? null)
      })
      .finally(() => setCardsLoading(false))
  }, [accountId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      transakCleanupRef.current?.()
    }
  }, [onClose])

  function handleOpenTransak() {
    if (!canBuy || !walletAddress) return
    setTransakOpen(true)
    const cleanup = openTransakWidget({
      walletAddress,
      fiatAmount: amountNum,
      onSuccess: (data) => {
        setTransakOrder(data)
        setTransakOpen(false)
        setStep('success')
        onSuccess?.()
      },
      onClose: () => {
        setTransakOpen(false)
      },
    })
    transakCleanupRef.current = cleanup
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 61,
        width: 440, maxWidth: '100vw',
        background: '#0a0a0c',
        borderLeft: '1px solid rgba(201,168,76,0.18)',
        display: 'flex', flexDirection: 'column',
        padding: '32px 28px 40px',
        overflowY: 'auto',
        fontFamily: "'Tenor Sans', sans-serif",
        boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>
              On-Ramp · Fiat to USDC
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>
              Add Money
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,0.4)', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* ── Pick ── */}
        {step === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)', fontSize: 11, color: 'rgba(0,212,170,0.8)', lineHeight: 1.7 }}>
              Buy USDC with your debit card. Transak handles payment securely — Genesis never stores your card details.
            </div>

            {/* ── Card Selector ── */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                Funding Card
              </div>
              {cardsLoading ? (
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)', padding: '8px 0' }}>Loading cards…</div>
              ) : linkedCards.length === 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>No debit cards linked yet</span>
                  {onLinkCard && (
                    <button type="button" onClick={onLinkCard}
                      style={{ fontSize: 11, color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em', textDecoration: 'underline', textUnderlineOffset: 3, flexShrink: 0 }}>
                      + Link a card
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {linkedCards.map(card => {
                    const sel = card.id === selectedCardId
                    const exp = `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
                    return (
                      <button key={card.id} type="button" onClick={() => setSelectedCardId(card.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', background: sel ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)', border: sel ? '1px solid rgba(201,168,76,0.45)' : '1px solid rgba(255,255,255,0.09)', transition: 'all 0.15s' }}>
                        <div style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <CardBrandBadge brand={card.brand} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: sel ? '#f5f0e8' : 'rgba(245,240,232,0.7)', fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.04em' }}>
                            •••• {card.last4}
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>
                            {card.cardholderName} &middot; exp {exp}
                          </div>
                        </div>
                        <div style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, border: sel ? '1px solid rgba(201,168,76,0.8)' : '1px solid rgba(255,255,255,0.18)', background: sel ? 'rgba(201,168,76,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {sel && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9a84c' }} />}
                        </div>
                      </button>
                    )
                  })}
                  {onLinkCard && (
                    <button type="button" onClick={onLinkCard}
                      style={{ padding: '8px 13px', borderRadius: 10, background: 'transparent', border: '1px dashed rgba(201,168,76,0.22)', color: 'rgba(201,168,76,0.5)', fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em', textAlign: 'left', fontFamily: "'Tenor Sans', sans-serif" }}>
                      + Link another card
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                Amount (USD)
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: amountNum > 0 ? '#f5f0e8' : 'rgba(245,240,232,0.3)', fontSize: 18 }}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min={MIN_USD}
                  step="1"
                  placeholder="0.00"
                  style={{ width: '100%', padding: '14px 14px 14px 28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f5f0e8', fontSize: 18, fontFamily: "'Cormorant Garamond', serif", outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {PRESETS.map(p => (
                  <button key={p} type="button" onClick={() => setAmount(String(p))}
                    style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: amountNum === p ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.1)', background: amountNum === p ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)', color: amountNum === p ? '#c9a84c' : 'rgba(245,240,232,0.6)', fontSize: 12, fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                    ${p}
                  </button>
                ))}
              </div>
            </div>

            {amountNum > 0 && amountNum < MIN_USD && (
              <div style={{ fontSize: 11, color: '#E84040', letterSpacing: '0.04em' }}>Minimum deposit is ${MIN_USD}.00</div>
            )}

            {amountNum >= MIN_USD && (
              <div style={{ padding: '11px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(245,240,232,0.45)', lineHeight: 1.6 }}>
                ~1–3% Transak fee applies · full breakdown shown at checkout
              </div>
            )}

            {walletAddress && (
              <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                USDC destination · {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)} (Arbitrum)
              </div>
            )}

            <button type="button" onClick={handleOpenTransak} disabled={!canBuy}
              style={{ padding: '14px 20px', borderRadius: 12, background: canBuy ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)', border: canBuy ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)', color: canBuy ? '#c9a84c' : 'rgba(245,240,232,0.28)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", cursor: canBuy ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
              {transakOpen ? 'Checkout Open…' : 'Buy USDC →'}
            </button>
          </div>
        )}

        {/* ── Success ── */}
        {step === 'success' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              ✓
            </div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#f5f0e8', marginBottom: 8 }}>
                Order Placed
              </div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                {transakOrder?.cryptoAmount
                  ? `${transakOrder.cryptoAmount} USDC is on its way to your Arbitrum wallet.`
                  : 'Your USDC is on its way to your Arbitrum wallet.'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', marginTop: 6 }}>Typically arrives within a few minutes.</div>
            </div>
            <button type="button" onClick={onClose}
              style={{ marginTop: 8, padding: '12px 32px', background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 12, color: '#00D4AA', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✕</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: '#f5f0e8', marginBottom: 8 }}>Something went wrong</div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 280 }}>No charge was made. Please try again.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setStep('pick')}
                style={{ padding: '11px 22px', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, color: '#c9a84c', fontSize: 12, letterSpacing: '0.08em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                Try Again
              </button>
              <button type="button" onClick={onClose}
                style={{ padding: '11px 22px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(245,240,232,0.5)', fontSize: 12, fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
