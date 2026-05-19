'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import type { Stripe, PaymentRequest, PaymentRequestPaymentMethodEvent } from '@stripe/stripe-js'
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

type ModalStep =
    | 'loading'           // Stripe + canMakePayment check
    | 'ready'             // NFC display, no Stripe wallet found
    | 'amount'            // Amount entry before launching wallet
    | 'processing'        // Stripe sheet open / network in flight
    | 'approved'          // Payment succeeded
    | 'failed'            // Hard error — show message
    | 'cancelled'         // User cancelled Stripe sheet
    | 'no-stripe'         // NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set

type WalletType = 'apple_pay' | 'google_pay' | 'link' | null

// ── Stripe singleton ──────────────────────────────────────────────────────────
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!pk) return null
    if (!stripePromise) stripePromise = loadStripe(pk)
    return stripePromise
}

// ── NFC rings ─────────────────────────────────────────────────────────────────
function NfcRings({ active, color = 'rgba(255,255,255,0.3)' }: { active: boolean; color?: string }) {
    return (
        <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{`@keyframes tap-ring { 0% { transform:scale(0.6);opacity:0.7 } 100% { transform:scale(2.0);opacity:0 } }`}</style>
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

// ── Card slide ────────────────────────────────────────────────────────────────
function CardSlide({ card, width, height }: { card: TapCard; width: number; height: number }) {
    if (card.isGenesis) return <GenesisCard width={width} height={height} cardholder={card.cardholderName} frozen={card.frozen} />
    if (card.linkedMeta) return <LinkedCardVisual card={{ ...card.linkedMeta, frozen: card.frozen }} width={width} height={height} />
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
    const [step, setStep] = useState<ModalStep>('loading')
    const [walletType, setWalletType] = useState<WalletType>(null)
    const [amountInput, setAmountInput] = useState('')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const stripeRef = useRef<Stripe | null>(null)
    const paymentRequestRef = useRef<PaymentRequest | null>(null)
    const touchStartX = useRef<number | null>(null)

    // Dismiss on Escape
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    // Probe Stripe + canMakePayment on mount
    useEffect(() => {
        const stripeLoader = getStripe()
        if (!stripeLoader) {
            setStep('no-stripe')
            return
        }

        stripeLoader.then(stripe => {
            if (!stripe) { setStep('ready'); return }
            stripeRef.current = stripe

            const pr = stripe.paymentRequest({
                country: 'US',
                currency: 'usd',
                total: { label: 'Genesis Reserve', amount: 100 }, // $1.00 probe
                requestPayerName: false,
                requestPayerEmail: false,
            })
            paymentRequestRef.current = pr

            pr.canMakePayment().then(result => {
                if (result?.applePay) setWalletType('apple_pay')
                else if (result?.googlePay) setWalletType('google_pay')
                // result non-null but no specific wallet = link/other
                setStep('ready')
            }).catch(() => setStep('ready'))
        }).catch(() => setStep('ready'))
    }, [])

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

    // Launch Stripe Payment Request sheet
    const launchPayment = useCallback(async () => {
        const stripe = stripeRef.current
        const pr = paymentRequestRef.current
        if (!stripe || !pr) return

        const amount = parseFloat(amountInput.replace(/[^0-9.]/g, ''))
        if (!amount || amount < 0.5) {
            setErrorMsg('Enter an amount of at least $0.50.')
            return
        }

        setStep('processing')
        setErrorMsg(null)

        // Create PaymentIntent on server
        let clientSecret: string
        try {
            const res = await fetch('/api/gr/payments/tap-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, description: 'Genesis Reserve — Tap to Pay' }),
            })
            const data = await res.json() as { clientSecret?: string; error?: string }
            if (!data.clientSecret) {
                setErrorMsg(data.error ?? 'Could not create payment. Check Stripe configuration.')
                setStep('failed')
                return
            }
            clientSecret = data.clientSecret
        } catch {
            setErrorMsg('Network error. Please try again.')
            setStep('failed')
            return
        }

        // Update the payment request amount to match what user entered
        pr.update({ total: { label: 'Genesis Reserve', amount: Math.round(amount * 100) } })

        // Wire up one-time payment handler
        const handlePaymentMethod = async (ev: PaymentRequestPaymentMethodEvent) => {
            const { error, paymentIntent } = await stripe.confirmCardPayment(
                clientSecret,
                { payment_method: ev.paymentMethod.id },
                { handleActions: false }
            )

            if (error) {
                ev.complete('fail')
                setErrorMsg(error.message ?? 'Payment declined.')
                setStep('failed')
                return
            }

            ev.complete('success')

            if (paymentIntent?.status === 'requires_action') {
                const { error: actionError } = await stripe.confirmCardPayment(clientSecret)
                if (actionError) {
                    setErrorMsg(actionError.message ?? '3D Secure verification failed.')
                    setStep('failed')
                    return
                }
            }

            setStep('approved')
        }

        pr.once('paymentmethod', handlePaymentMethod)
        pr.on('cancel', () => {
            pr.off('paymentmethod', handlePaymentMethod)
            setStep('cancelled')
        })

        try {
            await pr.show()
        } catch (err) {
            pr.off('paymentmethod', handlePaymentMethod)
            const msg = err instanceof Error ? err.message : ''
            if (msg.toLowerCase().includes('cancel')) {
                setStep('cancelled')
            } else {
                setErrorMsg(msg || 'Could not open digital wallet.')
                setStep('failed')
            }
        }
    }, [amountInput])

    const activeCard = cards[activeIdx]
    const cardW = Math.min(340, typeof window !== 'undefined' ? window.innerWidth - 32 : 340)
    const cardH = Math.round(cardW * 0.605)
    const isFrozen = activeCard?.frozen === true

    const walletLabel = walletType === 'apple_pay' ? 'Apple Pay' : walletType === 'google_pay' ? 'Google Pay' : 'Digital Wallet'
    const walletIcon = walletType === 'apple_pay' ? <ApplePayMark /> : walletType === 'google_pay' ? <GooglePayMark /> : <WalletIcon />

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: '#050505',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                paddingTop: 72, paddingBottom: 150,
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
            }}>×</button>

            {/* Card */}
            <div style={{
                transform: step === 'processing' ? 'scale(1.04)' : 'scale(1)',
                transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                marginBottom: 36,
                boxShadow: step === 'approved' ? '0 0 60px rgba(0,212,170,0.35)' : step === 'failed' ? '0 0 40px rgba(232,64,64,0.18)' : '0 40px 80px rgba(0,0,0,0.9)',
                borderRadius: 20,
            }}>
                {activeCard && <CardSlide card={activeCard} width={cardW} height={cardH} />}
            </div>

            {/* Status area */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 360, padding: '0 20px' }}>

                {step === 'loading' && (
                    <>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.2)', borderTopColor: '#c9a84c', animation: 'spin 1s linear infinite' }} />
                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>Checking digital wallet…</div>
                    </>
                )}

                {(step === 'ready' || step === 'cancelled') && (
                    <>
                        <NfcRings active color="rgba(255,255,255,0.3)" />
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.02em' }}>
                            {isFrozen ? 'Card is frozen' : 'Hold near reader'}
                        </div>
                        {isFrozen && (
                            <div style={{ fontSize: 11, color: '#E84040', letterSpacing: '0.06em' }}>Unfreeze this card to pay</div>
                        )}
                        {step === 'cancelled' && (
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Payment cancelled — try again below</div>
                        )}
                        {cards.length > 1 && (
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>Swipe to switch cards</div>
                        )}
                    </>
                )}

                {step === 'amount' && (
                    <>
                        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', marginBottom: 4 }}>Enter payment amount</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: '#c9a84c' }}>$</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={amountInput}
                                onChange={e => { setAmountInput(e.target.value); setErrorMsg(null) }}
                                autoFocus
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: 10, padding: '12px 14px',
                                    color: '#f5f0e8', fontSize: 22,
                                    fontFamily: "'Cormorant Garamond', serif",
                                    outline: 'none', letterSpacing: '0.02em',
                                }}
                            />
                        </div>
                        {errorMsg && (
                            <div style={{ fontSize: 11, color: '#E84040', textAlign: 'center', lineHeight: 1.5 }}>{errorMsg}</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
                            <button type="button" onClick={() => { setStep('ready'); setAmountInput(''); setErrorMsg(null) }}
                                style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>
                                Back
                            </button>
                            <button type="button" onClick={launchPayment}
                                style={{ flex: 2, padding: '12px', borderRadius: 10, background: walletType === 'apple_pay' ? '#000' : walletType === 'google_pay' ? 'rgba(255,255,255,0.9)' : 'rgba(201,168,76,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: walletType === 'google_pay' ? '#111' : '#fff', fontSize: 13, cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                {walletIcon}
                                Pay with {walletLabel}
                            </button>
                        </div>
                    </>
                )}

                {step === 'processing' && (
                    <>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.2)', borderTopColor: '#c9a84c', animation: 'spin 1s linear infinite' }} />
                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>Contacting wallet…</div>
                    </>
                )}

                {step === 'approved' && (
                    <>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                        <div style={{ fontSize: 17, color: '#00D4AA', letterSpacing: '0.02em' }}>Payment approved</div>
                        <button type="button" onClick={onClose}
                            style={{ marginTop: 8, padding: '10px 28px', borderRadius: 10, background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.25)', color: '#00D4AA', fontSize: 12, cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.06em' }}>
                            Done
                        </button>
                    </>
                )}

                {step === 'failed' && (
                    <>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#E84040" strokeWidth={2} strokeLinecap="round">
                                <circle cx={12} cy={12} r={10} /><line x1={12} y1={8} x2={12} y2={12} /><line x1={12} y1={16} x2={12.01} y2={16} />
                            </svg>
                        </div>
                        <div style={{ fontSize: 14, color: '#E84040' }}>Payment failed</div>
                        {errorMsg && (
                            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', textAlign: 'center', lineHeight: 1.65, padding: '10px 14px', borderRadius: 10, background: 'rgba(232,64,64,0.06)', border: '1px solid rgba(232,64,64,0.14)' }}>
                                {errorMsg}
                            </div>
                        )}
                        <button type="button" onClick={() => { setStep('ready'); setErrorMsg(null) }}
                            style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontSize: 12, cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif', letterSpacing: '0.06em" }}>
                            Try Again
                        </button>
                    </>
                )}

                {step === 'no-stripe' && (
                    <div style={{ textAlign: 'center', padding: '12px 16px', borderRadius: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)' }}>
                        <div style={{ fontSize: 13, color: '#c9a84c', marginBottom: 8 }}>Stripe not configured</div>
                        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', lineHeight: 1.7 }}>
                            Add <code style={{ color: '#c9a84c', fontSize: 10 }}>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> and{' '}
                            <code style={{ color: '#c9a84c', fontSize: 10 }}>STRIPE_SECRET_KEY</code> to your Vercel environment to enable Apple Pay and Google Pay.
                        </div>
                    </div>
                )}
            </div>

            {/* Card dots */}
            {cards.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    {cards.map((_, i) => (
                        <button key={i} type="button" onClick={() => setActiveIdx(i)} style={{
                            width: i === activeIdx ? 22 : 8, height: 8, borderRadius: 4,
                            background: i === activeIdx ? '#C9A84C' : 'rgba(255,255,255,0.2)',
                            border: 'none', cursor: 'pointer', transition: 'all 0.25s',
                        }} />
                    ))}
                </div>
            )}

            {/* Bottom action bar */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                padding: '14px 20px 36px',
                background: 'linear-gradient(0deg, #050505 65%, transparent 100%)',
                display: 'flex', flexDirection: 'column', gap: 8,
            }}>
                {/* Digital wallet button — only in ready/cancelled state */}
                {(step === 'ready' || step === 'cancelled') && !isFrozen && (
                    walletType ? (
                        <button type="button" onClick={() => setStep('amount')}
                            style={{
                                padding: '14px 20px', borderRadius: 13,
                                background: walletType === 'apple_pay' ? '#1a1a1a' : 'rgba(255,255,255,0.07)',
                                border: `1px solid ${walletType === 'apple_pay' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.12)'}`,
                                color: '#fff', fontSize: 14, letterSpacing: '0.03em',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                fontFamily: "'Tenor Sans', sans-serif",
                            }}>
                            {walletIcon}
                            Pay with {walletLabel}
                        </button>
                    ) : step === 'ready' && (
                        <div style={{
                            padding: '12px 16px', borderRadius: 12, textAlign: 'center',
                            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
                            fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6,
                        }}>
                            No digital wallet detected · Hold your card near the reader
                        </div>
                    )
                )}

                {/* Phase 2 notice */}
                <div style={{
                    padding: '9px 14px', borderRadius: 10,
                    background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.09)',
                    fontSize: 10, color: 'rgba(201,168,76,0.4)',
                    textAlign: 'center', lineHeight: 1.6, letterSpacing: '0.04em',
                }}>
                    Phase 2 · Native NFC card provisioning via Apple Wallet &amp; Google Wallet
                </div>
            </div>
        </div>
    )
}

// ── Brand marks ───────────────────────────────────────────────────────────────

function ApplePayMark() {
    return (
        <svg height="16" viewBox="0 0 43 16" fill="white">
            <path d="M8.07 3.3c-.5.62-1.32 1.1-2.12 1.04-.1-.8.3-1.65.76-2.18C7.22 1.52 8.12 1.07 8.8 1c.1.83-.24 1.66-.73 2.3zm.72 1.15c-1.18-.07-2.18.67-2.74.67-.57 0-1.44-.63-2.38-.62C2.4 4.52 1.3 5.22.87 6.3c-.9 1.97.23 4.9.9 6.5.46 1.1 1 2.3 1.72 2.28.7-.02 1-.47 1.87-.47.88 0 1.14.47 1.88.46.73-.01 1.2-1.09 1.66-2.19.27-.64.44-1.27.54-1.45-.8-.37-1.38-1.2-1.38-2.17 0-1.07.55-2 1.37-2.48-.52-.75-1.32-1.23-2.14-1.23zM17.9 1.96h-3.66v8.62h1.41V7.1h2.25c2.06 0 3.5-1.12 3.5-2.58 0-1.46-1.44-2.56-3.5-2.56zm-.14 4h-2.1V3.11h2.1c1.38 0 2.16.56 2.16 1.43 0 .87-.78 1.42-2.16 1.42zm8.17-1.3c-1.32 0-2.28.72-2.68 1.76h.06V4.8H22v5.78h1.34V7.72c0-.96.66-1.6 1.68-1.6.97 0 1.53.6 1.53 1.65v2.8h1.34V7.56c0-1.54-.9-2.56-2.36-2.56zM30.06 4.8H28.7v5.77h1.35V4.8zm-.68-2.1a.78.78 0 1 0 0 1.56.78.78 0 0 0 0-1.56zm4.4 7.88 1.34-3.83h.05l1.34 3.83h-2.73zm1.93-5.75h-1.17l-3.4 8.62h1.43l.77-2.1h3.57l.77 2.1h1.47l-3.44-8.62z" />
        </svg>
    )
}

function GooglePayMark() {
    return (
        <svg height="16" viewBox="0 0 40 16" fill="none">
            <text x="0" y="13" fontSize="13" fontFamily="'Roboto', sans-serif" fontWeight="500" fill="white">G Pay</text>
        </svg>
    )
}

function WalletIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M16 12h2" />
        </svg>
    )
}
