'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { arbitrum, base, polygon, optimism, mainnet } from 'viem/chains'
import { useDashboardSnapshot } from '../hooks/useDashboardSnapshot'
import { useOnChainHistory } from '../hooks/useOnChainHistory'
import { usePortfolioBalances } from '../hooks/usePortfolioBalances'
import { useVaultPositions } from '../hooks/useVaultPositions'
import { useYieldEngine } from '../hooks/useYieldEngine'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { TapToPayModal } from './TapToPayModal'
import { CHAIN_META } from '../config/contracts'
import type { LedgerEntry } from '../lib/bff.types'
import type { ViewKey } from './AppShell'
import { PANEL_BASE, SectionPanel, ActionButton } from './ds'
import { LinkedCardVisual } from './LinkedCardVisual'
import { LinkDebitCardPanelWrapper } from './CardPage'
import type { LinkedCardPayload } from './CardPage'

// Display order for portfolio breakdown
const PORTFOLIO_CHAINS = [
  arbitrum.id,
  base.id,
  polygon.id,
  optimism.id,
  mainnet.id,
] as const

interface WalletHomeProps {
  accountId?: string
  onNavigate: (view: ViewKey) => void
}

/* ── Genesis Reserve card ──────────────────────────────────────────────── */
export function GenesisCard({
  frozen = false,
  width = 312,
  height = 192,
  cardholder = 'GENESIS MEMBER',
}: {
  frozen?: boolean
  width?: number
  height?: number
  cardholder?: string
}) {
  const scale = width / 312
  return (
    <div style={{
      width, height, borderRadius: 20,
      background: 'linear-gradient(155deg, #161410 0%, #0c0a08 45%, #181410 100%)',
      border: '1px solid rgba(201,168,76,0.24)',
      position: 'relative',
      boxShadow: '0 0 0 1px rgba(201,168,76,0.07), 0 28px 72px rgba(0,0,0,0.9), 0 0 50px rgba(201,168,76,0.10)',
      overflow: 'hidden',
      opacity: frozen ? 0.38 : 1,
      filter: frozen ? 'grayscale(1)' : 'none',
      transition: 'opacity 0.3s, filter 0.3s',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: `${14 * scale}px ${16 * scale}px`,
    }}>
      {/* Shimmer top line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)',
      }} />

      {/* Top row: chip + brand */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Chip */}
        <div style={{
          width: 28 * scale, height: 22 * scale,
          background: 'linear-gradient(135deg, #c9a84c, #8a6e2a)',
          borderRadius: 4 * scale, opacity: 0.9,
        }} />
        {/* Brand stack */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14 * scale, fontWeight: 400, letterSpacing: '0.24em', color: '#E8CB6E', lineHeight: 1 }}>GENESIS</div>
          <div style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 6 * scale, letterSpacing: '0.55em', color: 'rgba(201,168,76,0.65)', textTransform: 'uppercase', marginTop: 3 * scale }}>RESERVE</div>
        </div>
      </div>

      {/* Center: logo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `${6 * scale}px 0 ${4 * scale}px` }}>
        <div style={{
          width: 66 * scale, height: 66 * scale, borderRadius: '50%', overflow: 'hidden',
          boxShadow: `0 0 ${16 * scale}px rgba(201,168,76,0.30), 0 0 ${36 * scale}px rgba(201,168,76,0.10)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src="/genesis-logo.png"
            alt=""
            width={66 * scale}
            height={66 * scale}
            style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
            onError={(e) => {
              const el = e.currentTarget.parentElement!
              el.innerHTML = `<span style="font-size:${46 * scale}px;color:#c9a84c;opacity:.85">◈</span>`
            }}
          />
        </div>
      </div>

      {/* Bottom row: cardholder + DEBIT/VISA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 9 * scale, color: '#c9a84c', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          {cardholder.slice(0, 22)}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 7 * scale, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 2 * scale }}>DEBIT</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 18 * scale, fontWeight: 600, color: '#E8CB6E', letterSpacing: '-0.01em' }}>VISA</div>
        </div>
      </div>
    </div>
  )
}


/* ── Home card type ───────────────────────────────────────────────────── */
type HomeLinkedCard = {
  id: string
  cardholderName: string
  brand: string
  last4: string
  expiry: string  // MM/YY
  issuerName?: string
  funding?: string
  frozen: boolean
}

function loadLinkedCardsFromStorage(accountId: string): HomeLinkedCard[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(`gr:cards:v1:${accountId.toLowerCase()}`)
    if (!raw) return []
    const stored = JSON.parse(raw) as Array<{
      id: string; holderName: string; isLinked?: boolean
      brand: string; last4: string; expiry: string
      issuerName?: string; funding?: string; frozen?: boolean
    }>
    return stored.filter(c => c.isLinked).map(c => ({
      id: c.id,
      cardholderName: c.holderName,
      brand: c.brand,
      last4: c.last4,
      expiry: c.expiry ?? '01/99',
      issuerName: c.issuerName,
      funding: c.funding,
      frozen: c.frozen ?? false,
    }))
  } catch { return [] }
}

function apiToHomeCard(c: Record<string, unknown>): HomeLinkedCard {
  const expMonth = String(c.expMonth ?? '1').padStart(2, '0')
  const expYear = String(c.expYear ?? '2099').slice(-2)
  return {
    id: String(c.id),
    cardholderName: String(c.cardholderName ?? ''),
    brand: String(c.brand ?? ''),
    last4: String(c.last4 ?? ''),
    expiry: `${expMonth}/${expYear}`,
    issuerName: c.issuerName as string | undefined,
    funding: c.funding as string | undefined,
    frozen: false,
  }
}

/* ── Quick-action button ───────────────────────────────────────────────── */
function QuickAction({ icon, label, onClick, href }: { icon: ReactNode; label: string; onClick?: () => void; href?: string }) {
  const [hover, setHover] = useState(false)
  const style = {
    display: 'flex' as const, flexDirection: 'column' as const, alignItems: 'center' as const, gap: 8,
    background: hover ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${hover ? 'rgba(201,168,76,0.28)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 14, padding: '14px 10px', flex: 1,
    minWidth: 120,
    cursor: 'pointer', transition: 'all 0.18s', fontFamily: "'Tenor Sans', sans-serif",
    textDecoration: 'none',
  }
  const iconWrap = (
    <>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: hover ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.07)', border: `1px solid ${hover ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s' }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.65)', letterSpacing: '0.04em' }}>{label}</span>
    </>
  )
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{iconWrap}</a>
  return <button type="button" onClick={onClick} style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{iconWrap}</button>
}

/* ── Chain badge ───────────────────────────────────────────────────────── */
function ChainDot({ chainId }: { chainId: number }) {
  const meta = CHAIN_META[chainId]
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: meta?.color ?? '#888', marginRight: 5, flexShrink: 0 }} />
}

/* ── Ledger entry helpers ──────────────────────────────────────────────── */
function parseEntry(entry: LedgerEntry) {
  const meta = entry.metadata as Record<string, string> | undefined
  const rawName = meta?.merchant ?? meta?.description ?? meta?.label ?? entry.entryType.replace(/_/g, ' ').toLowerCase()
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1)
  const initial = name.charAt(0).toUpperCase()
  const amount = Math.abs(parseFloat(entry.amount ?? '0') / 1e6)
  const isDebit = entry.entryType?.includes('OUT') || entry.entryType?.includes('DEBIT') || entry.entryType?.includes('PAYMENT')
  const date = new Date(entry.createdAt)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isYest = date.toDateString() === new Date(now.getTime() - 86400000).toDateString()
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dateStr = isToday ? `Today, ${timeStr}` : isYest ? `Yesterday, ${timeStr}` : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const hue = (initial.charCodeAt(0) * 37) % 360
  return { name, initial, amount, symbol: 'USDC', isDebit, dateStr, hue }
}

/* ── WalletHome ──────────────────────────────────────────────────────────*/
export function WalletHome({ accountId, onNavigate }: WalletHomeProps) {
  const { data, isLoading } = useDashboardSnapshot(accountId)
  const { user } = usePrivy()
  const walletAddr = useActiveWalletAddress()

  const isLive = !!walletAddr

  // ── Portfolio balances via block explorer APIs ────────────────────────
  // Reads native + USDC from Etherscan/Arbiscan/Basescan/Polygonscan/Optimistic
  // using the same proven approach as useOnChainHistory — no wagmi RPC needed.
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioBalances(walletAddr)

  // True while either BFF dashboard or on-chain portfolio scan are still in flight.
  // Using this prevents a false $0.00 while data is loading.
  const balanceLoading = isLoading || portfolioLoading

  const usdcByChain: Record<number, number> = {}
  const nativeByChain: Record<number, number> = {}
  for (const entry of portfolio ?? []) {
    usdcByChain[entry.chainId] = entry.usdcAmount
    nativeByChain[entry.chainId] = entry.nativeAmount
  }

  // ── Total USDC balance across all chains ──────────────────────────────
  const totalOnChainUsdc = Object.values(usdcByChain).reduce((s, v) => s + v, 0)
  const bal = data?.balance as { available?: number; total?: number } | undefined
  const bffBalance = bal?.available ?? bal?.total ?? 0

  // ── Live vault yield engine ───────────────────────────────────────────
  const { liveBalance, yieldTodayDisplay, displayApy, vaultUsdcBalance, walletUsdcBalance: walletOnChainUsdc } = useYieldEngine()
  // Priority: live vault ticker → vault position (maxWithdraw) → wallet direct USDC → BFF snapshot → cross-chain scan
  const totalBalance = liveBalance > 0
    ? liveBalance
    : vaultUsdcBalance > 0
      ? vaultUsdcBalance
      : walletOnChainUsdc > 0
        ? walletOnChainUsdc
        : bffBalance > 0
          ? bffBalance
          : totalOnChainUsdc

  // Chains with USDC outside Arbitrum — show bridge prompt per chain
  const offChainUsdc = PORTFOLIO_CHAINS.filter(id => id !== arbitrum.id && (usdcByChain[id] ?? 0) > 0.01)

  // ETH on Ethereum mainnet — needs bridge before it can enter the vault
  const ethOnMainnet = nativeByChain[mainnet.id] ?? 0

  // ── Balance mask ─────────────────────────────────────────────────────
  const [masked, setMasked] = useState(false)
  const [showPortfolio, setShowPortfolio] = useState(true)  // default open
  const [showTapToPay, setShowTapToPay] = useState(false)

  // ── Linked card carousel ─────────────────────────────────────────────
  const [linkedCards, setLinkedCards] = useState<HomeLinkedCard[]>([])
  const [activeCardIdx, setActiveCardIdx] = useState(0)  // 0 = Genesis, 1..n = linked cards
  const [showLinkCardPanel, setShowLinkCardPanel] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const totalCards = 1 + linkedCards.length

  useEffect(() => {
    if (!walletAddr) return
    const stored = loadLinkedCardsFromStorage(walletAddr)
    if (stored.length > 0) setLinkedCards(stored)
    // Fetch from API and merge (API wins for matching IDs — syncs DB cards to this device)
    fetch(`/api/gr/linked-debit-cards?accountId=${encodeURIComponent(walletAddr)}`)
      .then(r => r.json())
      .then(data => {
        const apiCards: HomeLinkedCard[] = (data?.data ?? []).map(apiToHomeCard)
        if (apiCards.length === 0) return
        setLinkedCards(prev => {
          const map = new Map(prev.map(c => [c.id, c]))
          apiCards.forEach(c => map.set(c.id, c))
          return Array.from(map.values())
        })
      })
      .catch(() => { /* keep localStorage data */ })
  }, [walletAddr])

  // ── Display name ─────────────────────────────────────────────────────
  const displayName = user?.phone?.number
    ?? user?.email?.address
    ?? (walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : 'Wallet')

  // ── Transactions ─────────────────────────────────────────────────────
  const backendEntries = (data?.history ?? []).slice(0, 3)
  const { data: onChainTxs, isLoading: txLoading } = useOnChainHistory(walletAddr)
  const onChainEntries = (onChainTxs ?? []).slice(0, 3)
  const hasBackendTxs = backendEntries.length > 0
  const hasOnChainTxs = onChainEntries.length > 0
  const txsReady = !isLoading && !txLoading

  const {
    data: vaultPositions,
    isLoading: vaultPositionsLoading,
  } = useVaultPositions(walletAddr)

  const topPositions = (vaultPositions?.positions ?? []).slice(0, 3)
  const hasPositions = topPositions.length > 0
  const noPortfolioBalances = PORTFOLIO_CHAINS.every(id => (usdcByChain[id] ?? 0) < 0.001 && (nativeByChain[id] ?? 0) < 0.00001)

  return (
    <div style={{ padding: '28px clamp(16px,3vw,32px) 46px', maxWidth: 980, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 28, paddingRight: 52 }}>
        {/* Bell — always top-right, never participates in layout flow */}
        <button
          type="button"
          style={{
            position: 'absolute', top: 0, right: 0,
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <BellIcon />
        </button>

        {/* Left: eyebrow + name */}
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(201,168,76,0.42)', textTransform: 'uppercase', marginBottom: 5, fontFamily: "'Tenor Sans', sans-serif" }}>
          Genesis Reserve
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.03em', marginBottom: 11, lineHeight: 1.1 }}>
          {displayName}
        </div>

        {/* Status pill */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
            borderRadius: 999, padding: '3px 9px',
            color: isLive ? '#1ABF6A' : 'rgba(245,240,232,0.38)',
            background: isLive ? 'rgba(26,191,106,0.08)' : 'rgba(255,255,255,0.04)',
            border: isLive ? '1px solid rgba(26,191,106,0.22)' : '1px solid rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap', fontFamily: "'Tenor Sans', sans-serif",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLive ? '#1ABF6A' : 'rgba(245,240,232,0.25)', display: 'inline-block', flexShrink: 0 }} />
            {isLive ? 'Wallet Connected' : 'Preview Mode'}
          </span>
        </div>
      </div>

      {/* ── Balance card ─────────────────────────────────────────────── */}
      <section style={{
        ...PANEL_BASE,
        background: 'linear-gradient(160deg, rgba(201,168,76,0.1) 0%, rgba(201,168,76,0.03) 60%, rgba(255,255,255,0.015) 100%)',
        border: '1px solid rgba(201,168,76,0.26)',
        borderRadius: 20,
        padding: '24px 24px 20px',
        marginBottom: 14,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Shimmer top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)' }} />
        {/* Kicker */}
        <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(201,168,76,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>
          Total Portfolio Value
        </div>

        {/* Balance number row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 46, fontWeight: 300,
            color: balanceLoading ? 'rgba(245,240,232,0.25)' : '#f5f0e8',
            letterSpacing: '-0.02em', lineHeight: 1,
            transition: 'color 0.3s',
          }}>
            {balanceLoading
              ? '——'
              : masked
                ? '••••••'
                : `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }
          </div>
          {!balanceLoading && (
            <button
              type="button"
              onClick={() => setMasked(m => !m)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'rgba(245,240,232,0.3)', flexShrink: 0 }}
            >
              {masked ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
        </div>

        {/* Loading indicator */}
        {balanceLoading && (
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.28)', letterSpacing: '0.08em', marginBottom: 10 }}>
            Scanning portfolio…
          </div>
        )}

        {/* Yield strip — only when loaded and balance is non-zero */}
        {!balanceLoading && totalBalance > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="animate-pulse-slow" style={{ width: 6, height: 6, borderRadius: '50%', background: '#1ABF6A', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#1ABF6A', fontFamily: "'Cormorant Garamond', serif", fontWeight: 400 }}>{yieldTodayDisplay} earned today</span>
            </div>
            {displayApy > 0 && (
              <span style={{
                fontSize: 10, letterSpacing: '0.1em',
                color: 'rgba(201,168,76,0.8)',
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: 6, padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}>
                {displayApy.toFixed(1)}% APY
              </span>
            )}
          </div>
        )}

        {/* Deposit CTA — only after loading completes and balance is genuinely zero */}
        {isLive && !balanceLoading && totalBalance === 0 && (
          <div style={{ marginBottom: 14 }}>
            <ActionButton label="Deposit USDC to start earning" onClick={() => onNavigate('deposit')} />
          </div>
        )}

        {/* Portfolio breakdown toggle */}
        {isLive && (
          <button
            type="button"
            onClick={() => setShowPortfolio(p => !p)}
            style={{
              marginTop: 4,
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'rgba(201,168,76,0.6)', fontSize: 11, letterSpacing: '0.08em',
              fontFamily: "'Tenor Sans', sans-serif",
            }}
          >
            <span style={{ fontSize: 9 }}>{showPortfolio ? '▲' : '▼'}</span>
            <span>Portfolio breakdown</span>
          </button>
        )}
      </section>

      {/* ── Portfolio breakdown panel ──────────────────────────────────── */}
      {showPortfolio && isLive && (
        <SectionPanel title="Assets by Chain" eyebrow="Capital Distribution">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PORTFOLIO_CHAINS.map(chainId => {
              const meta = CHAIN_META[chainId]
              const usdc = usdcByChain[chainId]
              const native = nativeByChain[chainId]
              const isVaultChain = chainId === arbitrum.id
              const hasAnything = usdc > 0.001 || native > 0.00001
              if (!hasAnything) return null
              return (
                <div key={chainId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <ChainDot chainId={chainId} />
                    <span style={{ fontSize: 12, color: '#f5f0e8', letterSpacing: '0.04em' }}>{meta.name}</span>
                    {isVaultChain && (
                      <span style={{ fontSize: 9, letterSpacing: '0.12em', color: '#c9a84c', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase' }}>Vault</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center' }}>
                    {usdc > 0.001 && (
                      <span style={{ fontSize: 12, color: '#1ABF6A', fontFamily: "'Cormorant Garamond', serif" }}>${usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC</span>
                    )}
                    {native > 0.00001 && (
                      <span style={{ fontSize: 12, color: 'rgba(245,240,232,0.55)', fontFamily: "'Cormorant Garamond', serif" }}>{native.toFixed(5)} {meta.symbol}</span>
                    )}
                    {!isVaultChain && usdc > 0.01 && meta.bridgeUrl && (
                      <a href={meta.bridgeUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 10, color: '#c9a84c', textDecoration: 'none', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap', letterSpacing: '0.06em' }}>
                        Bridge →
                      </a>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Loading state */}
            {portfolioLoading && (
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.3)', textAlign: 'center', padding: '8px 0', letterSpacing: '0.06em' }}>
                Scanning 5 chains…
              </div>
            )}

            {/* Empty state — only after load completes */}
            {!portfolioLoading && noPortfolioBalances && (
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.3)', textAlign: 'center', padding: '8px 0' }}>
                No assets detected on ETH · ARB · BASE · POLY · OP
              </div>
            )}
          </div>
        </SectionPanel>
      )}

      {/* ── Funding and bridge alerts ─────────────────────────────────── */}
      {(offChainUsdc.length > 0 || ethOnMainnet > 0.0001) && (
        <SectionPanel title="Funding Desk" eyebrow="Transfer Routing" noPadding>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 18px' }}>
            {offChainUsdc.map(chainId => {
              const meta = CHAIN_META[chainId]
              return (
                <div key={chainId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 12, background: `${meta.color}0d`, border: `1px solid ${meta.color}38`, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: meta.color, letterSpacing: '0.04em', marginBottom: 2 }}>
                      ${usdcByChain[chainId].toFixed(2)} USDC on {meta.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)' }}>Bridge to Arbitrum to deposit into Genesis Reserve vault</div>
                  </div>
                  {meta.bridgeUrl && (
                    <a href={meta.bridgeUrl} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '7px 14px', borderRadius: 8, fontSize: 11, background: `${meta.color}22`, border: `1px solid ${meta.color}55`, color: meta.color, textDecoration: 'none', fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.06em', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                      Bridge {'->'}
                    </a>
                  )}
                </div>
              )
            })}

            {ethOnMainnet > 0.0001 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 12, background: 'rgba(255,165,0,0.06)', border: '1px solid rgba(255,165,0,0.22)', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#f5a623', letterSpacing: '0.04em', marginBottom: 2 }}>{ethOnMainnet.toFixed(4)} ETH on Ethereum mainnet</div>
                  <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)' }}>Bridge to Arbitrum, swap to USDC, then deposit to earn yield</div>
                </div>
                <ActionButton label="Bridge ->" onClick={() => onNavigate('bridge')} />
              </div>
            )}
          </div>
        </SectionPanel>
      )}

      {/* ── Vault Positions Intelligence ─────────────────────────────── */}
      {isLive && (
        <SectionPanel
          title="Strategy Desk"
          eyebrow="Yield Positions"
          highlight
        >

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.62)', minHeight: 24, display: 'flex', alignItems: 'center' }}>Total</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#f5f0e8', lineHeight: 1 }}>
                ${Number(vaultPositions?.summary.totalBalanceUsd ?? '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)', minHeight: 24, display: 'flex', alignItems: 'center' }}>Blended APY</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#c9a84c', lineHeight: 1 }}>
                {Number(vaultPositions?.summary.blendedApyPct ?? '0').toFixed(2)}%
              </div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(26,191,106,0.05)', border: '1px solid rgba(26,191,106,0.15)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(26,191,106,0.72)', minHeight: 24, display: 'flex', alignItems: 'center' }}>Profit</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#1ABF6A', lineHeight: 1 }}>
                ${Number(vaultPositions?.summary.profitUsd ?? '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {vaultPositionsLoading ? (
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.35)' }}>Syncing strategy desk positions...</div>
          ) : hasPositions ? (
            <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {topPositions.map((position, idx) => (
                <div
                  key={position.strategyId || `${position.protocol}-${idx}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderBottom: idx < topPositions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    background: 'rgba(255,255,255,0.015)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: '#f5f0e8' }}>{position.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.4)', marginTop: 2 }}>
                      {position.protocol} · {position.chain}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#c9a84c' }}>{Number(position.apyPct).toFixed(2)}% APY</div>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.55)', marginTop: 2 }}>
                      ${Number(position.currentPositionUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              fontSize: 12,
              color: 'rgba(245,240,232,0.45)',
              lineHeight: 1.7,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              No active vault positions yet. Add money to start strategy allocation and yield tracking.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <ActionButton label="Cash Out" onClick={() => onNavigate('withdraw')} />
            </div>
            <div style={{ flex: 1 }}>
              <ActionButton label="Manage Vaults" onClick={() => onNavigate('vaults')} secondary />
            </div>
          </div>
        </SectionPanel>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <SectionPanel title="Quick Actions" eyebrow="Transfers & Conversions">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <QuickAction label="Add Money" onClick={() => onNavigate('deposit')} icon={<PlusQAIcon />} />
          <QuickAction label="Cash Out" onClick={() => onNavigate('withdraw')} icon={<CashOutQAIcon />} />
          <QuickAction label="Send" onClick={() => onNavigate('send')} icon={<SendQAIcon />} />
          <QuickAction label="Swap" onClick={() => onNavigate('swap')} icon={<SwapQAIcon />} />
        </div>
      </SectionPanel>

      {/* ── Cards section ─────────────────────────────────────────────── */}
      <SectionPanel
        title="Cards"
        eyebrow="Payments"
        action={<ActionButton label="Manage ->" onClick={() => onNavigate('card')} secondary />}
      >
        {/* Card carousel */}
        <div
          style={{ position: 'relative', userSelect: 'none' }}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (touchStartX.current === null) return
            const delta = touchStartX.current - e.changedTouches[0].clientX
            if (delta > 40) setActiveCardIdx(i => Math.min(totalCards - 1, i + 1))
            else if (delta < -40) setActiveCardIdx(i => Math.max(0, i - 1))
            touchStartX.current = null
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {activeCardIdx === 0 ? (
              <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('card')}>
                <GenesisCard width={340} height={208} cardholder={displayName.replace(/[@+]/g, '').slice(0, 22)} />
              </div>
            ) : (
              <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('card')}>
                <LinkedCardVisual
                  card={{
                    cardholderName: linkedCards[activeCardIdx - 1].cardholderName,
                    last4: linkedCards[activeCardIdx - 1].last4,
                    expiry: linkedCards[activeCardIdx - 1].expiry,
                    brand: linkedCards[activeCardIdx - 1].brand,
                    issuerName: linkedCards[activeCardIdx - 1].issuerName,
                    frozen: linkedCards[activeCardIdx - 1].frozen,
                  }}
                  width={340}
                  height={208}
                />
              </div>
            )}
          </div>

          {/* Prev / next arrows */}
          {totalCards > 1 && (
            <>
              <button type="button"
                onClick={() => setActiveCardIdx(i => Math.max(0, i - 1))}
                disabled={activeCardIdx === 0}
                style={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: activeCardIdx === 0 ? 'rgba(245,240,232,0.15)' : 'rgba(245,240,232,0.6)', fontSize: 16, cursor: activeCardIdx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                ‹
              </button>
              <button type="button"
                onClick={() => setActiveCardIdx(i => Math.min(totalCards - 1, i + 1))}
                disabled={activeCardIdx === totalCards - 1}
                style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: activeCardIdx === totalCards - 1 ? 'rgba(245,240,232,0.15)' : 'rgba(245,240,232,0.6)', fontSize: 16, cursor: activeCardIdx === totalCards - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                ›
              </button>
            </>
          )}
        </div>

        {/* Card label under active linked card */}
        {activeCardIdx > 0 && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'rgba(245,240,232,0.45)', letterSpacing: '0.06em' }}>
            {linkedCards[activeCardIdx - 1].issuerName ?? linkedCards[activeCardIdx - 1].brand} •••• {linkedCards[activeCardIdx - 1].last4}
          </div>
        )}

        {/* Dot pagination */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: activeCardIdx === 0 ? 12 : 8 }}>
          {Array.from({ length: totalCards }).map((_, i) => (
            <button key={i} type="button" onClick={() => setActiveCardIdx(i)}
              style={{ width: i === activeCardIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === activeCardIdx ? '#c9a84c' : 'rgba(201,168,76,0.22)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.2s' }} />
          ))}
        </div>

        {/* Quick actions row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={() => setShowTapToPay(true)}
            style={{ flex: 1, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,212,170,0.07)', border: '1px solid rgba(0,212,170,0.22)', borderRadius: 12, cursor: 'pointer', color: '#00D4AA', fontSize: 12, letterSpacing: '0.08em', fontFamily: "'Tenor Sans', sans-serif" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 12a6 6 0 0 1 6-6" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M8.5 12a3.5 3.5 0 0 1 3.5-3.5" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
            Tap to Pay
          </button>
          <button type="button" onClick={() => setShowLinkCardPanel(true)}
            style={{ flex: 1, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)', borderRadius: 12, cursor: 'pointer', color: 'rgba(201,168,76,0.75)', fontSize: 12, letterSpacing: '0.08em', fontFamily: "'Tenor Sans', sans-serif" }}>
            + Link Card
          </button>
        </div>
      </SectionPanel>

      {/* Tap to Pay modal — passes all cards including linked */}
      {showTapToPay && (
        <TapToPayModal
          cards={[
            { id: 'home-genesis', isGenesis: true, cardholderName: displayName.replace(/[@+]/g, '').slice(0, 22), frozen: false },
            ...linkedCards.map(c => ({
              id: c.id,
              isGenesis: false as const,
              cardholderName: c.cardholderName,
              frozen: c.frozen,
              linkedMeta: { cardholderName: c.cardholderName, last4: c.last4, expiry: c.expiry, brand: c.brand, funding: c.funding, issuerName: c.issuerName, frozen: c.frozen },
            })),
          ]}
          defaultCardId={activeCardIdx === 0 ? 'home-genesis' : (linkedCards[activeCardIdx - 1]?.id ?? 'home-genesis')}
          onClose={() => setShowTapToPay(false)}
        />
      )}

      {/* Inline card linking panel */}
      {showLinkCardPanel && walletAddr && (
        <LinkDebitCardPanelWrapper
          accountId={walletAddr}
          onClose={() => setShowLinkCardPanel(false)}
          onLinked={(card: LinkedCardPayload) => {
            const newCard: HomeLinkedCard = {
              id: card.id,
              cardholderName: card.cardholderName,
              brand: card.brand,
              last4: card.last4,
              expiry: `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`,
              issuerName: card.issuerName,
              funding: card.funding,
              frozen: false,
            }
            setLinkedCards(prev => {
              const map = new Map(prev.map(c => [c.id, c]))
              map.set(newCard.id, newCard)
              return Array.from(map.values())
            })
            setActiveCardIdx(1 + linkedCards.length) // jump to the new card
            setShowLinkCardPanel(false)
          }}
        />
      )}

      {/* ── Recent Transactions ───────────────────────────────────────── */}
      <SectionPanel
        title="Recent Transactions"
        eyebrow="Activity Ledger"
        action={<ActionButton label="View all ->" onClick={() => onNavigate('activity')} secondary />}
        noPadding
      >

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          {!txsReady ? (
            <div style={{ padding: '18px 20px', color: 'rgba(245,240,232,0.35)', fontSize: 13 }}>Loading transactions…</div>

          ) : hasBackendTxs ? (
            backendEntries.map((entry, idx) => {
              const parsed = parseEntry(entry)
              return <TxRow key={entry.id} {...parsed} last={idx === backendEntries.length - 1} />
            })

          ) : hasOnChainTxs ? (
            onChainEntries.map((tx, idx) => (
              <TxRow key={tx.hash} {...tx} last={idx === onChainEntries.length - 1} />
            ))

          ) : isLive ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 24, opacity: 0.25 }}>◈</div>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.55)' }}>No transactions yet</div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)' }}>Deposit USDC or bridge ETH from Ethereum to get started</div>
              <ActionButton label="Deposit ->" onClick={() => onNavigate('deposit')} />
            </div>

          ) : (
            /* Preview mode */
            [
              { name: 'Starbucks', amount: 5.48, symbol: 'USDC', isDebit: true, dateStr: 'Today, 8:42 AM', initial: 'S', hue: 25 },
              { name: 'Amazon', amount: 42.19, symbol: 'USDC', isDebit: true, dateStr: 'Yesterday, 4:21 PM', initial: 'A', hue: 200 },
              { name: 'Yield Earn', amount: 1.38, symbol: 'USDC', isDebit: false, dateStr: 'Yesterday, 12:00 AM', initial: 'Y', hue: 135 },
            ].map((tx, idx) => <TxRow key={idx} {...tx} last={idx === 2} />)
          )}
        </div>

        {!hasBackendTxs && hasOnChainTxs && (
          <div style={{ padding: '10px 20px 14px', fontSize: 10, color: 'rgba(245,240,232,0.25)', letterSpacing: '0.06em', textAlign: 'right' }}>
            On-chain data · Arbiscan / Etherscan
          </div>
        )}
      </SectionPanel>
    </div>
  )
}

/* ── Transaction row ───────────────────────────────────────────────────── */
function TxRow({ name, initial, amount, symbol, isDebit, dateStr, hue, last }: {
  name: string; initial: string; amount: number; symbol?: string; isDebit: boolean; dateStr: string; hue: number; last: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: `hsla(${hue},40%,30%,0.4)`, border: `1px solid hsla(${hue},40%,50%,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: `hsla(${hue},60%,75%,1)`, fontFamily: "'Tenor Sans', sans-serif" }}>
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.02em', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.38)' }}>{dateStr}</div>
      </div>
      <div style={{ fontSize: 14, color: isDebit ? '#f5f0e8' : '#1ABF6A', fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.02em', flexShrink: 0 }}>
        {isDebit ? '-' : '+'}{symbol === 'ETH' ? `${amount.toFixed(4)} ETH` : `$${amount.toFixed(2)}`}
      </div>
    </div>
  )
}

/* ── Icons ─────────────────────────────────────────────────────────────── */
function BellIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,232,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
}
function EyeIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
}
function EyeOffIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
}
function PlusQAIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function SendQAIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
}
function SwapQAIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
}
function CashOutQAIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9B6DFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
}
