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

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.79a4.85 4.85 0 0 1-1.01-.1z" />
    </svg>
  )
}

// ── Article image banner ──────────────────────────────────────────────────────

function ImageBanner({ url, category }: { url: string; category: string }) {
  const [failed, setFailed] = useState(false)
  const catColor = CATEGORY_COLORS[category] ?? '#c9a84c'
  if (failed) return null
  return (
    <div
      style={{
        margin: '-18px -18px 16px -18px',
        height: 150,
        position: 'relative',
        background: `${catColor}12`,
      }}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 60,
          background: 'linear-gradient(to top, rgba(4,6,8,0.92), transparent)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

interface PlatformDef {
  key: string
  label: string
  subLabel: string
  action: 'open' | 'copy'
  url?: string
  copy: string
  hint?: string
  bg: string
  border: string
  hoverBorder: string
  color: string
  icon: React.ReactNode
}

function SharePanel({ drop }: { drop: NewsDrop }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(drop.social.twitter)}`
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(drop.sourceUrl)}`

  const PLATFORMS: PlatformDef[] = [
    {
      key: 'twitter', label: 'Post to X', subLabel: 'Opens tweet composer',
      action: 'open', url: xUrl, copy: drop.social.twitter,
      bg: 'rgba(0,0,0,0.65)', border: 'rgba(255,255,255,0.18)', hoverBorder: 'rgba(255,255,255,0.42)',
      color: '#ffffff', icon: <XIcon />,
    },
    {
      key: 'linkedin', label: 'Post to LinkedIn', subLabel: 'Opens share dialog',
      action: 'open', url: linkedInUrl, copy: drop.social.linkedin,
      bg: 'rgba(10,102,194,0.10)', border: 'rgba(10,102,194,0.30)', hoverBorder: 'rgba(10,102,194,0.60)',
      color: '#5b9bd5', icon: <LinkedInIcon />,
    },
    {
      key: 'instagram', label: 'Copy for Instagram', subLabel: 'Caption to clipboard',
      action: 'copy', copy: drop.social.instagram, hint: 'Open Instagram → New Post → paste caption',
      bg: 'rgba(131,58,180,0.08)', border: 'rgba(225,48,108,0.22)', hoverBorder: 'rgba(225,48,108,0.50)',
      color: '#e1306c', icon: <InstagramIcon />,
    },
    {
      key: 'tiktok', label: 'Copy for TikTok', subLabel: 'Script to clipboard',
      action: 'copy', copy: drop.social.tiktok, hint: 'Open TikTok → Upload → paste caption',
      bg: 'rgba(0,0,0,0.65)', border: 'rgba(105,201,208,0.22)', hoverBorder: 'rgba(105,201,208,0.55)',
      color: '#69c9d0', icon: <TikTokIcon />,
    },
  ]

  function handleAction(p: PlatformDef) {
    if (p.action === 'open' && p.url) {
      window.open(p.url, '_blank', 'noopener,noreferrer')
    } else {
      navigator.clipboard.writeText(p.copy).then(() => {
        setCopiedKey(p.key)
        setTimeout(() => setCopiedKey(null), 3500)
      })
    }
  }

  function handleNativeShare() {
    navigator.share({ title: drop.headline, text: drop.social.twitter, url: drop.sourceUrl }).catch(() => {})
  }

  const activePreview = previewKey ? PLATFORMS.find(p => p.key === previewKey) : null

  return (
    <div
      style={{
        marginTop: 14,
        background: 'rgba(2,3,5,0.92)',
        border: '1px solid rgba(201,168,76,0.18)',
        borderRadius: 12,
        padding: '14px 14px 12px',
        animation: 'newsSlideIn 0.18s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#c9a84c',
          marginBottom: 12,
          fontFamily: "'Tenor Sans', sans-serif",
        }}
      >
        Share this Drop
      </div>

      {/* Native share (mobile) */}
      {canNativeShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '9px 12px',
            borderRadius: 8,
            border: '1px solid rgba(201,168,76,0.25)',
            background: 'rgba(201,168,76,0.07)',
            color: '#c9a84c',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: "'Tenor Sans', sans-serif",
            marginBottom: 10,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share via...
        </button>
      )}

      {/* 2×2 platform grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {PLATFORMS.map(p => {
          const isCopied = copiedKey === p.key
          return (
            <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type="button"
                onClick={() => handleAction(p)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '12px 12px 10px',
                  borderRadius: 9,
                  border: `1px solid ${isCopied ? 'rgba(0,212,170,0.50)' : p.border}`,
                  background: isCopied ? 'rgba(0,212,170,0.08)' : p.bg,
                  color: isCopied ? '#00D4AA' : p.color,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.18s, background 0.18s, color 0.18s',
                  width: '100%',
                }}
                onMouseEnter={e => {
                  if (!isCopied) (e.currentTarget as HTMLButtonElement).style.borderColor = p.hoverBorder
                }}
                onMouseLeave={e => {
                  if (!isCopied) (e.currentTarget as HTMLButtonElement).style.borderColor = p.border
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {isCopied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : p.icon}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      fontFamily: "'Tenor Sans', sans-serif",
                      lineHeight: 1,
                    }}
                  >
                    {isCopied ? 'Copied!' : p.label}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    color: isCopied ? 'rgba(0,212,170,0.7)' : 'rgba(245,240,232,0.35)',
                    fontFamily: "'Tenor Sans', sans-serif",
                    letterSpacing: '0.04em',
                    lineHeight: 1.4,
                  }}
                >
                  {isCopied && p.hint ? p.hint : p.subLabel}
                </span>
              </button>

              {/* Preview toggle */}
              <button
                type="button"
                onClick={() => setPreviewKey(previewKey === p.key ? null : p.key)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: previewKey === p.key ? '#c9a84c' : 'rgba(245,240,232,0.28)',
                  fontSize: 9,
                  cursor: 'pointer',
                  padding: '0 4px',
                  letterSpacing: '0.06em',
                  fontFamily: "'Tenor Sans', sans-serif",
                  textTransform: 'uppercase',
                  textAlign: 'left',
                  transition: 'color 0.15s',
                }}
              >
                {previewKey === p.key ? '▲ hide text' : '▼ preview text'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Content preview */}
      {activePreview && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            animation: 'newsSlideIn 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: activePreview.color,
                fontFamily: "'Tenor Sans', sans-serif",
              }}
            >
              {activePreview.label} · Preview
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(activePreview.copy).then(() => {
                  setCopiedKey(activePreview.key)
                  setTimeout(() => setCopiedKey(null), 3500)
                })
              }}
              style={{
                background: 'none',
                border: `1px solid ${activePreview.border}`,
                borderRadius: 12,
                color: activePreview.color,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: '3px 9px',
                fontFamily: "'Tenor Sans', sans-serif",
              }}
            >
              {copiedKey === activePreview.key ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              color: 'rgba(245,240,232,0.72)',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: "'Tenor Sans', sans-serif",
              maxHeight: 180,
              overflowY: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {activePreview.copy}
          </pre>
        </div>
      )}
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
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,168,76,0.22)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
    >
      {/* Article image */}
      {drop.imageUrl && <ImageBanner url={drop.imageUrl} category={drop.category} />}

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
      {shareOpen && <SharePanel drop={drop} />}
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
              overflow: 'hidden',
            }}
          >
            {/* Image skeleton */}
            <div style={{ height: 150, background: 'rgba(255,255,255,0.04)', animation: 'newsPulse 1.4s ease-in-out infinite' }} />
            {/* Text skeleton */}
            <div style={{ padding: '18px 18px 20px' }}>
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
          The Future Of Finance is Frictionless
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
