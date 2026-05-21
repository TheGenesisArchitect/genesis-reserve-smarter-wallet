'use client'

import { useState, useMemo, useEffect } from 'react'

// ── Brand tokens ──────────────────────────────────────────────────────────────
const GOLD = '#c9a84c'
const TEXT = '#f5f0e8'
const MUTED = 'rgba(245,240,232,0.45)'
const LINE = 'rgba(255,255,255,0.07)'
const SURFACE = 'rgba(255,255,255,0.025)'
const TEAL = '#00D4AA'
const PURPLE = '#9B6DFF'

// ── Product definitions ───────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: 'term' as const,
    name: 'Term Life',
    phase: 'Phase 1',
    phaseLabel: 'COMING SOON',
    phaseColor: TEAL,
    eta: 'Q3 2026',
    tagline: 'Maximum coverage. Zero out-of-pocket.',
    description:
      'Pure death benefit protection. Your yield funds 100% of your monthly premium — your family stays protected without touching your principal.',
    features: [
      'No medical exam up to $1 million',
      'Terms: 10, 15, 20, or 30 years',
      'Level premium locked at approval',
      'API underwriting — decision in minutes',
      'Yield auto-pays the premium monthly',
    ],
    color: TEAL,
    costPerThousandMonthly: 0.095,
  },
  {
    id: 'iul' as const,
    name: 'Indexed Universal Life',
    phase: 'Phase 2',
    phaseLabel: 'PHASE 2',
    phaseColor: GOLD,
    eta: 'Q1 2027',
    tagline: 'Tax-advantaged growth + lifelong protection.',
    description:
      'Your cash value grows indexed to the S&P 500 with a 0% floor — you capture market upside while yield covers your base premium.',
    features: [
      'Cash value grows tax-deferred',
      'S&P 500 indexed: 0% floor · ~10% cap',
      'Tax-free policy loans (your own bank)',
      'Death benefit + living benefit riders',
      'Surplus yield builds cash value faster',
    ],
    color: GOLD,
    costPerThousandMonthly: 0.22,
  },
  {
    id: 'whole' as const,
    name: 'Whole Life',
    phase: 'Phase 3',
    phaseLabel: 'PHASE 3',
    phaseColor: PURPLE,
    eta: 'Q3 2027',
    tagline: 'The infinite banking engine.',
    description:
      'Guaranteed cash value growth + annual dividends. Borrow against your policy to fund investments and pay yourself back — the wealth multiplier loop.',
    features: [
      'Guaranteed 4–5% cash value growth',
      'Annual dividends (unbroken 100+ yr track record)',
      'Infinite banking — borrow, invest, repay',
      'Tax-free wealth transfer & estate planning',
      'Dividends compound alongside wallet yield',
    ],
    color: PURPLE,
    costPerThousandMonthly: 0.52,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(n: number, decimals = 0) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%'
}

function CoverageBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${clamped}%`,
        background: `linear-gradient(90deg, ${color}99, ${color})`,
        borderRadius: 4,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function PhaseBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      color, background: `${color}18`, border: `1px solid ${color}40`,
      borderRadius: 4, padding: '3px 8px',
      fontFamily: "'Tenor Sans', sans-serif",
    }}>{label}</span>
  )
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      flex: 1, padding: '18px 20px', borderRadius: 14,
      background: SURFACE, border: `1px solid ${LINE}`,
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', color: MUTED, textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, color: color ?? TEXT, lineHeight: 1, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: "'Tenor Sans', sans-serif" }}>{sub}</div>}
    </div>
  )
}

// ── Projection chart ──────────────────────────────────────────────────────────
function ProjectionBars({ monthlyContrib, growthRate, color }: { monthlyContrib: number; growthRate: number; color: string }) {
  const years = [1, 3, 5, 10, 20]
  const values = years.map(y => {
    const months = y * 12
    const total = monthlyContrib * ((Math.pow(1 + growthRate / 12, months) - 1) / (growthRate / 12))
    return Math.round(total)
  })
  const max = values[values.length - 1] || 1

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', color: MUTED, textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", marginBottom: 14 }}>
        Projected Cash Value Growth
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100 }}>
        {years.map((y, i) => {
          const h = Math.max(6, Math.round((values[i] / max) * 100))
          return (
            <div key={y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 10, color: color, fontFamily: "'Tenor Sans', sans-serif", whiteSpace: 'nowrap' }}>
                {values[i] >= 1000 ? `$${(values[i] / 1000).toFixed(0)}k` : `$${values[i]}`}
              </div>
              <div style={{
                width: '100%', height: h,
                background: `linear-gradient(180deg, ${color}, ${color}55)`,
                borderRadius: '4px 4px 2px 2px',
                transition: 'height 0.4s ease',
              }} />
              <div style={{ fontSize: 10, color: MUTED, fontFamily: "'Tenor Sans', sans-serif" }}>yr {y}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function InsurancePage({ accountId: _accountId }: { accountId?: string }) {
  const [isMobile, setIsMobile] = useState(false)
  const [selectedId, setSelectedId] = useState<'term' | 'iul' | 'whole'>('term')
  const [coverageK, setCoverageK] = useState(500)          // in thousands
  const [allocationPct, setAllocationPct] = useState(25)   // % of yield to insurance
  const [walletBalanceK, setWalletBalanceK] = useState(50) // demo wallet in thousands
  const [apyPct, setApyPct] = useState(8.5)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const product = PRODUCTS.find(p => p.id === selectedId)!
  const coverageAmount = coverageK * 1000
  const walletBalance = walletBalanceK * 1000

  const calcs = useMemo(() => {
    const monthlyYield = (walletBalance * (apyPct / 100)) / 12
    const allocationDollars = monthlyYield * (allocationPct / 100)
    const monthlyPremium = (coverageAmount / 1000) * product.costPerThousandMonthly
    const yieldCoveragePct = Math.min(100, (allocationDollars / monthlyPremium) * 100)
    const outOfPocket = Math.max(0, monthlyPremium - allocationDollars)
    const annualSavings = Math.min(allocationDollars, monthlyPremium) * 12
    return { monthlyYield, allocationDollars, monthlyPremium, yieldCoveragePct, outOfPocket, annualSavings }
  }, [walletBalance, apyPct, allocationPct, coverageAmount, product])

  const growthRate = selectedId === 'iul' ? 0.065 : selectedId === 'whole' ? 0.045 : 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 80px', color: TEXT, fontFamily: "'Tenor Sans', sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase',
            border: `1px solid ${GOLD}35`, borderRadius: 4, padding: '3px 10px',
            fontFamily: "'Tenor Sans', sans-serif",
          }}>
            Protection Engine
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', color: MUTED, textTransform: 'uppercase' }}>
            Phase 2 &amp; 3 Preview
          </div>
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 32 : 48, fontWeight: 300, letterSpacing: '-0.02em', color: TEXT, margin: '0 0 10px', lineHeight: 1.05 }}>
          Yield-Funded Protection
        </h1>
        <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.7, maxWidth: 560, margin: 0 }}>
          The Smarter Wallet doesn&apos;t just grow your wealth — it protects it. A portion of your daily yield automatically funds a life insurance policy. Your family stays covered at zero out-of-pocket cost.
        </p>
      </div>

      {/* ── Product selector tabs ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
        {PRODUCTS.map(p => {
          const active = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              style={{
                textAlign: 'left', padding: '20px 20px 18px', borderRadius: 16,
                background: active ? `${p.color}10` : SURFACE,
                border: `1px solid ${active ? p.color + '50' : LINE}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: active ? `0 0 28px ${p.color}15` : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 15, color: active ? p.color : TEXT, fontFamily: "'Cormorant Garamond', serif", fontWeight: 300 }}>
                  {p.name}
                </div>
                <PhaseBadge label={p.phaseLabel} color={p.color} />
              </div>
              <div style={{ fontSize: 11, color: active ? `${p.color}cc` : MUTED, lineHeight: 1.5 }}>
                {p.tagline}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: MUTED, letterSpacing: '0.08em' }}>
                ETA {p.eta}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Two-column: detail + calculator ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 28 }}>

        {/* Product detail */}
        <div style={{ padding: '26px 24px', borderRadius: 18, background: SURFACE, border: `1px solid ${product.color}30` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, color: product.color }}>
              {product.name}
            </div>
            <PhaseBadge label={product.phaseLabel} color={product.color} />
          </div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>{product.description}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {product.features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: `${product.color}18`, border: `1px solid ${product.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={product.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive calculator */}
        <div style={{ padding: '26px 24px', borderRadius: 18, background: SURFACE, border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 11, letterSpacing: '0.16em', color: GOLD, textTransform: 'uppercase', marginBottom: 18 }}>
            Yield Coverage Calculator
          </div>

          {/* Wallet balance input */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Wallet Balance
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={5} max={500} step={5}
                value={walletBalanceK}
                onChange={e => setWalletBalanceK(Number(e.target.value))}
                style={{ flex: 1, accentColor: GOLD }}
              />
              <span style={{ fontSize: 14, color: TEXT, minWidth: 62, textAlign: 'right', fontFamily: "'Cormorant Garamond', serif" }}>
                {fmt$(walletBalanceK * 1000)}
              </span>
            </div>
          </label>

          {/* APY */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Blended APY
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={3} max={15} step={0.5}
                value={apyPct}
                onChange={e => setApyPct(Number(e.target.value))}
                style={{ flex: 1, accentColor: GOLD }}
              />
              <span style={{ fontSize: 14, color: GOLD, minWidth: 44, textAlign: 'right', fontFamily: "'Cormorant Garamond', serif" }}>
                {fmtPct(apyPct)}
              </span>
            </div>
          </label>

          {/* Coverage amount */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Coverage Amount
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={100} max={2000} step={50}
                value={coverageK}
                onChange={e => setCoverageK(Number(e.target.value))}
                style={{ flex: 1, accentColor: product.color }}
              />
              <span style={{ fontSize: 14, color: TEXT, minWidth: 62, textAlign: 'right', fontFamily: "'Cormorant Garamond', serif" }}>
                {fmt$(coverageK * 1000)}
              </span>
            </div>
          </label>

          {/* Yield allocation */}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Yield Allocated to Insurance
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={5} max={50} step={5}
                value={allocationPct}
                onChange={e => setAllocationPct(Number(e.target.value))}
                style={{ flex: 1, accentColor: product.color }}
              />
              <span style={{ fontSize: 14, color: product.color, minWidth: 44, textAlign: 'right', fontFamily: "'Cormorant Garamond', serif" }}>
                {allocationPct}%
              </span>
            </div>
          </label>

          {/* Coverage meter */}
          <div style={{ padding: '16px 0', borderTop: `1px solid ${LINE}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Yield Coverage</span>
              <span style={{ fontSize: 13, color: calcs.yieldCoveragePct >= 100 ? TEAL : product.color, fontFamily: "'Cormorant Garamond', serif" }}>
                {calcs.yieldCoveragePct >= 100 ? '100% — Fully Funded' : fmtPct(calcs.yieldCoveragePct)}
              </span>
            </div>
            <CoverageBar pct={calcs.yieldCoveragePct} color={calcs.yieldCoveragePct >= 100 ? TEAL : product.color} />
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        <StatBox
          label="Monthly Yield"
          value={fmt$(calcs.monthlyYield, 0)}
          sub={`at ${fmtPct(apyPct)} APY`}
          color={GOLD}
        />
        <StatBox
          label="Allocated to Premium"
          value={fmt$(calcs.allocationDollars, 0) + '/mo'}
          sub={`${allocationPct}% of yield`}
          color={product.color}
        />
        <StatBox
          label="Est. Monthly Premium"
          value={fmt$(calcs.monthlyPremium, 0) + '/mo'}
          sub={product.name + ' · ' + fmt$(coverageK * 1000) + ' coverage'}
        />
        <StatBox
          label="Out-of-Pocket"
          value={calcs.outOfPocket < 0.5 ? '$0' : fmt$(calcs.outOfPocket, 0) + '/mo'}
          sub={calcs.outOfPocket < 0.5 ? 'Fully yield-funded ✓' : 'Top-up needed'}
          color={calcs.outOfPocket < 0.5 ? TEAL : TEXT}
        />
      </div>

      {/* ── Cash value projection (IUL / Whole Life) ────────────────────── */}
      {selectedId !== 'term' && (
        <div style={{ padding: '26px 28px', borderRadius: 18, background: SURFACE, border: `1px solid ${product.color}25`, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 24 : 32 }}>
            <ProjectionBars
              monthlyContrib={calcs.allocationDollars}
              growthRate={growthRate}
              color={product.color}
            />
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.16em', color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>
                Wealth Building Summary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Monthly premium contribution', value: fmt$(calcs.allocationDollars, 0) },
                  { label: 'Annual premium funded by yield', value: fmt$(calcs.allocationDollars * 12, 0) },
                  { label: selectedId === 'iul' ? 'Target annual growth rate' : 'Guaranteed growth rate', value: selectedId === 'iul' ? '6.5% avg (indexed)' : '4.5% guaranteed' },
                  { label: '10-year projected cash value', value: fmt$(calcs.allocationDollars * 12 * 10 * (selectedId === 'iul' ? 1.72 : 1.52), 0) },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: `1px solid ${LINE}` }}>
                    <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
                    <span style={{ fontSize: 13, color: product.color, fontFamily: "'Cormorant Garamond', serif" }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── How it works ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 18 }}>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
          {[
            { n: '01', title: 'Wallet Earns', body: 'Your stablecoin deposits earn yield across vetted DeFi strategies — compounding daily.' },
            { n: '02', title: 'Yield Routes', body: `${allocationPct}% of your daily yield flows automatically into your Insurance Premium Reserve.` },
            { n: '03', title: 'Premium Pays', body: 'The Reserve auto-pays your carrier monthly. No manual transfers. No missed payments.' },
            { n: '04', title: 'Wealth Builds', body: 'For IUL & Whole Life, cash value accumulates tax-deferred alongside your wallet balance.' },
          ].map(step => (
            <div key={step.n} style={{ padding: '20px 18px', borderRadius: 14, background: SURFACE, border: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 22, fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, color: GOLD, marginBottom: 8 }}>{step.n}</div>
              <div style={{ fontSize: 13, color: TEXT, marginBottom: 6 }}>{step.title}</div>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>{step.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Phase roadmap ────────────────────────────────────────────────── */}
      <div style={{ padding: '28px', borderRadius: 18, background: SURFACE, border: `1px solid ${LINE}`, marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 18 }}>
          Production Rollout Roadmap
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { phase: 'Phase 1', label: 'Term Life Insurance', partner: 'Ethos · Bestow · Ladder Life', eta: 'Q3 2026', color: TEAL, detail: 'API-first underwriting, no-exam up to $1M, yield auto-pays premium' },
            { phase: 'Phase 2', label: 'Indexed Universal Life (IUL)', partner: 'Carrier partnership TBD', eta: 'Q1 2027', color: GOLD, detail: 'Cash value dashboard, policy loan feature, S&P indexed growth tracker' },
            { phase: 'Phase 3', label: 'Whole Life / Infinite Banking', partner: 'Mutual carrier partnership', eta: 'Q3 2027', color: PURPLE, detail: 'Dividend tracking, policy loan marketplace, estate planning tools' },
          ].map(r => (
            <div key={r.phase} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px', borderRadius: 12, background: `${r.color}08`, border: `1px solid ${r.color}25` }}>
              <PhaseBadge label={r.phase} color={r.color} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: TEXT }}>{r.label}</span>
                  <span style={{ fontSize: 11, color: r.color, fontFamily: "'Tenor Sans', sans-serif" }}>{r.eta}</span>
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>{r.partner}</div>
                <div style={{ fontSize: 11, color: `${r.color}99` }}>{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Waitlist CTA ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '32px 36px', borderRadius: 20,
        background: `linear-gradient(135deg, ${GOLD}10, rgba(255,255,255,0.02))`,
        border: `1px solid ${GOLD}30`,
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: TEXT, marginBottom: 8 }}>
          The Future of the Smarter Wallet
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' }}>
          Be first to access yield-funded life insurance when Phase 1 launches. Join the waitlist and we&apos;ll notify you the moment it&apos;s live.
        </div>
        {waitlistJoined ? (
          <div style={{ fontSize: 13, color: TEAL, letterSpacing: '0.06em' }}>
            ✓ &nbsp;You&apos;re on the list. We&apos;ll reach out before Phase 1 launches.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="your@email.com"
              value={waitlistEmail}
              onChange={e => setWaitlistEmail(e.target.value)}
              style={{
                padding: '12px 18px', borderRadius: 12, width: 260,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${LINE}`,
                color: TEXT, fontSize: 13,
                fontFamily: "'Tenor Sans', sans-serif",
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => { if (waitlistEmail.includes('@')) setWaitlistJoined(true) }}
              style={{
                padding: '12px 28px', borderRadius: 12,
                background: GOLD, color: '#1a1200',
                border: 'none', cursor: 'pointer',
                fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
                fontFamily: "'Tenor Sans', sans-serif",
                fontWeight: 700,
              }}
            >
              Join Waitlist
            </button>
          </div>
        )}
        <div style={{ marginTop: 16, fontSize: 10, color: MUTED, letterSpacing: '0.08em' }}>
          This is a virtual demonstration. Insurance products subject to state licensing and carrier approval.
        </div>
      </div>

    </div>
  )
}
