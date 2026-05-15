'use client'

import { useState, useMemo, useCallback } from 'react'
import { CODEX_CONCEPTS } from '@/lib/codex/concepts'
import { CODEX_PROTOCOLS } from '@/lib/codex/protocols'
import { CODEX_CHAINS, type CodexChainEntry } from '@/lib/codex/chains'
import type { CodexConceptEntry, CodexProtocolEntry } from '@/lib/codex/types'
import { CodexPanel } from './CodexPanel'
import { YieldTypeBadge } from './YieldTypeBadge'
import { useCodexProgress } from '@/hooks/useCodexProgress'

// ── Constants ─────────────────────────────────────────────────────────────────

const LEARNING_PATHS = [
  {
    key: 'foundation',
    label: 'Foundation',
    subtitle: 'New to DeFi — start here',
    accent: '#00D4AA',
    keys: ['stablecoins', 'smart-contracts', 'apy-vs-apr', 'risk-tiers', 'gas-fees'],
  },
  {
    key: 'yield-mechanics',
    label: 'Yield Mechanics',
    subtitle: 'How returns are generated',
    accent: '#C9A84C',
    keys: ['compounding', 'organic-vs-incentive-yield', 'liquidity-windows', 'collateralization', 'protocol-tvl'],
  },
  {
    key: 'advanced',
    label: 'Advanced Strategies',
    subtitle: 'Complex yield mechanics',
    accent: '#9B6DFF',
    keys: ['delta-neutral', 'funding-rates', 'impermanent-loss', 'erc-4626', 'epoch-harvesting'],
  },
]

const TIER_ORDER = ['preserve', 'grow', 'accelerate'] as const
const TIER_META = {
  preserve: { label: 'Preserve', color: '#00D4AA', bg: 'rgba(0,212,170,0.07)', border: 'rgba(0,212,170,0.20)' },
  grow:     { label: 'Grow',     color: '#C9A84C', bg: 'rgba(201,168,76,0.07)', border: 'rgba(201,168,76,0.20)' },
  accelerate: { label: 'Accelerate', color: '#9B6DFF', bg: 'rgba(155,109,255,0.07)', border: 'rgba(155,109,255,0.20)' },
}

type TabKey = 'concepts' | 'protocols' | 'chains'

// ── Shared tokens ─────────────────────────────────────────────────────────────
const F = {
  tenor: "'Tenor Sans', sans-serif" as const,
  cormorant: "'Cormorant Garamond', serif" as const,
}

// ── Concept Card ──────────────────────────────────────────────────────────────
function ConceptCard({
  entry, isRead, onRead,
}: { entry: CodexConceptEntry; isRead: boolean; onRead: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      background: isRead ? 'rgba(0,212,170,0.04)' : 'rgba(255,255,255,0.018)',
      border: `1px solid ${isRead ? 'rgba(0,212,170,0.22)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 12,
      padding: '16px',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#f5f0e8', fontFamily: F.cormorant, lineHeight: 1.2, marginBottom: 6 }}>
            {entry.term}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.65)', lineHeight: 1.55, fontFamily: F.cormorant }}>
            {entry.simple}
          </div>
        </div>
        {isRead && (
          <span style={{ fontSize: 9, color: '#00D4AA', fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, marginTop: 2 }}>
            ✓ Read
          </span>
        )}
      </div>

      {/* Expand */}
      <button
        type="button"
        onClick={() => {
          setOpen(p => !p)
          if (!isRead) onRead()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          marginTop: 12,
          background: 'none',
          border: 'none',
          color: '#00D4AA',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontFamily: F.tenor,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {open ? 'Close' : 'Go Deeper'}
        <span style={{ fontSize: 8, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', animation: 'codexIn 0.2s ease' }}>
          <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 4 }}>Detail</div>
          <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.85)', lineHeight: 1.6, fontFamily: F.cormorant, marginBottom: 14 }}>{entry.detail}</div>

          {entry.analogy && (
            <>
              <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 4 }}>Analogy</div>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(0,212,170,0.05)', border: '1px solid rgba(0,212,170,0.18)', borderLeft: '3px solid #00D4AA',
                fontSize: 13, color: 'rgba(245,240,232,0.82)', lineHeight: 1.6, fontFamily: F.cormorant, marginBottom: 14,
              }}>{entry.analogy}</div>
            </>
          )}

          {entry.relatedKeys && entry.relatedKeys.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 6 }}>Related Concepts</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entry.relatedKeys.map(k => {
                  const related = CODEX_CONCEPTS.find(c => c.key === k)
                  if (!related) return null
                  return (
                    <span key={k} style={{
                      padding: '2px 8px', borderRadius: 20,
                      background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.22)',
                      fontSize: 10, color: '#9B6DFF', fontFamily: F.tenor, letterSpacing: '0.04em',
                    }}>
                      {related.term}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Protocol Card (wraps CodexPanel) ─────────────────────────────────────────
function ProtocolCard({ entry, isRead, onRead }: { entry: CodexProtocolEntry; isRead: boolean; onRead: () => void }) {
  const [open, setOpen] = useState(false)
  const tier = TIER_META[entry.tier as keyof typeof TIER_META]

  return (
    <div style={{
      background: isRead ? 'rgba(0,212,170,0.04)' : 'rgba(255,255,255,0.018)',
      border: `1px solid ${isRead ? 'rgba(0,212,170,0.22)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Tier stripe */}
      <div style={{ height: 2, background: tier?.color ?? '#00D4AA' }} />

      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#f5f0e8', fontFamily: F.cormorant }}>{entry.displayName}</span>
            <span style={{
              padding: '1px 7px', borderRadius: 4,
              background: tier?.bg, border: `1px solid ${tier?.border}`,
              fontSize: 9, color: tier?.color, fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{tier?.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isRead && <span style={{ fontSize: 9, color: '#00D4AA', fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>✓ Read</span>}
            <YieldTypeBadge type={entry.yieldType} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.60)', fontFamily: F.tenor, marginBottom: 12 }}>
          {entry.plainRiskLabel}
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(p => !p)
            if (!isRead) onRead()
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', color: '#00D4AA',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            fontFamily: F.tenor, cursor: 'pointer', padding: 0,
          }}
        >
          {open ? 'Close' : 'Learn More'}
          <span style={{ fontSize: 8, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>
      </div>

      {open && (
        <div style={{ padding: '0 16px 16px', animation: 'codexIn 0.2s ease' }}>
          <CodexPanel entry={entry} fullWidth />
        </div>
      )}
    </div>
  )
}

// ── Chain Card ────────────────────────────────────────────────────────────────
function ChainCard({ entry, isRead, onRead }: { entry: CodexChainEntry; isRead: boolean; onRead: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      background: isRead ? 'rgba(0,212,170,0.04)' : 'rgba(255,255,255,0.018)',
      border: `1px solid ${isRead ? 'rgba(0,212,170,0.22)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 12, padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f5f0e8', fontFamily: F.cormorant }}>{entry.displayName}</div>
        {isRead && <span style={{ fontSize: 9, color: '#00D4AA', fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>✓ Read</span>}
      </div>
      <div style={{ fontSize: 12, color: '#C9A84C', fontFamily: F.tenor, marginBottom: 8, letterSpacing: '0.02em' }}>{entry.tagline}</div>
      <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.62)', lineHeight: 1.55, fontFamily: F.cormorant }}>
        {entry.yieldContext.slice(0, 120)}...
      </div>

      <button
        type="button"
        onClick={() => {
          setOpen(p => !p)
          if (!isRead) onRead()
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 12,
          background: 'none', border: 'none', color: '#00D4AA',
          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          fontFamily: F.tenor, cursor: 'pointer', padding: 0,
        }}
      >
        {open ? 'Close' : 'Chain Intelligence'}
        <span style={{ fontSize: 8, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', animation: 'codexIn 0.2s ease' }}>
          {[
            { label: 'Why Yield Is Compelling Here', text: entry.yieldContext },
            { label: 'What Genesis Unlocks', text: entry.genesisNote },
            { label: 'Risk Profile', text: entry.riskNote },
          ].map(({ label, text }) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.75)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: F.tenor, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.85)', lineHeight: 1.6, fontFamily: F.cormorant }}>{text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Hub ──────────────────────────────────────────────────────────────────
export function CodexAcademyHub() {
  const [activeTab, setActiveTab] = useState<TabKey>('concepts')
  const [searchQuery, setSearchQuery] = useState('')
  const [pathsOpen, setPathsOpen] = useState(true)
  const { isRead, markRead, readKeys } = useCodexProgress()

  const concepts = useMemo(() => Object.values(CODEX_CONCEPTS), [])
  const protocols = useMemo(() => Object.values(CODEX_PROTOCOLS), [])
  const chains = useMemo(() => Object.values(CODEX_CHAINS), [])

  const q = searchQuery.toLowerCase().trim()

  const filteredConcepts = useMemo(() =>
    q ? concepts.filter(c => c.term.toLowerCase().includes(q) || c.simple.toLowerCase().includes(q)) : concepts,
    [concepts, q]
  )

  const filteredProtocols = useMemo(() =>
    q ? protocols.filter(p => p.displayName.toLowerCase().includes(q) || p.whatIsIt.toLowerCase().includes(q)) : protocols,
    [protocols, q]
  )

  const filteredChains = useMemo(() =>
    q ? chains.filter(c => c.displayName.toLowerCase().includes(q) || c.tagline.toLowerCase().includes(q)) : chains,
    [chains, q]
  )

  const totalEntries = concepts.length + protocols.length + chains.length
  const totalRead = readKeys.size
  const pct = totalEntries > 0 ? Math.round((totalRead / totalEntries) * 100) : 0

  const protocolsByTier = useMemo(() => {
    const grouped: Record<string, CodexProtocolEntry[]> = {}
    for (const tier of TIER_ORDER) grouped[tier] = []
    for (const p of filteredProtocols) {
      if (grouped[p.tier]) grouped[p.tier].push(p)
    }
    return grouped
  }, [filteredProtocols])

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'concepts', label: 'Concepts', count: filteredConcepts.length },
    { key: 'protocols', label: 'Protocols', count: filteredProtocols.length },
    { key: 'chains', label: 'Chains', count: filteredChains.length },
  ]

  return (
    <div style={{ padding: '20px 20px 48px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ color: '#00D4AA', fontSize: 14 }}>◈</span>
          <span style={{ fontSize: 11, color: '#00D4AA', fontFamily: F.tenor, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
            Codex Academy
          </span>
        </div>
        <div style={{ fontSize: 28, color: '#f5f0e8', fontFamily: F.cormorant, fontWeight: 300, lineHeight: 1.2, marginBottom: 8 }}>
          Institutional-grade education.<br />
          <span style={{ color: '#C9A84C' }}>Your edge as an investor.</span>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.45)', fontFamily: F.tenor, letterSpacing: '0.06em' }}>
              {totalRead} of {totalEntries} entries mastered
            </span>
            <span style={{ fontSize: 10, color: pct >= 80 ? '#1ABF6A' : pct >= 40 ? '#C9A84C' : '#00D4AA', fontFamily: F.tenor, fontWeight: 700 }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: pct >= 80 ? '#1ABF6A' : pct >= 40 ? '#C9A84C' : '#00D4AA',
              width: `${pct}%`, transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {[
              { label: 'Concepts', total: concepts.length, read: concepts.filter(c => isRead(c.key)).length },
              { label: 'Protocols', total: protocols.length, read: protocols.filter(p => isRead(p.key)).length },
              { label: 'Chains', total: chains.length, read: chains.filter(c => isRead(c.key)).length },
            ].map(({ label, total, read }) => (
              <span key={label} style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', fontFamily: F.tenor }}>
                {label}: {read}/{total}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(245,240,232,0.30)', fontSize: 13 }}>
          ⌕
        </span>
        <input
          type="text"
          placeholder="Search concepts, protocols, chains..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px 10px 34px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            color: '#f5f0e8',
            fontSize: 13,
            fontFamily: F.tenor,
            outline: 'none',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'rgba(245,240,232,0.35)',
              cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
            }}
          >×</button>
        )}
      </div>

      {/* Learning Paths (hidden when searching) */}
      {!q && (
        <div style={{ marginBottom: 20, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setPathsOpen(p => !p)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', background: 'rgba(255,255,255,0.02)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: '#C9A84C', fontFamily: F.tenor, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>
                Learning Paths
              </div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.40)', fontFamily: F.tenor }}>
                Structured curriculum — {pathsOpen ? 'tap to collapse' : 'tap to expand'}
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'rgba(245,240,232,0.30)', transform: pathsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {pathsOpen && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {LEARNING_PATHS.map(path => {
                const pathReadCount = path.keys.filter(k => isRead(k)).length
                const done = pathReadCount === path.keys.length
                return (
                  <div
                    key={path.key}
                    style={{
                      flex: '1 1 220px',
                      padding: '14px',
                      borderRadius: 10,
                      border: `1px solid ${done ? 'rgba(26,191,106,0.30)' : `rgba(${path.accent === '#00D4AA' ? '0,212,170' : path.accent === '#C9A84C' ? '201,168,76' : '155,109,255'},0.22)`}`,
                      background: done ? 'rgba(26,191,106,0.05)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: done ? '#1ABF6A' : path.accent, fontFamily: F.tenor, letterSpacing: '0.04em' }}>
                        {path.label}
                      </span>
                      <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.40)', fontFamily: F.tenor }}>
                        {pathReadCount}/{path.keys.length}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', fontFamily: F.tenor, marginBottom: 10 }}>
                      {path.subtitle}
                    </div>
                    <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: done ? '#1ABF6A' : path.accent, width: `${(pathReadCount / path.keys.length) * 100}%`, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                      {path.keys.map(k => {
                        const concept = CODEX_CONCEPTS.find(c => c.key === k)
                        if (!concept) return null
                        return (
                          <span key={k} style={{
                            padding: '2px 7px', borderRadius: 20,
                            background: isRead(k) ? 'rgba(0,212,170,0.12)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isRead(k) ? 'rgba(0,212,170,0.30)' : 'rgba(255,255,255,0.08)'}`,
                            fontSize: 9, color: isRead(k) ? '#00D4AA' : 'rgba(245,240,232,0.40)',
                            fontFamily: F.tenor, letterSpacing: '0.03em',
                          }}>
                            {concept.term}
                          </span>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('concepts')
                        setSearchQuery(path.keys[0] ? (CODEX_CONCEPTS.find(c => c.key === path.keys[0])?.term ?? '') : '')
                      }}
                      style={{
                        marginTop: 12, width: '100%', padding: '7px',
                        background: 'none', border: `1px solid ${done ? 'rgba(26,191,106,0.30)' : 'rgba(255,255,255,0.10)'}`,
                        borderRadius: 8, color: done ? '#1ABF6A' : path.accent,
                        fontSize: 10, fontFamily: F.tenor, letterSpacing: '0.06em', textTransform: 'uppercase',
                        cursor: 'pointer', fontWeight: 600,
                      }}
                    >
                      {done ? '✓ Complete' : pathReadCount === 0 ? 'Start Path →' : 'Continue →'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '8px 4px',
              background: activeTab === tab.key ? 'rgba(0,212,170,0.12)' : 'none',
              border: activeTab === tab.key ? '1px solid rgba(0,212,170,0.25)' : '1px solid transparent',
              borderRadius: 8, cursor: 'pointer',
              color: activeTab === tab.key ? '#00D4AA' : 'rgba(245,240,232,0.45)',
              fontSize: 11, fontFamily: F.tenor, fontWeight: activeTab === tab.key ? 700 : 400,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
            <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.6 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Concepts Tab */}
      {activeTab === 'concepts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filteredConcepts.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'rgba(245,240,232,0.30)', fontFamily: F.tenor, fontSize: 12 }}>
              No concepts match "{searchQuery}"
            </div>
          )}
          {filteredConcepts.map(entry => (
            <ConceptCard
              key={entry.key}
              entry={entry}
              isRead={isRead(entry.key)}
              onRead={() => markRead(entry.key)}
            />
          ))}
        </div>
      )}

      {/* Protocols Tab */}
      {activeTab === 'protocols' && (
        <div>
          {filteredProtocols.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(245,240,232,0.30)', fontFamily: F.tenor, fontSize: 12 }}>
              No protocols match "{searchQuery}"
            </div>
          )}
          {TIER_ORDER.map(tier => {
            const items = protocolsByTier[tier] ?? []
            if (items.length === 0) return null
            const meta = TIER_META[tier]
            return (
              <div key={tier} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 3, height: 16, borderRadius: 2, background: meta.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: meta.color, fontFamily: F.tenor, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700 }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.30)', fontFamily: F.tenor }}>{items.length} protocols</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {items.map(entry => (
                    <ProtocolCard
                      key={entry.key}
                      entry={entry}
                      isRead={isRead(entry.key)}
                      onRead={() => markRead(entry.key)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Chains Tab */}
      {activeTab === 'chains' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filteredChains.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'rgba(245,240,232,0.30)', fontFamily: F.tenor, fontSize: 12 }}>
              No chains match "{searchQuery}"
            </div>
          )}
          {filteredChains.map(entry => (
            <ChainCard
              key={entry.key}
              entry={entry}
              isRead={isRead(entry.key)}
              onRead={() => markRead(entry.key)}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes codexIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: rgba(245,240,232,0.25); }
      `}</style>
    </div>
  )
}
