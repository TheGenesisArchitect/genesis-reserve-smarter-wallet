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

export function FundPage({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const walletAddress = useActiveWalletAddress()

  const [mode, setMode] = useState<'card' | 'bridge'>('card')
  const [cardStep, setCardStep] = useState<CardStep>('pick')
  const [amount, setAmount] = useState('')
  const [transakOpen, setTransakOpen] = useState(false)
  const [transakOrder, setTransakOrder] = useState<TransakOrderData | null>(null)
  const transakCleanupRef = useRef<(() => void) | null>(null)

  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0
  const canBuy = amountNum >= MIN_USD && !!walletAddress && !transakOpen

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
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>What's next?</div>
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
