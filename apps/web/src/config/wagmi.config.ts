// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/config/wagmi.config.ts
//
// wagmi v2 configuration — uses Alchemy as RPC provider (already in use
// per 16-week roadmap). Privy handles wallet injection.
// ─────────────────────────────────────────────────────────────────────────────

import { createConfig } from 'wagmi'
import { fallback, http } from 'viem'
import { arbitrum, arbitrumSepolia, mainnet, base, polygon, optimism } from 'viem/chains'
import { createStorage, cookieStorage } from 'wagmi'
import { IS_TESTNET } from './contracts'

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
const PREFER_PUBLIC_RPC = process.env.NEXT_PUBLIC_RPC_PREFER_PUBLIC === 'true'
const ENABLE_WS_EVENTS = process.env.NEXT_PUBLIC_ENABLE_WS_EVENTS !== 'false'

// ── Transport URLs ────────────────────────────────────────────────────────────

const parseRpcList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)

const dedupe = (urls: string[]): string[] => Array.from(new Set(urls))

const buildRpcTransport = (urls: string[]) =>
  fallback(
    urls.map((url) =>
      http(url, {
        batch: true,
        retryCount: 1,
        retryDelay: 200,
        timeout: 4_000,
      })
    )
  )

const primaryRpc = (alchemyPath: string) =>
  ALCHEMY_KEY ? `https://${alchemyPath}/v2/${ALCHEMY_KEY}` : ''

const orderedRpcUrls = (primary: string, fallbackEnv: string | undefined, defaults: string[]) => {
  const fallbackUrls = parseRpcList(fallbackEnv)
  const prioritized = PREFER_PUBLIC_RPC
    ? [...fallbackUrls, ...defaults, primary]
    : [primary, ...fallbackUrls, ...defaults]

  return dedupe(prioritized.filter((url) => url.length > 0))
}

const ARBITRUM_RPC_URLS = orderedRpcUrls(
  primaryRpc('arb-mainnet.g.alchemy.com'),
  process.env.NEXT_PUBLIC_ARBITRUM_RPC_FALLBACKS,
  ['https://rpc.ankr.com/arbitrum', 'https://arbitrum-one.publicnode.com', 'https://arb1.arbitrum.io/rpc']
)
const SEPOLIA_RPC_URLS = orderedRpcUrls(
  primaryRpc('arb-sepolia.g.alchemy.com'),
  process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_FALLBACKS,
  ['https://sepolia-rollup.arbitrum.io/rpc']
)
const ETH_RPC_URLS = orderedRpcUrls(
  primaryRpc('eth-mainnet.g.alchemy.com'),
  process.env.NEXT_PUBLIC_ETHEREUM_RPC_FALLBACKS,
  ['https://cloudflare-eth.com']
)
const BASE_RPC_URLS = orderedRpcUrls(
  primaryRpc('base-mainnet.g.alchemy.com'),
  process.env.NEXT_PUBLIC_BASE_RPC_FALLBACKS,
  ['https://mainnet.base.org']
)
const POLYGON_RPC_URLS = orderedRpcUrls(
  primaryRpc('polygon-mainnet.g.alchemy.com'),
  process.env.NEXT_PUBLIC_POLYGON_RPC_FALLBACKS,
  ['https://polygon-rpc.com']
)
const OPTIMISM_RPC_URLS = orderedRpcUrls(
  primaryRpc('opt-mainnet.g.alchemy.com'),
  process.env.NEXT_PUBLIC_OPTIMISM_RPC_FALLBACKS,
  ['https://mainnet.optimism.io']
)

const ARBITRUM_WS = ALCHEMY_KEY ? `wss://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : 'wss://arb1.arbitrum.io/feed'
const SEPOLIA_WS = ALCHEMY_KEY ? `wss://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : 'wss://sepolia-rollup.arbitrum.io/feed'

// ── wagmi config ──────────────────────────────────────────────────────────────

export const wagmiConfig = createConfig({
  chains: IS_TESTNET
    ? [arbitrumSepolia]
    : [arbitrum, arbitrumSepolia, mainnet, base, polygon, optimism],

  storage: createStorage({ storage: cookieStorage }),
  ssr: true,

  transports: {
    [arbitrum.id]: buildRpcTransport(ARBITRUM_RPC_URLS),
    [arbitrumSepolia.id]: buildRpcTransport(SEPOLIA_RPC_URLS),
    [mainnet.id]: buildRpcTransport(ETH_RPC_URLS),
    [base.id]: buildRpcTransport(BASE_RPC_URLS),
    [polygon.id]: buildRpcTransport(POLYGON_RPC_URLS),
    [optimism.id]: buildRpcTransport(OPTIMISM_RPC_URLS),
  },
})

// ── WebSocket client for event subscriptions ─────────────────────────────────

export const WS_TRANSPORT_URL = ENABLE_WS_EVENTS ? (IS_TESTNET ? SEPOLIA_WS : ARBITRUM_WS) : ''
