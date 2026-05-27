import { NextResponse } from 'next/server'
import type { NewsDrop, NewsDropsResponse } from '@/lib/news/types'

// ── RSS sources ───────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'The Block',     url: 'https://www.theblock.co/rss.xml' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'The Defiant',   url: 'https://thedefiant.io/feed' },
  { name: 'Unchained',     url: 'https://unchainedcrypto.com/feed/' },
  { name: 'CryptoSlate',   url: 'https://cryptoslate.com/feed/' },
  { name: 'Finextra',      url: 'https://www.finextra.com/rss/headlines.aspx' },
  { name: 'BeInCrypto',    url: 'https://beincrypto.com/feed/' },
]

// ── Relevance keywords by category ───────────────────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  DeFi:           ['defi', 'yield', 'staking', 'liquidity', 'protocol', 'vault', 'aave', 'compound', 'uniswap', 'pendle', 'curve', 'tvl', 'amm', 'lending', 'borrowing'],
  Stablecoin:     ['stablecoin', 'usdc', 'usdt', 'dai', 'pyusd', 'usde', 'peg', 'stable coin', 'dollar-pegged'],
  Regulation:     ['regulation', 'sec', 'cftc', 'compliance', 'legislation', 'congress', 'policy', 'legal', 'lawsuit', 'bill', 'framework', 'regulator'],
  Infrastructure: ['layer 2', 'l2', 'rollup', 'arbitrum', 'optimism', 'ethereum', 'blockchain', 'scaling', 'eip', 'upgrade', 'mainnet'],
  Macro:          ['bitcoin', 'btc', 'fed', 'federal reserve', 'interest rate', 'inflation', 'monetary', 'treasury', 'bond', 'macro', 'etf'],
  Payments:       ['payments', 'remittance', 'cross-border', 'fintech', 'banking', 'cbdc', 'digital dollar', 'swift', 'settlement', 'transfer'],
}

const GENESIS_ANGLES: Record<string, string> = {
  DeFi:           'Genesis Reserve vaults route capital through battle-tested DeFi protocols — developments in this space directly affect yield strategies available to members.',
  Stablecoin:     'Genesis Reserve holds stablecoin positions as the foundation of every member portfolio. Stablecoin dynamics shape both yield rates and capital preservation guarantees.',
  Regulation:     'Regulatory clarity accelerates institutional adoption — Genesis Reserve is built for compliance-first finance, positioning members ahead of this curve.',
  Infrastructure: 'Arbitrum One is the backbone of Genesis Reserve smart contracts. L2 improvements enhance speed, reduce fees, and expand strategy options for members.',
  Macro:          'Macro movements shift the risk/reward profile of on-chain yield. Genesis Reserve real-time monitors track these dynamics so your portfolio adapts automatically.',
  Payments:       'Genesis Reserve\'s built-in payment rails are designed for exactly this future — borderless, programmable money that moves at the speed of the internet.',
}

// ── OG image resolver ─────────────────────────────────────────────────────────

async function resolveOgImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(500),
      headers: { 'User-Agent': 'GenesisReserve/1.0', Accept: 'text/html' },
    })
    if (!res.ok) return undefined
    const html = await res.text()
    const m = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)
           ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)
    return m?.[1] ?? undefined
  } catch {
    return undefined
  }
}

// ── RSS XML parser ────────────────────────────────────────────────────────────

interface RssItem { title: string; link: string; description: string; pubDate: string; source: string }

function extractTag(xml: string, tag: string): string {
  const cd = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')
  const pl = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = cd.exec(xml) || pl.exec(xml)
  return m ? m[1].trim() : ''
}

function stripHtml(h: string): string {
  return h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 420)
}

function parseRss(xml: string, source: string, limit = 10): RssItem[] {
  const items: RssItem[] = []
  const rx = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = rx.exec(xml)) !== null && items.length < limit) {
    const b = m[1]
    const title = extractTag(b, 'title')
    const link = extractTag(b, 'link') || extractTag(b, 'guid')
    const description = stripHtml(extractTag(b, 'description') || extractTag(b, 'content:encoded') || '')
    const pubDate = extractTag(b, 'pubDate')
    if (title && link) items.push({ title, link, description, pubDate, source })
  }
  return items
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

function scoreItem(item: RssItem): { score: number; category: string } {
  const text = `${item.title} ${item.description}`.toLowerCase()
  let best = 'Macro'
  let bestScore = 0
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0)
    if (score > bestScore) { bestScore = score; best = cat }
  }
  return { score: bestScore, category: best }
}

// ── Social copy generator ─────────────────────────────────────────────────────

function makeSocial(headline: string, summary: string, source: string, url: string, category: string): NewsDrop['social'] {
  const short = headline.length > 130 ? headline.slice(0, 127) + '...' : headline
  const lead = (summary.split('.')[0] || summary.slice(0, 90)).trim()
  const hookWord = headline.split(' ').slice(0, 6).join(' ')

  return {
    twitter: `${short}\n\n${lead}.\n\nThis is the pipeline into the future of fintech and digital currency.\n\n${url}\n\n#GenesisReserve #DeFi #${category} #Fintech #DigitalFinance`,

    instagram: `The future of money is being written right now.\n\n◈ ${headline}\n\n${summary}\n\nThis is exactly why we built Genesis Reserve — for people who refuse to stay on the wrong side of financial history.\n\nSave this. Share it with someone building wealth in silence.\n\n#GenesisReserve #DigitalFinance #DeFi #YieldOptimization #FintechNews #${category} #Web3 #FutureOfMoney #CryptoNews #WealthBuilding`,

    linkedin: `Worth flagging for anyone tracking the future of finance:\n\n${headline}\n\n${summary}\n\nAt Genesis Reserve, we monitor shifts like this in real time — because they directly shape how member capital is deployed across institutional DeFi strategies. The pipeline into the future of fintech and digital currency runs through moments exactly like this one.\n\nFull story: ${url}\nVia ${source}\n\n#GenesisReserve #DeFi #Fintech #DigitalFinance #${category} #InstitutionalDeFi`,

    tiktok: `POV: The financial news the banks hope you scroll past...\n\n${hookWord}...\n\nHere's what this actually means:\n→ ${lead}\n→ This shifts the entire ${category} landscape\n→ Genesis Reserve members are already positioned for this\n\nFollow for daily fintech intelligence drops.\n\n#FinanceTok #DeFi #CryptoNews #Fintech #MoneyTok #Web3 #${category} #GenesisReserve`,
  }
}

// ── Mock fallback drops ───────────────────────────────────────────────────────

function buildMocks(): NewsDrop[] {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const SLOT_DEFS = [
    { slot: 'morning' as const, slotLabel: 'Morning Intel',  slotTime: '8:00 AM EST' },
    { slot: 'midday'  as const, slotLabel: 'Midday Signal',  slotTime: '12:00 PM EST' },
    { slot: 'evening' as const, slotLabel: 'Evening Brief',  slotTime: '6:00 PM EST' },
  ]
  const seeds: Array<{ headline: string; summary: string; source: string; url: string; category: string }> = [
    {
      headline: 'DeFi Total Value Locked Climbs Past $120B as Institutional Yield Demand Accelerates',
      summary:  'On-chain data shows renewed inflows into structured yield products across Arbitrum and Ethereum mainnet, driven by interest rate differentials and improved smart contract security standards.',
      source:   'CoinDesk', url: 'https://coindesk.com', category: 'DeFi',
    },
    {
      headline: 'Circle Expands Native USDC to Three New L2 Networks, Deepening Stablecoin Infrastructure',
      summary:  'Circle announced native USDC deployment across additional Layer 2 networks, reducing bridging costs and settlement times for institutional and consumer payment corridors.',
      source:   'The Block', url: 'https://theblock.co', category: 'Stablecoin',
    },
    {
      headline: 'Congress Advances Digital Asset Framework Bill — Clearest Regulatory Signal in Three Years',
      summary:  'The bipartisan bill proposes a clear taxonomy for digital assets, defining which tokens fall under SEC versus CFTC jurisdiction and establishing compliance safe harbors for DeFi protocols.',
      source:   'Decrypt', url: 'https://decrypt.co', category: 'Regulation',
    },
  ]
  return seeds.map((s, i) => ({
    id:          `${SLOT_DEFS[i].slot}-${today.replace(/\s/g, '-')}`,
    ...SLOT_DEFS[i],
    publishedAt: new Date().toISOString(),
    headline:    s.headline,
    summary:     s.summary,
    source:      s.source,
    sourceUrl:   s.url,
    category:    s.category as NewsDrop['category'],
    genesisAngle: GENESIS_ANGLES[s.category],
    social:      makeSocial(s.headline, s.summary, s.source, s.url, s.category),
  }))
}

// ── In-process cache (5 min) ──────────────────────────────────────────────────

// BUILD_ID changes on every Vercel deployment — ensures stale cached drops
// from a previous build never survive a redeployment.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.BUILD_ID ?? String(Date.now())
let _cache: { drops: NewsDrop[]; ts: number; buildId: string } | null = null
const TTL = 5 * 60 * 1000

// ── Main aggregation logic ────────────────────────────────────────────────────

async function buildDrops(): Promise<NewsDrop[]> {
  if (_cache && _cache.buildId === BUILD_ID && Date.now() - _cache.ts < TTL) return _cache.drops

  const results = await Promise.allSettled(
    RSS_SOURCES.map(async ({ name, url }) => {
      const res = await fetch(url, {
        signal:  AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'GenesisReserve/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
        cache:   'no-store',
      })
      if (!res.ok) throw new Error(`${name}: ${res.status}`)
      return parseRss(await res.text(), name)
    })
  )

  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  if (all.length === 0) return buildMocks()

  const scored = all
    .map(item => ({ item, ...scoreItem(item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  // One article per source — pick the highest-scoring article from each outlet,
  // then rank those winners by score to get source-diverse top 3.
  type Candidate = { item: RssItem; score: number; category: string }
  const bySource = new Map<string, Candidate>()
  for (const s of scored) {
    if (!bySource.has(s.item.source)) bySource.set(s.item.source, s)
  }
  const diverseTop = [...bySource.values()].sort((a, b) => b.score - a.score)

  // Fill to 3: if we don't have 3 sources with scored articles, backfill from
  // lower-scored articles (may repeat a source) rather than returning mocks.
  const usedSources = new Set(diverseTop.slice(0, 3).map(s => s.item.source))
  const backfill = scored.filter(s => !usedSources.has(s.item.source) && !diverseTop.slice(0, 3).includes(s))
  const candidates = [...diverseTop, ...backfill]

  const seenTitles = new Set<string>()
  const top3 = candidates
    .filter(({ item }) => {
      const key = item.title.slice(0, 40).toLowerCase()
      if (seenTitles.has(key)) return false
      seenTitles.add(key)
      return true
    })
    .slice(0, 3)

  if (top3.length < 3) return buildMocks()

  const SLOT_DEFS = [
    { slot: 'morning' as const, slotLabel: 'Morning Intel',  slotTime: '8:00 AM EST' },
    { slot: 'midday'  as const, slotLabel: 'Midday Signal',  slotTime: '12:00 PM EST' },
    { slot: 'evening' as const, slotLabel: 'Evening Brief',  slotTime: '6:00 PM EST' },
  ]

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Resolve og:images in parallel — 500ms timeout each, failures silently omitted
  const imageUrls = await Promise.all(top3.map(({ item }) => resolveOgImage(item.link)))

  const drops: NewsDrop[] = top3.map(({ item, category }, i) => {
    const def = SLOT_DEFS[i]
    return {
      id:          `${def.slot}-${today.replace(/\s/g, '-')}`,
      ...def,
      publishedAt: item.pubDate || new Date().toISOString(),
      headline:    item.title,
      summary:     item.description || item.title,
      source:      item.source,
      sourceUrl:   item.link,
      category:    category as NewsDrop['category'],
      imageUrl:    imageUrls[i],
      genesisAngle: GENESIS_ANGLES[category] ?? GENESIS_ANGLES['Macro'],
      social:      makeSocial(item.title, item.description, item.source, item.link, category),
    }
  })

  _cache = { drops, ts: Date.now(), buildId: BUILD_ID }
  return drops
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<NewsDropsResponse>> {
  try {
    const drops = await buildDrops()
    return NextResponse.json({ drops, generatedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ drops: buildMocks(), generatedAt: new Date().toISOString() })
  }
}
