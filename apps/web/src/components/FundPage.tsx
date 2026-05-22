'use client'

import { useEffect, useRef, useState } from 'react'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { DepositFlow } from './DepositFlow'
import type { ViewKey } from './AppShell'
import { openTransakWidget } from '../lib/transak'
import type { TransakOrderData } from '../lib/transak'

const MIN_USD = 5
const PRESETS = [25, 50, 100, 250]

type CardStep = 'pick' | 'success' | 'error'

type LinkedCard = {
  id: string
  cardholderName: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  status: string
  fundingEligible: boolean
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
    <span style={{ fontFamily: "'Arial Black', sans-serif", fontSize: 10, fontWeight: 900, color: '#1A1F71', background: '#fff', borderRadius: 3, padding: '1px 4px', letterSpacing: '0.04em' }}>VISA</span>
  )
  if (n === 'mastercard') return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 24, height: 16, verticalAlign: 'middle' }}>
      <span style={{ position: 'absolute', left: 0, width: 16, height: 16, borderRadius: '50%', background: '#EB001B', opacity: 0.9 }} />
      <span style={{ position: 'absolute', left: 8, width: 16, height: 16, borderRadius: '50%', background: '#F79E1B', opacity: 0.9 }} />
    </span>
  )
  if (n === 'amex') return (
    <span style={{ fontFamily: 'sans-serif', fontSize: 9, fontWeight: 700, color: '#fff', background: '#2E77BC', borderRadius: 3, padding: '1px 4px' }}>AMEX</span>
  )
  return <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)' }}>💳</span>
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
      return { id: c.id, cardholderName: c.holderName, brand: c.brand, last4: c.last4, expMonth: parseInt(mm, 10) || 1, expYear: 2000 + (parseInt(yy, 10) || 30), status: 'verified', fundingEligible: true }
    })
  } catch { return [] }
}

export function FundPage({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const walletAddress = useActiveWalletAddress()
  const accountId = walletAddress ?? ''

  const [mode, setMode] = useState<'card' | 'bridge'>('card')
  const [cardStep, setCardStep] = useState<CardStep>('pick')
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
    setCardsLoading(true)
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
    return () => { transakCleanupRef.current?.() }
  }, [])

  function handleOpenTransak() {
    if (!canBuy || !walletAddress) return
    setTransakOpen(true)
    const cleanup = openTransakWidget({
      walletAddress,
      fiatAmount: amountNum,
      onSuccess: (data) => {
        setTransakOrder(data)
        setTransakOpen(false)
        setCardStep('success')
      },
      onClose: () => {
        setTransakOpen(false)
      },
    })
    transakCleanupRef.current = cleanup
  }

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

          {/* Pick — amount input + Transak launch */}
          {cardStep === 'pick' && (
            <>
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)', fontSize: 11, color: 'rgba(0,212,170,0.85)', lineHeight: 1.7 }}>
                Buy USDC with your debit card. Transak handles payment securely — Genesis never stores your card details.
              </div>

              {/* ── Debit Card Selector ── */}
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Funding Card
                </div>
                {cardsLoading ? (
                  <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)', padding: '10px 0' }}>Loading cards…</div>
                ) : linkedCards.length === 0 ? (
                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>No debit cards linked yet</span>
                    <button type="button" onClick={() => onNavigate('card')}
                      style={{ fontSize: 11, color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      + Link a card
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {linkedCards.map(card => {
                      const sel = card.id === selectedCardId
                      const exp = `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
                      return (
                        <button key={card.id} type="button" onClick={() => setSelectedCardId(card.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                            background: sel ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                            border: sel ? '1px solid rgba(201,168,76,0.45)' : '1px solid rgba(255,255,255,0.09)',
                            transition: 'all 0.15s',
                          }}>
                          {/* Brand badge */}
                          <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <CardBrandBadge brand={card.brand} />
                          </div>
                          {/* Card info */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: sel ? '#f5f0e8' : 'rgba(245,240,232,0.7)', fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.04em' }}>
                              •••• {card.last4}
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.38)', marginTop: 2, letterSpacing: '0.04em' }}>
                              {card.cardholderName} · exp {exp}
                            </div>
                          </div>
                          {/* Selection indicator */}
                          <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: sel ? '1px solid rgba(201,168,76,0.8)' : '1px solid rgba(255,255,255,0.2)', background: sel ? 'rgba(201,168,76,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c' }} />}
                          </div>
                        </button>
                      )
                    })}
                    <button type="button" onClick={() => onNavigate('card')}
                      style={{ padding: '9px 14px', borderRadius: 10, background: 'transparent', border: '1px dashed rgba(201,168,76,0.25)', color: 'rgba(201,168,76,0.55)', fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em', textAlign: 'left', fontFamily: "'Tenor Sans', sans-serif" }}>
                      + Link another card
                    </button>
                  </div>
                )}
              </div>

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

              {amountNum > 0 && amountNum < MIN_USD && (
                <div style={{ fontSize: 11, color: '#E84040' }}>Minimum is ${MIN_USD}.00</div>
              )}

              {amountNum >= MIN_USD && (
                <div style={{ padding: '11px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(245,240,232,0.45)', lineHeight: 1.6 }}>
                  ~1–3% Transak fee applies · full breakdown shown at checkout
                </div>
              )}

              {walletAddress && (
                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', letterSpacing: '0.04em' }}>
                  Destination · {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)} on Arbitrum
                </div>
              )}

              <button type="button" onClick={handleOpenTransak} disabled={!canBuy}
                style={{ padding: '14px 20px', borderRadius: 12, background: canBuy ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)', border: canBuy ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)', color: canBuy ? '#c9a84c' : 'rgba(245,240,232,0.28)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", cursor: canBuy ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                {transakOpen ? 'Checkout Open…' : 'Buy USDC →'}
              </button>
            </>
          )}

          {/* Success */}
          {cardStep === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '28px 20px', borderRadius: 16, background: 'rgba(26,191,106,0.08)', border: '1px solid rgba(26,191,106,0.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#1ABF6A', marginBottom: 6 }}>Order Placed</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.55)', lineHeight: 1.6 }}>
                  {transakOrder?.cryptoAmount
                    ? `${transakOrder.cryptoAmount} USDC is on its way to your Arbitrum wallet.`
                    : 'Your USDC is on its way to your Arbitrum wallet.'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', marginTop: 6 }}>Typically arrives within a few minutes.</div>
              </div>
              <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>What&apos;s next?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: '→ Deploy to Vault — earn yield', color: '#c9a84c', bg: 'rgba(201,168,76,0.10)', border: 'rgba(201,168,76,0.28)', action: () => onNavigate('vaults') },
                    { label: '→ Go to Home', color: 'rgba(245,240,232,0.55)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.1)', action: () => onNavigate('home') },
                    { label: '→ Buy more USDC', color: 'rgba(245,240,232,0.35)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.07)', action: () => { setCardStep('pick'); setAmount(''); setTransakOrder(null) } },
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
          {cardStep === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(232,64,64,0.07)', border: '1px solid rgba(232,64,64,0.25)', color: '#E84040', fontSize: 12, lineHeight: 1.6 }}>
                Something went wrong. No charge was made.
              </div>
              <button type="button" onClick={() => setCardStep('pick')}
                style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(245,240,232,0.7)', fontSize: 11, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
                ← Try Again
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
