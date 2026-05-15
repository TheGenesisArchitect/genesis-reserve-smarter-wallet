'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { arbitrum } from 'viem/chains'
import { parseEther, parseUnits, encodeFunctionData, maxUint256 } from 'viem'
import { usePortfolioBalances } from '../hooks/usePortfolioBalances'
import type { ViewKey } from './AppShell'

// ── Arbitrum One addresses ────────────────────────────────────────────────────
const SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as const
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const

// ── Minimal ABIs ─────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const ROUTER_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'recipient', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'amountOutMinimum', type: 'uint256' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ]
    }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'unwrapWETH9',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'amountMinimum', type: 'uint256' }, { name: 'recipient', type: 'address' }],
    outputs: [],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const

// ── Quote response type ───────────────────────────────────────────────────────
type QuoteResult = {
  amountOut: string
  amountOutRaw: string
  fee: number
  rate: string
  direction: string
}

interface SwapPanelProps {
  onNavigate: (view: ViewKey) => void
}

export function SwapPanel({ onNavigate }: SwapPanelProps) {
  const { address, chainId } = useAccount()
  const { wallets } = useWallets()
  const [isEthToUsdc, setIsEthToUsdc] = useState(true)
  const [amount, setAmount] = useState('')
  const [inputError, setInputError] = useState('')
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [isSwitching, setIsSwitching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Portfolio balances ───────────────────────────────────────────────────
  const { data: portfolio } = usePortfolioBalances(address)
  const ethBalance = portfolio?.find(b => b.chainId === arbitrum.id)?.nativeAmount ?? 0
  const usdcBalance = portfolio?.find(b => b.chainId === arbitrum.id)?.usdcAmount ?? 0
  const inputBalance = isEthToUsdc ? ethBalance : usdcBalance

  // ── USDC allowance check ─────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ARB,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', SWAP_ROUTER],
    chainId: arbitrum.id,
    query: { enabled: !!address && !isEthToUsdc },
  })

  const parsedAmount = parseFloat(amount) || 0
  const needsApproval = !isEthToUsdc && !!address && parsedAmount > 0 &&
    (allowance === undefined || allowance < parseUnits(amount || '0', 6))

  // ── Chain switch ─────────────────────────────────────────────────────────
  const isOnArbitrum = chainId === arbitrum.id

  async function switchToArbitrum() {
    const wallet = wallets.find(w => w.walletClientType === 'privy') ?? wallets[0]
    if (!wallet) return
    setIsSwitching(true)
    try { await wallet.switchChain(arbitrum.id) }
    finally { setIsSwitching(false) }
  }

  // ── Quote fetching ────────────────────────────────────────────────────────
  const fetchQuote = useCallback(async (amt: string, ethToUsdc: boolean) => {
    if (!amt || parseFloat(amt) <= 0) { setQuote(null); setQuoteError(''); return }
    setQuoteLoading(true)
    setQuoteError('')
    try {
      const dir = ethToUsdc ? 'eth_to_usdc' : 'usdc_to_eth'
      const res = await fetch(`/api/gr/swap/quote?direction=${dir}&amountIn=${amt}`)
      const json = await res.json()
      if (json.error) { setQuoteError(json.error === 'no_liquidity' ? 'No liquidity at this amount' : json.error); setQuote(null) }
      else setQuote(json)
    } catch { setQuoteError('Failed to fetch quote') }
    finally { setQuoteLoading(false) }
  }, [])

  // Debounce quote on amount change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchQuote(amount, isEthToUsdc), 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [amount, isEthToUsdc, fetchQuote])

  // ── Approve USDC ─────────────────────────────────────────────────────────
  const { writeContract: writeApprove, isPending: isApproving, data: approveTxHash } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })
  useEffect(() => { if (approveConfirmed) refetchAllowance() }, [approveConfirmed, refetchAllowance])

  function handleApprove() {
    writeApprove({ address: USDC_ARB, abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER, maxUint256], chainId: arbitrum.id })
  }

  // ── Execute swap ─────────────────────────────────────────────────────────
  const { writeContract: writeSwap, isPending: isSwapping, data: swapTxHash, error: swapError, reset: resetSwap } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: swapSuccess } = useWaitForTransactionReceipt({ hash: swapTxHash })

  function handleSwap() {
    if (!address || !quote) return
    const slippage = 0.005 // 0.5%
    const amountOutMin = BigInt(Math.floor(Number(quote.amountOutRaw) * (1 - slippage)))
    const fee = quote.fee as 500 | 3000

    if (isEthToUsdc) {
      // ETH → USDC: send ETH as value, router wraps to WETH internally
      writeSwap({
        address: SWAP_ROUTER,
        abi: ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{ tokenIn: WETH, tokenOut: USDC_ARB, fee, recipient: address, amountIn: parseEther(amount), amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
        value: parseEther(amount),
        chainId: arbitrum.id,
      })
    } else {
      // USDC → ETH: multicall [exactInputSingle(→WETH, recipient=router), unwrapWETH9(min, user)]
      const swapData = encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{ tokenIn: USDC_ARB, tokenOut: WETH, fee, recipient: SWAP_ROUTER, amountIn: parseUnits(amount, 6), amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
      })
      const unwrapData = encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountOutMin, address],
      })
      writeSwap({ address: SWAP_ROUTER, abi: ROUTER_ABI, functionName: 'multicall', args: [[swapData, unwrapData]], chainId: arbitrum.id })
    }
  }

  function handleFlip() {
    setIsEthToUsdc(p => !p)
    setAmount('')
    setQuote(null)
    setInputError('')
    resetSwap()
  }

  function handleMax() {
    const bal = isEthToUsdc ? Math.max(0, ethBalance - 0.001) : usdcBalance
    if (bal > 0) setAmount(bal.toFixed(isEthToUsdc ? 6 : 2))
  }

  const isLoading = isApproving || isSwapping || isConfirming || isSwitching

  return (
    <div style={{ padding: '32px 32px 40px', maxWidth: 520, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button type="button" onClick={() => onNavigate('home')}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: 'rgba(245,240,232,0.5)', fontSize: 16 }}>
          ←
        </button>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>Swap</div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.08em', marginTop: 2 }}>Uniswap V3 · Arbitrum One</div>
        </div>
        <div style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 20, background: 'rgba(40,160,240,0.1)', border: '1px solid rgba(40,160,240,0.25)', fontSize: 10, color: '#28A0F0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Arbitrum
        </div>
      </div>

      {/* Chain switch prompt */}
      {!isOnArbitrum && (
        <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 12, background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.6)' }}>Switch to Arbitrum One to swap</div>
          <button type="button" onClick={switchToArbitrum} disabled={isSwitching}
            style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)', color: '#c9a84c', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 11, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            {isSwitching ? 'Switching…' : 'Switch Network'}
          </button>
        </div>
      )}

      {/* Swap card */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden' }}>

        {/* From */}
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase' }}>From</span>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>
              Balance: <span style={{ color: inputBalance > 0 ? '#f5f0e8' : 'rgba(245,240,232,0.3)' }}>
                {isEthToUsdc ? ethBalance.toFixed(5) : usdcBalance.toFixed(2)} {isEthToUsdc ? 'ETH' : 'USDC'}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TokenBadge symbol={isEthToUsdc ? 'ETH' : 'USDC'} />
            <input
              type="text" inputMode="decimal" placeholder="0.00"
              value={amount}
              onChange={e => { setInputError(''); resetSwap(); const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v) }}
              disabled={isLoading || swapSuccess}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: '#f5f0e8', fontWeight: 300 }}
            />
            <button type="button" onClick={handleMax} disabled={isLoading || swapSuccess || inputBalance <= 0}
              style={{ fontSize: 10, color: '#c9a84c', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.08em' }}>
              MAX
            </button>
          </div>
        </div>

        {/* Flip divider */}
        <div style={{ position: 'relative', height: 1, background: 'rgba(255,255,255,0.06)' }}>
          <button type="button" onClick={handleFlip} disabled={isLoading || swapSuccess}
            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 34, height: 34, borderRadius: '50%', background: '#111', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'rgba(245,240,232,0.5)', transition: 'all 0.18s' }}>
            ⇅
          </button>
        </div>

        {/* To */}
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase' }}>To (estimated)</span>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>
              Balance: <span style={{ color: (!isEthToUsdc ? ethBalance : usdcBalance) > 0 ? '#f5f0e8' : 'rgba(245,240,232,0.3)' }}>
                {isEthToUsdc ? usdcBalance.toFixed(2) : ethBalance.toFixed(5)} {isEthToUsdc ? 'USDC' : 'ETH'}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TokenBadge symbol={isEthToUsdc ? 'USDC' : 'ETH'} />
            <div style={{ flex: 1, fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: quote ? '#4caf50' : 'rgba(245,240,232,0.2)', fontWeight: 300 }}>
              {quoteLoading ? <Spinner /> : quote ? quote.amountOut : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Quote details */}
      {quote && !quoteError && (
        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(245,240,232,0.45)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Row label="Rate" value={isEthToUsdc ? `1 ETH = ${parseFloat(quote.rate).toLocaleString()} USDC` : `1 USDC = ${quote.rate} ETH`} />
          <Row label="Fee tier" value={quote.fee === 500 ? '0.05%' : '0.3%'} />
          <Row label="Slippage" value="0.5%" />
          <Row label="Min received" value={`${(parseFloat(quote.amountOut) * 0.995).toFixed(isEthToUsdc ? 2 : 6)} ${isEthToUsdc ? 'USDC' : 'ETH'}`} />
        </div>
      )}

      {quoteError && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#e55', textAlign: 'center' }}>{quoteError}</div>
      )}

      {inputError && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#e55', paddingLeft: 4 }}>{inputError}</div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!swapSuccess && needsApproval && (
          <ActionButton onClick={handleApprove} loading={isApproving} disabled={!isOnArbitrum}>
            {isApproving ? 'Approving USDC…' : 'Approve USDC'}
          </ActionButton>
        )}

        {!swapSuccess && (
          <ActionButton
            onClick={handleSwap}
            loading={isSwapping || isConfirming}
            disabled={!isOnArbitrum || !quote || parsedAmount <= 0 || needsApproval || isLoading}
            primary
          >
            {isSwapping ? 'Confirm in wallet…' : isConfirming ? 'Submitting…' : `Swap ${isEthToUsdc ? 'ETH → USDC' : 'USDC → ETH'}`}
          </ActionButton>
        )}
      </div>

      {/* Swap error */}
      {swapError && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(229,85,85,0.08)', border: '1px solid rgba(229,85,85,0.2)', fontSize: 11, color: '#e55', lineHeight: 1.5 }}>
          {swapError.message?.slice(0, 140) ?? 'Transaction failed'}
        </div>
      )}

      {/* Success */}
      {swapSuccess && swapTxHash && (
        <div style={{ marginTop: 16, padding: '20px 22px', borderRadius: 16, background: 'rgba(76,175,80,0.07)', border: '1px solid rgba(76,175,80,0.22)' }}>
          <div style={{ fontSize: 13, color: '#4caf50', letterSpacing: '0.04em', marginBottom: 6 }}>✓ Swap confirmed</div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', lineHeight: 1.6, marginBottom: 12 }}>
            {isEthToUsdc
              ? 'USDC is in your wallet. Deposit to Genesis Reserve to start earning yield.'
              : 'ETH is in your wallet on Arbitrum One.'}
          </div>
          <a href={`https://arbiscan.io/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#c9a84c', textDecoration: 'none', letterSpacing: '0.06em' }}>
            View on Arbiscan →
          </a>
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { resetSwap(); setAmount(''); setQuote(null) }}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(245,240,232,0.6)', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, letterSpacing: '0.06em' }}>
              Swap Again
            </button>
            {isEthToUsdc && (
              <button type="button" onClick={() => onNavigate('deposit')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)', color: '#4caf50', cursor: 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, letterSpacing: '0.06em' }}>
                Deposit to Vault →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function TokenBadge({ symbol }: { symbol: 'ETH' | 'USDC' }) {
  const isEth = symbol === 'ETH'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 8px', borderRadius: 20, background: isEth ? 'rgba(98,126,234,0.12)' : 'rgba(76,175,80,0.10)', border: `1px solid ${isEth ? 'rgba(98,126,234,0.3)' : 'rgba(76,175,80,0.25)'}`, flexShrink: 0 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: isEth ? '#627EEA' : '#2775CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, fontFamily: 'sans-serif' }}>
        {isEth ? 'Ξ' : '$'}
      </div>
      <span style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.06em', fontFamily: "'Tenor Sans', sans-serif" }}>{symbol}</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: '#f5f0e8' }}>{value}</span>
    </div>
  )
}

function ActionButton({ children, onClick, loading = false, disabled = false, primary = false }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean; primary?: boolean
}) {
  const [hover, setHover] = useState(false)
  const off = disabled || loading
  const bg = off
    ? 'rgba(201,168,76,0.05)'
    : primary
      ? hover ? 'rgba(201,168,76,0.22)' : 'rgba(201,168,76,0.14)'
      : hover ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'
  const border = off
    ? 'rgba(201,168,76,0.12)'
    : primary
      ? hover ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.35)'
      : 'rgba(255,255,255,0.1)'
  return (
    <button type="button" onClick={onClick} disabled={off}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: '100%', padding: '13px 0', borderRadius: 12, background: bg, border: `1px solid ${border}`, color: off ? 'rgba(201,168,76,0.35)' : '#c9a84c', cursor: off ? 'not-allowed' : 'pointer', fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, letterSpacing: '0.1em', transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  )
}
