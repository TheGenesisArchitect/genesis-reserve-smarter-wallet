'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { mainnet } from 'viem/chains'
import { parseEther } from 'viem'
import { usePortfolioBalances } from '../hooks/usePortfolioBalances'
import type { ViewKey } from './AppShell'

// ── Arbitrum One Inbox contract on Ethereum mainnet ──────────────────────────
// Official Arbitrum One Delayed Inbox — accepts ETH deposits via depositEth()
// Source: https://developer.arbitrum.io/useful-addresses
const ARBITRUM_INBOX = '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f' as const

const INBOX_ABI = [
  {
    name: 'depositEth',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

interface BridgePanelProps {
  onNavigate: (view: ViewKey) => void
}

export function BridgePanel({ onNavigate }: BridgePanelProps) {
  const { address, chainId } = useAccount()
  const { wallets } = useWallets()
  const [isSwitching, setIsSwitching] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const [amount, setAmount] = useState('')
  const [inputError, setInputError] = useState('')

  // Switch to Ethereum mainnet via Privy's wallet API (wagmi's useSwitchChain
  // doesn't propagate to Privy embedded wallets)
  async function switchToMainnet() {
    const wallet = wallets.find(w => w.walletClientType === 'privy') ?? wallets[0]
    if (!wallet) { setSwitchError('No wallet found'); return }
    setSwitchError('')
    setIsSwitching(true)
    try {
      await wallet.switchChain(mainnet.id)
    } catch (e: unknown) {
      setSwitchError(e instanceof Error ? e.message.slice(0, 80) : 'Switch failed')
    } finally {
      setIsSwitching(false)
    }
  }

  // ETH balance on mainnet — via BFF (same approach as portfolio breakdown)
  const { data: portfolio } = usePortfolioBalances(address)
  const ethBalance = portfolio?.find(b => b.chainId === mainnet.id)?.nativeAmount ?? 0

  const { writeContract, data: txHash, isPending: isWriting, error: writeError, reset } = useWriteContract()

  // Wait for receipt
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const isOnMainnet = chainId === mainnet.id
  const parsedAmount = parseFloat(amount) || 0

  function handleAmountChange(val: string) {
    setInputError('')
    reset()
    // Only allow numbers and one decimal point
    if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val)
  }

  function handleMax() {
    if (ethBalance > 0.001) {
      // Leave 0.001 ETH for gas
      setAmount((ethBalance - 0.001).toFixed(6))
    }
  }

  function handleBridge() {
    if (!address) return
    if (parsedAmount <= 0) { setInputError('Enter an amount'); return }
    if (parsedAmount > ethBalance) { setInputError('Insufficient ETH balance'); return }
    if (parsedAmount < 0.001) { setInputError('Minimum bridge amount is 0.001 ETH'); return }

    writeContract({
      address: ARBITRUM_INBOX,
      abi: INBOX_ABI,
      functionName: 'depositEth',
      value: parseEther(amount),
      chainId: mainnet.id,
    })
  }

  return (
    <div style={{ padding: '32px 32px 40px', maxWidth: 560, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button type="button" onClick={() => onNavigate('home')}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: 'rgba(245,240,232,0.5)', fontSize: 16, lineHeight: 1 }}>
          ←
        </button>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>
            Bridge ETH
          </div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.08em', marginTop: 2 }}>
            Ethereum → Arbitrum One · ~10 minutes
          </div>
        </div>
      </div>

      {/* Route card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
        <ChainBadge name="Ethereum" color="#627EEA" symbol="ETH" />
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #627EEA55, #28A0F055)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: '#070707', padding: '0 8px', fontSize: 16 }}>→</div>
        </div>
        <ChainBadge name="Arbitrum One" color="#28A0F0" symbol="ETH" />
      </div>

      {/* Step 1 — Chain switch */}
      {!isOnMainnet && (
        <StepCard step={1} title="Switch to Ethereum Mainnet" done={false}>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(245,240,232,0.55)', lineHeight: 1.6 }}>
            Your wallet needs to be on Ethereum mainnet to initiate the bridge. Arbitrum is the destination.
          </p>
          <GoldButton onClick={switchToMainnet} loading={isSwitching}>
            {isSwitching ? 'Switching…' : 'Switch to Ethereum'}
          </GoldButton>
          {switchError && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#e55' }}>{switchError}</div>
          )}
        </StepCard>
      )}

      {/* Step 2 — Amount */}
      <StepCard step={isOnMainnet ? 1 : 2} title="Enter Amount" done={false} dimmed={!isOnMainnet}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.06em' }}>ETH TO BRIDGE</span>
          <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>
            Balance: <span style={{ color: ethBalance > 0 ? '#f5f0e8' : 'rgba(245,240,232,0.3)' }}>{ethBalance.toFixed(5)} ETH</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${inputError ? '#e55' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: inputError ? 6 : 14 }}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => handleAmountChange(e.target.value)}
            disabled={!isOnMainnet || isSuccess}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: '#f5f0e8', fontWeight: 300 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={handleMax} disabled={!isOnMainnet || ethBalance <= 0.001 || isSuccess}
              style={{ fontSize: 10, letterSpacing: '0.1em', color: '#c9a84c', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif" }}>
              MAX
            </button>
            <span style={{ fontSize: 13, color: 'rgba(245,240,232,0.55)', letterSpacing: '0.04em' }}>ETH</span>
          </div>
        </div>

        {inputError && (
          <div style={{ fontSize: 11, color: '#e55', marginBottom: 14, paddingLeft: 2 }}>{inputError}</div>
        )}

        {/* Fee estimate */}
        {parsedAmount > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: 'rgba(245,240,232,0.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>You send</span>
              <span style={{ color: '#f5f0e8' }}>{parsedAmount.toFixed(6)} ETH</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>You receive on Arbitrum</span>
              <span style={{ color: '#4caf50' }}>{parsedAmount.toFixed(6)} ETH</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Estimated time</span>
              <span>~10 minutes</span>
            </div>
          </div>
        )}

        {/* Bridge button */}
        {!isSuccess && (
          <GoldButton
            onClick={handleBridge}
            loading={isWriting || isConfirming}
            disabled={!isOnMainnet || parsedAmount <= 0}
          >
            {isWriting ? 'Confirm in wallet…' : isConfirming ? 'Submitting to Ethereum…' : 'Bridge ETH to Arbitrum'}
          </GoldButton>
        )}

        {/* Write error */}
        {writeError && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(229,85,85,0.08)', border: '1px solid rgba(229,85,85,0.2)', fontSize: 11, color: '#e55', lineHeight: 1.5 }}>
            {writeError.message?.slice(0, 120) ?? 'Transaction failed'}
          </div>
        )}
      </StepCard>

      {/* Success */}
      {isSuccess && txHash && (
        <div style={{ marginTop: 16, padding: '20px 22px', borderRadius: 16, background: 'rgba(76,175,80,0.07)', border: '1px solid rgba(76,175,80,0.22)' }}>
          <div style={{ fontSize: 13, color: '#4caf50', letterSpacing: '0.04em', marginBottom: 6 }}>
            ✓ Bridge transaction submitted
          </div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', lineHeight: 1.6, marginBottom: 12 }}>
            Your ETH is on its way to Arbitrum One. It will arrive in approximately 10 minutes.
            Once it arrives, you can swap it to USDC and deposit into Genesis Reserve to start earning yield.
          </div>
          <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#c9a84c', textDecoration: 'none', letterSpacing: '0.06em' }}>
            View on Etherscan →
          </a>
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => onNavigate('home')}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, letterSpacing: '0.08em' }}>
              Back to Home
            </button>
            <button type="button" onClick={() => onNavigate('deposit')}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)', color: '#4caf50', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, letterSpacing: '0.08em' }}>
              Deposit to Vault →
            </button>
          </div>
        </div>
      )}

      {/* Info section */}
      <div style={{ marginTop: 28, padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'rgba(245,240,232,0.35)', lineHeight: 1.7 }}>
        <div style={{ color: 'rgba(245,240,232,0.55)', letterSpacing: '0.1em', fontSize: 10, textTransform: 'uppercase', marginBottom: 8 }}>How it works</div>
        <div>1. Your ETH is locked in the Arbitrum One Inbox contract on Ethereum mainnet</div>
        <div>2. Arbitrum validators confirm the deposit (~10 minutes)</div>
        <div>3. ETH appears in your wallet on Arbitrum One</div>
        <div style={{ marginTop: 8 }}>To earn yield, swap ETH → USDC on Arbitrum, then deposit to Genesis Reserve.</div>
      </div>
    </div>
  )
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function ChainBadge({ name, color, symbol }: { name: string; color: string; symbol: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, background: `${color}0d`, border: `1px solid ${color}33` }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${color}22`, border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: color }} />
      </div>
      <div style={{ fontSize: 10, color, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.08em' }}>{symbol}</div>
    </div>
  )
}

function StepCard({ step, title, done, dimmed = false, children }: {
  step: number; title: string; done: boolean; dimmed?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16, padding: '18px 20px', borderRadius: 16, background: dimmed ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)', border: `1px solid ${dimmed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'}`, opacity: dimmed ? 0.45 : 1, transition: 'opacity 0.2s', pointerEvents: dimmed ? 'none' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? '#4caf50' : 'rgba(201,168,76,0.15)', border: `1px solid ${done ? '#4caf50' : 'rgba(201,168,76,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: done ? '#fff' : '#c9a84c', flexShrink: 0 }}>
          {done ? '✓' : step}
        </div>
        <div style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.04em' }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

function GoldButton({ children, onClick, loading = false, disabled = false }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  const isDisabled = disabled || loading
  return (
    <button type="button" onClick={onClick} disabled={isDisabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: '100%', padding: '13px 0', borderRadius: 12, background: isDisabled ? 'rgba(201,168,76,0.06)' : hover ? 'rgba(201,168,76,0.22)' : 'rgba(201,168,76,0.14)', border: `1px solid ${isDisabled ? 'rgba(201,168,76,0.15)' : hover ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.35)'}`, color: isDisabled ? 'rgba(201,168,76,0.4)' : '#c9a84c', cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, letterSpacing: '0.1em', transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  )
}
