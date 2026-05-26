// ─────────────────────────────────────────────────────────────────────────────
// Codex Academy — Type Definitions
//
// Three depth levels per entry, always opt-in:
//   L1  Plain-language label + yield-type badge  (always visible, zero taps)
//   L2  What / How / Risk / Liquidity            (one tap — CodexChip expand)
//   L3  Deep-dive: origin, worked example, risk  (Go Deeper → drill-down card)
// ─────────────────────────────────────────────────────────────────────────────

export type YieldTypeBadge =
  | 'lending-rate'
  | 'savings-rate'
  | 'tbill-yield'
  | 'fixed-rate'
  | 'funding-rate'
  | 'institutional'
  | 'leveraged-yield'

export type CodexTier = 'preserve' | 'grow' | 'accelerate'

export interface CodexProtocolEntry {
  /** Lowercase key matching the protocol key in liveProtocols.ts and deframe.ts */
  key: string
  displayName: string
  tier: CodexTier

  // ── L1 — always rendered, requires no interaction ────────────────────────
  yieldType: YieldTypeBadge
  /** e.g. "Safe · withdraw anytime"  */
  plainRiskLabel: string

  // ── L2 — expands on CodexChip tap ────────────────────────────────────────
  /** 2 sentences, zero jargon */
  whatIsIt: string
  /** 2 sentences + concrete analogy */
  howItEarns: string
  /** 2 sentences, real scenario — not abstract rating */
  realRisk: string
  /** 1 sentence about liquidity window in plain terms */
  liquidityNote: string

  // ── L3 — Go Deeper / CodexDeepDive section ───────────────────────────────
  /** Protocol origin, team track record, key audits */
  originStory: string
  /** "$1,000 at X% = $Y/month because..." — concrete, personal */
  workedExample: string
  /** 2-3 "What happens if..." scenarios */
  riskScenarios: string[]
  /** Context for the current APY number (historical range) */
  historicalContext: string
  /** Plain-language breakdown of organic vs incentive yield component */
  stabilityNote: string

  // ── L3 KPI data — powers visual dashboard ────────────────────────────────
  /** Historical APY range and current rate (all values as %) */
  apyRange?: { low: number; mid: number; high: number; current: number }
  /** 12-month APY history for sparkline chart */
  apyHistory?: Array<{ label: string; apy: number }>
  /** Total Value Locked in billions USD */
  tvlUsdBn?: number
  /** Safety scores per risk dimension — 10 = maximum safety */
  riskScores?: {
    smartContract: number
    liquidity: number
    oracle: number
    governance: number
    market: number
  }
  /** Breakdown of yield by source */
  yieldComponents?: Array<{ label: string; pct: number; organic: boolean }>
  /** Security audit firms */
  auditFirms?: string[]
  /** Keys of comparable protocols for the peer comparison table */
  peerKeys?: string[]
  /** Year protocol launched */
  launchYear?: number
  /** DefiLlama protocol slug for the external due-diligence link */
  defiLlamaSlug?: string
}

export interface CodexConceptEntry {
  key: string
  term: string
  /** One-line plain-English definition */
  simple: string
  /** 2-3 sentence deeper explanation */
  detail: string
  /** Optional real-world analogy */
  analogy?: string
  /** Related concept keys */
  relatedKeys?: string[]
}

export interface YieldTypeMeta {
  label: string
  color: string
  bg: string
  border: string
  description: string
}
