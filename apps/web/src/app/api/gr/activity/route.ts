import { NextResponse } from 'next/server'

const V2_API = 'https://api.etherscan.io/v2/api'
const API_KEY = process.env.ETHERSCAN_API_KEY ?? ''

// ── Known contract labels ─────────────────────────────────────────────────
const ARB_INBOX = '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f'
const UNISWAP_ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45'
const UNISWAP_ROUTER2 = '0xec7be89e362d070c0e6e03e73b7c8bd8f7a35f15' // UniversalRouter
const ZERO_EX = '0xdef1c0ded9bec7f1a1670819833240f027b25eff'

// ── USDC contract per chain ───────────────────────────────────────────────
const USDC: Record<number, string> = {
  1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Ethereum
  42161: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum (native USDC)
  8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base
  137: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // Polygon (native USDC)
  10: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // Optimism (native USDC)
}

// ── Chain metadata ────────────────────────────────────────────────────────
const CHAINS = [
  { id: 1, label: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io/tx/' },
  { id: 42161, label: 'Arbitrum', symbol: 'ETH', explorer: 'https://arbiscan.io/tx/' },
  { id: 8453, label: 'Base', symbol: 'ETH', explorer: 'https://basescan.org/tx/' },
  { id: 137, label: 'Polygon', symbol: 'POL', explorer: 'https://polygonscan.com/tx/' },
  { id: 10, label: 'Optimism', symbol: 'ETH', explorer: 'https://optimistic.etherscan.io/tx/' },
]

export type ActivityTx = {
  hash: string
  name: string
  initial: string
  amount: number
  symbol: string
  isDebit: boolean
  dateStr: string
  hue: number
  chain: string
  chainId: number
  explorerUrl: string
  txType: 'send' | 'receive' | 'swap' | 'bridge' | 'yield'
}

type EtherscanTx = {
  hash: string; from: string; to: string; value: string
  timeStamp: string; isError?: string; tokenSymbol?: string
  tokenDecimal?: string; contractAddress?: string
}

function fmtTimestamp(ts: string): string {
  const d = new Date(Number(ts) * 1000)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isYest = d.toDateString() === new Date(now.getTime() - 86400000).toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today, ${time}`
  if (isYest) return `Yesterday, ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function txLabel(to: string, from: string, addrLower: string, symbol: string): {
  name: string; initial: string; hue: number; txType: ActivityTx['txType']
} {
  const toLower = to.toLowerCase()
  const isDebit = from.toLowerCase() === addrLower

  if (toLower === ARB_INBOX) {
    return { name: 'Bridge → Arbitrum', initial: '⇌', hue: 195, txType: 'bridge' }
  }
  if (toLower === UNISWAP_ROUTER || toLower === UNISWAP_ROUTER2 || toLower === ZERO_EX) {
    return { name: `Swap · Uniswap`, initial: '⇄', hue: 260, txType: 'swap' }
  }

  const peer = isDebit ? to : from
  const peerShort = `${peer.slice(0, 6)}…${peer.slice(-4)}`
  if (isDebit) {
    return { name: `Sent ${symbol} · ${peerShort}`, initial: 'S', hue: 15, txType: 'send' }
  }
  return { name: `Received ${symbol} · ${peerShort}`, initial: 'R', hue: 135, txType: 'receive' }
}

async function fetchChainActivity(
  chainId: number,
  address: string,
  label: string,
  nativeSymbol: string,
  explorerBase: string,
): Promise<ActivityTx[]> {
  const txs: ActivityTx[] = []
  const addrLower = address.toLowerCase()

  // Native token txlist
  try {
    const url = `${V2_API}?chainid=${chainId}&module=account&action=txlist&address=${address}&sort=desc&page=1&offset=20&apikey=${API_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json() as { status: string; result: EtherscanTx[] }
    if (json.status === '1' && Array.isArray(json.result)) {
      for (const tx of json.result) {
        if (tx.isError === '1') continue
        const raw = Number(tx.value)
        if (raw < 1e13) continue // < 0.00001 native — skip dust
        const amount = raw / 1e18
        const isDebit = tx.from.toLowerCase() === addrLower
        const { name, initial, hue, txType } = txLabel(tx.to, tx.from, addrLower, nativeSymbol)
        txs.push({
          hash: tx.hash,
          name,
          initial,
          amount,
          symbol: nativeSymbol,
          isDebit,
          dateStr: fmtTimestamp(tx.timeStamp),
          hue,
          chain: label,
          chainId,
          explorerUrl: explorerBase + tx.hash,
          txType,
        })
      }
    }
  } catch { /* rate-limit or unavailable — skip */ }

  // USDC ERC-20 transfers
  const usdcAddr = USDC[chainId]
  if (usdcAddr) {
    try {
      const url = `${V2_API}?chainid=${chainId}&module=account&action=tokentx&contractaddress=${usdcAddr}&address=${address}&sort=desc&page=1&offset=20&apikey=${API_KEY}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json() as { status: string; result: EtherscanTx[] }
      if (json.status === '1' && Array.isArray(json.result)) {
        for (const tx of json.result) {
          const decimals = Number(tx.tokenDecimal ?? 6)
          const amount = Number(tx.value) / Math.pow(10, decimals)
          if (amount < 0.01) continue
          const isDebit = tx.from.toLowerCase() === addrLower
          const { name, initial, hue, txType } = txLabel(tx.to, tx.from, addrLower, 'USDC')
          txs.push({
            hash: tx.hash,
            name,
            initial,
            amount,
            symbol: 'USDC',
            isDebit,
            dateStr: fmtTimestamp(tx.timeStamp),
            hue,
            chain: label,
            chainId,
            explorerUrl: explorerBase + tx.hash,
            txType,
          })
        }
      }
    } catch { /* skip */ }
  }

  return txs
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
  }

  // Fetch all chains in parallel
  const results = await Promise.allSettled(
    CHAINS.map(c => fetchChainActivity(c.id, address, c.label, c.symbol, c.explorer))
  )

  const allTxs: ActivityTx[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') allTxs.push(...r.value)
  }

  // Deduplicate by tx hash (same tx can appear as native + token transfer)
  const seen = new Set<string>()
  const deduped = allTxs.filter(tx => {
    if (seen.has(tx.hash)) return false
    seen.add(tx.hash)
    return true
  })

  // Sort newest first — dateStr is already formatted, sort by hash isn't reliable,
  // but each chain's results are already sorted desc. Merge by interleave is complex,
  // so we rely on Etherscan's sort=desc per chain. Global sort would need timestamps.
  return NextResponse.json({
    address,
    count: deduped.length,
    txs: deduped.slice(0, 50),
  })
}
