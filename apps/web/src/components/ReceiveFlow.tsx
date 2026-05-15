'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { usePrivy } from '@privy-io/react-auth'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { useBalance } from 'wagmi'
import { arbitrum } from 'viem/chains'

// ── Token info ────────────────────────────────────────────────────────────────
const TOKENS = [
  { symbol: 'USDC', label: 'USD Coin',   color: '#2775ca', contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}` },
  { symbol: 'USDT', label: 'Tether USD', color: '#26a17b', contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}` },
  { symbol: 'ETH',  label: 'Ethereum',   color: '#627eea', contract: undefined },
]

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  label: {
    fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)',
    textTransform: 'uppercase' as const, marginBottom: 6,
    fontFamily: "'Tenor Sans', sans-serif",
  },
  card: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18, padding: '22px 20px',
  } as React.CSSProperties,
  btnGold: {
    width: '100%', padding: '14px', borderRadius: 30,
    background: '#c9a84c', color: '#1a1400',
    border: 'none', cursor: 'pointer',
    fontSize: 12, letterSpacing: '0.12em',
    fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600,
  } as React.CSSProperties,
  btnGhost: {
    flex: 1, padding: '11px', borderRadius: 24,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(245,240,232,0.55)', cursor: 'pointer', fontSize: 11,
    fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.04em',
  } as React.CSSProperties,
}

export function ReceiveFlow() {
  const { authenticated, login } = usePrivy()
  const walletAddress = useActiveWalletAddress()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [selectedToken, setSelectedToken] = useState('USDC')
  const token = TOKENS.find(t => t.symbol === selectedToken) ?? TOKENS[0]

  const walletAddr = walletAddress as `0x${string}` | undefined

  // Live balances
  const { data: ethBal }  = useBalance({ address: walletAddr, chainId: arbitrum.id })
  const { data: usdcBal } = useBalance({ address: walletAddr, token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: arbitrum.id })
  const { data: usdtBal } = useBalance({ address: walletAddr, token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', chainId: arbitrum.id })

  const balances: Record<string, string> = {
    ETH:  ethBal  ? Number(ethBal.formatted).toFixed(6)  : '—',
    USDC: usdcBal ? Number(usdcBal.formatted).toFixed(2) : '—',
    USDT: usdtBal ? Number(usdtBal.formatted).toFixed(2) : '—',
  }

  // Generate QR code whenever address changes
  useEffect(() => {
    if (!walletAddress || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, walletAddress, {
      width: 220,
      margin: 2,
      color: { dark: '#f5f0e8', light: '#12100a' },
    })
  }, [walletAddress])

  const handleCopy = async () => {
    if (!walletAddress) return
    await navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (!walletAddress) return
    if (navigator.share) {
      await navigator.share({ title: 'My Genesis Reserve Address', text: walletAddress })
    } else {
      await handleCopy()
    }
  }

  if (!authenticated) {
    return (
      <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>📲</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#f5f0e8' }}>Connect to Receive</div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)' }}>Connect your wallet to see your receive address</div>
        <button style={S.btnGold} onClick={login}>Connect Wallet</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 0 48px', maxWidth: 480, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ padding: '32px 20px 0' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Wallet</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em', marginBottom: 4 }}>Receive</div>
        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', marginBottom: 24 }}>
          Send to your Arbitrum One address · any token, any network
        </div>
      </div>

      {/* ── Token selector ── */}
      <div style={{ padding: '0 20px', marginBottom: 24 }}>
        <div style={S.label}>Show balance for</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {TOKENS.map(t => (
            <button key={t.symbol} type="button" onClick={() => setSelectedToken(t.symbol)}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                background: selectedToken === t.symbol ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                border: selectedToken === t.symbol ? `1.5px solid ${t.color}` : '1px solid rgba(255,255,255,0.09)',
                fontFamily: "'Tenor Sans', sans-serif",
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedToken === t.symbol ? t.color : 'rgba(245,240,232,0.5)' }}>{t.symbol}</span>
              <span style={{ fontSize: 10, color: selectedToken === t.symbol ? '#f5f0e8' : 'rgba(245,240,232,0.3)' }}>{balances[t.symbol]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── QR Code card ── */}
      <div style={{ padding: '0 20px', marginBottom: 20 }}>
        <div style={{
          ...S.card,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          padding: '28px 24px',
        }}>
          {/* Network badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 20,
            background: 'rgba(98,126,234,0.1)', border: '1px solid rgba(98,126,234,0.2)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#627eea', display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: '#a0b0ff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Arbitrum One</span>
          </div>

          {/* QR canvas */}
          <div style={{
            padding: 12, borderRadius: 16,
            background: '#12100a',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 8 }} />
          </div>

          {/* Token badge overlay hint */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', marginBottom: 4 }}>
              Scan to send{' '}
              <span style={{ color: token.color, fontWeight: 600 }}>{selectedToken}</span>
              {' '}or any token on Arbitrum
            </div>
            <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.2)', letterSpacing: '0.08em' }}>
              Same address works for all assets
            </div>
          </div>
        </div>
      </div>

      {/* ── Address display ── */}
      <div style={{ padding: '0 20px', marginBottom: 20 }}>
        <div style={S.label}>Your Address</div>
        <div style={{
          padding: '14px 16px', borderRadius: 14,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 12, color: '#f5f0e8',
            wordBreak: 'break-all', flex: 1, lineHeight: 1.6,
          }}>
            {walletAddress
              ? `${walletAddress.slice(0, 20)}…${walletAddress.slice(-10)}`
              : 'Loading…'}
          </span>
          <button onClick={handleCopy} style={{
            flexShrink: 0, padding: '6px 14px', borderRadius: 20,
            background: copied ? 'rgba(76,175,80,0.15)' : 'rgba(201,168,76,0.1)',
            border: copied ? '1px solid rgba(76,175,80,0.3)' : '1px solid rgba(201,168,76,0.25)',
            color: copied ? '#4caf50' : '#c9a84c',
            fontSize: 11, cursor: 'pointer',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.2s',
          }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ padding: '0 20px', display: 'flex', gap: 10, marginBottom: 24 }}>
        <button style={S.btnGhost} onClick={handleCopy}>
          {copied ? '✓ Copied!' : '⎘ Copy Address'}
        </button>
        <button style={S.btnGhost} onClick={handleShare}>
          ↗ Share
        </button>
      </div>

      {/* ── Info cards ── */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          {
            icon: '⚡',
            title: 'Instant Settlement',
            desc: 'Arbitrum One confirms in ~0.3s with sub-cent fees. The cheapest, fastest path.',
          },
          {
            icon: '🔒',
            title: 'Universal Address',
            desc: 'USDC, USDT, ETH, and all ERC-20 tokens use the same address on Arbitrum.',
          },
          {
            icon: '🌐',
            title: 'Cross-Chain Bridge',
            desc: 'Receiving from Ethereum, Base, or Polygon? Use the Bridge tab to route funds in.',
          },
        ].map(item => (
          <div key={item.title} style={{
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 11, color: '#f5f0e8', marginBottom: 3, fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
