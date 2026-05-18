'use client'

import { useEffect, useRef, useState } from 'react'
import { LinkedCardVisual } from './LinkedCardVisual'
import { StatusPill } from './ds'

const FEE_RATE = 0.01
const FEE_FIXED = 0.25
const MIN_USDC = 5

type LinkedCard = {
  id: string
  cardholderName: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  status: string
  payoutEligible: boolean
  issuerName?: string
  funding?: string
}

type Step = 'loading' | 'no_cards' | 'pick' | 'confirm' | 'processing' | 'polling' | 'success' | 'error'

function feeFor(amount: number) { return amount * FEE_RATE + FEE_FIXED }
function netFor(amount: number) { return Math.max(0, amount - feeFor(amount)) }
function fmt(n: number) { return n.toFixed(2) }

const PRESETS = [25, 50, 100, 250]

// Estimated arrival copy per payout status
const ARRIVAL_BY_STATUS: Record<string, string> = {
  pending_network: 'Typically arrives in minutes',
  paid: 'Funds sent',
  failed: 'Payout failed',
  returned: 'Payout returned',
}

export function PayoutModal({
  accountId,
  onClose,
  onSuccess,
  onLinkCard,
  defaultAmount,
}: {
  accountId: string
  onClose: () => void
  onSuccess?: () => void
  onLinkCard?: () => void
  defaultAmount?: string
}) {
  const [step, setStep] = useState<Step>('loading')
  const [cards, setCards] = useState<LinkedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [amount, setAmount] = useState(defaultAmount ?? '')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [payoutId, setPayoutId] = useState<string | null>(null)
  const [payoutData, setPayoutData] = useState<any>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedCard = cards.find(c => c.id === selectedCardId) ?? null
  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const fee = amountNum >= MIN_USDC ? feeFor(amountNum) : 0
  const net = amountNum >= MIN_USDC ? netFor(amountNum) : 0
  const canContinue = amountNum >= MIN_USDC && selectedCard !== null

  // Load payout-eligible linked cards
  useEffect(() => {
    if (!accountId) { setStep('pick'); return }
    fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(accountId)}`)
      .then(r => r.json())
      .then(data => {
        const eligible: LinkedCard[] = (data?.data ?? []).filter(
          (c: LinkedCard) => c.payoutEligible && c.status === 'verified'
        )
        setCards(eligible)
        if (eligible.length === 0) { setStep('no_cards'); return }
        setSelectedCardId(eligible[0].id)
        setStep('pick')
      })
      .catch(() => setStep('pick'))
  }, [accountId])

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Poll payout status every 2 s
  useEffect(() => {
    if (step !== 'polling' || !payoutId) return
    const check = async () => {
      try {
        const res = await fetch(`/api/gr/payouts/${encodeURIComponent(payoutId)}`)
        const data = await res.json()
        const p = data?.data
        if (!p) return
        setPayoutData(p)
        if (p.status === 'paid') {
          clearInterval(pollRef.current!)
          setStep('success')
          onSuccess?.()
        } else if (p.status === 'failed' || p.status === 'returned') {
          clearInterval(pollRef.current!)
          setErrorMsg('Payout could not be completed. Please contact support.')
          setStep('error')
        }
      } catch { /* transient */ }
    }
    pollRef.current = setInterval(check, 2000)
    // After 30 s without terminal status, show success anyway (payout accepted)
    const timeout = setTimeout(() => {
      clearInterval(pollRef.current!)
      setStep('success')
      onSuccess?.()
    }, 30_000)
    return () => { clearInterval(pollRef.current!); clearTimeout(timeout) }
  }, [step, payoutId, onSuccess])

  async function handlePayout() {
    if (!selectedCard) return
    setStep('processing')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/gr/payouts/push-to-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `payout_${accountId}_${Date.now().toString(36)}`,
        },
        body: JSON.stringify({
          accountId,
          linkedCardId: selectedCard.id,
          amount: { amount: fmt(amountNum), currency: 'USDC' },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data?.error?.message ?? 'Payout request failed. Please try again.')
        setStep('error')
        return
      }
      const p = data?.data
      setPayoutData(p)
      setPayoutId(p.id)
      if (p.status === 'paid') {
        setStep('success'); onSuccess?.()
      } else {
        setStep('polling')
      }
    } catch {
      setErrorMsg('Network error. Please try again.')
      setStep('error')
    }
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
              Off-Ramp · USDC to Card
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>
              Cash Out
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,0.4)', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: 'rgba(245,240,232,0.35)', fontSize: 12, letterSpacing: '0.08em' }}>Loading cards…</div>
          </div>
        )}

        {/* ── No cards ── */}
        {step === 'no_cards' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{ fontSize: 40 }}>💳</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: '#f5f0e8', marginBottom: 8 }}>
                No Cards Linked
              </div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 280 }}>
                Link a debit card to withdraw USDC back to your bank account instantly.
              </div>
            </div>
            {onLinkCard && (
              <button type="button" onClick={() => { onClose(); onLinkCard() }}
                style={{ padding: '12px 28px', background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.38)', borderRadius: 12, color: '#c9a84c', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                Link a Card
              </button>
            )}
          </div>
        )}

        {/* ── Pick card + amount ── */}
        {step === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* Explainer */}
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.18)', fontSize: 11, color: 'rgba(155,109,255,0.85)', lineHeight: 1.7 }}>
              USDC from your wallet is converted to USD and sent directly to your debit card — typically within minutes.
            </div>

            {/* Card selector */}
            {cards.length > 0 && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Receive To
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cards.map(card => {
                    const isSelected = card.id === selectedCardId
                    return (
                      <button key={card.id} type="button" onClick={() => setSelectedCardId(card.id)}
                        style={{
                          padding: 10, borderRadius: 14,
                          border: isSelected ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.08)',
                          background: isSelected ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                          cursor: 'pointer', textAlign: 'left',
                        }}>
                        <LinkedCardVisual
                          card={{ cardholderName: card.cardholderName, last4: card.last4, expiry: `${String(card.expMonth).padStart(2,'0')}/${String(card.expYear).slice(-2)}`, brand: card.brand, issuerName: card.issuerName, frozen: false }}
                          width={280} height={172}
                        />
                        <div style={{ fontSize: 11, color: '#f5f0e8', marginTop: 8, padding: '0 4px' }}>
                          •••• {card.last4} · {card.cardholderName}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                Amount (USDC)
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,212,170,0.6)', fontSize: 12, letterSpacing: '0.06em' }}>USDC</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min={MIN_USDC}
                  step="1"
                  placeholder="0.00"
                  style={{
                    width: '100%', padding: '14px 60px 14px 14px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12, color: '#f5f0e8', fontSize: 18,
                    fontFamily: "'Cormorant Garamond', serif", outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {PRESETS.map(p => (
                  <button key={p} type="button" onClick={() => setAmount(String(p))}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8,
                      border: amountNum === p ? '1px solid rgba(0,212,170,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      background: amountNum === p ? 'rgba(0,212,170,0.08)' : 'rgba(255,255,255,0.02)',
                      color: amountNum === p ? '#00D4AA' : 'rgba(245,240,232,0.6)',
                      fontSize: 12, fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer',
                    }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Fee preview */}
            {amountNum >= MIN_USDC && (
              <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                {[
                  { label: 'USDC from wallet', value: `${fmt(amountNum)} USDC` },
                  { label: `Fee (${(FEE_RATE * 100).toFixed(0)}% + $${FEE_FIXED})`, value: `−${fmt(fee)} USDC` },
                  { label: 'USD to your card', value: `$${fmt(net)}`, highlight: true },
                ].map(({ label, value, highlight }, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: highlight ? 'rgba(155,109,255,0.04)' : 'transparent' }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)' }}>{label}</span>
                    <span style={{ fontSize: 13, color: highlight ? '#9B6DFF' : '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {amountNum > 0 && amountNum < MIN_USDC && (
              <div style={{ fontSize: 11, color: '#E84040' }}>Minimum payout is {MIN_USDC} USDC</div>
            )}

            <button type="button" onClick={() => setStep('confirm')} disabled={!canContinue}
              style={{
                padding: '14px 20px', borderRadius: 12,
                background: canContinue ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: canContinue ? '1px solid rgba(155,109,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: canContinue ? '#9B6DFF' : 'rgba(245,240,232,0.28)',
                fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontFamily: "'Tenor Sans', sans-serif", cursor: canContinue ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}>
              Review
            </button>
          </div>
        )}

        {/* ── Confirm ── */}
        {step === 'confirm' && selectedCard && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <LinkedCardVisual
              card={{ cardholderName: selectedCard.cardholderName, last4: selectedCard.last4, expiry: `${String(selectedCard.expMonth).padStart(2,'0')}/${String(selectedCard.expYear).slice(-2)}`, brand: selectedCard.brand, issuerName: selectedCard.issuerName, frozen: false }}
              width={384} height={236}
            />

            <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {[
                { label: 'Sending', value: `${fmt(amountNum)} USDC`, sub: 'From your Arbitrum wallet' },
                { label: 'Fee', value: `${fmt(fee)} USDC` },
                { label: 'You receive', value: `$${fmt(net)} USD`, sub: `•••• ${selectedCard.last4} · via Stripe instant payout`, highlight: true },
              ].map(({ label, value, sub, highlight }, i) => (
                <div key={i} style={{ padding: '13px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', background: highlight ? 'rgba(155,109,255,0.04)' : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                    <span style={{ fontSize: 14, color: highlight ? '#9B6DFF' : '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{value}</span>
                  </div>
                  {sub && <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 3 }}>{sub}</div>}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setStep('pick')}
                style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(245,240,232,0.5)', fontSize: 12, letterSpacing: '0.08em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                Back
              </button>
              <button type="button" onClick={handlePayout}
                style={{ flex: 2, padding: '13px', borderRadius: 12, background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.4)', color: '#9B6DFF', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                Confirm · Cash Out {fmt(amountNum)} USDC
              </button>
            </div>
          </div>
        )}

        {/* ── Processing / Polling ── */}
        {(step === 'processing' || step === 'polling') && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(155,109,255,0.15)', borderTopColor: '#9B6DFF', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: '#f5f0e8', marginBottom: 6 }}>
                {step === 'processing' ? 'Submitting…' : 'Sending to Card…'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', lineHeight: 1.7, maxWidth: 260 }}>
                Stripe instant payout in progress — typically arrives within minutes
              </div>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === 'success' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              ✓
            </div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#f5f0e8', marginBottom: 8 }}>
                ${fmt(net)} Sent to Card
              </div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                {payoutData?.status ? (ARRIVAL_BY_STATUS[payoutData.status] ?? 'Funds are on their way') : 'Funds are on their way to your debit card.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <StatusPill label="Payout Sent" tone="success" />
              <StatusPill label={`$${fmt(net)} USD`} tone="accent" />
            </div>
            {payoutData?.id && (
              <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.25)', letterSpacing: '0.04em' }}>
                Ref · {payoutData.id}
              </div>
            )}
            <button type="button" onClick={onClose}
              style={{ marginTop: 8, padding: '12px 32px', background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.3)', borderRadius: 12, color: '#9B6DFF', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✕</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: '#f5f0e8', marginBottom: 8 }}>Payout Failed</div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 280 }}>{errorMsg ?? 'Something went wrong. No funds were moved.'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => { setStep('pick'); setErrorMsg(null) }}
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
