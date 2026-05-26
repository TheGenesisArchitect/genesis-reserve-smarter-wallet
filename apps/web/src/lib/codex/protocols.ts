// ─────────────────────────────────────────────────────────────────────────────
// Codex Academy — Protocol Library
//
// 14 entries covering every protocol in the Genesis yield universe.
// Content written at three depth levels so the UI can progressively reveal
// more information as the user's curiosity grows.
//
// Preserve  — Aave, Compound, Spark, Sky, Ondo
// Grow      — Pendle, Morpho, Resolv, Maple, Fluid, Notional, Term Finance
// Accelerate — Ethena, Gearbox
// ─────────────────────────────────────────────────────────────────────────────

import type { CodexProtocolEntry } from './types'

export const CODEX_PROTOCOLS: Record<string, CodexProtocolEntry> = {

  // ── PRESERVE ──────────────────────────────────────────────────────────────

  aave: {
    key: 'aave',
    displayName: 'Aave',
    tier: 'preserve',
    yieldType: 'lending-rate',
    plainRiskLabel: 'Safe · withdraw anytime',

    whatIsIt:
      'Aave is a digital lending bank where you earn interest by depositing your USDC for others to borrow. Think of it like a high-yield savings account — except the interest updates every few seconds based on real demand.',
    howItEarns:
      'Borrowers must put up more collateral than they borrow — so if they can\'t repay, your funds are protected by liquidating their collateral first. Every dollar of interest they pay flows directly to you.',
    realRisk:
      'When fewer people want to borrow, rates drop — but you can always withdraw instantly and move to a better opportunity. Smart contract risk exists, though Aave has managed over $15 billion since 2020 without a major exploit.',
    liquidityNote:
      'Instant — withdraw any amount, any time, settled in the same block.',

    originStory:
      'Aave launched in 2020 as the evolution of ETHLend, the first peer-to-peer crypto lending platform. Founded by Stani Kulechov, it pioneered the concept of "flash loans" and became the dominant DeFi money market. It has been audited by Trail of Bits, OpenZeppelin, and Certora — the most rigorous firms in the space.',
    workedExample:
      '$1,000 deposited at 5.2% APY earns approximately $4.33/month, or $52/year. Because Aave compounds in real time, your interest starts earning interest immediately — no monthly settlement.',
    riskScenarios: [
      'If borrowing demand falls (e.g., during a crypto bear market), rates can drop to 1-2%. Your capital is safe — just earning less. You can withdraw and redeploy with no penalty.',
      'If a smart contract bug were discovered, Aave\'s Safety Module ($500M+ in reserves) is designed to cover shortfalls. This has never been needed in Aave V3\'s history.',
      'If USDC were to depeg significantly, your position\'s dollar value would shift — though USDC has maintained its peg through multiple market crises.',
    ],
    historicalContext:
      'Aave USDC APY has ranged from 1.5% (low demand, 2023 bear) to 12%+ (high leverage demand, 2021 bull). Current rates in the 4-7% range reflect normalized post-rate-hike conditions.',
    stabilityNote:
      'Aave\'s yield is nearly 100% organic — it comes directly from borrower interest, not token incentives. This makes it one of the most stable and predictable yields in DeFi. What you see today is close to what you\'ll earn tomorrow.',

    apyRange: { low: 1.5, mid: 4.8, high: 12.0, current: 5.4 },
    apyHistory: [
      { label: 'Jun', apy: 5.8 }, { label: 'Jul', apy: 4.9 }, { label: 'Aug', apy: 4.2 },
      { label: 'Sep', apy: 4.8 }, { label: 'Oct', apy: 6.5 }, { label: 'Nov', apy: 7.2 },
      { label: 'Dec', apy: 5.9 }, { label: 'Jan', apy: 5.1 }, { label: 'Feb', apy: 4.7 },
      { label: 'Mar', apy: 5.3 }, { label: 'Apr', apy: 5.8 }, { label: 'May', apy: 5.4 },
    ],
    tvlUsdBn: 15.2,
    riskScores: { smartContract: 9, liquidity: 10, oracle: 8, governance: 8, market: 7 },
    yieldComponents: [{ label: 'Borrower Interest', pct: 100, organic: true }],
    auditFirms: ['Trail of Bits', 'OpenZeppelin', 'Certora'],
    peerKeys: ['compound', 'spark', 'morpho'],
    launchYear: 2020,
    defiLlamaSlug: 'aave-v3',
  },

  compound: {
    key: 'compound',
    displayName: 'Compound V3',
    tier: 'preserve',
    yieldType: 'lending-rate',
    plainRiskLabel: 'Safe · withdraw anytime',

    whatIsIt:
      'Compound is one of the original DeFi lending protocols, running since 2018. You deposit USDC, borrowers pay interest to use it, and you earn that interest automatically — no action required on your part.',
    howItEarns:
      'Compound V3 (Comet) is the most conservative version yet — it only accepts a handful of high-quality assets as collateral, which reduces the chance of bad debt. Your yield comes purely from real borrower demand.',
    realRisk:
      'Compound\'s conservatism means rates are sometimes lower than more aggressive protocols, but your principal is better protected. The protocol has $3B+ in TVL across chains and has operated through every major market cycle.',
    liquidityNote:
      'Instant — same-block withdrawal, no queues, no lock-up periods.',

    originStory:
      'Compound was founded by Robert Leshner and launched in 2018, pioneering the concept of algorithmically determined interest rates. It introduced COMP governance tokens in 2020, triggering the "DeFi Summer." Compound V3 (2022) was a complete redesign focused on safety over yield maximization.',
    workedExample:
      '$1,000 deposited at 5.6% APY earns $4.67/month. Compound accrues interest block-by-block, meaning your balance ticks up every ~12 seconds on Ethereum and every ~0.25 seconds on Arbitrum.',
    riskScenarios: [
      'If utilization falls below 80%, interest rates drop along the supply curve — sometimes to 2-3%. Simply withdraw and move capital to a higher-yielding Grow strategy.',
      'Compound V2 experienced a bug in 2021 that led to $80M in excess COMP distribution (not a loss of user funds). V3 was redesigned specifically to prevent these governance/code edge cases.',
      'COMP token incentives can supplement base yield but also mask the true organic rate. Check whether incentives are included in the displayed APY.',
    ],
    historicalContext:
      'Compound USDC has ranged from 2% to 14%+ depending on market conditions. Current 5-6% rates represent the normalized post-Fed-rate-hike era where risk-free rates provide a natural floor.',
    stabilityNote:
      'Compound V3 yields are largely organic. Some chains supplement with COMP rewards — these are disclosed in the protocol and tend to be relatively stable but can change via governance vote.',

    apyRange: { low: 2.0, mid: 5.2, high: 14.0, current: 5.6 },
    apyHistory: [
      { label: 'Jun', apy: 6.0 }, { label: 'Jul', apy: 5.1 }, { label: 'Aug', apy: 4.5 },
      { label: 'Sep', apy: 5.0 }, { label: 'Oct', apy: 6.8 }, { label: 'Nov', apy: 7.5 },
      { label: 'Dec', apy: 6.2 }, { label: 'Jan', apy: 5.4 }, { label: 'Feb', apy: 5.0 },
      { label: 'Mar', apy: 5.6 }, { label: 'Apr', apy: 6.1 }, { label: 'May', apy: 5.6 },
    ],
    tvlUsdBn: 3.1,
    riskScores: { smartContract: 9, liquidity: 10, oracle: 8, governance: 8, market: 7 },
    yieldComponents: [
      { label: 'Borrower Interest', pct: 85, organic: true },
      { label: 'COMP Rewards', pct: 15, organic: false },
    ],
    auditFirms: ['OpenZeppelin', 'Trail of Bits', 'Gauntlet'],
    peerKeys: ['aave', 'spark'],
    launchYear: 2018,
    defiLlamaSlug: 'compound-v3',
  },

  spark: {
    key: 'spark',
    displayName: 'Spark',
    tier: 'preserve',
    yieldType: 'savings-rate',
    plainRiskLabel: 'Safest option · MakerDAO backed',

    whatIsIt:
      'Spark is the lending arm of MakerDAO — the 7-year-old protocol that created DAI, one of the most trusted stablecoins in crypto. Depositing here converts your USDC to USDS and earns the Sky Savings Rate, which tracks real-world interest rates.',
    howItEarns:
      'Your yield comes from MakerDAO\'s massive collateral engine — real-world assets including US Treasuries, ETH, and other stablecoins. It\'s essentially a DeFi version of earning the Federal Funds Rate, updated daily by governance.',
    realRisk:
      'MakerDAO is the most battle-tested protocol in DeFi — over 7 years of operation, $5B+ TVL, and no major user fund losses. The main risk is regulatory: MakerDAO holds real-world assets that could be affected by future regulations.',
    liquidityNote:
      'Instant — Spark positions can be unwound in the same block.',

    originStory:
      'Spark Protocol launched in 2023 as MakerDAO\'s official lending frontend. It sits on the same foundation as the $5B MakerDAO protocol, which has processed over $30B in DAI since 2017. The Sky Savings Rate was designed to be a credibly neutral, governance-determined baseline yield for DeFi.',
    workedExample:
      '$1,000 deposited at 5.0% APY earns $4.17/month. The Sky Savings Rate adjusts weekly via MakerDAO governance, so your rate evolves slowly — not volatile like pure market-demand protocols.',
    riskScenarios: [
      'If the Federal Reserve cuts rates, the Sky Savings Rate follows — it is designed to track real-world risk-free rates. A 1% Fed cut would likely lead to ~1% lower Spark yields.',
      'If MakerDAO were to face regulatory pressure on its real-world asset portfolio, the SSR could be reduced or paused by governance. This would give users time to withdraw.',
      'USDS (the underlying stablecoin) has maintained its $1 peg through all market conditions since launch. MakerDAO\'s over-collateralization model is designed to absorb extreme volatility.',
    ],
    historicalContext:
      'The Sky Savings Rate has ranged from 1% (2021 low-rate environment) to 8%+ (2023 post-Fed-hike peak). Current 4.5-5% rates reflect the global interest rate environment.',
    stabilityNote:
      'Spark yield is almost entirely organic — set by governance to reflect real-world rates, not token incentives. This makes it the most predictable yield in the Preserve tier. What you see today reflects actual market conditions, not a promotional rate.',

    apyRange: { low: 1.0, mid: 4.5, high: 8.5, current: 5.0 },
    apyHistory: [
      { label: 'Jun', apy: 5.0 }, { label: 'Jul', apy: 5.0 }, { label: 'Aug', apy: 4.5 },
      { label: 'Sep', apy: 4.5 }, { label: 'Oct', apy: 5.0 }, { label: 'Nov', apy: 5.5 },
      { label: 'Dec', apy: 5.5 }, { label: 'Jan', apy: 5.0 }, { label: 'Feb', apy: 4.5 },
      { label: 'Mar', apy: 4.5 }, { label: 'Apr', apy: 5.0 }, { label: 'May', apy: 5.0 },
    ],
    tvlUsdBn: 4.8,
    riskScores: { smartContract: 9, liquidity: 10, oracle: 7, governance: 8, market: 8 },
    yieldComponents: [{ label: 'Sky Savings Rate', pct: 100, organic: true }],
    auditFirms: ['OpenZeppelin', 'ChainSecurity', 'Trail of Bits'],
    peerKeys: ['sky', 'aave', 'ondo'],
    launchYear: 2023,
    defiLlamaSlug: 'spark',
  },

  sky: {
    key: 'sky',
    displayName: 'Sky',
    tier: 'preserve',
    yieldType: 'savings-rate',
    plainRiskLabel: 'Safest option · MakerDAO ecosystem',

    whatIsIt:
      'Sky is the evolved MakerDAO savings product — formerly known as the DAI Savings Rate (DSR). You deposit USDS (or DAI) and earn the Sky Savings Rate (SSR), a governance-set yield tied to real-world interest rates.',
    howItEarns:
      'MakerDAO\'s protocol generates revenue from fees charged to DAI/USDS borrowers and from returns on real-world assets (US Treasuries, etc.). That revenue is distributed to USDS savers as the Sky Savings Rate.',
    realRisk:
      'Sky shares the same backing as Spark — the $5B+ MakerDAO system. The primary risk is a governance decision to reduce the SSR, or regulatory pressure on MakerDAO\'s real-world asset strategy. Neither has affected user funds in 7 years.',
    liquidityNote:
      'Instant — deposit and withdraw in the same transaction.',

    originStory:
      'The DAI Savings Rate launched in 2019 and became the benchmark "risk-free rate" of DeFi — the rate all other protocols price against. The rebrand to Sky in 2024 introduced USDS and expanded the protocol\'s real-world asset strategy. Sky now manages over $3B in savings.',
    workedExample:
      '$1,000 in Sky USDS at 4.75% earns $3.96/month. Your USDS balance grows in your wallet automatically — no staking transaction needed, interest accrues the moment you deposit.',
    riskScenarios: [
      'Rate cuts: The SSR follows Fed Funds Rate directionally. If rates normalize to 2-3%, expect similar yields here.',
      'USDS peg: USDS is backed by over-collateralized assets. During the 2022 Luna crash, DAI maintained its peg when many other stablecoins failed.',
      'Regulatory: MakerDAO holds US Treasuries through regulated funds. If new laws restrict this, MakerDAO would need to restructure — a slow process users would have time to respond to.',
    ],
    historicalContext:
      'Sky SSR has ranged from 1% to 8% since 2019. It is set by governance vote, not market forces, which means changes are announced in advance and move gradually.',
    stabilityNote:
      'Sky yield is 100% organic — no token incentives involved. It is the most transparent yield in DeFi: you can verify the current rate on-chain at any time and it changes only via public governance vote.',

    apyRange: { low: 1.0, mid: 4.5, high: 8.0, current: 4.75 },
    apyHistory: [
      { label: 'Jun', apy: 5.0 }, { label: 'Jul', apy: 5.0 }, { label: 'Aug', apy: 4.5 },
      { label: 'Sep', apy: 4.5 }, { label: 'Oct', apy: 5.0 }, { label: 'Nov', apy: 5.5 },
      { label: 'Dec', apy: 5.5 }, { label: 'Jan', apy: 4.75 }, { label: 'Feb', apy: 4.5 },
      { label: 'Mar', apy: 4.5 }, { label: 'Apr', apy: 4.75 }, { label: 'May', apy: 4.75 },
    ],
    tvlUsdBn: 3.2,
    riskScores: { smartContract: 9, liquidity: 10, oracle: 7, governance: 8, market: 8 },
    yieldComponents: [{ label: 'Sky Savings Rate', pct: 100, organic: true }],
    auditFirms: ['Trail of Bits', 'OpenZeppelin', 'Runtime Verification'],
    peerKeys: ['spark', 'ondo'],
    launchYear: 2019,
    defiLlamaSlug: 'sky',
  },

  ondo: {
    key: 'ondo',
    displayName: 'Ondo Finance',
    tier: 'preserve',
    yieldType: 'tbill-yield',
    plainRiskLabel: 'T-Bill safe · 2-3 day redemption',

    whatIsIt:
      'Ondo Finance puts US Treasury Bills on the blockchain. When you hold OUSG or USDY, your money is invested in actual short-term US government debt — the same instrument used by central banks and the world\'s largest institutions.',
    howItEarns:
      'The US Treasury pays interest to borrow money for 1-3 months at a time. Ondo pools depositor funds, buys those T-bills through a regulated fund, and passes the yield directly to token holders. It\'s the most direct connection between DeFi and real-world government yield.',
    realRisk:
      'The underlying instrument (US T-bills) has zero historical default risk — it is backed by the full faith and credit of the United States government. The DeFi risk is Ondo\'s smart contracts and fund management — both are regulated and audited.',
    liquidityNote:
      'Scheduled — T-bill redemptions take 2-3 business days. Plan to hold for at least a week.',

    originStory:
      'Ondo Finance launched in 2022, founded by former Goldman Sachs bankers. It became the first DeFi protocol to offer direct access to regulated US Treasury products. OUSG is held in a BlackRock-managed fund. Ondo is SEC-registered and KYC required for US persons.',
    workedExample:
      '$1,000 in Ondo OUSG at 5.1% APY earns $4.25/month. Unlike lending protocols, the yield is fixed by the current T-bill rate — it doesn\'t fluctuate with crypto market demand. Your rate changes only when the Federal Reserve changes rates.',
    riskScenarios: [
      'Fed rate cuts: If the Fed cuts rates to 2%, your yield would decline to approximately 2%. This is predictable, not sudden.',
      'Redemption timing: If you need funds within 24 hours, Ondo is not the right choice. The T-bill settlement cycle is a feature, not a bug — it\'s why the yield is so clean.',
      'Regulatory risk: Ondo operates in a regulated environment. A major regulatory shift could affect operations, though the underlying assets (T-bills) would be unaffected.',
    ],
    historicalContext:
      'T-bill yields have ranged from 0.05% (2021 zero-rate era) to 5.5% (2024 peak). Current ~5% rates represent a historically elevated period likely to moderate as rates normalize.',
    stabilityNote:
      'Ondo yield is 100% real-world organic — no DeFi incentives, no token rewards, no protocol fees beyond management. The APY shown is the actual T-bill yield minus Ondo\'s ~0.15% management fee.',

    apyRange: { low: 0.05, mid: 3.5, high: 5.5, current: 5.1 },
    apyHistory: [
      { label: 'Jun', apy: 5.2 }, { label: 'Jul', apy: 5.2 }, { label: 'Aug', apy: 5.1 },
      { label: 'Sep', apy: 5.0 }, { label: 'Oct', apy: 4.8 }, { label: 'Nov', apy: 4.6 },
      { label: 'Dec', apy: 4.5 }, { label: 'Jan', apy: 4.4 }, { label: 'Feb', apy: 4.3 },
      { label: 'Mar', apy: 4.2 }, { label: 'Apr', apy: 4.1 }, { label: 'May', apy: 5.1 },
    ],
    tvlUsdBn: 0.8,
    riskScores: { smartContract: 8, liquidity: 6, oracle: 9, governance: 10, market: 9 },
    yieldComponents: [{ label: 'T-Bill Yield', pct: 100, organic: true }],
    auditFirms: ['Certora', 'Sherlock', 'OpenZeppelin'],
    peerKeys: ['spark', 'sky'],
    launchYear: 2022,
    defiLlamaSlug: 'ondo-finance',
  },

  // ── GROW ──────────────────────────────────────────────────────────────────

  pendle: {
    key: 'pendle',
    displayName: 'Pendle',
    tier: 'grow',
    yieldType: 'fixed-rate',
    plainRiskLabel: 'Medium risk · fixed yield to maturity',

    whatIsIt:
      'Pendle splits yield-bearing assets into two tradeable parts: the principal token (PT, returned at maturity) and the yield token (YT, which captures the yield). When you buy a PT, you\'re locking in today\'s high yield as a guaranteed fixed rate — like buying a bond.',
    howItEarns:
      'If sUSDe is currently yielding 14%, Pendle lets you lock that 14% in for 90 days. Even if rates crash to 5% next week, you still earn 14% because you bought the yield upfront at a discount. The fixed rate is determined by market supply and demand.',
    realRisk:
      'Your PT tokens are locked until the maturity date. You can sell early on Pendle\'s secondary market, but the price varies with interest rate movements. Smart contract risk exists — though Pendle has managed $4B+ in TVL with no major exploits since 2021.',
    liquidityNote:
      'Scheduled — funds are locked until the maturity date shown. Early exit is possible via PT secondary market but price may vary.',

    originStory:
      'Pendle was founded in 2020 by TN Lee and launched on mainnet in 2021. It pioneered yield tokenization in DeFi — separating the concept of "ownership" from "yield rights." By 2024 it had grown to $7B+ TVL as fixed-rate demand surged. Audited by Ackee, Trail of Bits, and multiple others.',
    workedExample:
      '$1,000 deployed into Pendle PT-sUSDe at 14.2% for 90 days earns approximately $35.50 at maturity. The yield is fixed the moment you enter — if rates spike to 20% next week, you still earn exactly 14.2%. Certainty has value.',
    riskScenarios: [
      'Maturity lock: You cannot access your principal until the PT expires. If you need funds urgently, you can sell your PT on the secondary market but may receive slightly less than face value.',
      'Rate environment: If DeFi rates crash before your maturity, you\'re earning above-market rates — a good outcome. If rates spike, your locked rate looks less attractive but you still earn what you agreed to.',
      'Smart contract: Pendle\'s code is battle-tested but complex. A bug in the AMM could affect PT pricing. The principal itself is held in the underlying protocol (e.g., Ethena), not Pendle.',
    ],
    historicalContext:
      'Pendle PT-sUSDe APY has ranged from 7% to 25%+ depending on Ethena funding rates and market demand for fixed yield. Current rates reflect elevated crypto funding conditions.',
    stabilityNote:
      'Pendle PT yield is entirely fixed once you enter — it cannot change during your holding period. This is the ultimate stability: not variable like lending rates, not incentive-dependent, just a fixed return you agreed to upfront.',

    apyRange: { low: 7.0, mid: 14.0, high: 28.0, current: 14.2 },
    apyHistory: [
      { label: 'Jun', apy: 12.0 }, { label: 'Jul', apy: 18.5 }, { label: 'Aug', apy: 9.5 },
      { label: 'Sep', apy: 11.2 }, { label: 'Oct', apy: 22.0 }, { label: 'Nov', apy: 28.0 },
      { label: 'Dec', apy: 16.5 }, { label: 'Jan', apy: 14.2 }, { label: 'Feb', apy: 11.8 },
      { label: 'Mar', apy: 15.5 }, { label: 'Apr', apy: 19.2 }, { label: 'May', apy: 14.2 },
    ],
    tvlUsdBn: 6.5,
    riskScores: { smartContract: 7, liquidity: 6, oracle: 8, governance: 9, market: 6 },
    yieldComponents: [{ label: 'Fixed Yield Lock-in', pct: 100, organic: true }],
    auditFirms: ['Trail of Bits', 'Ackee', 'Spearbit'],
    peerKeys: ['notional', 'term'],
    launchYear: 2021,
    defiLlamaSlug: 'pendle',
  },

  morpho: {
    key: 'morpho',
    displayName: 'Morpho',
    tier: 'grow',
    yieldType: 'lending-rate',
    plainRiskLabel: 'Medium risk · actively curated vaults',

    whatIsIt:
      'Morpho is a lending optimizer with curated vaults managed by professional risk teams like Gauntlet and Steakhouse Financial. Think of it as Aave, but with an active portfolio manager routing your funds to the highest-yield pools within safety limits.',
    howItEarns:
      'Your USDC is deployed into whichever borrower pool offers the best rate that meets the curator\'s risk criteria. Gauntlet\'s algorithms monitor utilization, collateral quality, and liquidity 24/7. When a better opportunity appears, they rebalance — automatically.',
    realRisk:
      'You\'re trusting both Morpho\'s smart contracts AND the curator\'s risk judgment. Gauntlet and Steakhouse have strong track records managing $1B+ each. The tradeoff for higher yield is a short queue (hours) when withdrawing instead of instant.',
    liquidityNote:
      'Same-day — withdrawals typically settle within a few hours as liquidity is managed across pools.',

    originStory:
      'Morpho was founded in 2021 by Paul Frambot and launched its curated vault system (Morpho Blue) in 2023. It reimagined DeFi lending by separating the base protocol from risk management — allowing specialized teams to compete as "curators." By 2025 it managed $5B+ in TVL across Ethereum and Base.',
    workedExample:
      '$1,000 in Morpho Gauntlet USDC vault at 9.4% earns $7.83/month. The Gauntlet team actively optimizes this — your rate is typically 2-4% higher than plain Aave because the same dollar is put to work more efficiently.',
    riskScenarios: [
      'Curator risk: If the Gauntlet team makes a poor allocation decision, returns could drop or, in extreme cases, a position could face bad debt. Gauntlet has insurance and has maintained a clean track record.',
      'Withdrawal queue: During high-stress market events, withdrawal queues can extend from hours to 1-2 days as the curator manages liquidity. Plan for same-day, not instant.',
      'Smart contract: Morpho Blue has been audited by leading firms. However, it is more complex than single-protocol lending, and complexity introduces additional surface area for bugs.',
    ],
    historicalContext:
      'Morpho curated vaults have consistently outperformed plain Aave/Compound by 2-5 percentage points. Yields range from 5% (quiet markets) to 18%+ (high leverage demand periods).',
    stabilityNote:
      'Morpho yield is primarily organic (borrower demand) but curators may also deploy into incentivized pools. Check your vault\'s breakdown — Gauntlet\'s USDC vault is typically 80%+ organic, which is strong.',

    apyRange: { low: 5.0, mid: 9.5, high: 18.0, current: 9.4 },
    apyHistory: [
      { label: 'Jun', apy: 7.2 }, { label: 'Jul', apy: 9.8 }, { label: 'Aug', apy: 6.5 },
      { label: 'Sep', apy: 7.8 }, { label: 'Oct', apy: 11.5 }, { label: 'Nov', apy: 14.2 },
      { label: 'Dec', apy: 10.1 }, { label: 'Jan', apy: 8.9 }, { label: 'Feb', apy: 7.5 },
      { label: 'Mar', apy: 9.2 }, { label: 'Apr', apy: 10.8 }, { label: 'May', apy: 9.4 },
    ],
    tvlUsdBn: 5.2,
    riskScores: { smartContract: 7, liquidity: 8, oracle: 8, governance: 8, market: 6 },
    yieldComponents: [
      { label: 'Borrower Interest', pct: 80, organic: true },
      { label: 'MORPHO Rewards', pct: 20, organic: false },
    ],
    auditFirms: ['Trail of Bits', 'Spearbit', 'Dedaub'],
    peerKeys: ['aave', 'fluid', 'gearbox'],
    launchYear: 2021,
    defiLlamaSlug: 'morpho',
  },

  resolv: {
    key: 'resolv',
    displayName: 'Resolv',
    tier: 'grow',
    yieldType: 'funding-rate',
    plainRiskLabel: 'Medium risk · delta-neutral strategy',

    whatIsIt:
      'Resolv creates USR — a stablecoin that earns yield through a delta-neutral position. It holds ETH while simultaneously shorting ETH perpetuals on exchanges, capturing the "funding rate" that bullish traders pay to maintain their long positions.',
    howItEarns:
      'In crypto markets, perpetual futures traders who are long ETH pay a fee (funding rate) to short sellers every 8 hours. Resolv systematically sits on the short side to collect these payments. Because it\'s simultaneously long and short ETH, price movements cancel out — only the funding payment remains.',
    realRisk:
      'Funding rates can go negative during prolonged bear markets — when most traders are short, longs receive payment instead. Resolv has an insurance layer (RLP) designed to absorb these periods, but yields can temporarily drop or pause.',
    liquidityNote:
      'Same-day — USR redemptions typically complete within 24 hours.',

    originStory:
      'Resolv launched in 2024, built by a team with backgrounds in quantitative trading and DeFi infrastructure. It grew rapidly as users sought alternatives to Ethena with different risk profiles. The RLP (Resolv Liquidity Pool) acts as a first-loss buffer funded by higher-yield participants.',
    workedExample:
      '$1,000 in Resolv USR at 9.5% earns $7.92/month. The yield comes from crypto traders paying to stay leveraged long — a payment stream that has been consistently positive in trending markets but pauses during corrections.',
    riskScenarios: [
      'Negative funding: If ETH enters a prolonged downtrend and most traders go short, funding rates invert. Resolv\'s USR yield would drop, and the RLP buffer would be drawn on. Yield may pause but principal is protected by the protocol design.',
      'Exchange counterparty: Resolv holds perpetual positions on centralized exchanges. An exchange failure (like FTX in 2022) would be a major event. Resolv uses multiple venues and maintains collateral independently.',
      'Depeg risk: USR has maintained its $1 peg through market stress, but as a synthetic stablecoin it carries more peg risk than USDC-backed alternatives.',
    ],
    historicalContext:
      'Crypto funding rates have been positive approximately 75-80% of the time historically, with negative periods typically lasting days to weeks. Resolv USR has yielded 7-14% APY in normal market conditions.',
    stabilityNote:
      'Resolv yield is a mix of funding rate payments (sustainable) and RLP incentives (variable). During bull markets, funding rates are strong — 10%+ APY is common. The risk is downside environments where the yield temporarily compresses.',

    apyRange: { low: 0.0, mid: 9.5, high: 16.0, current: 9.5 },
    apyHistory: [
      { label: 'Jun', apy: 8.5 }, { label: 'Jul', apy: 12.0 }, { label: 'Aug', apy: 4.2 },
      { label: 'Sep', apy: 7.5 }, { label: 'Oct', apy: 14.0 }, { label: 'Nov', apy: 16.0 },
      { label: 'Dec', apy: 11.5 }, { label: 'Jan', apy: 9.5 }, { label: 'Feb', apy: 7.2 },
      { label: 'Mar', apy: 10.5 }, { label: 'Apr', apy: 13.2 }, { label: 'May', apy: 9.5 },
    ],
    tvlUsdBn: 0.4,
    riskScores: { smartContract: 6, liquidity: 8, oracle: 6, governance: 8, market: 5 },
    yieldComponents: [
      { label: 'Funding Rate', pct: 75, organic: true },
      { label: 'RLP Incentives', pct: 25, organic: false },
    ],
    auditFirms: ['Spearbit', 'Cantina', 'Code4rena'],
    peerKeys: ['ethena'],
    launchYear: 2024,
    defiLlamaSlug: 'resolv',
  },

  maple: {
    key: 'maple',
    displayName: 'Maple Finance',
    tier: 'grow',
    yieldType: 'institutional',
    plainRiskLabel: 'Medium risk · institutional borrowers',

    whatIsIt:
      'Maple is an institutional lending marketplace where you act as the bank for professional trading firms and market makers. These companies borrow USDC at fixed rates to fund their operations, and you earn the interest — typically higher than retail lending because institutional borrowers pay a premium for guaranteed access.',
    howItEarns:
      'Maple\'s pool delegates vet and underwrite each borrower — reviewing their financials, trading history, and collateral. Approved borrowers pay above-market rates for the convenience of on-chain credit. Your yield is their interest payment.',
    realRisk:
      'Maple experienced a significant default in 2022 when Orthogonal Trading misrepresented its financials, causing losses for one pool. Since then, underwriting standards have been dramatically tightened. Accredited investor status required — this is treated as a real investment product.',
    liquidityNote:
      'Scheduled — redemptions queue behind active loans, typically 7-14 days depending on the pool.',

    originStory:
      'Maple Finance launched in 2021, founded by Sidney Powell and Joe Flanagan. It pioneered uncollateralized institutional lending in DeFi — a model that trades smart contract collateral for real-world credit assessment. After the 2022 defaults, Maple rebuilt with significantly stricter underwriting, and by 2024 had returned to growth with zero new defaults.',
    workedExample:
      '$1,000 in Maple USDC Cash at 11.2% earns $9.33/month. This rate is higher than Aave or Morpho because institutional borrowers pay a premium — they need large amounts quickly and value the certainty of the credit facility.',
    riskScenarios: [
      'Borrower default: If an institutional borrower fails to repay, pool participants could face losses. Post-2022, Maple requires comprehensive due diligence and many loans are now over-collateralized.',
      'Liquidity: If many lenders exit at once, redemption queues can extend. Maple manages this through loan term matching, but plan for a 2-week liquidity window.',
      'Accreditation: Maple verifies investor accreditation, which means it\'s subject to securities regulations. Any regulatory change affecting accredited investor frameworks could impact access.',
    ],
    historicalContext:
      'Maple institutional pools have yielded 9-16% APY depending on credit market conditions and crypto leverage demand. Rates tend to be higher during bull markets when trading firms need more capital.',
    stabilityNote:
      'Maple yield is institutional interest — organic and contractually fixed for each loan term. However, loan rates reset between borrowers, so your effective APY can shift when pools rebalance their borrower mix.',

    apyRange: { low: 9.0, mid: 12.0, high: 16.0, current: 11.2 },
    apyHistory: [
      { label: 'Jun', apy: 10.5 }, { label: 'Jul', apy: 11.2 }, { label: 'Aug', apy: 10.8 },
      { label: 'Sep', apy: 11.0 }, { label: 'Oct', apy: 12.5 }, { label: 'Nov', apy: 13.8 },
      { label: 'Dec', apy: 12.2 }, { label: 'Jan', apy: 11.5 }, { label: 'Feb', apy: 10.9 },
      { label: 'Mar', apy: 11.4 }, { label: 'Apr', apy: 12.0 }, { label: 'May', apy: 11.2 },
    ],
    tvlUsdBn: 0.9,
    riskScores: { smartContract: 8, liquidity: 5, oracle: 10, governance: 8, market: 6 },
    yieldComponents: [{ label: 'Loan Interest', pct: 100, organic: true }],
    auditFirms: ['Spearbit', 'Trail of Bits'],
    peerKeys: ['term', 'notional'],
    launchYear: 2021,
    defiLlamaSlug: 'maple-finance',
  },

  fluid: {
    key: 'fluid',
    displayName: 'Fluid',
    tier: 'grow',
    yieldType: 'lending-rate',
    plainRiskLabel: 'Medium risk · next-gen dynamic lending',

    whatIsIt:
      'Fluid (formerly Instadapp) is a next-generation lending protocol with smarter liquidity routing. It automatically moves your USDC to the highest-yielding borrower pool within its ecosystem, combining the safety of traditional lending with AI-optimized capital efficiency.',
    howItEarns:
      'Fluid\'s architecture is more capital-efficient than Aave because it dynamically adjusts liquidity between lending and DEX operations. When demand is high, your USDC earns from borrowers; during quieter periods, it earns from trading fee capture. Multiple yield sources compound your return.',
    realRisk:
      'Fluid is newer than Aave but built by Instadapp, which has managed $1B+ since 2020 without a major incident. Dynamic rate management means your APY can shift significantly within a single day — more variable than static lending protocols.',
    liquidityNote:
      'Instant — withdraw any time, no queuing required.',

    originStory:
      'Fluid launched in 2024, representing the third evolution of Instadapp\'s DeFi infrastructure. The founding team previously built DeFi Smart Accounts that abstract cross-protocol interactions. Fluid introduced the concept of "smart collateral" and "smart debt" that dynamically optimize between lending and liquidity provision.',
    workedExample:
      '$1,000 in Fluid USDC at 8.5% earns $7.08/month. This rate is above Aave because Fluid uses the same capital for both lending and DEX liquidity provision — earning fees from multiple sources simultaneously.',
    riskScenarios: [
      'Rate volatility: Fluid\'s multi-source yield means your APY can swing 2-3% within a day. The average over time is higher than single-source lenders, but day-to-day it\'s less predictable.',
      'Protocol novelty: Fluid is relatively new. While the Instadapp team is respected, the combined lending+DEX architecture is complex and has less historical stress-testing than Aave.',
      'Smart contract: Fluid has been audited, but its complexity introduces more potential failure modes. Recommend treating as medium risk and sizing position accordingly.',
    ],
    historicalContext:
      'Fluid USDC yields have ranged from 5% to 14% since launch, averaging above comparable Aave positions. The highest yields occur during high leverage demand combined with active DEX trading volume.',
    stabilityNote:
      'Fluid yield is mixed: base lending rate (organic) plus DEX fee capture (volume-dependent). In high-volume markets, both components are strong. In quiet markets, the DEX fee component drops and lending rate dominates.',

    apyRange: { low: 5.0, mid: 8.5, high: 14.0, current: 8.5 },
    apyHistory: [
      { label: 'Jun', apy: 7.0 }, { label: 'Jul', apy: 9.5 }, { label: 'Aug', apy: 5.8 },
      { label: 'Sep', apy: 7.2 }, { label: 'Oct', apy: 11.0 }, { label: 'Nov', apy: 13.5 },
      { label: 'Dec', apy: 9.8 }, { label: 'Jan', apy: 8.2 }, { label: 'Feb', apy: 7.0 },
      { label: 'Mar', apy: 8.8 }, { label: 'Apr', apy: 10.2 }, { label: 'May', apy: 8.5 },
    ],
    tvlUsdBn: 1.8,
    riskScores: { smartContract: 6, liquidity: 9, oracle: 7, governance: 8, market: 6 },
    yieldComponents: [
      { label: 'Lending Rate', pct: 70, organic: true },
      { label: 'DEX Fee Capture', pct: 30, organic: true },
    ],
    auditFirms: ['Spearbit', 'Code4rena', 'Cantina'],
    peerKeys: ['aave', 'morpho'],
    launchYear: 2024,
    defiLlamaSlug: 'fluid',
  },

  notional: {
    key: 'notional',
    displayName: 'Notional',
    tier: 'grow',
    yieldType: 'fixed-rate',
    plainRiskLabel: 'Medium risk · fixed rate to maturity',

    whatIsIt:
      'Notional is a fixed-rate lending protocol — like a Certificate of Deposit (CD) for DeFi. You lend USDC for a set term (1-6 months) at a rate agreed today, then receive your principal plus all interest at maturity. No rate risk, no surprises.',
    howItEarns:
      'Notional matches borrowers who want fixed-rate debt with lenders who want fixed income. Rates are set by supply and demand at auction time. Because both sides want certainty, they\'re willing to pay a premium over variable rates — giving you a predictability bonus.',
    realRisk:
      'If market rates rise significantly after you lock in, your fixed rate looks less attractive in hindsight. You can exit early via Notional\'s secondary market, but you may receive slightly less than face value. Smart contract risk exists in a less battle-tested protocol.',
    liquidityNote:
      'Scheduled — locked until your chosen maturity date. Early exit possible via secondary market at variable pricing.',

    originStory:
      'Notional launched in 2020 and introduced the first fully on-chain fixed-rate lending system in DeFi. By 2023, Notional V3 expanded to cross-chain vaults and leveraged fixed-rate strategies. It\'s the protocol most professional DeFi managers use when they want predictable yield without variable rate risk.',
    workedExample:
      '$1,000 in Notional fixed USDC at 10.5% for 3 months earns $26.25 at maturity — exactly. You know on day one exactly how many dollars you receive on day 90. No monitoring required.',
    riskScenarios: [
      'Opportunity cost: If rates spike to 15% after you lock in 10.5%, you miss the upside. This is the fundamental tradeoff of fixed income — you sacrifice upside for certainty.',
      'Early exit: Selling your fCash (Notional\'s fixed income token) before maturity means accepting the current market price, which varies with interest rate expectations.',
      'Protocol risk: Notional has $300M+ TVL and multiple audits, but it\'s smaller than Aave/Morpho. Position sizing accordingly.',
    ],
    historicalContext:
      'Notional fixed USDC rates have cleared 7-18% at various market conditions. Current 10-14% clearings reflect strong demand for fixed income as crypto leverage cycles continue.',
    stabilityNote:
      'Notional yield is the most stable possible once locked: a contractually fixed rate that cannot change during your holding period. The only variable is what rate you can lock at entry — which is determined by market supply and demand.',

    apyRange: { low: 7.0, mid: 10.5, high: 18.0, current: 10.5 },
    apyHistory: [
      { label: 'Jun', apy: 9.5 }, { label: 'Jul', apy: 12.0 }, { label: 'Aug', apy: 8.5 },
      { label: 'Sep', apy: 10.0 }, { label: 'Oct', apy: 14.5 }, { label: 'Nov', apy: 18.0 },
      { label: 'Dec', apy: 13.2 }, { label: 'Jan', apy: 11.0 }, { label: 'Feb', apy: 9.5 },
      { label: 'Mar', apy: 11.5 }, { label: 'Apr', apy: 13.0 }, { label: 'May', apy: 10.5 },
    ],
    tvlUsdBn: 0.35,
    riskScores: { smartContract: 6, liquidity: 6, oracle: 8, governance: 8, market: 6 },
    yieldComponents: [{ label: 'Fixed Rate', pct: 100, organic: true }],
    auditFirms: ['ABDK', 'Certora', 'OpenZeppelin'],
    peerKeys: ['pendle', 'term'],
    launchYear: 2020,
    defiLlamaSlug: 'notional-v3',
  },

  term: {
    key: 'term',
    displayName: 'Term Finance',
    tier: 'grow',
    yieldType: 'fixed-rate',
    plainRiskLabel: 'Medium risk · auction-set fixed rate',

    whatIsIt:
      'Term Finance runs weekly auctions where borrowers and lenders bid for fixed rates — like a US Treasury auction, but for DeFi. You submit the minimum rate you\'ll accept. If the auction clears above your minimum, you earn the auction\'s clearing rate for the full term.',
    howItEarns:
      'The clearing rate is determined by competitive bidding: borrowers bid the maximum they\'ll pay, lenders bid the minimum they\'ll accept, and the market finds the crossing point. Because borrowers are sophisticated and value certainty, rates typically clear above comparable variable-rate protocols.',
    realRisk:
      'If you bid too high and the auction doesn\'t clear at your rate, your funds are returned unused — no yield, but no loss. If you win the auction, your funds are locked until maturity with no early exit.',
    liquidityNote:
      'Scheduled — term lengths of 1-4 weeks. No early exit after auction settles.',

    originStory:
      'Term Finance launched in 2023, founded by veterans of traditional fixed income markets who saw that DeFi had no equivalent to the repo market. By 2024 it had processed $500M+ in auction volume. Its model closely mirrors how institutional lenders operate in traditional finance.',
    workedExample:
      '$1,000 in Term Finance at 12.8% for 2 weeks earns $4.92 at maturity. The auction process ensures you always earn the competitive market rate — not the rate a protocol decided to pay you, but the rate the market actually cleared.',
    riskScenarios: [
      'Auction failure: If your minimum rate is above the clearing rate, you don\'t participate and your funds return. Not a loss, but you miss the yield for that term.',
      'Liquidity lock: Once settled, your position is fully locked. Term Finance is for capital you genuinely don\'t need for the duration.',
      'Counterparty: Borrowers are vetted and typically over-collateralized, but Term Finance relies on the borrower\'s ability to repay at maturity.',
    ],
    historicalContext:
      'Term Finance auctions have cleared at 8-20% APY depending on market conditions and term length. Shorter terms (1-week) typically clear lower than longer terms, similar to traditional yield curves.',
    stabilityNote:
      'Term Finance yield is 100% organic — the auction-clearing rate reflects genuine market supply and demand for fixed credit. No token incentives, no protocol subsidies. As pure a market signal as DeFi produces.',

    apyRange: { low: 8.0, mid: 12.5, high: 20.0, current: 12.8 },
    apyHistory: [
      { label: 'Jun', apy: 10.5 }, { label: 'Jul', apy: 14.2 }, { label: 'Aug', apy: 9.8 },
      { label: 'Sep', apy: 11.5 }, { label: 'Oct', apy: 16.8 }, { label: 'Nov', apy: 20.0 },
      { label: 'Dec', apy: 15.5 }, { label: 'Jan', apy: 12.8 }, { label: 'Feb', apy: 11.0 },
      { label: 'Mar', apy: 13.5 }, { label: 'Apr', apy: 15.2 }, { label: 'May', apy: 12.8 },
    ],
    tvlUsdBn: 0.5,
    riskScores: { smartContract: 7, liquidity: 4, oracle: 9, governance: 9, market: 7 },
    yieldComponents: [{ label: 'Auction-Cleared Rate', pct: 100, organic: true }],
    auditFirms: ['Spearbit', 'Code4rena'],
    peerKeys: ['notional', 'pendle'],
    launchYear: 2023,
    defiLlamaSlug: 'term-finance',
  },

  // ── ACCELERATE ────────────────────────────────────────────────────────────

  ethena: {
    key: 'ethena',
    displayName: 'Ethena',
    tier: 'accelerate',
    yieldType: 'funding-rate',
    plainRiskLabel: 'Higher risk · funding rate dependent',

    whatIsIt:
      'Ethena creates sUSDe — a synthetic dollar that earns yield from crypto funding rates. It holds staked ETH while simultaneously shorting ETH on perpetual exchanges, pocketing the "funding payment" that bullish leveraged traders pay every 8 hours. When crypto is in a bull run, this payment is extremely high.',
    howItEarns:
      'Perpetual futures traders who are long ETH pay a recurring fee (the funding rate) to short sellers to keep the futures price in line with spot. Ethena sits on the short side at massive scale, collecting these payments. The fee is roughly 1/365th of the APY every day — it compounds fast.',
    realRisk:
      'Funding rates can go negative during bear markets — when everyone\'s short, longs receive the payment instead. sUSDe has an insurance fund to buffer this, but in sustained negative funding environments your yield would compress. This is the right tier for capital you can afford to have working hard with some volatility in returns.',
    liquidityNote:
      'Instant for most conditions — but during extreme market stress, large redemptions may face short delays.',

    originStory:
      'Ethena launched in 2024, founded by Guy Young after studying how perpetual futures funding rates could be captured systematically at scale. It grew to $5B+ TVL faster than any DeFi protocol in history. The design is inspired by traditional finance "cash and carry" trades — well understood by institutional traders.',
    workedExample:
      '$1,000 in Ethena sUSDe at 15.8% APY earns $13.17/month during typical bull market conditions. During peak funding periods (major crypto rallies), this can spike to $25-35/month. During negative funding, it could drop to near zero temporarily.',
    riskScenarios: [
      'Negative funding: If crypto markets enter a sustained downturn and most traders short, funding goes negative. Ethena\'s $50M+ insurance fund absorbs this, but extended negative periods could temporarily affect yield. Principal is designed to be protected.',
      'Exchange risk: Ethena holds short positions on centralized exchanges (Binance, Bybit, OKX). An exchange failure would be severe. Ethena mitigates by distributing across venues and using off-exchange custody.',
      'sUSDe depeg: sUSDe has maintained near-perfect $1 peg through multiple volatile periods, but as a synthetic stablecoin it carries more peg risk than USDC. A catastrophic hedge failure could theoretically impact the peg.',
    ],
    historicalContext:
      'Ethena sUSDe APY has ranged from 4% (muted funding environment) to 35%+ (peak bull market funding). The protocol launched in 2024 bull conditions and average yields have exceeded 15% annually through its operating history.',
    stabilityNote:
      'Ethena yield has two components: staking yield from stETH (organic, ~3-4%) and funding rate payments (variable, 5-30%+). The staking component is stable; the funding component amplifies with market enthusiasm. This mixed structure means even in weak markets you earn meaningful base yield.',

    apyRange: { low: 4.0, mid: 15.0, high: 35.0, current: 15.8 },
    apyHistory: [
      { label: 'Jun', apy: 12.5 }, { label: 'Jul', apy: 22.0 }, { label: 'Aug', apy: 6.5 },
      { label: 'Sep', apy: 11.5 }, { label: 'Oct', apy: 28.5 }, { label: 'Nov', apy: 35.0 },
      { label: 'Dec', apy: 20.5 }, { label: 'Jan', apy: 15.8 }, { label: 'Feb', apy: 10.2 },
      { label: 'Mar', apy: 18.5 }, { label: 'Apr', apy: 25.0 }, { label: 'May', apy: 15.8 },
    ],
    tvlUsdBn: 5.5,
    riskScores: { smartContract: 6, liquidity: 8, oracle: 5, governance: 8, market: 3 },
    yieldComponents: [
      { label: 'Funding Rate', pct: 75, organic: true },
      { label: 'Staking Yield', pct: 25, organic: true },
    ],
    auditFirms: ['Spearbit', 'Cyfrin', 'Code4rena'],
    peerKeys: ['resolv', 'gearbox'],
    launchYear: 2024,
    defiLlamaSlug: 'ethena',
  },

  gearbox: {
    key: 'gearbox',
    displayName: 'Gearbox',
    tier: 'accelerate',
    yieldType: 'leveraged-yield',
    plainRiskLabel: 'High risk · leverage amplifies all outcomes',

    whatIsIt:
      'Gearbox is a leverage protocol that lets yield strategies borrow additional capital and deploy it — amplifying returns proportionally. Your USDC acts as the passive lending side: you earn interest from leveraged borrowers who are using your capital to run amplified yield strategies.',
    howItEarns:
      'Leveraged users borrow your USDC at a fixed rate, deploy it into yield strategies at 2-4× leverage, and keep the spread. You earn the interest they pay on your loan — which is higher than regular lending because leverage demand commands a premium. You take no leverage risk yourself as a passive lender.',
    realRisk:
      'As a passive USDC lender on Gearbox, you have less risk than the leveraged borrowers — they get liquidated first if strategies fail. However, Gearbox is a complex protocol, and the leveraged strategies it enables carry real liquidation risk. Suitable for maximum-return positioning with full awareness of the risk spectrum.',
    liquidityNote:
      'Instant for passive lenders — your USDC is available to withdraw unless 100% utilized, which would queue your exit by hours.',

    originStory:
      'Gearbox Protocol launched in 2021, pioneering composable leverage for DeFi strategies. V3 (2023) introduced credit account abstraction — allowing any DeFi strategy to be run at leverage within risk parameters. The protocol is DAO-governed and has processed $2B+ in leveraged positions with audits from ChainSecurity and Consensys Diligence.',
    workedExample:
      '$1,000 deposited as a passive lender in Gearbox USDC at 18% APY earns $15/month. This rate exists because the leveraged users on the other side need your capital to run their strategies — they pay premium rates for the privilege of leverage.',
    riskScenarios: [
      'Liquidation cascade: If leveraged borrowers\' positions lose value rapidly and liquidations fail to execute in time, passive lenders could face losses. Gearbox\'s liquidation system is battle-tested but not infallible.',
      'Protocol complexity: Gearbox V3 is one of the most complex protocols in DeFi. More complexity = more potential attack surface. It has been audited extensively but complexity risk is real.',
      'Utilization lock: If 100% of passive USDC is borrowed by leveraged users and all try to repay simultaneously, withdrawals could queue for hours. This is rare but possible in volatile markets.',
    ],
    historicalContext:
      'Gearbox passive lending rates have ranged from 8% to 35%+ depending on leveraged strategy demand. Bull markets with high demand for Pendle/Ethena leverage drive rates toward the top of that range.',
    stabilityNote:
      'Gearbox passive lender yield is organic — it is the actual interest paid by leveraged borrowers. No token incentives in the base rate. The yield reflects genuine market demand for leverage, which is highest when opportunities are most plentiful — aligning your incentives with market activity.',

    apyRange: { low: 8.0, mid: 18.0, high: 35.0, current: 18.0 },
    apyHistory: [
      { label: 'Jun', apy: 14.0 }, { label: 'Jul', apy: 25.5 }, { label: 'Aug', apy: 8.5 },
      { label: 'Sep', apy: 13.5 }, { label: 'Oct', apy: 32.0 }, { label: 'Nov', apy: 35.0 },
      { label: 'Dec', apy: 24.5 }, { label: 'Jan', apy: 18.0 }, { label: 'Feb', apy: 12.5 },
      { label: 'Mar', apy: 21.5 }, { label: 'Apr', apy: 28.0 }, { label: 'May', apy: 18.0 },
    ],
    tvlUsdBn: 0.7,
    riskScores: { smartContract: 4, liquidity: 7, oracle: 7, governance: 7, market: 2 },
    yieldComponents: [{ label: 'Leverage Interest', pct: 100, organic: true }],
    auditFirms: ['ChainSecurity', 'Consensys Diligence', 'Code4rena'],
    peerKeys: ['ethena', 'morpho'],
    launchYear: 2021,
    defiLlamaSlug: 'gearbox',
  },
}

/**
 * Looks up a Codex entry by protocol key or display name (case-insensitive).
 * Returns undefined if the protocol is not in the Codex library.
 */
export function getCodexEntry(protocolRaw: string): CodexProtocolEntry | undefined {
  const key = protocolRaw.toLowerCase().trim()
  if (CODEX_PROTOCOLS[key]) return CODEX_PROTOCOLS[key]
  // Try matching by display name or partial key
  return Object.values(CODEX_PROTOCOLS).find(
    (entry) =>
      entry.displayName.toLowerCase() === key ||
      key.includes(entry.key) ||
      entry.key.includes(key)
  )
}
