'use client'

import { useEffect, useRef, useState } from 'react'
import { useVaultPositions } from '../hooks/useVaultPositions'
import { useGenesisVault } from '../hooks/useGenesisVault'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { LinkedCardVisual } from './LinkedCardVisual'
import { LinkDebitCardPanelWrapper } from './CardPage'
import type { LinkedCardPayload } from './CardPage'
import type { ViewKey } from './AppShell'

const FEE_RATE = 0.01
const FEE_FIXED = 0.25
const MIN_USDC = 5
const PRESETS = [25, 50, 100, 250]

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

type Source = 'vault' | 'wallet'

// All possible steps in the unified cash-out flow
type CashOutStep =
  | 'loading'          // fetching positions + cards
  | 'empty'            // no USDC anywhere
  | 'no_cards'         // has USDC but no payout-eligible cards
  | 'pick'             // main form: source + amount + card
  | 'confirm'          // review before submitting
  | 'vault_processing' // withdrawing USDC from vault (on-chain)
  | 'payout_processing'// submitting Stripe push-to-card
  | 'payout_polling'   // polling payout status
  | 'success'
  | 'error'

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
          payoutEligible: true,
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

function feeFor(n: number) { return n * FEE_RATE + FEE_FIXED }
function netFor(n: number) { return Math.max(0, n - feeFor(n)) }
function fmt(n: number) { return n.toFixed(2) }
function fmtUsd(n: string | number) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function cardExpiry(c: LinkedCard) {
  return `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`
}

// Step-indicator bar at top — only shown during active processing steps
function StepBar({ phase }: { phase: 1 | 2 }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24 }}>
      {[1, 2].map(n => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: n < phase ? 'rgba(26,191,106,0.15)' : n === phase ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.05)',
            border: n < phase ? '1px solid rgba(26,191,106,0.4)' : n === phase ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)',
            color: n < phase ? '#1ABF6A' : n === phase ? '#c9a84c' : 'rgba(245,240,232,0.35)',
            fontSize: 11, fontFamily: "'Sora', sans-serif", fontWeight: 700,
          }}>
            {n < phase ? '✓' : n}
          </div>
          <span style={{ fontSize: 11, color: n === phase ? 'rgba(245,240,232,0.7)' : 'rgba(245,240,232,0.3)', fontFamily: "'Tenor Sans', sans-serif" }}>
            {n === 1 ? 'Withdraw from Vault' : 'Send to Card'}
          </span>
          {n < 2 && <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.12)' }} />}
        </div>
      ))}
    </div>
  )
}

export function CashOutPage({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const walletAddress = useActiveWalletAddress()
  const accountId = walletAddress ?? 'demo-account'
  const { data: positionsData, isLoading: positionsLoading } = useVaultPositions(walletAddress)
  const { withdraw, walletUsdcBalance } = useGenesisVault()

  const [step, setStep] = useState<CashOutStep>('loading')
  const [cards, setCards] = useState<LinkedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('vault')
  const [amount, setAmount] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [payoutId, setPayoutId] = useState<string | null>(null)
  const [showLinkCard, setShowLinkCard] = useState(false)
  const [viewW, setViewW] = useState(500)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const update = () => setViewW(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const contentW = Math.min(viewW - 64, 500)
  const pickerCardW = Math.max(260, contentW - 20)
  const pickerCardH = Math.round(pickerCardW * (284 / 460))
  const confirmCardW = Math.max(260, contentW)
  const confirmCardH = Math.round(confirmCardW * (308 / 500))

  const positions = positionsData?.positions ?? []
  const hasVaultPositions = positions.length > 0
  const walletBalance = Number(walletUsdcBalance ?? 0)
  const totalVault = Number(positionsData?.summary?.totalBalanceUsd ?? 0)

  const selectedCard = cards.find(c => c.id === selectedCardId) ?? null
  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const fee = amountNum >= MIN_USDC ? feeFor(amountNum) : 0
  const net = amountNum >= MIN_USDC ? netFor(amountNum) : 0
  const maxAmount = source === 'vault' ? totalVault : walletBalance
  const canContinue = amountNum >= MIN_USDC && amountNum <= maxAmount && selectedCard !== null

  // On mount: fetch cards (API + localStorage), then decide starting step once positions also load
  useEffect(() => {
    if (!accountId) return
    fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(accountId)}`)
      .then(r => r.json())
      .then(data => {
        const apiCards: LinkedCard[] = (data?.data ?? []).filter(
          (c: LinkedCard) => c.payoutEligible && c.status === 'verified'
        )
        const storedCards = getLinkedCardsFromStorage(accountId)
        const eligible = mergeLinkedCards(storedCards, apiCards)
        setCards(eligible)
        setSelectedCardId(eligible[0]?.id ?? null)
      })
      .catch(() => {
        const storedCards = getLinkedCardsFromStorage(accountId)
        setCards(storedCards)
        setSelectedCardId(storedCards[0]?.id ?? null)
      })
  }, [accountId])

  // Decide starting step once both positions and cards are resolved
  useEffect(() => {
    if (positionsLoading) return
    const hasUsdc = hasVaultPositions || walletBalance > 0
    if (!hasUsdc) { setStep('empty'); return }
    if (cards.length === 0 && step === 'loading') { setStep('no_cards'); return }
    if (step === 'loading') {
      setSource(hasVaultPositions ? 'vault' : 'wallet')
      setStep('pick')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsLoading, hasVaultPositions, walletBalance, cards.length])

  // Transition from no_cards → pick when cards load
  useEffect(() => {
    if (step === 'no_cards' && cards.length > 0) setStep('pick')
  }, [cards.length, step])

  // Poll payout every 2 s
  useEffect(() => {
    if (step !== 'payout_polling' || !payoutId) return
    const check = async () => {
      try {
        const data = (await (await fetch(`/api/gr/payouts/${encodeURIComponent(payoutId)}`)).json())?.data
        if (!data) return
        if (data.status === 'paid') { clearInterval(pollRef.current!); setStep('success') }
        else if (data.status === 'failed' || data.status === 'returned') { clearInterval(pollRef.current!); setErrorMsg('Payout could not be completed.'); setStep('error') }
      } catch { /* keep polling */ }
    }
    pollRef.current = setInterval(check, 2000)
    const timeout = setTimeout(() => { clearInterval(pollRef.current!); setStep('success') }, 30_000)
    return () => { clearInterval(pollRef.current!); clearTimeout(timeout) }
  }, [step, payoutId])

  function handleCardLinked(card: LinkedCardPayload) {
    const newCard: LinkedCard = {
      id: card.id,
      cardholderName: card.cardholderName,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      status: card.status,
      payoutEligible: true,
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

  async function handleCashOut() {
    if (!selectedCard || !canContinue) return
    setErrorMsg(null)

    // Phase 1 — vault withdrawal (skip if source is wallet)
    if (source === 'vault') {
      setStep('vault_processing')
      try {
        await withdraw(amount)
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Vault withdrawal failed. Please try again.')
        setStep('error'); return
      }
    }

    // Phase 2 — payout to card
    setStep('payout_processing')
    try {
      const res = await fetch('/api/gr/payouts/push-to-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': `payout_${accountId}_${Date.now().toString(36)}` },
        body: JSON.stringify({ accountId, linkedCardId: selectedCard.id, amount: { amount: fmt(amountNum), currency: 'USDC' } }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data?.error?.message ?? 'Payout request failed.'); setStep('error'); return }
      const p = data?.data
      setPayoutId(p.id)
      setStep(p.status === 'paid' ? 'success' : 'payout_polling')
    } catch {
      setErrorMsg('Network error. Please try again.')
      setStep('error')
    }
  }

  // ── Shared style helpers ────────────────────────────────────────────────────
  const sLabel = { fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase' as const, marginBottom: 10 }

  const sourceActive = (s: Source) => source === s
  const sourceBtn = (s: Source, label: string, value: string, sub: string) => (
    <button type="button" key={s} onClick={() => setSource(s)}
      style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: sourceActive(s) ? '1px solid rgba(201,168,76,0.45)' : '1px solid rgba(255,255,255,0.08)', background: sourceActive(s) ? 'rgba(201,168,76,0.07)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', color: sourceActive(s) ? 'rgba(201,168,76,0.7)' : 'rgba(245,240,232,0.35)', textTransform: 'uppercase' as const, marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)' }}>{sub}</div>
    </button>
  )

  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 720, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Off-Ramp</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em', marginBottom: 6 }}>Cash Out</div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.4)' }}>Withdraw from your vault and send USD directly to your debit card</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 500 }}>

        {/* Loading */}
        {(step === 'loading' || positionsLoading) && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(245,240,232,0.35)', fontSize: 12, letterSpacing: '0.08em' }}>
            Loading your balances…
          </div>
        )}

        {/* Empty state */}
        {step === 'empty' && (
          <div style={{ padding: '48px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 44 }}>💰</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', marginBottom: 8 }}>No USDC to cash out</div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                Add money to your wallet first, then you can cash out to your debit card.
              </div>
            </div>
            <button type="button" onClick={() => onNavigate('deposit')}
              style={{ padding: '12px 28px', background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 12, color: '#00D4AA', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
              Add Money First →
            </button>
          </div>
        )}

        {/* No cards */}
        {step === 'no_cards' && (
          <div style={{ padding: '48px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 44 }}>💳</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', marginBottom: 8 }}>No cards linked yet</div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                Link a debit card to receive USD instantly. Your USDC is converted and pushed to your card within minutes.
              </div>
            </div>
            <button type="button" onClick={() => setShowLinkCard(true)}
              style={{ padding: '12px 28px', background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.38)', borderRadius: 12, color: '#c9a84c', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
              Link a Card →
            </button>
          </div>
        )}

        {/* Main pick form */}
        {step === 'pick' && (
          <>
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.18)', fontSize: 11, color: 'rgba(155,109,255,0.85)', lineHeight: 1.7 }}>
              USDC is converted to USD and sent directly to your debit card — typically within minutes.
            </div>

            {/* Source selector — only shown if user has both vault + wallet USDC */}
            {hasVaultPositions && walletBalance > 0 && (
              <div>
                <div style={sLabel}>Cash Out From</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {sourceBtn('vault', 'Vault (earning)', `$${fmtUsd(totalVault)}`, `${positionsData?.summary?.blendedApyPct ?? '0'}% APY`)}
                  {sourceBtn('wallet', 'Wallet USDC', `${fmtUsd(walletBalance)} USDC`, 'Not earning')}
                </div>
              </div>
            )}

            {/* Source info (single source — no toggle) */}
            {hasVaultPositions && walletBalance === 0 && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>From Vault</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8' }}>${fmtUsd(totalVault)}</div>
                <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)', marginTop: 2 }}>Earning {positionsData?.summary?.blendedApyPct ?? '0'}% APY — withdrawn funds stop earning</div>
              </div>
            )}

            {!hasVaultPositions && walletBalance > 0 && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>From Wallet</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8' }}>{fmtUsd(walletBalance)} USDC</div>
              </div>
            )}

            {/* Card picker */}
            <div>
              <div style={sLabel}>Receive To</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cards.map(card => {
                  const sel = card.id === selectedCardId
                  return (
                    <button key={card.id} type="button" onClick={() => setSelectedCardId(card.id)}
                      style={{ padding: 10, borderRadius: 14, border: sel ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left' }}>
                      <LinkedCardVisual card={{ cardholderName: card.cardholderName, last4: card.last4, expiry: cardExpiry(card), brand: card.brand, issuerName: card.issuerName, frozen: false }} width={pickerCardW} height={pickerCardH} />
                      <div style={{ fontSize: 11, color: '#f5f0e8', marginTop: 8, padding: '0 4px' }}>
                        •••• {card.last4} · {card.cardholderName}
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
              <div style={sLabel}>Amount (USDC)</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,212,170,0.6)', fontSize: 12, letterSpacing: '0.06em' }}>USDC</span>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={MIN_USDC} step="1" placeholder="0.00"
                  style={{ width: '100%', padding: '14px 60px 14px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f5f0e8', fontSize: 18, fontFamily: "'Cormorant Garamond', serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {PRESETS.map(p => (
                  <button key={p} type="button" onClick={() => setAmount(String(p))}
                    style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: amountNum === p ? '1px solid rgba(0,212,170,0.4)' : '1px solid rgba(255,255,255,0.1)', background: amountNum === p ? 'rgba(0,212,170,0.08)' : 'rgba(255,255,255,0.02)', color: amountNum === p ? '#00D4AA' : 'rgba(245,240,232,0.6)', fontSize: 12, fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                    {p}
                  </button>
                ))}
              </div>
              {amountNum > maxAmount && maxAmount > 0 && (
                <div style={{ fontSize: 11, color: '#E84040', marginTop: 6 }}>
                  Exceeds available balance (${fmtUsd(maxAmount)})
                </div>
              )}
            </div>

            {/* Fee preview */}
            {amountNum >= MIN_USDC && (
              <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                {[
                  { label: 'USDC out', value: `${fmt(amountNum)} USDC` },
                  { label: `Fee (${(FEE_RATE * 100).toFixed(0)}% + $${FEE_FIXED})`, value: `−${fmt(fee)} USDC` },
                  { label: 'USD to your card', value: `$${fmt(net)}`, hi: true },
                ].map(({ label, value, hi }, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: hi ? 'rgba(155,109,255,0.04)' : 'transparent' }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)' }}>{label}</span>
                    <span style={{ fontSize: 13, color: hi ? '#9B6DFF' : '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {amountNum > 0 && amountNum < MIN_USDC && <div style={{ fontSize: 11, color: '#E84040' }}>Minimum is {MIN_USDC} USDC</div>}

            <button type="button" onClick={() => setStep('confirm')} disabled={!canContinue}
              style={{ padding: '14px 20px', borderRadius: 12, background: canContinue ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.04)', border: canContinue ? '1px solid rgba(155,109,255,0.4)' : '1px solid rgba(255,255,255,0.1)', color: canContinue ? '#9B6DFF' : 'rgba(245,240,232,0.28)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", cursor: canContinue ? 'pointer' : 'not-allowed' }}>
              Review →
            </button>
          </>
        )}

        {/* Confirm */}
        {step === 'confirm' && selectedCard && (
          <>
            {source === 'vault' && <StepBar phase={1} />}
            <LinkedCardVisual card={{ cardholderName: selectedCard.cardholderName, last4: selectedCard.last4, expiry: cardExpiry(selectedCard), brand: selectedCard.brand, issuerName: selectedCard.issuerName, frozen: false }} width={confirmCardW} height={confirmCardH} />
            <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {[
                source === 'vault'
                  ? { label: 'Withdraw from Vault', value: `${fmt(amountNum)} USDC`, sub: 'Removed from yield strategy' }
                  : { label: 'From Wallet', value: `${fmt(amountNum)} USDC` },
                { label: 'Payout fee', value: `−${fmt(fee)} USDC` },
                { label: 'You receive on card', value: `$${fmt(net)} USD`, sub: `•••• ${selectedCard.last4} · via Stripe instant payout`, hi: true },
              ].map(({ label, value, sub, hi }: any, i) => (
                <div key={i} style={{ padding: '13px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', background: hi ? 'rgba(155,109,255,0.04)' : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                    <span style={{ fontSize: 14, color: hi ? '#9B6DFF' : '#f5f0e8', fontFamily: "'Cormorant Garamond', serif" }}>{value}</span>
                  </div>
                  {sub && <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 3 }}>{sub}</div>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setStep('pick')} style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(245,240,232,0.55)', fontSize: 12, cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>← Back</button>
              <button type="button" onClick={handleCashOut} style={{ flex: 2, padding: '13px', borderRadius: 12, background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.4)', color: '#9B6DFF', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>Confirm Cash Out</button>
            </div>
          </>
        )}

        {/* Vault processing — step 1 */}
        {step === 'vault_processing' && (
          <>
            <StepBar phase={1} />
            <div style={{ padding: '40px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.6)', fontFamily: "'Sora', sans-serif", letterSpacing: '0.06em' }}>Withdrawing from vault…</div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Confirm in your wallet if prompted</div>
            </div>
          </>
        )}

        {/* Payout processing / polling — step 2 */}
        {(step === 'payout_processing' || step === 'payout_polling') && (
          <>
            {source === 'vault' && <StepBar phase={2} />}
            <div style={{ padding: '40px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.6)', fontFamily: "'Sora', sans-serif", letterSpacing: '0.06em' }}>
                {step === 'payout_processing' ? 'Initiating payout…' : 'Sending to your card…'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Typically arrives within minutes</div>
            </div>
          </>
        )}

        {/* Success */}
        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '28px 20px', borderRadius: 16, background: 'rgba(26,191,106,0.08)', border: '1px solid rgba(26,191,106,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#1ABF6A', marginBottom: 6 }}>Payout Sent</div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.55)' }}>${fmt(net)} USD is on its way to your •••• {selectedCard?.last4}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>What's next?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: '→ Add money again', color: '#00D4AA', bg: 'rgba(0,212,170,0.08)', border: 'rgba(0,212,170,0.22)', action: () => onNavigate('deposit') },
                  { label: '→ Go to Home', color: 'rgba(245,240,232,0.55)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.1)', action: () => onNavigate('home') },
                  { label: '→ Cash out more', color: 'rgba(245,240,232,0.35)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.07)', action: () => { setStep('pick'); setAmount('') } },
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
