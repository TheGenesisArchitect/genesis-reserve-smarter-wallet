'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { useHistoryEntries } from '../hooks/useHistoryEntries'
import { useOnChainHistory } from '../hooks/useOnChainHistory'
import type { OnChainTx } from '../hooks/useOnChainHistory'
import type { LedgerEntry } from '../lib/bff.types'

function useEthPrice() {
  return useQuery({
    queryKey: ['eth-price'],
    queryFn: async () => {
      const res = await fetch('/api/gr/swap/quote?direction=eth_to_usdc&amountIn=1')
      if (!res.ok) return 0
      const json = await res.json() as { rate?: string }
      return parseFloat(json.rate ?? '0') || 0
    },
    staleTime: 60_000,
    retry: 1,
  })
}

type Filter = 'all' | 'in' | 'out' | 'yield'

interface Props {
  accountId?: string
}

/* ── Amount parser ─────────────────────────────────────────────────────── */
function parseAmount(raw: string): number {
  const n = parseFloat(raw) / 1e6
  return isNaN(n) ? 0 : n
}

/* ── Entry classifier ─────────────────────────────────────────────────── */
function classifyEntry(entry: LedgerEntry) {
  const type = (entry.entryType ?? '').toUpperCase()
  const isIn = type.includes('IN') || type.includes('CREDIT') || type.includes('DEPOSIT') || type.includes('YIELD') || type.includes('HARVEST')
  const isYield = type.includes('YIELD') || type.includes('HARVEST') || type.includes('EARN')
  const meta = entry.metadata as Record<string, string> | undefined
  const rawName = meta?.merchant ?? meta?.description ?? meta?.label ?? entry.entryType.replace(/_/g, ' ').toLowerCase()
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1)
  const initial = name.charAt(0).toUpperCase()
  const hue = (initial.charCodeAt(0) * 41) % 360
  const amount = Math.abs(parseAmount(entry.amount))
  return { name, initial, hue, amount, isIn, isYield }
}

/* ── Date formatter ───────────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const isYest = d.toDateString() === new Date(now.getTime() - 86400000).toDateString()
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return isToday ? `Today, ${time}` : isYest ? `Yesterday, ${time}` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

/* ── Single transaction row ───────────────────────────────────────────── */
function ActivityRow({ entry, last }: { entry: LedgerEntry; last: boolean }) {
  const { name, initial, hue, amount, isIn, isYield } = classifyEntry(entry)
  const amountColor = isIn ? '#4caf50' : '#f5f0e8'
  const amountPrefix = isIn ? '+' : '−'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '15px 20px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(255,255,255,0.02)',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: isYield ? 'rgba(201,168,76,0.15)' : `hsla(${hue},38%,28%,0.55)`,
        border: isYield ? '1px solid rgba(201,168,76,0.3)' : `1px solid hsla(${hue},40%,50%,0.22)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 600,
        color: isYield ? '#c9a84c' : `hsla(${hue},55%,72%,1)`,
        fontFamily: "'Tenor Sans', sans-serif",
      }}>
        {isYield ? '◈' : initial}
      </div>

      {/* Name + date */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.02em', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.38)', fontFamily: "'Tenor Sans', sans-serif" }}>
          {fmtDate(entry.createdAt)}
        </div>
      </div>

      {/* Type badge */}
      <div style={{
        padding: '2px 9px', borderRadius: 10,
        background: isYield ? 'rgba(201,168,76,0.1)' : isIn ? 'rgba(76,175,80,0.1)' : 'rgba(255,255,255,0.05)',
        border: isYield ? '1px solid rgba(201,168,76,0.2)' : isIn ? '1px solid rgba(76,175,80,0.2)' : '1px solid rgba(255,255,255,0.08)',
        fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
        color: isYield ? '#c9a84c' : isIn ? '#4caf50' : 'rgba(245,240,232,0.35)',
        flexShrink: 0,
      }}>
        {isYield ? 'Yield' : isIn ? 'In' : 'Out'}
      </div>

      {/* Amount */}
      <div style={{
        fontSize: 14,
        color: amountColor,
        fontFamily: "'Cormorant Garamond', serif",
        letterSpacing: '0.02em',
        minWidth: 80, textAlign: 'right' as const,
        flexShrink: 0,
      }}>
        {amountPrefix}${amount.toFixed(2)}
      </div>
    </div>
  )
}

/* ── Demo rows shown when no real data ────────────────────────────────── */
const DEMO_ENTRIES: LedgerEntry[] = [
  { id: 'd1', entryType: 'PAYMENT_OUT', amount: '5480000', createdAt: new Date().toISOString(), metadata: { merchant: 'Starbucks' } },
  { id: 'd2', entryType: 'PAYMENT_OUT', amount: '42190000', createdAt: new Date(Date.now() - 86400000).toISOString(), metadata: { merchant: 'Amazon' } },
  { id: 'd3', entryType: 'YIELD_EARN', amount: '1380000', createdAt: new Date(Date.now() - 86400000 * 1.5).toISOString(), metadata: { description: 'Daily yield accrual' } },
  { id: 'd4', entryType: 'DEPOSIT_IN', amount: '500000000', createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), metadata: { description: 'Initial deposit' } },
  { id: 'd5', entryType: 'PAYMENT_OUT', amount: '18750000', createdAt: new Date(Date.now() - 86400000 * 4).toISOString(), metadata: { merchant: 'Whole Foods' } },
  { id: 'd6', entryType: 'YIELD_EARN', amount: '4120000', createdAt: new Date(Date.now() - 86400000 * 7).toISOString(), metadata: { description: 'Weekly harvest' } },
]

/* ── ActivityPage ──────────────────────────────────────────────────────── */
export function ActivityPage({ accountId }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading, error } = useHistoryEntries(accountId, 50)

  // Live ETH/USD price via swap quote BFF
  const { data: ethPrice = 0 } = useEthPrice()

  // Wallet address for on-chain fallback
  const { address } = useAccount()
  const { user } = usePrivy()
  const walletAddr = address ?? (user?.wallet?.address as `0x${string}` | undefined)
  const isLive = !!walletAddr

  // On-chain history via Arbiscan when backend is down
  const { data: onChainTxs, isLoading: onChainLoading } = useOnChainHistory(walletAddr)

  const rawEntries = data?.entries ?? []
  const hasBackend = rawEntries.length > 0

  // Decide what entries to show:
  // 1. Backend entries (when available)
  // 2. On-chain entries converted to ledger-like shape
  // 3. Demo entries (only when no live wallet)
  const entries: LedgerEntry[] = hasBackend
    ? rawEntries
    : !isLive
      ? DEMO_ENTRIES
      : []

  const onChainRows = !hasBackend && isLive ? (onChainTxs ?? []) : []

  const filtered = entries.filter(e => {
    const type = (e.entryType ?? '').toUpperCase()
    if (filter === 'in') return type.includes('IN') || type.includes('CREDIT') || type.includes('DEPOSIT')
    if (filter === 'out') return type.includes('OUT') || type.includes('DEBIT') || type.includes('PAYMENT')
    if (filter === 'yield') return type.includes('YIELD') || type.includes('HARVEST') || type.includes('EARN')
    return true
  })

  /* CSV export */
  function exportCSV() {
    const rows = ['Date,Type,Amount (USDC),ID']
      .concat(entries.map(e => `"${e.createdAt}","${e.entryType}","${Math.abs(parseAmount(e.amount)).toFixed(2)}","${e.id}"`))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'genesis-reserve-activity.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  /* Summary stats — convert ETH to USD using live price */
  const isNative = (sym: string) => sym === 'ETH' || sym === 'POL' || sym === 'MATIC'

  const totalInUSDC = hasBackend
    ? entries.reduce((s, e) => { const c = classifyEntry(e); return c.isIn && !c.isYield ? s + c.amount : s }, 0)
    : onChainRows.filter(t => !t.isDebit && t.symbol === 'USDC').reduce((s, t) => s + t.amount, 0)
  const totalInETH = hasBackend ? 0
    : onChainRows.filter(t => !t.isDebit && isNative(t.symbol)).reduce((s, t) => s + t.amount, 0)

  const totalOutUSDC = hasBackend
    ? entries.reduce((s, e) => { const c = classifyEntry(e); return !c.isIn && !c.isYield ? s + c.amount : s }, 0)
    : onChainRows.filter(t => t.isDebit && t.symbol === 'USDC').reduce((s, t) => s + t.amount, 0)
  const totalOutETH = hasBackend ? 0
    : onChainRows.filter(t => t.isDebit && isNative(t.symbol)).reduce((s, t) => s + t.amount, 0)

  const totalYield = hasBackend
    ? entries.reduce((s, e) => { const c = classifyEntry(e); return c.isYield ? s + c.amount : s }, 0)
    : 0

  // Convert ETH to USD and combine with USDC totals
  const totalIn  = totalInUSDC  + (ethPrice > 0 ? totalInETH  * ethPrice : 0)
  const totalOut = totalOutUSDC + (ethPrice > 0 ? totalOutETH * ethPrice : 0)

  const txCount = hasBackend ? filtered.length : onChainRows.length

  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 900, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>
            Ledger
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em' }}>
            Activity
          </div>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 20,
            background: 'transparent',
            border: '1px solid rgba(201,168,76,0.28)',
            color: '#c9a84c', cursor: 'pointer',
            fontSize: 11, letterSpacing: '0.1em',
            fontFamily: "'Tenor Sans', sans-serif",
          }}
        >
          Export CSV ↓
        </button>
      </div>

      {/* ── Summary stats ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {([
          {
            label: 'Total Received', value: `$${totalIn.toFixed(2)}`, color: '#4caf50',
            sub: totalInETH >= 0.00001 ? `${totalInETH.toFixed(4)} ETH @ $${ethPrice.toFixed(0)}` : undefined,
          },
          {
            label: 'Total Sent', value: `$${totalOut.toFixed(2)}`, color: '#f5f0e8',
            sub: totalOutETH >= 0.00001 ? `${totalOutETH.toFixed(4)} ETH @ $${ethPrice.toFixed(0)}` : undefined,
          },
          { label: 'Yield Earned', value: `$${totalYield.toFixed(2)}`, color: '#c9a84c', sub: undefined },
        ] as const).map(s => (
          <div key={s.label} style={{
            flex: 1, padding: '14px 16px',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: s.color }}>{s.value}</div>
            {s.sub && (
              <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.3)', marginTop: 3, fontFamily: "'Tenor Sans', sans-serif" }}>
                incl. {s.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Filter tabs ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {([
          { key: 'all', label: 'All' },
          { key: 'in', label: 'Received' },
          { key: 'out', label: 'Sent' },
          { key: 'yield', label: 'Yield' },
        ] as const).map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '7px 18px', borderRadius: 20,
              border: filter === f.key ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.1)',
              background: filter === f.key ? 'rgba(201,168,76,0.1)' : 'transparent',
              color: filter === f.key ? '#c9a84c' : 'rgba(245,240,232,0.45)',
              cursor: 'pointer', fontSize: 12, letterSpacing: '0.06em',
              fontFamily: "'Tenor Sans', sans-serif",
              transition: 'all 0.18s',
            }}
          >
            {f.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(245,240,232,0.3)', display: 'flex', alignItems: 'center' }}>
          {txCount} transaction{txCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Transaction list ─────────────────────────────────────────── */}
      <div style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        {isLoading || (isLive && onChainLoading && !hasBackend) ? (
          <div style={{ padding: '24px 20px', color: 'rgba(245,240,232,0.35)', fontSize: 13, textAlign: 'center' }}>
            Loading transactions…
          </div>

        ) : filtered.length > 0 ? (
          filtered.map((e, i) => <ActivityRow key={e.id} entry={e} last={i === filtered.length - 1} />)

        ) : onChainRows.length > 0 ? (
          /* On-chain fallback rows */
          onChainRows
            .filter(tx => {
              if (filter === 'in') return !tx.isDebit
              if (filter === 'out') return tx.isDebit
              if (filter === 'yield') return false
              return true
            })
            .map((tx, i, arr) => <OnChainRow key={tx.hash} tx={tx} last={i === arr.length - 1} />)

        ) : isLive ? (
          <div style={{ padding: '40px 20px', color: 'rgba(245,240,232,0.3)', fontSize: 13, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 24, opacity: 0.2 }}>◈</div>
            <div>No transactions yet on this wallet</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.2)' }}>Transactions will appear here after your first deposit or transfer</div>
          </div>

        ) : !isLive ? (
          DEMO_ENTRIES
            .filter(e => {
              const type = (e.entryType ?? '').toUpperCase()
              if (filter === 'in') return type.includes('IN') || type.includes('DEPOSIT')
              if (filter === 'out') return type.includes('OUT') || type.includes('PAYMENT')
              if (filter === 'yield') return type.includes('YIELD')
              return true
            })
            .map((e, i, arr) => <ActivityRow key={e.id} entry={e} last={i === arr.length - 1} />)

        ) : (
          <div style={{ padding: '32px 20px', color: 'rgba(245,240,232,0.3)', fontSize: 13, textAlign: 'center' }}>
            No transactions match this filter.
          </div>
        )}
      </div>

      {/* On-chain source note */}
      {!hasBackend && onChainRows.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(245,240,232,0.25)', letterSpacing: '0.06em', textAlign: 'right' }}>
          On-chain data · Ethereum · Arbitrum · Base · Polygon · Optimism
        </div>
      )}
    </div>
  )
}

/* ── On-chain transaction row ──────────────────────────────────────────── */
function OnChainRow({ tx, last }: { tx: OnChainTx; last: boolean }) {
  const isIn = !tx.isDebit
  const isSpecial = tx.txType === 'swap' || tx.txType === 'bridge'
  const amountStr = tx.symbol === 'ETH' || tx.symbol === 'POL'
    ? `${tx.isDebit ? '−' : '+'}${tx.amount.toFixed(4)} ${tx.symbol}`
    : `${tx.isDebit ? '−' : '+'}$${tx.amount.toFixed(2)}`

  const typeBadgeColor = isSpecial
    ? { bg: 'rgba(201,168,76,0.1)', border: 'rgba(201,168,76,0.2)', text: '#c9a84c' }
    : isIn
      ? { bg: 'rgba(76,175,80,0.1)', border: 'rgba(76,175,80,0.2)', text: '#4caf50' }
      : { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', text: 'rgba(245,240,232,0.35)' }

  const badgeLabel = tx.txType === 'swap' ? 'Swap'
    : tx.txType === 'bridge' ? 'Bridge'
      : isIn ? 'In' : 'Out'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '15px 20px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(255,255,255,0.02)',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: `hsla(${tx.hue},38%,28%,0.55)`,
        border: `1px solid hsla(${tx.hue},40%,50%,0.22)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 600,
        color: `hsla(${tx.hue},55%,72%,1)`,
        fontFamily: "'Tenor Sans', sans-serif",
      }}>
        {tx.initial}
      </div>

      {/* Name + date + chain */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#f5f0e8', letterSpacing: '0.02em', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.38)', fontFamily: "'Tenor Sans', sans-serif" }}>
            {tx.dateStr}
          </span>
          <span style={{
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            padding: '1px 6px', borderRadius: 6,
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(245,240,232,0.3)',
          }}>
            {tx.chain}
          </span>
          {tx.explorerUrl && (
            <a
              href={tx.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 10, color: 'rgba(201,168,76,0.55)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = '#c9a84c')}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(201,168,76,0.55)')}
            >
              View ↗
            </a>
          )}
        </div>
      </div>

      {/* Type badge */}
      <div style={{
        padding: '2px 9px', borderRadius: 10,
        background: typeBadgeColor.bg, border: `1px solid ${typeBadgeColor.border}`,
        fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
        color: typeBadgeColor.text, flexShrink: 0,
      }}>
        {badgeLabel}
      </div>

      {/* Amount */}
      <div style={{
        fontSize: 14, color: isIn ? '#4caf50' : '#f5f0e8',
        fontFamily: "'Cormorant Garamond', serif",
        letterSpacing: '0.02em', minWidth: 80, textAlign: 'right' as const, flexShrink: 0,
      }}>
        {amountStr}
      </div>
    </div>
  )
}
