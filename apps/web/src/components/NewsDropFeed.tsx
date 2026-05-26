'use client'

import { useEffect, useState, useCallback } from 'react'
import type { NewsDrop, NewsDropsResponse } from '@/lib/news/types'

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  DeFi:           '#00D4AA',
  Stablecoin:     '#c9a84c',
  Regulation:     '#9B6DFF',
  Infrastructure: '#4FC3F7',
  Macro:          '#FF8A65',
  Payments:       '#81C784',
}

const SLOT_GLYPHS: Record<string, string> = {
  morning: '○',
  midday:  '◈',
  evening: '◑',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSlotLive(slot: NewsDrop['slot']): boolean {
  const now = new Date()
  const estOffset = -5 * 60  // EST (not DST-aware, intentionally simple)
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const estMin = ((utcMin + estOffset) % (24 * 60) + 24 * 60) % (24 * 60)
  if (slot === 'morning') return estMin >= 8 * 60
  if (slot === 'midday')  return estMin >= 12 * 60
  return estMin >= 18 * 60
}

function fmtPubDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

// ── Social share panel ────────────────────────────────────────────────────────

const SOCIAL_TABS = [
  { key: 'twitter',   label: 'X (Twitter)' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin',  label: 'LinkedIn' },
  { key: 'tiktok',    label: 'TikTok' },
] as const

function SharePanel({ social }: { social: NewsDrop['social'] }) {
  const [tab, setTab] = useState<keyof NewsDrop['social']>('twitter')
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard.writeText(social[tab]).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [social, tab])

  return (
    <div
      style={{
        marginTop: 14,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(201,168,76,0.18)',
        borderRadius: 10,
        overflow: 'hidden',
        animation: 'newsSlideIn 0.18s ease',
      }}
    >
      {/* Tab row */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {SOCIAL_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setCopied(false) }}
            style={{
              flex: 1,
              padding: '9px 4px',
              background: tab === key ? 'rgba(201,168,76,0.1)' : 'transparent',
              border: 'none',
              borderBottom: tab === key ? '2px solid #c9a84c' : '2px solid transparent',
              color: tab === key ? '#c9a84c' : 'rgba(245,240,232,0.4)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: "'Tenor Sans', sans-serif",
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Copy text area */}
      <div style={{ padding: '14px 16px 10px' }}>
        <pre
          style={{
            margin: 0,
            fontFamily: "'Tenor Sans', sans-serif",
            fontSize: 12,
            color: 'rgba(245,240,232,0.80)',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 160,
            overflowY: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {social[tab]}
        </pre>
      </div>

      {/* Copy button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 12px' }}>
        <button
          type="button"
          onClick={copy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid rgba(201,168,76,0.35)',
            background: copied ? 'rgba(0,212,170,0.12)' : 'rgba(201,168,76,0.08)',
            color: copied ? '#00D4AA' : '#c9a84c',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'all 0.18s ease',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// ── Genesis angle panel ───────────────────────────────────────────────────────

function GenesisAnglePanel({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 14px',
        background: 'rgba(0,212,170,0.05)',
        border: '1px solid rgba(0,212,170,0.18)',
        borderRadius: 8,
        animation: 'newsSlideIn 0.18s ease',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#00D4AA',
          marginBottom: 6,
          fontFamily: "'Tenor Sans', sans-serif",
        }}
      >
        Genesis Angle
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'rgba(245,240,232,0.82)',
          lineHeight: 1.65,
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── Drop card ─────────────────────────────────────────────────────────────────

function DropCard({ drop }: { drop: NewsDrop }) {
  const [angleOpen, setAngleOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const live = isSlotLive(drop.slot)
  const catColor = CATEGORY_COLORS[drop.category] ?? '#c9a84c'

  return (
    <div
      style={{
        background: 'rgba(4,6,8,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '18px 18px 14px',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,168,76,0.22)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
    >
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {/* Category badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: catColor,
            background: `${catColor}18`,
            border: `1px solid ${catColor}40`,
            fontFamily: "'Tenor Sans', sans-serif",
          }}
        >
          {drop.category}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.40)', fontFamily: "'Tenor Sans', sans-serif" }}>
          {drop.source}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.25)', fontFamily: "'Tenor Sans', sans-serif" }}>·</span>
        <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', fontFamily: "'Tenor Sans', sans-serif" }}>
          {fmtPubDate(drop.publishedAt)}
        </span>
        {!live && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(245,240,232,0.28)',
              fontFamily: "'Tenor Sans', sans-serif",
            }}
          >
            Upcoming
          </span>
        )}
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#f5f0e8',
          lineHeight: 1.45,
          marginBottom: 10,
          fontFamily: "'Cormorant Garamond', serif",
          letterSpacing: '0.01em',
        }}
      >
        {drop.headline}
      </div>

      {/* Summary */}
      <div
        style={{
          fontSize: 13,
          color: 'rgba(245,240,232,0.62)',
          lineHeight: 1.65,
          marginBottom: 14,
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        {drop.summary}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Genesis Angle toggle */}
        <button
          type="button"
          onClick={() => setAngleOpen(o => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 20,
            border: '1px solid rgba(0,212,170,0.28)',
            background: angleOpen ? 'rgba(0,212,170,0.10)' : 'rgba(0,212,170,0.05)',
            color: '#00D4AA',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'background 0.15s',
          }}
        >
          ◈ Genesis Angle
          <span style={{ display: 'inline-block', transform: angleOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 7 }}>▼</span>
        </button>

        {/* Share toggle */}
        <button
          type="button"
          onClick={() => setShareOpen(o => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 20,
            border: '1px solid rgba(201,168,76,0.28)',
            background: shareOpen ? 'rgba(201,168,76,0.10)' : 'rgba(201,168,76,0.05)',
            color: '#c9a84c',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: "'Tenor Sans', sans-serif",
            transition: 'background 0.15s',
          }}
        >
          Share
          <span style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
        </button>

        {/* Source link */}
        <a
          href={drop.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: 'rgba(245,240,232,0.28)',
            textDecoration: 'none',
            fontFamily: "'Tenor Sans', sans-serif",
            letterSpacing: '0.04em',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(245,240,232,0.60)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(245,240,232,0.28)' }}
        >
          Full article →
        </a>
      </div>

      {/* Genesis angle panel */}
      {angleOpen && <GenesisAnglePanel text={drop.genesisAngle} />}

      {/* Share panel */}
      {shareOpen && <SharePanel social={drop.social} />}
    </div>
  )
}

// ── Slot header ───────────────────────────────────────────────────────────────

function SlotHeader({ drop }: { drop: NewsDrop }) {
  const live = isSlotLive(drop.slot)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span
        style={{
          fontSize: 14,
          color: live ? '#c9a84c' : 'rgba(245,240,232,0.28)',
          lineHeight: 1,
        }}
      >
        {SLOT_GLYPHS[drop.slot]}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: live ? '#c9a84c' : 'rgba(245,240,232,0.28)',
          fontFamily: "'Tenor Sans', sans-serif",
        }}
      >
        {drop.slotLabel}
      </span>
      <span
        style={{
          fontSize: 10,
          color: 'rgba(245,240,232,0.28)',
          fontFamily: "'Tenor Sans', sans-serif",
        }}
      >
        · {drop.slotTime}
      </span>
      {live && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#c9a84c',
            background: 'rgba(201,168,76,0.12)',
            border: '1px solid rgba(201,168,76,0.25)',
            fontFamily: "'Tenor Sans', sans-serif",
          }}
        >
          Live
        </span>
      )}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DropSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[0, 1, 2].map(i => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(201,168,76,0.12)', animation: 'newsPulse 1.4s ease-in-out infinite' }} />
            <div style={{ width: 100, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.06)', animation: 'newsPulse 1.4s ease-in-out infinite' }} />
          </div>
          <div
            style={{
              background: 'rgba(4,6,8,0.80)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '18px 18px 20px',
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 48, height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.05)', animation: 'newsPulse 1.4s ease-in-out infinite' }} />
              <div style={{ width: 60, height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.04)', animation: 'newsPulse 1.4s ease-in-out infinite' }} />
            </div>
            <div style={{ width: '88%', height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.05)', marginBottom: 8, animation: 'newsPulse 1.4s ease-in-out infinite' }} />
            <div style={{ width: '72%', height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.04)', marginBottom: 14, animation: 'newsPulse 1.4s ease-in-out infinite' }} />
            <div style={{ width: '94%', height: 13, borderRadius: 3, background: 'rgba(255,255,255,0.03)', marginBottom: 5, animation: 'newsPulse 1.4s ease-in-out infinite' }} />
            <div style={{ width: '80%', height: 13, borderRadius: 3, background: 'rgba(255,255,255,0.03)', animation: 'newsPulse 1.4s ease-in-out infinite' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface NewsDropFeedProps {
  onUnreadChange?: (count: number) => void
}

export function NewsDropFeed({ onUnreadChange }: NewsDropFeedProps) {
  const [drops, setDrops] = useState<NewsDrop[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch drops
  useEffect(() => {
    fetch('/api/gr/news/drops')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<NewsDropsResponse>
      })
      .then(data => {
        setDrops(data.drops)
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load news drops. Please try again.')
        setLoading(false)
      })
  }, [])

  // Mark as viewed when drops load — clears the unread badge
  useEffect(() => {
    if (!drops) return
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('gr_news_viewed_date', today)
    onUnreadChange?.(0)
  }, [drops, onUnreadChange])

  return (
    <div style={{ padding: '28px 24px 48px', maxWidth: 760, margin: '0 auto' }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#c9a84c',
            marginBottom: 8,
            fontFamily: "'Tenor Sans', sans-serif",
          }}
        >
          ◈ Intelligence Feed
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 28,
            fontWeight: 300,
            color: '#f5f0e8',
            letterSpacing: '0.04em',
            lineHeight: 1.25,
            marginBottom: 10,
          }}
        >
          Pipeline into the Future of<br />
          Fintech and Digital Currency
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'rgba(245,240,232,0.45)',
            fontFamily: "'Tenor Sans', sans-serif",
            letterSpacing: '0.04em',
            lineHeight: 1.6,
          }}
        >
          3 curated drops daily — Morning Intel · Midday Signal · Evening Brief
        </p>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'rgba(201,168,76,0.15)', marginBottom: 28 }} />

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading && <DropSkeleton />}

      {error && !loading && (
        <div
          style={{
            padding: '20px 24px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,80,80,0.18)',
            color: 'rgba(245,240,232,0.5)',
            fontSize: 13,
            fontFamily: "'Tenor Sans', sans-serif",
            letterSpacing: '0.04em',
          }}
        >
          {error}
        </div>
      )}

      {drops && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {drops.map(drop => (
            <div key={drop.id}>
              <SlotHeader drop={drop} />
              <DropCard drop={drop} />
            </div>
          ))}
        </div>
      )}

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      {drops && (
        <div
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            color: 'rgba(245,240,232,0.22)',
            fontFamily: "'Tenor Sans', sans-serif",
            letterSpacing: '0.05em',
            lineHeight: 1.7,
          }}
        >
          Drops refresh every 5 minutes · Sources: CoinDesk, The Block, Decrypt, Cointelegraph
        </div>
      )}

      <style>{`
        @keyframes newsSlideIn {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes newsPulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
