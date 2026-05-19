'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { LinkedCardVisual } from './LinkedCardVisual'
import { StatusPill } from './ds'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { DepositFlow } from './DepositFlow'
import { LinkDebitCardPanelWrapper } from './CardPage'
import type { LinkedCardPayload } from './CardPage'
import type { ViewKey } from './AppShell'

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null

const FEE_RATE = 0.01
const FEE_FIXED = 0.30
const MIN_USD = 5
const PRESETS = [25, 50, 100, 250]

type LinkedCard = {
  id: string
  cardholderName: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  status: string
  fundingEligible: boolean
  circleCardId?: string | null
  issuerName?: string
  funding?: string
}

type FundStep = 'loading' | 'no_cards' | 'pick' | 'confirm' | 'processing' | 'polling' | 'success' | 'error'

function feeFor(n: number) { return n * FEE_RATE + FEE_FIXED }
function netFor(n: number) { return Math.max(0, n - feeFor(n)) }
function fmt(n: number) { return n.toFixed(2) }

function cardExpiry(c: LinkedCard) {
  return `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`
}

function getLinkedCardsFromStorage(accountId: string): LinkedCard[] {
  if (typeof window === 'undefined') return []
  try {
    const key = `gr:cards:v1:${accountId.toLowerCase()}`
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const stored = JSON.parse(raw) as Array<{
      id: string; holderName: string; isLinked?: boolean
      brand: string; last4: string; expiry: string
      issuerName?: string; funding?: string
    }>
    return stored
      .filter(c => c.isLinked)
      .map(c => {
        const [mm, yy] = (c.expiry ?? '01/99').split('/')
        return {
          id: c.id,
          cardholderName: c.holderName,
          brand: c.brand,
          last4: c.last4,
          expMonth: parseInt(mm, 10) || 1,
          expYear: 2000 + (parseInt(yy, 10) || 30),
          status: 'verified',
          fundingEligible: true,
          issuerName: c.issuerName,
          funding: c.funding,
        }
      })
  } catch {
    return []
  }
}

function mergeLinkedCards(stored: LinkedCard[], api: LinkedCard[]): LinkedCard[] {
  const map = new Map<string, LinkedCard>()
  stored.forEach(c => map.set(c.id, c))
  api.forEach(c => map.set(c.id, c)) // API wins for matching IDs
  return Array.from(map.values())
}

export function FundPage({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const accountId = useActiveWalletAddress() ?? 'demo-account'
  const walletAddress = useActiveWalletAddress()

  const [mode, setMode] = useState<'card' | 'bridge'>('card')
  const [step, setStep] = useState<FundStep>('loading')
  const [cards, setCards] = useState<LinkedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fundingId, setFundingId] = useState<string | null>(null)
  const [fundingTx, setFundingTx] = useState<any>(null)
  const [showLinkCard, setShowLinkCard] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedCard = cards.find(c => c.id === selectedCardId) ?? null
  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const fee = amountNum >= MIN_USD ? feeFor(amountNum) : 0
  const net = amountNum >= MIN_USD ? netFor(amountNum) : 0
  const canContinue = amountNum >= MIN_USD && selectedCard !== null

  // Load linked cards whenever card mode is active
  useEffect(() => {
    if (mode !== 'card') return
    setStep('loading')
    fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(accountId)}`)
      .then(r => r.json())
      .then(data => {
        const apiCards: LinkedCard[] = (data?.data ?? []).filter(
          (c: LinkedCard) => c.fundingEligible && c.status === 'verified'
        )
        const storedCards = getLinkedCardsFromStorage(accountId)
        const eligible = mergeLinkedCards(storedCards, apiCards)
        setCards(eligible)
        setSelectedCardId(eligible[0]?.id ?? null)
        setStep(eligible.length === 0 ? 'no_cards' : 'pick')
      })
      .catch(() => {
        const storedCards = getLinkedCardsFromStorage(accountId)
        setCards(storedCards)
        setSelectedCardId(storedCards[0]?.id ?? null)
        setStep(storedCards.length === 0 ? 'no_cards' : 'pick')
      })
  }, [accountId, mode])

  // Poll funding status every 2 s
  useEffect(() => {
    if (step !== 'polling' || !fundingId) return
    const check = async () => {
      try {
        const res = await fetch(`/api/gr/funding/${encodeURIComponent(fundingId)}`)
        const tx = (await res.json())?.data
        if (!tx) return
        setFundingTx(tx)
        if ((tx.status === 'captured' || tx.status === 'settled') && !(tx.circlePaymentId && tx.onChainStatus === 'pending')) {
          clearInterval(pollRef.current!); setStep('success')
        } else if (tx.status === 'failed') {
          clearInterval(pollRef.current!); setErrorMsg('Payment declined. Check your card and try again.'); setStep('error')
        }
      } catch { /* keep polling on transient error */ }
    }
    pollRef.current = setInterval(check, 2000)
    return () => clearInterval(pollRef.current!)
  }, [step, fundingId])

  async function handleFund() {
    if (!selectedCard) return
    setStep('processing'); setErrorMsg(null)
    try {
      const res = await fetch('/api/gr/funding/add-money', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': `add_money_${accountId}_${Date.now().toString(36)}` },
        body: JSON.stringify({
          accountId,
          linkedCardId: selectedCard.id,
          amount: { amount: fmt(amountNum), currency: 'USD' },
          ...(walletAddress ? { destinationAddress: walletAddress } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data?.error?.message ?? 'Payment failed.'); setStep('error'); return }
      const tx = data?.data
      setFundingTx(tx); setFundingId(tx.id)
      if (tx.status === 'requires_action' && tx.challenge?.clientSecret) {
        const stripe = await stripePromise
        if (!stripe) { setErrorMsg('3DS verification unavailable.'); setStep('error'); return }
        const result = await stripe.handleNextAction({ clientSecret: tx.challenge.clientSecret })
        if (result.error) { setErrorMsg(result.error.message ?? '3DS verification failed.'); setStep('error'); return }
        setStep('polling')
      } else if (tx.status === 'failed') {
        setErrorMsg('Payment was declined. Try a different card.'); setStep('error')
      } else {
        setStep(tx.status === 'captured' && !tx.circlePaymentId ? 'success' : 'polling')
      }
    } catch { setErrorMsg('Network error. Please try again.'); setStep('error') }
  }

  function handleCardLinked(card: LinkedCardPayload) {
    const newCard: LinkedCard = {
      id: card.id,
      cardholderName: card.cardholderName,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      status: card.status,
      fundingEligible: true,
      issuerName: card.issuerName,
      funding: card.funding,
    }
    setCards(prev => {
      const map = new Map(prev.map(c => [c.id, c]))
      map.set(newCard.id, newCard)
      return Array.from(map.values())
    })
    setSelectedCardId(newCard.id)
    setShowLinkCard(false)
    setStep('pick')
  }

  // ── Shared style helpers ────────────────────────────────────────────────────
  const s = {
    label: { fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase' as const, marginBottom: 10 },
    input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f5f0e8', fontSize: 18, fontFamily: "'Cormorant Garamond', serif", outline: 'none', boxSizing: 'border-box' as const },
    presetBtn: (active: boolean) => ({ flex: 1, padding: '8px 4px', borderRadius: 8, border: active ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.1)', background: active ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)', color: active ? '#c9a84c' : 'rgba(245,240,232,0.6)', fontSize: 12, fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' as const }),
  }

  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 720, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Fund Your Account</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em', marginBottom: 6 }}>Add Money</div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>Fund your wallet with a debit card, or bridge USDC from another chain</div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 32, width: 'fit-content' }}>
        {([['card', '💳  Debit Card'], ['bridge', '⛓  Bridge USDC']] as const).map(([key, label]) => (
          <button key={key} type="button"
            onClick={() => setMode(key)}
            style={{ padding: '8px 20px', borderRadius: 9, background: mode === key ? 'rgba(201,168,76,0.14)' : 'transparent', border: mode === key ? '1px solid rgba(201,168,76,0.35)' : '1px solid transparent', color: mode === key ? '#c9a84c' : 'rgba(245,240,232,0.45)', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Bridge mode ── */}
      {mode === 'bridge' && <DepositFlow onNavigateSwap={() => onNavigate('swap')} />}

      {/* ── Card mode ── */}
      {mode === 'card' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 500 }}>

          {/* Loading */}
          {step === 'loading' && (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(245,240,232,0.35)', fontSize: 12, letterSpacing: '0.08em' }}>
              Loading your cards…
            </div>
          )}

          {/* No cards linked */}
          {step === 'no_cards' && (
            <div style={{ padding: '48px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ fontSize: 44 }}>💳</div>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', marginBottom: 8 }}>No cards linked yet</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                  Link a debit card to fund your wallet instantly. Your card is charged in USD and USDC is delivered to your Arbitrum wallet.
                </div>
              </div>
              <button type="button" onClick={() => setShowLinkCard(true)}
                style={{ padding: '12px 28px', background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.38)', borderRadius: 12, color: '#c9a84c', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                Link a Card →
              </button>
              <button type="button" onClick={() => setMode('bridge')}
                style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.3)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                Bridge USDC instead
              </button>
            </div>
          )}

          {/* Pick card + amount */}
          {step === 'pick' && (
            <>
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)', fontSize: 11, color: 'rgba(0,212,170,0.85)', lineHeight: 1.7 }}>
                Your card is charged in USD. USDC is delivered to your Arbitrum wallet — Genesis never holds your funds.
              </div>

              {/* Card picker */}
              <div>
                <div style={s.label}>Charge Card</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cards.map(card => {
                    const sel = card.id === selectedCardId
                    return (
                      <button key={card.id} type="button" onClick={() => setSelectedCardId(card.id)}
                        style={{ padding: 10, borderRadius: 14, border: sel ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left' }}>
                        <LinkedCardVisual card={{ cardholderName: card.cardholderName, last4: card.last4, expiry: cardExpiry(card), brand: card.brand, issuerName: card.issuerName, frozen: false }} width={460} height={284} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, padding: '0 4px' }}>
                          <span style={{ fontSize: 11, color: '#f5f0e8' }}>•••• {card.last4}</span>
                          {card.circleCardId ? <StatusPill label="USDC Ready" tone="success" /> : <StatusPill label="USD Charge" tone="accent" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <button type="button" onClick={() => setShowLinkCard(true)}
                  style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.35)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', marginTop: 8, padding: 0 }}>
                  + Link another card
                </button>
              </div>

              {/* Amount */}
              <div>
                <div style={s.label}>Amount (USD)</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: amountNum > 0 ? '#f5f0e8' : 'rgba(245,240,232,0.3)', fontSize: 18 }}>$</span>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={MIN_USD} step="1" placeholder="0.00"
                    style={{ ...s.input, padding: '14px 14px 14px 28px' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {PRESETS.map(p => <button key={p} type="button" onClick={() => setAmount(String(p))} style={s.presetBtn(amountNum === p)}>${p}</button>)}
                </div>
              </div>

              {/* Fee preview */}
              {amountNum >= MIN_USD && (
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  {[
                    { label: 'You pay', value: `$${fmt(amountNum)} USD` },
                    { label: `Fee (${(FEE_RATE * 100).toFixed(0)}% + $${FEE_FIXED})`, value: `−$${fmt(fee)}` },
                    { label: 'USDC you receive', value: `${fmt(net)} USDC`, hi: true },
                  ].map(({ label, value, hi }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: hi ? 'rgba(0,212,170,0.04)' : 'transparent' }}>
                      <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)' }}>{label}</span>
                      <span style={{ fontSize: 13, color: hi ? '#00D4AA' : '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {amountNum > 0 && amountNum < MIN_USD && <div style={{ fontSize: 11, color: '#E84040' }}>Minimum is ${MIN_USD}.00</div>}

              {walletAddress && (
                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', letterSpacing: '0.04em' }}>
                  Destination · {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)} on Arbitrum
                </div>
              )}

              <button type="button" onClick={() => setStep('confirm')} disabled={!canContinue}
                style={{ padding: '14px 20px', borderRadius: 12, background: canContinue ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)', border: canContinue ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)', color: canContinue ? '#c9a84c' : 'rgba(245,240,232,0.28)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", cursor: canContinue ? 'pointer' : 'not-allowed' }}>
                Review →
              </button>
            </>
          )}

          {/* Confirm */}
          {step === 'confirm' && selectedCard && (
            <>
              <LinkedCardVisual card={{ cardholderName: selectedCard.cardholderName, last4: selectedCard.last4, expiry: cardExpiry(selectedCard), brand: selectedCard.brand, issuerName: selectedCard.issuerName, frozen: false }} width={500} height={308} />
              <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                {[
                  { label: 'Charging', value: `$${fmt(amountNum)} USD`, sub: `•••• ${selectedCard.last4}` },
                  { label: 'Processing fee', value: `−$${fmt(fee)}` },
                  { label: 'USDC to wallet', value: `${fmt(net)} USDC`, sub: walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)} · Arbitrum` : '', hi: true },
                ].map(({ label, value, sub, hi }, i) => (
                  <div key={i} style={{ padding: '13px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', background: hi ? 'rgba(0,212,170,0.04)' : 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                      <span style={{ fontSize: 14, color: hi ? '#00D4AA' : '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{value}</span>
                    </div>
                    {sub && <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 3 }}>{sub}</div>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setStep('pick')} style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(245,240,232,0.55)', fontSize: 12, cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>← Back</button>
                <button type="button" onClick={handleFund} style={{ flex: 2, padding: '13px', borderRadius: 12, background: 'rgba(201,168,76,0.18)', border: '1px solid rgba(201,168,76,0.4)', color: '#c9a84c', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>Confirm & Fund</button>
              </div>
            </>
          )}

          {/* Processing / Polling */}
          {(step === 'processing' || step === 'polling') && (
            <div style={{ padding: '60px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.6)', fontFamily: "'Sora', sans-serif", letterSpacing: '0.06em' }}>
                {step === 'processing' ? 'Processing payment…' : 'Delivering USDC to your wallet…'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>
                {step === 'polling' ? 'Typically takes 10–30 seconds' : 'Please wait'}
              </div>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '28px 20px', borderRadius: 16, background: 'rgba(26,191,106,0.08)', border: '1px solid rgba(26,191,106,0.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#1ABF6A', marginBottom: 6 }}>Funds Added</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.55)' }}>{fmt(net)} USDC is now in your wallet</div>
                {fundingTx?.circlePaymentId && (
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 8, fontFamily: 'JetBrains Mono, monospace' }}>Circle ref: {fundingTx.circlePaymentId.slice(0, 16)}…</div>
                )}
              </div>
              <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>What's next?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: '→ Deploy to Vault — earn yield', color: '#c9a84c', bg: 'rgba(201,168,76,0.10)', border: 'rgba(201,168,76,0.28)', action: () => onNavigate('vaults') },
                    { label: '→ Go to Home', color: 'rgba(245,240,232,0.55)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.1)', action: () => onNavigate('home') },
                    { label: '→ Add more money', color: 'rgba(245,240,232,0.35)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.07)', action: () => { setStep('pick'); setAmount('') } },
                  ].map(({ label, color, bg, border, action }) => (
                    <button key={label} type="button" onClick={action}
                      style={{ padding: '11px 14px', borderRadius: 10, background: bg, border: `1px solid ${border}`, color, fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(232,64,64,0.07)', border: '1px solid rgba(232,64,64,0.25)', color: '#E84040', fontSize: 12 }}>{errorMsg}</div>
              <button type="button" onClick={() => setStep('pick')} style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(245,240,232,0.7)', fontSize: 11, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>← Try Again</button>
            </div>
          )}

        </div>
      )}

      {/* Inline card linking panel */}
      {showLinkCard && (
        <LinkDebitCardPanelWrapper
          accountId={accountId}
          onClose={() => setShowLinkCard(false)}
          onLinked={handleCardLinked}
        />
      )}
    </div>
  )
}
