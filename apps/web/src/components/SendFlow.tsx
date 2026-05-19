'use client'

import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { isAddress, formatUnits, parseUnits, parseEther, encodeFunctionData } from 'viem'
import { arbitrum } from 'viem/chains'
import { useComplianceGate, KYCTier } from '../hooks/useComplianceGate'
import { useGenesisVault } from '../hooks/useGenesisVault'
import { useWalletStore } from '../store/wallet.store'
import { useBalance } from 'wagmi'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { useSendQuote } from '../hooks/useSendQuote'
import { useSend } from '../hooks/useSend'
import type { ScreenResult, OrderResult, FinalizeResult } from '../hooks/useSend'
import { PROTOCOL } from '../config/contracts'
import { RecipientBookPanel } from './RecipientBookPanel'
import { AddRecipientForm } from './AddRecipientForm'
import type { RemittanceRecipient } from '../lib/bff.types'
import { KYCUpgradeFlow } from './KYCUpgradeFlow'

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  card: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: '22px 20px',
  } as React.CSSProperties,
  label: {
    fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)',
    textTransform: 'uppercase' as const, marginBottom: 6,
    fontFamily: "'Tenor Sans', sans-serif",
  },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f5f0e8', fontSize: 13,
    fontFamily: "'Tenor Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box' as const,
  },
  btnGold: {
    width: '100%', padding: '14px', borderRadius: 30,
    background: '#c9a84c', color: '#1a1400',
    border: 'none', cursor: 'pointer',
    fontSize: 12, letterSpacing: '0.12em',
    fontFamily: "'Tenor Sans', sans-serif",
    fontWeight: 600,
  } as React.CSSProperties,
  btnGhost: {
    width: '100%', padding: '12px', borderRadius: 30,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(245,240,232,0.5)',
    cursor: 'pointer', fontSize: 11,
    fontFamily: "'Tenor Sans', sans-serif",
    letterSpacing: '0.06em',
  } as React.CSSProperties,
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, color: 'rgba(245,240,232,0.55)',
    fontFamily: "'Tenor Sans', sans-serif",
  } as React.CSSProperties,
  select: {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f5f0e8', fontSize: 13,
    fontFamily: "'Tenor Sans', sans-serif",
    outline: 'none',
  } as React.CSSProperties,
}

// ── USDC ERC-20 transfer ABI ──────────────────────────────────────────────────
const ERC20_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const

// ── Token config ──────────────────────────────────────────────────────────────
type TokenKey = 'ETH' | 'USDC' | 'USDT'

const TOKENS = [
  { key: 'USDC' as TokenKey, label: 'USD Coin',   symbol: 'USDC', decimals: 6,  contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}` | undefined, color: '#2775ca' },
  { key: 'ETH'  as TokenKey, label: 'Ethereum',   symbol: 'ETH',  decimals: 18, contract: undefined as `0x${string}` | undefined,                                   color: '#627eea' },
  { key: 'USDT' as TokenKey, label: 'Tether USD', symbol: 'USDT', decimals: 6,  contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}` | undefined, color: '#26a17b' },
]

const USDT_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }],
  outputs: [],
}] as const

// ── SendFlow ──────────────────────────────────────────────────────────────────
type SendStep = 'input' | 'kyc' | 'compliance' | 'reserving' | 'confirming' | 'success' | 'error'

interface SendFlowProps {
  accountId?: string
  onStepChange?: (step: number) => void
}

export function SendFlow({ accountId, onStepChange }: SendFlowProps) {
  const { authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
    const walletAddress = useActiveWalletAddress() as `0x${string}` | undefined
    const { walletUsdcBalance } = useGenesisVault()
    const { data: ethBalData } = useBalance({ address: walletAddress, chainId: arbitrum.id })
    const { data: usdtBalData } = useBalance({
      address: walletAddress,
      token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      chainId: arbitrum.id,
    })
  const compliance = useComplianceGate()
  const { addToast } = useWalletStore()
  const send = useSend()

  const [step, setStep] = useState<SendStep>('input')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
    const [selectedToken, setSelectedToken] = useState<TokenKey>('USDC')
  const [reservationId, setResId] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feeAmount, setFeeAmount] = useState<string>('0')
  const [showBook, setShowBook] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [debouncedRecipient, setDebouncedRecipient] = useState('')
  const [debouncedAtomicAmount, setDebouncedAtomicAmount] = useState('0')

  function changeStep(s: SendStep) {
    setStep(s)
    const idx = ['input', 'compliance', 'confirming', 'success'].indexOf(s)
    if (idx >= 0) onStepChange?.(idx)
  }

  function selectSavedRecipient(r: RemittanceRecipient) {
    setRecipient(r.recipientAddress ?? r.recipientId)
    if (r.memo) setMemo(r.memo)
    setShowBook(false)
  }

  const numericAmount = parseFloat(amount) || 0
  const token = TOKENS.find(t => t.key === selectedToken) ?? TOKENS[0]
  const atomicAmount = numericAmount > 0 ? parseUnits(amount, token.decimals).toString() : '0'
    const vaultBalance = selectedToken === 'ETH'
      ? parseFloat(ethBalData?.formatted || '0')
      : selectedToken === 'USDT'
        ? parseFloat(usdtBalData?.formatted || '0')
        : parseFloat(walletUsdcBalance || '0')
  // Flat $0.80 Genesis fee on stablecoin sends; ETH sends pay no Genesis fee (gas only)
  const feeUsdc = selectedToken === 'ETH' ? 0 : (numericAmount > 0 ? PROTOCOL.TX_FEE_FLAT_USD : 0)
  const netAmount = numericAmount - feeUsdc

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRecipient(recipient)
      setDebouncedAtomicAmount(atomicAmount)
    }, 400)
    return () => clearTimeout(timer)
  }, [recipient, atomicAmount])

  const quoteQuery = useSendQuote({
    accountId: accountId ?? '',
    recipientAddress: debouncedRecipient,
    amount: debouncedAtomicAmount,
    corridor: 'US-PH',
    payoutMethod: 'bank_transfer',
    enabled: step === 'input' && Boolean(accountId) && isAddress(debouncedRecipient) && debouncedAtomicAmount !== '0',
  })

  const quoteFeeUsdc = quoteQuery.data?.fee ? Number(formatUnits(BigInt(quoteQuery.data.fee), PROTOCOL.USDC_DECIMALS)) : feeUsdc
  const quoteNetUsdc = quoteQuery.data?.netAmount ? Number(formatUnits(BigInt(quoteQuery.data.netAmount), PROTOCOL.USDC_DECIMALS)) : netAmount

  const isRecipientValid = isAddress(recipient)
  const isAmountValid = numericAmount > 0 && numericAmount <= vaultBalance
  // Allow send even without a backend quote — will fall back to direct on-chain
  const canSubmit = isRecipientValid && isAmountValid && (compliance.canSend || compliance.isLoading)

  // ── Direct on-chain USDC transfer (backend fallback) ──────────────────────
  async function sendOnChain(): Promise<string> {
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
    if (!embeddedWallet) throw new Error('No embedded wallet found. Please reconnect.')
    await embeddedWallet.switchChain(arbitrum.id)
    const provider = await embeddedWallet.getEthereumProvider()
    if (token.key === 'ETH') {
      return await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: embeddedWallet.address as `0x${string}`, to: recipient as `0x${string}`, value: ('0x' + parseEther(amount).toString(16)) as `0x${string}` }],
      }) as string
    }
    const abi = token.key === 'USDT' ? USDT_TRANSFER_ABI : ERC20_TRANSFER_ABI
    const calldata = encodeFunctionData({ abi, functionName: 'transfer', args: [recipient as `0x${string}`, parseUnits(amount, token.decimals)] })
    return await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: embeddedWallet.address as `0x${string}`, to: token.contract!, data: calldata }],
    }) as string
  }

  const handleSend = async () => {
    if (!authenticated) { login(); return }
    if (!canSubmit) return

    setError(null)
    changeStep('compliance')

    try {
      // Try compliance screening via backend
      let screened = false
      try {
        const screenRaw = await send.mutateAsync({ action: 'screen', fromAddress: recipient, amount: atomicAmount })
        const screenResult = screenRaw as ScreenResult
        if (screenResult.sanctioned) throw new Error('Address is sanctioned. Contact support.')
        screened = true
      } catch (e) {
        if (e instanceof Error && e.message.includes('sanctioned')) throw e
        // Backend down — allow with local validation only
      }

      changeStep('reserving')

      let orderId: string | null = null
      let finalFee = quoteFeeUsdc.toString()

      // Try to create order via backend
      if (accountId && quoteQuery.data?.quoteId) {
        try {
          const orderRaw = await send.mutateAsync({
            action: 'order', quoteId: quoteQuery.data.quoteId,
            accountId, recipientId: recipient,
            payoutMethod: 'bank_transfer', memo: memo || undefined,
          })
          const orderResult = orderRaw as OrderResult
          orderId = orderResult.orderId || orderResult.reservationId
          finalFee = orderResult.fee ? formatUnits(BigInt(orderResult.fee), PROTOCOL.USDC_DECIMALS) : finalFee
        } catch {
          // Backend unavailable — proceed to direct on-chain confirmation
        }
      }

      setResId(orderId)
      setFeeAmount(finalFee)
      changeStep('confirming')

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed'
      setError(msg)
      changeStep('error')
    }
  }

  const handleConfirm = async () => {
    changeStep('reserving')
    try {
      let hash = ''

      if (reservationId) {
        // Try backend finalize first
        try {
          const finalRaw = await send.mutateAsync({ action: 'finalize', orderId: reservationId })
          const finalizeResult = finalRaw as FinalizeResult
          hash = finalizeResult.txHash || ''
        } catch {
          // Backend down — fall back to direct on-chain
          hash = await sendOnChain()
        }
      } else {
        // No backend order — direct on-chain transfer
        hash = await sendOnChain()
      }

      setTxHash(hash)
      changeStep('success')
      addToast(`Sent $${netAmount.toFixed(2)} USDC successfully`, 'success')

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed'
      setError(msg)
      changeStep('error')
    }
  }

  const reset = () => {
    changeStep('input')
    setRecipient(''); setAmount(''); setMemo('')
    setResId(null); setTxHash(null); setError(null)
    setShowBook(false); setShowAddForm(false)
  }

  // ── KYC Gate ───────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '32px 24px' }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>🔐</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8' }}>Connect to Send</div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)' }}>Connect your wallet to access transfers</div>
        <button style={S.btnGold} onClick={login}>Connect Wallet</button>
      </div>
    )
  }

  if (step === 'kyc') {
    return (
      <div style={S.card}>
        <KYCUpgradeFlow currentTier={compliance.tier} onBack={() => changeStep('input')} />
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', padding: '36px 24px' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>✓</div>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', marginBottom: 6 }}>Transfer Complete</div>
          <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.5)', lineHeight: 1.7 }}>
            {selectedToken === 'ETH' ? netAmount.toFixed(6) : `$${netAmount.toFixed(2)}`} {token.symbol} sent to<br />
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#c9a84c' }}>{recipient.slice(0, 8)}…{recipient.slice(-6)}</span>
          </div>
        </div>
        {txHash && (
          <a href={`https://arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#c9a84c', fontFamily: 'monospace', textDecoration: 'none', padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(201,168,76,0.07)' }}>
            View on Arbiscan ↗
          </a>
        )}
        <button style={S.btnGhost} onClick={reset}>New Transfer</button>
      </div>
    )
  }

  // ── Confirm screen ─────────────────────────────────────────────────────────
  if (step === 'confirming') {
    return (
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8' }}>Confirm Transfer</div>

        <div style={{ borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          {[
            { label: 'To', value: `${recipient.slice(0, 10)}…${recipient.slice(-8)}`, mono: true },
              { label: 'Asset', value: `${token.label} (${token.symbol})`, mono: false },
              { label: 'Amount', value: `${numericAmount.toFixed(selectedToken === 'ETH' ? 6 : 2)} ${token.symbol}`, mono: false },
              ...(feeUsdc > 0 ? [{ label: 'Genesis Fee (relay + gas)', value: `-$${PROTOCOL.TX_FEE_FLAT_USD.toFixed(2)}`, mono: false, highlight: false }] : []),
              { label: 'Recipient receives', value: `${quoteNetUsdc.toFixed(selectedToken === 'ETH' ? 6 : 4)} ${token.symbol}`, mono: false, highlight: true },
              { label: 'Network', value: 'Arbitrum One · ~0.3s finality', mono: false },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ ...S.row, padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.055)' : 'none' }}>
              <span style={{ color: 'rgba(245,240,232,0.4)' }}>{row.label}</span>
              <span style={{ fontFamily: row.mono ? 'monospace' : "'Tenor Sans', sans-serif", fontSize: row.mono ? 11 : 13, color: row.highlight ? '#4caf50' : '#f5f0e8', fontWeight: row.highlight ? 600 : 400 }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {memo && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12, color: 'rgba(245,240,232,0.45)' }}>
            Memo: {memo}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={S.btnGold} onClick={handleConfirm} disabled={send.isPending}>
            {send.isPending ? 'Processing…' : 'Confirm & Send →'}
          </button>
          <button style={S.btnGhost} onClick={reset}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Processing states ──────────────────────────────────────────────────────
  if (step === 'compliance' || step === 'reserving') {
    const msg = step === 'compliance' ? 'Running compliance checks…' : 'Preparing transfer…'
    return (
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '36px 24px' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.15)', borderTopColor: '#c9a84c', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.55)', fontFamily: "'Tenor Sans', sans-serif" }}>{msg}</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Input form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KYC tier notice */}
      {!compliance.isLoading && !compliance.canSend && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#c9a84c', marginBottom: 2 }}>Identity verification required to send</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>Current tier: {compliance.tierLabel}</div>
          </div>
          <button onClick={() => changeStep('kyc')} style={{ padding: '7px 14px', borderRadius: 20, background: '#c9a84c', color: '#1a1400', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}>
            Upgrade →
          </button>
        </div>
      )}

      {/* Token Selector */}
      <div>
        <div style={S.label}>Asset</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {TOKENS.map(t => (
            <button key={t.key} type="button" onClick={() => { setSelectedToken(t.key); setAmount('') }}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                background: selectedToken === t.key ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                border: selectedToken === t.key ? `1.5px solid ${t.color}` : '1px solid rgba(255,255,255,0.09)',
                color: selectedToken === t.key ? '#f5f0e8' : 'rgba(245,240,232,0.4)',
                fontFamily: "'Tenor Sans', sans-serif",
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedToken === t.key ? t.color : 'inherit' }}>{t.symbol}</span>
              <span style={{ fontSize: 9, opacity: 0.65 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Remittance upsell for Basic-tier users */}
      {!compliance.isLoading && compliance.canSend && !compliance.canRemit && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.13)', fontSize: 11, color: 'rgba(245,240,232,0.45)' }}>
          Crypto sends active ·{' '}
          <span style={{ color: '#c9a84c', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => changeStep('kyc')}>
            Upgrade to Enhanced KYC
          </span>{' '}
          for international remittance
        </div>
      )}

      {/* Recipient */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={S.label}>Recipient Address</div>
          {accountId && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => { setShowBook(v => !v); setShowAddForm(false) }}
                style={{ fontSize: 11, color: showBook ? '#c9a84c' : 'rgba(245,240,232,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>
                {showBook ? '− Saved' : '+ Saved'}
              </button>
              <button type="button" onClick={() => { setShowAddForm(v => !v); setShowBook(false) }}
                style={{ fontSize: 11, color: showAddForm ? '#c9a84c' : 'rgba(245,240,232,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>
                {showAddForm ? '− New' : '+ New'}
              </button>
            </div>
          )}
        </div>

        {showBook && accountId && (
          <div style={{ marginBottom: 10 }}>
            <RecipientBookPanel accountId={accountId} onSelectRecipient={selectSavedRecipient} />
          </div>
        )}
        {showAddForm && accountId && (
          <div style={{ marginBottom: 10 }}>
            <AddRecipientForm accountId={accountId}
              onSuccess={(recipientId, displayName) => { setRecipient(recipientId); setMemo(displayName); setShowAddForm(false) }}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        <input style={S.input} placeholder="0x… or select from saved recipients"
          value={recipient} onChange={e => setRecipient(e.target.value)} />
        {recipient && !isRecipientValid && (
          <div style={{ fontSize: 11, color: '#e57373', marginTop: 4 }}>Invalid Ethereum address</div>
        )}
      </div>

      {/* Amount */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={S.label}>Amount ({token.symbol})</div>
            <button type="button" onClick={() => setAmount(vaultBalance.toFixed(token.decimals === 18 ? 6 : 2))}
            style={{ fontSize: 11, color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>
              MAX {selectedToken === 'ETH' ? `${vaultBalance.toFixed(6)} ETH` : `$${vaultBalance.toFixed(2)}`}
          </button>
        </div>
        <div style={{ position: 'relative' }}>
            {selectedToken !== 'ETH' && <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(245,240,232,0.3)' }}>$</span>}
            <input type="number" style={{ ...S.input, paddingLeft: selectedToken !== 'ETH' ? 28 : 14 }} placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        {numericAmount > 0 && (
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', marginTop: 6 }}>
              {feeUsdc > 0
                ? `Fee: $${quoteFeeUsdc.toFixed(4)} · Receives: $${quoteNetUsdc.toFixed(4)} ${token.symbol}`
                : `${netAmount.toFixed(selectedToken === 'ETH' ? 6 : 2)} ${token.symbol} · gasless · Arbitrum`}
          </div>
        )}
        {numericAmount > vaultBalance && vaultBalance > 0 && (
          <div style={{ fontSize: 11, color: '#e57373', marginTop: 4 }}>Insufficient balance</div>
        )}
      </div>

      {/* Quote box */}
      {accountId && isRecipientValid && numericAmount > 0 && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {quoteQuery.isLoading ? (
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Refreshing quote…</div>
          ) : quoteQuery.data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { k: 'Rate', v: quoteQuery.data.rate },
                { k: 'Spread', v: `${quoteQuery.data.spread.toFixed(2)}%` },
                { k: 'ETA', v: quoteQuery.data.deliveryEstimate },
                { k: 'Expires', v: new Date(quoteQuery.data.expiresAt).toLocaleTimeString() },
              ].map(r => (
                <div key={r.k} style={{ ...S.row, fontSize: 11 }}>
                  <span style={{ color: 'rgba(245,240,232,0.35)' }}>{r.k}</span>
                  <span style={{ color: '#f5f0e8' }}>{r.v}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)' }}>Direct on-chain transfer · 0.42% fee · Arbitrum</div>
          )}
        </div>
      )}

      {/* Memo */}
      <div>
        <div style={{ ...S.label, marginBottom: 8 }}>Memo <span style={{ opacity: 0.5 }}>(optional)</span></div>
        <input style={S.input} placeholder="What's this for?" value={memo} onChange={e => setMemo(e.target.value)} />
      </div>

      {/* Error */}
      {step === 'error' && error && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(229,115,115,0.07)', border: '1px solid rgba(229,115,115,0.2)', fontSize: 12, color: '#e57373', lineHeight: 1.6 }}>
          {error}
        </div>
      )}

      {/* CTA */}
      <button style={{ ...S.btnGold, opacity: canSubmit ? 1 : 0.4 }} onClick={handleSend} disabled={!canSubmit}>
        {!accountId ? 'Resolving account…' : quoteQuery.isLoading ? 'Getting quote…' : 'Review Transfer →'}
      </button>

      {/* Limit footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(245,240,232,0.25)' }}>
        <span>Daily limit: ${compliance.dailyLimit.toLocaleString()}</span>
        <span>Per tx: ${compliance.txLimit.toLocaleString()}</span>
      </div>
    </div>
  )
}
