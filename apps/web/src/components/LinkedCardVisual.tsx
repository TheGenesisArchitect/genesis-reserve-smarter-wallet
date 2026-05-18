'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LinkedCardVisual — renders a user's linked external debit/credit card
// with issuer-branded colors, network logo, and texture pattern.
//
// Phase 1: color/pattern database for top-40 US issuers + network fallbacks.
// Phase 2: swap `bgGradient` for actual card art URL from Visa/MC card art API.
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkedCardMeta {
  cardholderName: string
  last4: string
  expiry: string
  brand: string         // raw from Stripe: 'Visa' | 'Mastercard' | 'American Express' | 'Discover' | 'UnionPay'
  funding?: string      // 'debit' | 'credit' | 'prepaid'
  issuerName?: string   // e.g. 'Capital One' — set after bank selection
  frozen?: boolean
}

export type CardNetworkType = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown'

export function normalizeNetwork(brand: string): CardNetworkType {
  const b = brand.toLowerCase()
  if (b.includes('visa')) return 'visa'
  if (b.includes('mastercard') || b.includes('master card')) return 'mastercard'
  if (b.includes('amex') || b.includes('american express')) return 'amex'
  if (b.includes('discover')) return 'discover'
  return 'unknown'
}

// ── Issuer theme database ─────────────────────────────────────────────────────
type PatternType = 'wave' | 'arc' | 'dots' | 'grid' | 'none'

type IssuerTheme = {
  displayName: string
  bgGradient: string
  accentColor: string
  patternType: PatternType
  // Phase 2: cardArtUrl?: string
}

const ISSUER_THEMES: Record<string, IssuerTheme> = {
  'cash app': {
    displayName: 'Cash App',
    bgGradient: 'linear-gradient(155deg, #0D0D0D 0%, #1A1A1A 100%)',
    accentColor: '#00D632',
    patternType: 'none',
  },
  'capital one': {
    displayName: 'Capital One',
    bgGradient: 'linear-gradient(155deg, #1B4F8A 0%, #0E3060 50%, #1A4B85 100%)',
    accentColor: '#BA232A',
    patternType: 'wave',
  },
  'navy federal': {
    displayName: 'Navy Federal',
    bgGradient: 'linear-gradient(155deg, #CC1020 0%, #A00015 50%, #C81020 100%)',
    accentColor: '#003087',
    patternType: 'arc',
  },
  'navy federal credit union': {
    displayName: 'Navy Federal',
    bgGradient: 'linear-gradient(155deg, #CC1020 0%, #A00015 50%, #C81020 100%)',
    accentColor: '#003087',
    patternType: 'arc',
  },
  'chase': {
    displayName: 'Chase',
    bgGradient: 'linear-gradient(155deg, #117ACA 0%, #0A5E9E 50%, #0F72C0 100%)',
    accentColor: '#FFFFFF',
    patternType: 'grid',
  },
  'jpmorgan chase': {
    displayName: 'Chase',
    bgGradient: 'linear-gradient(155deg, #117ACA 0%, #0A5E9E 50%, #0F72C0 100%)',
    accentColor: '#FFFFFF',
    patternType: 'grid',
  },
  'bank of america': {
    displayName: 'Bank of America',
    bgGradient: 'linear-gradient(155deg, #E31837 0%, #B01028 50%, #CC1530 100%)',
    accentColor: '#012169',
    patternType: 'wave',
  },
  'wells fargo': {
    displayName: 'Wells Fargo',
    bgGradient: 'linear-gradient(155deg, #CC0000 0%, #A00000 50%, #C00000 100%)',
    accentColor: '#FFD700',
    patternType: 'arc',
  },
  'citibank': {
    displayName: 'Citi',
    bgGradient: 'linear-gradient(155deg, #003B6F 0%, #00295A 50%, #003570 100%)',
    accentColor: '#E31837',
    patternType: 'wave',
  },
  'citi': {
    displayName: 'Citi',
    bgGradient: 'linear-gradient(155deg, #003B6F 0%, #00295A 50%, #003570 100%)',
    accentColor: '#E31837',
    patternType: 'wave',
  },
  'us bank': {
    displayName: 'U.S. Bank',
    bgGradient: 'linear-gradient(155deg, #0063A5 0%, #004E84 50%, #005E9A 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  'pnc': {
    displayName: 'PNC',
    bgGradient: 'linear-gradient(155deg, #E05A00 0%, #C04A00 50%, #D55500 100%)',
    accentColor: '#003087',
    patternType: 'none',
  },
  'td bank': {
    displayName: 'TD Bank',
    bgGradient: 'linear-gradient(155deg, #2F8B00 0%, #226A00 50%, #2B8000 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  'ally': {
    displayName: 'Ally Bank',
    bgGradient: 'linear-gradient(155deg, #6B2D8B 0%, #521F6E 50%, #632880 100%)',
    accentColor: '#FFFFFF',
    patternType: 'wave',
  },
  'ally bank': {
    displayName: 'Ally Bank',
    bgGradient: 'linear-gradient(155deg, #6B2D8B 0%, #521F6E 50%, #632880 100%)',
    accentColor: '#FFFFFF',
    patternType: 'wave',
  },
  'chime': {
    displayName: 'Chime',
    bgGradient: 'linear-gradient(155deg, #1EC677 0%, #15A060 50%, #1AC070 100%)',
    accentColor: '#FFFFFF',
    patternType: 'dots',
  },
  'current': {
    displayName: 'Current',
    bgGradient: 'linear-gradient(155deg, #5E1DEB 0%, #4814BB 50%, #5819E0 100%)',
    accentColor: '#FFFFFF',
    patternType: 'wave',
  },
  'sofi': {
    displayName: 'SoFi',
    bgGradient: 'linear-gradient(155deg, #2D59CC 0%, #2045A8 50%, #2A52C5 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  'venmo': {
    displayName: 'Venmo',
    bgGradient: 'linear-gradient(155deg, #3D95CE 0%, #2C7AAB 50%, #3890C5 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  'paypal': {
    displayName: 'PayPal',
    bgGradient: 'linear-gradient(155deg, #003087 0%, #001F5E 50%, #002C80 100%)',
    accentColor: '#009CDE',
    patternType: 'none',
  },
  'discover': {
    displayName: 'Discover',
    bgGradient: 'linear-gradient(155deg, #F76F20 0%, #D85A10 50%, #EF6818 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  'american express': {
    displayName: 'American Express',
    bgGradient: 'linear-gradient(155deg, #016FD0 0%, #0058AA 50%, #0068C8 100%)',
    accentColor: '#FFFFFF',
    patternType: 'grid',
  },
  'usaa': {
    displayName: 'USAA',
    bgGradient: 'linear-gradient(155deg, #003087 0%, #001F60 50%, #002B80 100%)',
    accentColor: '#C9A84C',
    patternType: 'none',
  },
  'fifth third': {
    displayName: 'Fifth Third',
    bgGradient: 'linear-gradient(155deg, #003A5C 0%, #002440 50%, #003358 100%)',
    accentColor: '#6AC043',
    patternType: 'none',
  },
  'regions': {
    displayName: 'Regions',
    bgGradient: 'linear-gradient(155deg, #005B38 0%, #003D25 50%, #005530 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  'truist': {
    displayName: 'Truist',
    bgGradient: 'linear-gradient(155deg, #4D2F91 0%, #3A1E70 50%, #472A88 100%)',
    accentColor: '#FFFFFF',
    patternType: 'wave',
  },
}

// Network-only fallbacks
const NETWORK_FALLBACKS: Record<CardNetworkType, IssuerTheme> = {
  visa: {
    displayName: '',
    bgGradient: 'linear-gradient(155deg, #1A2B7A 0%, #0D1A5E 50%, #182877 100%)',
    accentColor: '#F7A600',
    patternType: 'wave',
  },
  mastercard: {
    displayName: '',
    bgGradient: 'linear-gradient(155deg, #1C1C1C 0%, #0A0A0A 50%, #181818 100%)',
    accentColor: '#EB001B',
    patternType: 'none',
  },
  amex: {
    displayName: '',
    bgGradient: 'linear-gradient(155deg, #016FD0 0%, #0058AA 50%, #0068C8 100%)',
    accentColor: '#FFFFFF',
    patternType: 'grid',
  },
  discover: {
    displayName: '',
    bgGradient: 'linear-gradient(155deg, #F76F20 0%, #D85A10 50%, #EF6818 100%)',
    accentColor: '#FFFFFF',
    patternType: 'none',
  },
  unknown: {
    displayName: '',
    bgGradient: 'linear-gradient(155deg, #1a1a22 0%, #0e0e14 50%, #181820 100%)',
    accentColor: '#C9A84C',
    patternType: 'none',
  },
}

export function resolveIssuerTheme(issuerName?: string, brand?: string): IssuerTheme {
  if (issuerName) {
    const key = issuerName.toLowerCase().trim()
    if (ISSUER_THEMES[key]) return ISSUER_THEMES[key]
    for (const [k, theme] of Object.entries(ISSUER_THEMES)) {
      if (key.includes(k) || k.includes(key.split(' ')[0])) return theme
    }
  }
  return NETWORK_FALLBACKS[normalizeNetwork(brand ?? '')]
}

// ── SVG texture patterns ──────────────────────────────────────────────────────

function WavePattern() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 312 192" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 9 }, (_, i) => {
        const y = 15 + i * 20
        return (
          <path
            key={i}
            d={`M-60 ${y} Q18 ${y - 12} 96 ${y} Q174 ${y + 12} 252 ${y} Q330 ${y - 12} 380 ${y}`}
            stroke="white" strokeOpacity={0.09 - i * 0.006} strokeWidth={1} fill="none"
          />
        )
      })}
    </svg>
  )
}

function ArcPattern() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 312 192" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 5 }, (_, i) => (
        <circle key={i} cx={156} cy={230 + i * 28} r={120 + i * 48}
          stroke="white" strokeOpacity={0.09 - i * 0.012} strokeWidth={1.2} fill="none" />
      ))}
    </svg>
  )
}

function DotsPattern() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 312 192" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 15 }, (_, col) => (
          <circle key={`${row}-${col}`} cx={col * 22 + 7} cy={row * 25 + 9} r={1.4}
            fill="white" fillOpacity={0.13} />
        ))
      )}
    </svg>
  )
}

function GridPattern() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 312 192" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 21} x2={312} y2={i * 21} stroke="white" strokeOpacity={0.055} strokeWidth={0.8} />
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <line key={`v${i}`} x1={i * 26} y1={0} x2={i * 26} y2={192} stroke="white" strokeOpacity={0.055} strokeWidth={0.8} />
      ))}
    </svg>
  )
}

// ── Network logos ─────────────────────────────────────────────────────────────

function MastercardLogo({ scale }: { scale: number }) {
  const s = 38 * scale
  return (
    <svg width={s} height={s * 0.62} viewBox="0 0 38 24">
      <circle cx="14" cy="12" r="12" fill="#EB001B" />
      <circle cx="24" cy="12" r="12" fill="#F79E1B" />
      <path d="M19 4.6A12 12 0 0 1 23.4 12 12 12 0 0 1 19 19.4 12 12 0 0 1 14.6 12 12 12 0 0 1 19 4.6z" fill="#FF5F00" />
    </svg>
  )
}

function VisaLogo({ scale }: { scale: number }) {
  return (
    <div style={{ fontFamily: "'Times New Roman', serif", fontStyle: 'italic', fontSize: 19 * scale, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>
      VISA
    </div>
  )
}

function AmexLogo({ scale }: { scale: number }) {
  return (
    <div style={{ fontFamily: "'Arial Narrow', Arial, sans-serif", fontSize: 7 * scale, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em', textAlign: 'right', lineHeight: 1.3 }}>
      AMERICAN<br />EXPRESS
    </div>
  )
}

function DiscoverLogo({ scale }: { scale: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 * scale }}>
      <span style={{ fontFamily: "'Arial', sans-serif", fontSize: 10 * scale, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.02em' }}>DISCOVER</span>
      <div style={{ width: 10 * scale, height: 10 * scale, borderRadius: '50%', background: '#F76F20' }} />
    </div>
  )
}

function NetworkLogo({ network, scale }: { network: CardNetworkType; scale: number }) {
  if (network === 'mastercard') return <MastercardLogo scale={scale} />
  if (network === 'visa') return <VisaLogo scale={scale} />
  if (network === 'amex') return <AmexLogo scale={scale} />
  if (network === 'discover') return <DiscoverLogo scale={scale} />
  return null
}

// ── Main component ────────────────────────────────────────────────────────────

export function LinkedCardVisual({
  card,
  width = 312,
  height = 192,
}: {
  card: LinkedCardMeta
  width?: number
  height?: number
}) {
  const scale = width / 312
  const network = normalizeNetwork(card.brand)
  const theme = resolveIssuerTheme(card.issuerName, card.brand)
  const fundingLabel = (card.funding ?? 'debit').toUpperCase()
  const issuerDisplay = theme.displayName || card.issuerName || ''

  return (
    <div style={{
      width, height, borderRadius: 20 * scale,
      background: theme.bgGradient,
      border: '1px solid rgba(255,255,255,0.14)',
      position: 'relative',
      boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 28px 72px rgba(0,0,0,0.85)',
      overflow: 'hidden',
      opacity: card.frozen ? 0.38 : 1,
      filter: card.frozen ? 'grayscale(1)' : 'none',
      transition: 'opacity 0.3s, filter 0.3s',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: `${14 * scale}px ${16 * scale}px`,
    }}>
      {/* Texture overlay */}
      {theme.patternType === 'wave' && <WavePattern />}
      {theme.patternType === 'arc' && <ArcPattern />}
      {theme.patternType === 'dots' && <DotsPattern />}
      {theme.patternType === 'grid' && <GridPattern />}

      {/* Top shimmer */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }} />

      {/* Row 1: funding label + issuer name */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 8 * scale, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}>
          {fundingLabel}
        </div>
        {issuerDisplay && (
          <div style={{ fontSize: 10 * scale, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.92)', fontWeight: 600, textAlign: 'right', maxWidth: '58%', fontFamily: "'Tenor Sans', sans-serif", lineHeight: 1.2 }}>
            {issuerDisplay}
          </div>
        )}
      </div>

      {/* Row 2: chip */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1, paddingTop: 4 * scale }}>
        <div style={{
          width: 28 * scale, height: 22 * scale,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.38), rgba(255,255,255,0.10))',
          borderRadius: 4 * scale, border: '1px solid rgba(255,255,255,0.22)',
        }} />
      </div>

      {/* Row 3: cardholder + last4 + network */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
        <div>
          <div style={{ fontSize: 8 * scale, color: 'rgba(255,255,255,0.48)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif", marginBottom: 3 * scale }}>
            {card.cardholderName.toUpperCase().slice(0, 22)}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 13 * scale, color: 'rgba(255,255,255,0.92)', letterSpacing: '0.10em', fontWeight: 600 }}>
            ••{card.last4}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 * scale }}>
          <NetworkLogo network={network} scale={scale} />
        </div>
      </div>

      {/* Frozen state overlay */}
      {card.frozen && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <div style={{ fontSize: 11 * scale, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontFamily: "'Tenor Sans', sans-serif" }}>
            FROZEN
          </div>
        </div>
      )}
    </div>
  )
}

// ── Issuer picker data ────────────────────────────────────────────────────────
// Exported for the "Which bank issued this card?" selector in LinkDebitCardPanel.

export const POPULAR_ISSUERS: Array<{ key: string; displayName: string; previewColor: string }> = [
  { key: 'cash app',             displayName: 'Cash App',        previewColor: '#1A1A1A' },
  { key: 'capital one',          displayName: 'Capital One',     previewColor: '#1B4F8A' },
  { key: 'navy federal',         displayName: 'Navy Federal',    previewColor: '#CC1020' },
  { key: 'chase',                displayName: 'Chase',           previewColor: '#117ACA' },
  { key: 'bank of america',      displayName: 'Bank of America', previewColor: '#E31837' },
  { key: 'wells fargo',          displayName: 'Wells Fargo',     previewColor: '#CC0000' },
  { key: 'citibank',             displayName: 'Citi',            previewColor: '#003B6F' },
  { key: 'us bank',              displayName: 'U.S. Bank',       previewColor: '#0063A5' },
  { key: 'truist',               displayName: 'Truist',          previewColor: '#4D2F91' },
  { key: 'pnc',                  displayName: 'PNC',             previewColor: '#E05A00' },
  { key: 'td bank',              displayName: 'TD Bank',         previewColor: '#2F8B00' },
  { key: 'usaa',                 displayName: 'USAA',            previewColor: '#003087' },
  { key: 'ally',                 displayName: 'Ally Bank',       previewColor: '#6B2D8B' },
  { key: 'chime',                displayName: 'Chime',           previewColor: '#1EC677' },
  { key: 'current',              displayName: 'Current',         previewColor: '#5E1DEB' },
  { key: 'sofi',                 displayName: 'SoFi',            previewColor: '#2D59CC' },
  { key: 'venmo',                displayName: 'Venmo',           previewColor: '#3D95CE' },
  { key: 'discover',             displayName: 'Discover',        previewColor: '#F76F20' },
  { key: 'american express',     displayName: 'American Express',previewColor: '#016FD0' },
  { key: 'fifth third',          displayName: 'Fifth Third',     previewColor: '#003A5C' },
  { key: 'regions',              displayName: 'Regions',         previewColor: '#005B38' },
]
