'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { GenesisCard } from './WalletHome'
import { LinkedCardVisual, POPULAR_ISSUERS } from './LinkedCardVisual'
import type { LinkedCardMeta } from './LinkedCardVisual'
import { TapToPayModal } from './TapToPayModal'
import type { TapCard } from './TapToPayModal'
import { SectionPanel, StatusPill, PageHeader } from './ds'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import type { ViewKey } from './AppShell'

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null

/* ── AddCardPanel ─────────────────────────────────────────────────────── */
type AddCardStep = 'form' | 'submitting' | 'success'
type CardType = 'virtual' | 'physical'
type SpendLimit = '$0' | '$500' | '$1,000' | '$5,000' | '$25,000'

type AddCardDraft = {
  type: CardType
  holderName: string
  spendLimit: SpendLimit
}

function AddCardPanel({ onClose, onCreate }: { onClose: () => void; onCreate: (draft: AddCardDraft) => void }) {
  const [step, setStep] = useState<AddCardStep>('form')
  const [cardType, setCardType] = useState<CardType>('virtual')
  const [holderName, setHolderName] = useState('')
  const [spendLimit, setSpendLimit] = useState<SpendLimit>('$1,000')

  function handleSubmit() {
    if (!holderName.trim()) return
    setStep('submitting')
    setTimeout(() => {
      onCreate({
        type: cardType,
        holderName: holderName.trim(),
        spendLimit,
      })
      setStep('success')
    }, 1200)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 48,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        zIndex: 49,
        width: 420,
        maxWidth: '100vw',
        background: '#0c0c0e',
        borderLeft: '1px solid rgba(201,168,76,0.18)',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 28px 40px',
        overflowY: 'auto',
        fontFamily: "'Tenor Sans', sans-serif",
        boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>
              Card Services
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>
              Request a Card
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(245,240,232,0.4)', fontSize: 22, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {step === 'success' ? (
          /* ── Success state ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(76,175,80,0.12)',
              border: '1px solid rgba(76,175,80,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>
              ✓
            </div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', marginBottom: 8 }}>
                Application Submitted
              </div>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                Your {cardType === 'virtual' ? 'virtual' : 'physical'} card request has been received. Our team will review and issue your card within 1–2 business days.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <StatusPill label="Under Review" tone="accent" />
              <StatusPill label={cardType === 'virtual' ? 'Virtual Card' : 'Physical Card'} />
              <StatusPill label={spendLimit + ' / mo'} />
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 8,
                padding: '11px 28px',
                background: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.3)',
                borderRadius: 10,
                color: '#c9a84c',
                fontSize: 12,
                letterSpacing: '0.1em',
                fontFamily: "'Tenor Sans', sans-serif",
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Application form ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* Card type */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                Card Type
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['virtual', 'physical'] as CardType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCardType(type)}
                    style={{
                      padding: '14px 12px',
                      borderRadius: 12,
                      border: cardType === type ? '1px solid rgba(201,168,76,0.55)' : '1px solid rgba(255,255,255,0.1)',
                      background: cardType === type ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      fontFamily: "'Tenor Sans', sans-serif",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{type === 'virtual' ? '💳' : '🪙'}</div>
                    <div style={{ fontSize: 13, color: cardType === type ? '#c9a84c' : '#f5f0e8', textTransform: 'capitalize' }}>
                      {type}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)', marginTop: 2 }}>
                      {type === 'virtual' ? 'Instant · Online use' : 'Delivered · Worldwide'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cardholder name */}
            <div>
              <label style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Cardholder Name
              </label>
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="As it appears on your account"
                autoComplete="name"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: '#f5f0e8',
                  fontSize: 14,
                  fontFamily: "'Tenor Sans', sans-serif",
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Spending limit */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                Monthly Spending Limit
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['$500', '$1,000', '$5,000', '$25,000'] as SpendLimit[]).map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => setSpendLimit(limit)}
                    style={{
                      padding: '11px 8px',
                      borderRadius: 10,
                      border: spendLimit === limit ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.09)',
                      background: spendLimit === limit ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)',
                      color: spendLimit === limit ? '#c9a84c' : 'rgba(245,240,232,0.65)',
                      fontSize: 13,
                      fontFamily: "'Cormorant Garamond', serif",
                      fontWeight: 400,
                      cursor: 'pointer',
                    }}
                  >
                    {limit}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(201,168,76,0.05)',
              border: '1px solid rgba(201,168,76,0.15)',
              fontSize: 11,
              color: 'rgba(245,240,232,0.5)',
              lineHeight: 1.7,
            }}>
              Cards are issued subject to identity verification and account standing. Physical cards are shipped within 5–7 business days.
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!holderName.trim() || step === 'submitting'}
              style={{
                padding: '14px 20px',
                background: holderName.trim() ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)',
                border: holderName.trim() ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                color: holderName.trim() ? '#c9a84c' : 'rgba(245,240,232,0.28)',
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontFamily: "'Tenor Sans', sans-serif",
                cursor: holderName.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {step === 'submitting' ? 'Submitting…' : 'Submit Card Application'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/* ── LinkDebitCardPanelWrapper ────────────────────────────────────────── */
// Fetches the SetupIntent clientSecret before mounting Elements so Stripe
// receives it at stripe.elements({ clientSecret }) init time — the modern
// Stripe pattern that enables Link, payment method optimization, and
// Connect integration health checks. Falls back to mounting without a
// clientSecret when Stripe is unconfigured (mock mode).
function LinkDebitCardPanelWrapper({ onClose, onLinked, accountId }: { onClose: () => void; onLinked: (card: LinkedCardPayload) => void; accountId: string }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    if (!stripePublicKey) return
    fetch('/api/gr/linked-debit-cards/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'idempotency-key': `ldc_setup_${Date.now().toString(36)}` },
      body: JSON.stringify({ accountId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.data?.clientSecret) {
          setClientSecret(data.data.clientSecret)
        } else {
          setInitError(data?.error?.message ?? 'Unable to initialize card linking.')
        }
      })
      .catch(() => setInitError('Unable to reach the card service.'))
  }, [accountId])

  if (!stripePublicKey) {
    return <LinkDebitCardPanel onClose={onClose} onLinked={onLinked} accountId={accountId} prefetchedClientSecret={null} />
  }

  if (initError) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 49, width: 420, maxWidth: '100vw', background: '#0c0c0e', borderLeft: '1px solid rgba(201,168,76,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: "'Tenor Sans', sans-serif" }}>
          <div style={{ textAlign: 'center', color: '#e57373', fontSize: 13 }}>{initError}</div>
        </div>
      </>
    )
  }

  if (!clientSecret) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 49, width: 420, maxWidth: '100vw', background: '#0c0c0e', borderLeft: '1px solid rgba(201,168,76,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Tenor Sans', sans-serif" }}>
          <div style={{ color: 'rgba(245,240,232,0.4)', fontSize: 12, letterSpacing: '0.08em' }}>Initializing…</div>
        </div>
      </>
    )
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#c9a84c', fontFamily: "'Tenor Sans', sans-serif" } } }}>
      <LinkDebitCardPanel onClose={onClose} onLinked={onLinked} accountId={accountId} prefetchedClientSecret={clientSecret} />
    </Elements>
  )
}

/* ── Circle RSA-OAEP card encryption (browser-side) ──────────────────── */
// Encrypts { number, cvv } using Circle's RSA public key so raw card data
// never reaches Genesis servers. Returns base64-encoded ciphertext.
async function encryptCircleCardData(publicKeyPem: string, number: string, cvv: string): Promise<string> {
  const pem = publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const cryptoKey = await window.crypto.subtle.importKey(
    'spki',
    der.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const data = new TextEncoder().encode(JSON.stringify({ number, cvv }))
  const encrypted = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, data)
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

/* ── Toggle ───────────────────────────────────────────────────────────── */
function LinkDebitCardPanel({ onClose, onLinked, accountId, prefetchedClientSecret }: { onClose: () => void; onLinked: (card: LinkedCardPayload) => void; accountId: string; prefetchedClientSecret: string | null }) {
  const stripe = useStripe()
  const elements = useElements()
  const [step, setStep] = useState<'form' | 'submitting' | 'issuer' | 'success'>('form')
  const [cardholderName, setCardholderName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successCard, setSuccessCard] = useState<LinkedCardPayload | null>(null)
  const [selectedIssuer, setSelectedIssuer] = useState('')
  const [issuerSearch, setIssuerSearch] = useState('')
  const [usdcEnabled, setUsdcEnabled] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Circle card inputs — only collected when user opts in for USDC purchases.
  // Data is encrypted with Circle's RSA public key before leaving the browser.
  const [circleCardNumber, setCircleCardNumber] = useState('')
  const [circleExpiry, setCircleExpiry] = useState('')   // MM/YY
  const [circleCvv, setCircleCvv] = useState('')

  const supportsStripe = Boolean(stripePublicKey)
  const canSubmit = cardholderName.trim() !== '' && !submitting && (!supportsStripe || (stripe && elements && elements.getElement(CardElement)))

  // Formats a raw card number string into "XXXX XXXX XXXX XXXX" groups.
  function formatCardNumber(raw: string) {
    return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }

  // Formats expiry input as "MM/YY".
  function formatExpiry(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
  }

  // Tokenizes card details with Circle via the backend proxy.
  // Returns a circleCardId on success, null on any failure (graceful degradation).
  async function tokenizeWithCircle(expMonth: number, expYear: number): Promise<string | null> {
    try {
      const keyRes = await fetch('/api/gr/circle/encryption-key')
      if (!keyRes.ok) return null
      const { keyId, publicKey } = await keyRes.json()
      if (!keyId || !publicKey) return null

      const raw = circleCardNumber.replace(/\s/g, '')
      const encryptedData = await encryptCircleCardData(publicKey, raw, circleCvv)

      const cardRes = await fetch('/api/gr/circle/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `circle_card_${accountId}_${Date.now().toString(36)}`,
          keyId,
          encryptedData,
          expMonth,
          expYear,
          billingDetails: { name: cardholderName.trim() },
        }),
      })
      if (!cardRes.ok) return null
      const { circleCardId } = await cardRes.json()
      return circleCardId ?? null
    } catch {
      return null
    }
  }

  async function handleSubmit() {
    if (!cardholderName.trim()) {
      setError('Enter the cardholder name.')
      return
    }
    if (!accountId) {
      setError('No account selected for card linking.')
      return
    }

    setError(null)
    setSubmitting(true)
    setStep('submitting')

    try {
      let processorSetupToken = ''
      let cardToken: string | undefined
      let stripeExpMonth: number | undefined
      let stripeExpYear: number | undefined

      if (supportsStripe) {
        if (!stripe || !elements) {
          throw new Error('Stripe is still loading. Please wait a moment.')
        }
        // clientSecret is fetched at panel mount (not here) so Stripe Elements was
        // already initialized with it — required for Connect integration health checks.
        if (!prefetchedClientSecret) {
          throw new Error('Card setup session expired. Please close and try again.')
        }

        const cardElement = elements.getElement(CardElement)
        if (!cardElement) {
          throw new Error('Card input is not available.')
        }

        // tok_xxx: registers the card as an external account on a Stripe connected
        // account so push-to-card instant payouts work without any manual step.
        // createToken() is only available on CardElement/CardNumberElement — this is
        // why we use CardElement rather than PaymentElement for our Connect flow.
        const { token: rawToken } = await stripe.createToken(cardElement, { name: cardholderName.trim() })
        cardToken = rawToken?.id
        stripeExpMonth = rawToken?.card?.exp_month
        stripeExpYear = rawToken?.card?.exp_year

        const result = await stripe.confirmCardSetup(prefetchedClientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: { name: cardholderName.trim() },
          },
        })

        if (result.error) throw new Error(result.error.message || 'Unable to confirm card setup.')
        const paymentMethod = result.setupIntent?.payment_method
        if (!paymentMethod) throw new Error('Failed to create a reusable payment method for the card.')

        if (typeof paymentMethod === 'string') {
          processorSetupToken = paymentMethod
        } else if (typeof paymentMethod === 'object' && paymentMethod.id) {
          processorSetupToken = paymentMethod.id
        } else {
          throw new Error('Invalid payment method result from Stripe setup confirmation.')
        }
      } else {
        processorSetupToken = `pm_mock_${Date.now().toString(36)}`
      }

      // Circle tokenization — attempted in parallel after Stripe succeeds.
      // Uses Circle card inputs when user opted in, falls back to expiry from
      // Stripe token when available. Failure is non-fatal: the card still links
      // for Stripe-based funding and push-to-card payouts.
      let circleCardId: string | null = null
      if (usdcEnabled && circleCardNumber.replace(/\s/g, '').length >= 13) {
        const [mmStr, yyStr] = circleExpiry.split('/')
        const expMonth = parseInt(mmStr ?? '', 10) || (stripeExpMonth ?? 0)
        const expYear = yyStr ? (2000 + parseInt(yyStr, 10)) : (stripeExpYear ?? 0)
        if (expMonth > 0 && expYear > 2000) {
          circleCardId = await tokenizeWithCircle(expMonth, expYear)
        }
      }

      const createRes = await fetch('/api/gr/linked-debit-cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `ldc_create_${Date.now().toString(36)}`,
        },
        body: JSON.stringify({
          accountId,
          cardholderName: cardholderName.trim(),
          processorSetupToken,
          ...(cardToken ? { cardToken } : {}),
          ...(circleCardId ? { circleCardId } : {}),
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error?.message || 'Unable to link debit card.')

      setSuccessCard({ ...createData.data, _circleEnabled: Boolean(circleCardId) } as LinkedCardPayload)
      setStep('issuer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Card linking failed.')
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }

  const cardStyle = {
    base: {
      color: '#f5f0e8',
      fontFamily: "'Tenor Sans', sans-serif",
      fontSize: '16px',
      '::placeholder': { color: 'rgba(245,240,232,0.35)' },
      iconColor: '#c9a84c',
    },
    invalid: { color: '#ff8a80', iconColor: '#ff8a80' },
  }

  const circleLinked = Boolean((successCard as any)?._circleEnabled)

  function confirmIssuer() {
    if (!successCard) return
    const finalCard: LinkedCardPayload = { ...successCard, issuerName: selectedIssuer || undefined }
    onLinked(finalCard)
    // Persist issuerName to the server so it survives across devices
    if (selectedIssuer && successCard.id) {
      void fetch(`/api/gr/linked-debit-cards/${encodeURIComponent(successCard.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuerName: selectedIssuer }),
      })
    }
    setStep('success')
  }

  // Filtered issuer list for search
  const filteredIssuers = issuerSearch
    ? POPULAR_ISSUERS.filter(i => i.displayName.toLowerCase().includes(issuerSearch.toLowerCase()))
    : POPULAR_ISSUERS

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      />
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        zIndex: 49,
        width: 420,
        maxWidth: '100vw',
        background: '#0c0c0e',
        borderLeft: '1px solid rgba(201,168,76,0.18)',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 28px 40px',
        overflowY: 'auto',
        fontFamily: "'Tenor Sans', sans-serif",
        boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>
              Linked Debit Cards
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>
              Link a Debit Card
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,0.4)', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {step === 'issuer' ? (
          /* ── Issuer selection — captures card visual branding ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: '#f5f0e8', marginBottom: 6 }}>Card Linked ✓</div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7 }}>
                Which bank issued this card? We use this to display your card with its correct colors and style.
              </div>
            </div>

            {/* Search */}
            <input
              type="text"
              value={issuerSearch}
              onChange={e => setIssuerSearch(e.target.value)}
              placeholder="Search your bank…"
              style={{ width: '100%', padding: '10px 13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f5f0e8', fontSize: 13, fontFamily: "'Tenor Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
            />

            {/* Issuer grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {filteredIssuers.map(issuer => {
                const isSelected = selectedIssuer === issuer.key
                return (
                  <button
                    key={issuer.key}
                    type="button"
                    onClick={() => setSelectedIssuer(isSelected ? '' : issuer.key)}
                    style={{
                      padding: '10px 12px', borderRadius: 10,
                      border: isSelected ? '1px solid rgba(201,168,76,0.55)' : '1px solid rgba(255,255,255,0.08)',
                      background: isSelected ? 'rgba(201,168,76,0.10)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      fontFamily: "'Tenor Sans', sans-serif",
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: issuer.previewColor, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                    <span style={{ fontSize: 11, color: isSelected ? '#c9a84c' : '#f5f0e8', textAlign: 'left', lineHeight: 1.3 }}>{issuer.displayName}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => confirmIssuer()}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'rgba(201,168,76,0.16)', border: '1px solid rgba(201,168,76,0.4)', color: '#c9a84c', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
                {selectedIssuer ? 'Confirm' : 'Skip'}
              </button>
            </div>
          </div>

        ) : step === 'success' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              ✓
            </div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', marginBottom: 8 }}>Card Ready</div>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
                {circleLinked
                  ? 'Your card is ready for funding, withdrawals, and USDC purchases via Circle.'
                  : 'Your debit card is ready for funding, withdrawals, and Tap to Pay.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <StatusPill label="Verified" tone="success" />
              <StatusPill label="Tap to Pay" tone="accent" />
              {circleLinked && <StatusPill label="USDC Purchases" tone="accent" />}
            </div>
            <button type="button" onClick={onClose} style={{ marginTop: 8, padding: '11px 28px', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, color: '#c9a84c', fontSize: 12, letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif", cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.65)', lineHeight: 1.7 }}>
              Link your debit card to add funds instantly or send withdrawals back to the card.
            </div>

            {/* Cardholder name */}
            <div>
              <label style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Cardholder Name
              </label>
              <input type="text" value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} placeholder="Jane Doe" autoComplete="off" style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f5f0e8', fontSize: 14, fontFamily: "'Tenor Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Stripe card element */}
            {supportsStripe && (
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  Card Details
                </label>
                <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <CardElement options={{ style: cardStyle, hidePostalCode: true }} />
                </div>
              </div>
            )}

            {!supportsStripe && (
              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(245,240,232,0.6)' }}>
                Stripe is not configured. A mock token will be used for preview mode.
              </div>
            )}

            {/* Circle USDC opt-in section */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(100,149,237,0.2)', overflow: 'hidden' }}>
              {/* Toggle row */}
              <button
                type="button"
                onClick={() => setUsdcEnabled((v) => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: usdcEnabled ? 'rgba(100,149,237,0.08)' : 'rgba(255,255,255,0.02)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, color: usdcEnabled ? '#8ec0ff' : '#f5f0e8', letterSpacing: '0.04em', marginBottom: 2 }}>
                    Enable USDC Purchases
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)', lineHeight: 1.5 }}>
                    Buy USDC instantly via Circle — cheaper than Moonpay
                  </div>
                </div>
                <Toggle on={usdcEnabled} onChange={() => setUsdcEnabled((v) => !v)} />
              </button>

              {/* Circle card inputs — revealed when opted in */}
              {usdcEnabled && (
                <div style={{ padding: '16px', borderTop: '1px solid rgba(100,149,237,0.15)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 10, color: 'rgba(100,149,237,0.8)', lineHeight: 1.6 }}>
                    Card data is encrypted in your browser before leaving your device.
                  </div>

                  {/* Card number */}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={circleCardNumber}
                    onChange={(e) => setCircleCardNumber(formatCardNumber(e.target.value))}
                    placeholder="Card number"
                    autoComplete="off"
                    style={{ width: '100%', padding: '11px 13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,149,237,0.2)', borderRadius: 10, color: '#f5f0e8', fontSize: 14, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', letterSpacing: '0.08em' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Expiry */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={circleExpiry}
                      onChange={(e) => setCircleExpiry(formatExpiry(e.target.value))}
                      placeholder="MM / YY"
                      autoComplete="off"
                      style={{ padding: '11px 13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,149,237,0.2)', borderRadius: 10, color: '#f5f0e8', fontSize: 14, fontFamily: "'Tenor Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                    />

                    {/* CVV */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={circleCvv}
                      onChange={(e) => setCircleCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="CVV"
                      autoComplete="off"
                      style={{ padding: '11px 13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,149,237,0.2)', borderRadius: 10, color: '#f5f0e8', fontSize: 14, fontFamily: "'Tenor Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373' }}>
                {error}
              </div>
            )}

            <button type="button" onClick={handleSubmit} disabled={!canSubmit} style={{ padding: '14px 20px', background: canSubmit ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)', border: canSubmit ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: canSubmit ? '#c9a84c' : 'rgba(245,240,232,0.28)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", cursor: canSubmit ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
              {submitting ? 'Linking…' : 'Link Debit Card'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      onClick={onChange}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: on ? '#c9a84c' : 'rgba(255,255,255,0.1)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.25s',
        flexShrink: 0,
        border: on ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.15)',
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: on ? 20 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: on ? '#1a1400' : 'rgba(245,240,232,0.7)',
        transition: 'left 0.25s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      }} />
    </div>
  )
}

type ManagedCard = {
  id: string
  holderName: string
  type: CardType
  spendLimit: SpendLimit
  last4: string
  expiry: string
  cvv: string
  brand: string
  frozen: boolean
  controls: { online: boolean; atm: boolean; international: boolean }
  // linked card fields
  isLinked?: boolean
  issuerName?: string
  funding?: string   // 'debit' | 'credit' | 'prepaid'
}

type LinkedCardPayload = {
  id: string
  accountId: string
  cardholderName: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  status: string
  issuerName?: string
  funding?: string
}

const CARD_STORAGE_KEY = 'gr:cards:v1'
const ACTIVE_CARD_KEY = 'gr:cards:active:v1'

function getCardStorageKey(accountId?: string) {
  return accountId ? `${CARD_STORAGE_KEY}:${accountId.toLowerCase()}` : CARD_STORAGE_KEY
}

function getActiveCardStorageKey(accountId?: string) {
  return accountId ? `${ACTIVE_CARD_KEY}:${accountId.toLowerCase()}` : ACTIVE_CARD_KEY
}

function mapLinkedCardToManagedCard(card: LinkedCardPayload): ManagedCard {
  return {
    id: card.id,
    holderName: card.cardholderName,
    type: 'virtual',
    spendLimit: '$0',
    last4: card.last4,
    expiry: `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`,
    cvv: '•••',
    brand: card.brand,
    frozen: card.status !== 'verified',
    controls: { online: true, atm: false, international: true },
    isLinked: true,
    issuerName: card.issuerName,
    funding: card.funding ?? 'debit',
  }
}

function loadStoredCards(accountId?: string): ManagedCard[] {
  try {
    const raw = window.localStorage.getItem(getCardStorageKey(accountId))
    if (!raw) return [DEFAULT_CARD]
    const parsed = JSON.parse(raw) as ManagedCard[]
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_CARD]
    return parsed
  } catch {
    return [DEFAULT_CARD]
  }
}

function mergeCardsById(existing: ManagedCard[], incoming: ManagedCard[]) {
  const map = new Map(existing.map((card) => [card.id, card]))
  incoming.forEach((card) => map.set(card.id, card))
  return Array.from(map.values())
}

async function fetchLinkedCards(accountId: string): Promise<ManagedCard[]> {
  try {
    const res = await fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(accountId)}`)
    if (!res.ok) return []
    const body = await res.json()
    if (!Array.isArray(body?.data)) return []
    return body.data.map(mapLinkedCardToManagedCard)
  } catch {
    return []
  }
}

const DEFAULT_CARD: ManagedCard = {
  id: 'card-default',
  holderName: 'GENESIS MEMBER',
  type: 'virtual',
  spendLimit: '$5,000',
  last4: '9010',
  expiry: '03/28',
  cvv: '123',
  brand: 'VISA',
  frozen: false,
  controls: { online: true, atm: false, international: true },
  isLinked: false,
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')
}

function generateCardFromDraft(draft: AddCardDraft): ManagedCard {
  const now = new Date()
  const expiryMonth = String(((now.getMonth() + 5) % 12) + 1).padStart(2, '0')
  const expiryYear = String((now.getFullYear() + 3) % 100).padStart(2, '0')

  return {
    id: `card-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    holderName: draft.holderName.toUpperCase(),
    type: draft.type,
    spendLimit: draft.spendLimit,
    last4: randomDigits(4),
    expiry: `${expiryMonth}/${expiryYear}`,
    cvv: randomDigits(3),
    brand: 'VISA',
    frozen: false,
    controls: { online: true, atm: false, international: draft.type === 'physical' },
  }
}

/* ── CardPage ─────────────────────────────────────────────────────────── */
export function CardPage({ onNavigate }: { onNavigate?: (v: ViewKey) => void }) {
  const [cards, setCards] = useState<ManagedCard[]>([DEFAULT_CARD])
  const [activeCardId, setActiveCardId] = useState(DEFAULT_CARD.id)
  const [cardsLoaded, setCardsLoaded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(390)
  const [numberRevealed, setNumberRevealed] = useState(false)
  const [cvvRevealed, setCvvRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showLinkCard, setShowLinkCard] = useState(false)
  const [showTapToPay, setShowTapToPay] = useState(false)
  const activeAccountId = useActiveWalletAddress() ?? 'demo-account'

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(max-width: 900px)')
    const update = () => {
      setIsMobile(media.matches)
      setViewportWidth(window.innerWidth)
    }

    update()
    window.addEventListener('resize', update)
    media.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      media.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const stored = loadStoredCards(activeAccountId)
    setCards(stored)

    const storedActiveId = window.localStorage.getItem(getActiveCardStorageKey(activeAccountId))
    const hasStoredActive = !!storedActiveId && stored.some((card) => card.id === storedActiveId)
    setActiveCardId(hasStoredActive ? storedActiveId! : stored[0].id)

    if (activeAccountId) {
      void fetchLinkedCards(activeAccountId).then((linkedCards) => {
        if (linkedCards.length > 0) {
          // API data is the source of truth — it overwrites stale localStorage fields
          // (e.g. isLinked, issuerName) so the card renders correctly on every device.
          setCards((prev) => mergeCardsById(prev, linkedCards).filter((card) => card.id !== DEFAULT_CARD.id || linkedCards.length === 0))
        }
      }).finally(() => setCardsLoaded(true))
    } else {
      setCardsLoaded(true)
    }
  }, [activeAccountId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!cardsLoaded) return
    window.localStorage.setItem(getCardStorageKey(activeAccountId), JSON.stringify(cards))
  }, [cards, activeAccountId, cardsLoaded])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(getActiveCardStorageKey(activeAccountId), activeCardId)
  }, [activeCardId, activeAccountId])

  useEffect(() => {
    if (!cards.some((card) => card.id === activeCardId)) {
      setActiveCardId(cards[0]?.id ?? DEFAULT_CARD.id)
    }
  }, [cards, activeCardId])

  const activeCard = cards.find((card) => card.id === activeCardId) ?? cards[0] ?? DEFAULT_CARD
  const frozen = activeCard.frozen
  const controls = activeCard.controls

  const mobileContentWidth = Math.max(248, viewportWidth - 40)
  const detailCardWidth = isMobile ? Math.min(336, mobileContentWidth) : 380
  const listCardWidth = isMobile ? Math.min(300, mobileContentWidth - 10) : 286
  const detailCardHeight = Math.round(detailCardWidth * 0.605)
  const listCardHeight = Math.round(listCardWidth * 0.608)

  const CARD_NUMBER = `4000 1234 5678 ${activeCard.last4}`
  const CARD_NUMBER_MASKED = `•••• •••• •••• ${activeCard.last4}`
  const CVV = activeCard.cvv

  function updateActiveCard(updater: (card: ManagedCard) => ManagedCard) {
    setCards((prev) => prev.map((card) => (card.id === activeCard.id ? updater(card) : card)))
  }

  function handleCreateCard(draft: AddCardDraft) {
    const newCard = generateCardFromDraft(draft)
    setCards((prev) => [newCard, ...prev])
    setActiveCardId(newCard.id)
    setNumberRevealed(false)
    setCvvRevealed(false)
  }

  function copyNumber() {
    navigator.clipboard?.writeText(CARD_NUMBER.replace(/\s/g, '')).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      minHeight: '100vh',
      fontFamily: "'Tenor Sans', sans-serif",
      background: '#070707',
      overflowX: 'hidden',
    }}>

      {/* Tap to Pay modal */}
      {showTapToPay && (
        <TapToPayModal
          cards={cards.map(card => ({
            id: card.id,
            isGenesis: !card.isLinked,
            cardholderName: card.holderName,
            frozen: card.frozen,
            linkedMeta: card.isLinked ? { cardholderName: card.holderName, last4: card.last4, expiry: card.expiry, brand: card.brand, funding: card.funding, issuerName: card.issuerName, frozen: card.frozen } : undefined,
          }))}
          defaultCardId={activeCard.id}
          onClose={() => setShowTapToPay(false)}
        />
      )}

      {/* Add card slide-in panel */}
      {showAddCard && <AddCardPanel onClose={() => setShowAddCard(false)} onCreate={handleCreateCard} />}
      {showLinkCard && (
        <LinkDebitCardPanelWrapper
          onClose={() => setShowLinkCard(false)}
          onLinked={(card) => {
            const managed = mapLinkedCardToManagedCard(card)
            setCards((prev) => mergeCardsById([managed], prev))
            setActiveCardId(managed.id)
            setShowLinkCard(false)
          }}
          accountId={activeAccountId}
        />
      )}

      {/* ── Left panel — card list ─────────────────────────────────── */}
      <div style={{
        flex: isMobile ? '0 0 auto' : '0 0 360px',
        width: isMobile ? '100%' : undefined,
        padding: isMobile ? '18px 16px' : '32px 28px',
        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.07)',
        borderBottom: isMobile ? '1px solid rgba(255,255,255,0.07)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Section header using DS */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase' }}>Your Cards</div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', marginTop: 4 }}>
              {cardsLoaded ? 'Cards loaded for this wallet' : 'Loading cards…'}
            </div>
          </div>
          <StatusPill label={frozen ? 'Frozen' : 'Active'} tone={frozen ? 'neutral' : 'success'} />
        </div>

        {/* Card list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: isMobile ? 'none' : 'calc(100vh - 260px)', paddingRight: 2 }}>
          {cards.map((card) => {
            const isActive = card.id === activeCard.id
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setActiveCardId(card.id)
                  setNumberRevealed(false)
                  setCvvRevealed(false)
                }}
                style={{
                  background: isActive ? 'rgba(201,168,76,0.06)' : 'transparent',
                  border: isActive ? '1px solid rgba(201,168,76,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {card.isLinked ? (
                  <LinkedCardVisual
                    card={{ cardholderName: card.holderName, last4: card.last4, expiry: card.expiry, brand: card.brand, funding: card.funding, issuerName: card.issuerName, frozen: card.frozen }}
                    width={listCardWidth} height={listCardHeight}
                  />
                ) : (
                  <GenesisCard frozen={card.frozen} width={listCardWidth} height={listCardHeight} cardholder={card.holderName} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, padding: '0 4px' }}>
                  <div style={{ fontSize: 11, color: '#f5f0e8', letterSpacing: '0.05em' }}>•••• {card.last4}</div>
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', textTransform: 'capitalize' }}>{card.isLinked ? (card.funding ?? 'linked') : card.type}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Add card — now wired */}
        <button
          type="button"
          onClick={() => setShowAddCard(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
            padding: '12px', borderRadius: 14,
            border: '1px dashed rgba(201,168,76,0.32)',
            background: 'rgba(201,168,76,0.04)',
            color: 'rgba(201,168,76,0.65)',
            cursor: 'pointer', fontSize: 12, letterSpacing: '0.06em',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,168,76,0.09)'; e.currentTarget.style.color = '#c9a84c' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,168,76,0.04)'; e.currentTarget.style.color = 'rgba(201,168,76,0.65)' }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add new card</button>

        <button
          type="button"
          onClick={() => setShowLinkCard(true)}
          style={{
            marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
            padding: '12px', borderRadius: 14,
            border: '1px solid rgba(148, 192, 255, 0.22)',
            background: 'rgba(100, 149, 237, 0.08)',
            color: '#8ec0ff',
            cursor: 'pointer', fontSize: 12, letterSpacing: '0.06em',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(100, 149, 237, 0.12)'; e.currentTarget.style.color = '#b8d7ff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(100, 149, 237, 0.08)'; e.currentTarget.style.color = '#8ec0ff' }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>↗</span> Link debit card
        </button>
      </div>

      {/* ── Right panel — virtual card details ────────────────────── */}
      <div style={{
        flex: 1,
        width: isMobile ? '100%' : undefined,
        padding: isMobile ? '18px 16px 28px' : '32px 32px 40px',
        overflowY: 'auto',
        maxWidth: isMobile ? '100%' : 480,
      }}>

        {/* Header using DS PageHeader */}
        <PageHeader
          eyebrow="Card Management"
          title={`${activeCard.type === 'virtual' ? 'Virtual' : 'Physical'} Card`}
          pills={
            <>
              <StatusPill label={frozen ? 'Frozen' : 'Active'} tone={frozen ? 'neutral' : 'success'} />
              <StatusPill label={activeCard.brand} tone="accent" />
            </>
          }
        />

        {/* Card preview */}
        <div style={{ marginBottom: 24 }}>
          {activeCard.isLinked ? (
            <LinkedCardVisual
              card={{ cardholderName: activeCard.holderName, last4: activeCard.last4, expiry: activeCard.expiry, brand: activeCard.brand, funding: activeCard.funding, issuerName: activeCard.issuerName, frozen }}
              width={detailCardWidth} height={detailCardHeight}
            />
          ) : (
            <GenesisCard frozen={frozen} width={detailCardWidth} height={detailCardHeight} cardholder={activeCard.holderName} />
          )}
        </div>

        {/* Copy number button */}
        <button
          type="button"
          onClick={copyNumber}
          style={{
            width: '100%', padding: '13px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, cursor: 'pointer', marginBottom: 16,
            fontFamily: "'Tenor Sans', sans-serif",
            color: copied ? '#4caf50' : '#f5f0e8',
            fontSize: 13, letterSpacing: '0.04em',
            transition: 'color 0.2s',
          }}
        >
          {copied ? 'Copied!' : 'Copy Card Number'}
          <CopyIcon />
        </button>

        {/* Card detail rows */}
        <div style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>

          {/* Card number */}
          <DetailRow
            label="Card Number"
            value={numberRevealed ? CARD_NUMBER : CARD_NUMBER_MASKED}
            action={
              <button type="button" onClick={() => setNumberRevealed(r => !r)}
                style={revealBtnStyle}>{numberRevealed ? 'Hide' : 'Show'}</button>
            }
          />

          {/* Expires */}
          <DetailRow label="Expires" value={activeCard.expiry} />

          {/* CVV */}
          <DetailRow
            label="CVV"
            value={cvvRevealed ? CVV : '•••'}
            action={
              <button type="button" onClick={() => setCvvRevealed(r => !r)}
                style={revealBtnStyle}>{cvvRevealed ? 'Hide' : 'Show'}</button>
            }
          />

          {/* Billing address */}
          <DetailRow
            label="Billing Address"
            value={activeCard.holderName}
            action={<span style={{ fontSize: 14, color: 'rgba(245,240,232,0.3)' }}>›</span>}
            last
          />
        </div>

        {/* View full details */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, marginBottom: 24, cursor: 'pointer',
        }}>
          <span style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.02em' }}>View Full Card Details</span>
          <span style={{ fontSize: 16, color: 'rgba(245,240,232,0.35)' }}>›</span>
        </div>

        {/* Card controls */}
        <SectionPanel eyebrow="Security" title="Card Controls">
          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <ControlRow
              label="Online Transactions"
              desc="Allow online payments"
              on={controls.online}
              onChange={() => updateActiveCard((card) => ({ ...card, controls: { ...card.controls, online: !card.controls.online } }))}
            />
            <ControlRow
              label="ATM Withdrawals"
              desc="Allow ATM cash withdrawals"
              on={controls.atm}
              onChange={() => updateActiveCard((card) => ({ ...card, controls: { ...card.controls, atm: !card.controls.atm } }))}
            />
            <ControlRow
              label="International Usage"
              desc="Allow outside the US"
              on={controls.international}
              onChange={() => updateActiveCard((card) => ({ ...card, controls: { ...card.controls, international: !card.controls.international } }))}
              last
            />
          </div>
        </SectionPanel>

        {/* Tap to Pay */}
        <button
          type="button"
          onClick={() => setShowTapToPay(true)}
          style={{
            width: '100%', padding: '15px 18px', marginBottom: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'rgba(0,212,170,0.08)',
            border: '1px solid rgba(0,212,170,0.28)',
            borderRadius: 14, cursor: 'pointer',
            color: '#00D4AA',
            fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.25s',
          }}
        >
          <NfcIcon />
          Tap to Pay
        </button>

        {/* Freeze button */}
        <button
          type="button"
          onClick={() => updateActiveCard((card) => ({ ...card, frozen: !card.frozen }))}
          style={{
            width: '100%', padding: '15px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: frozen ? 'rgba(224,64,64,0.18)' : 'rgba(224,64,64,0.08)',
            border: `1px solid ${frozen ? 'rgba(224,64,64,0.55)' : 'rgba(224,64,64,0.28)'}`,
            borderRadius: 14, cursor: 'pointer',
            color: frozen ? '#ff6b6b' : '#e04040',
            fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.25s',
          }}
        >
          <LockIcon frozen={frozen} />
          {frozen ? 'Unfreeze Card' : 'Freeze Card'}
        </button>
      </div>
    </div>
  )
}

/* ── Detail row ──────────────────────────────────────────────────────── */
function DetailRow({ label, value, action, last = false }: { label: string; value: string; action?: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 18px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div>
        <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(245,240,232,0.38)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 14, color: '#f5f0e8', fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.06em' }}>{value}</div>
      </div>
      {action}
    </div>
  )
}

/* ── Control row ─────────────────────────────────────────────────────── */
function ControlRow({ label, desc, on, onChange, last = false }: {
  label: string; desc: string; on: boolean; onChange: () => void; last?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 18px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div>
        <div style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.02em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.38)' }}>{desc}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  )
}

/* ── Styles / icons ──────────────────────────────────────────────────── */
const revealBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(201,168,76,0.25)',
  borderRadius: 6,
  padding: '3px 9px',
  fontSize: 10,
  letterSpacing: '0.08em',
  color: '#c9a84c',
  cursor: 'pointer',
  fontFamily: "'Tenor Sans', sans-serif",
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function NfcIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 12a6 6 0 0 1 6-6" />
      <path d="M4 12a8 8 0 0 1 8-8" />
      <path d="M8.5 12a3.5 3.5 0 0 1 3.5-3.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

function LockIcon({ frozen }: { frozen: boolean }) {
  return frozen ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}
