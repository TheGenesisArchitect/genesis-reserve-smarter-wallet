// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/config/contracts.ts
//
// Single source of truth for all Genesis Reserve contract addresses.
// All addresses from deployments/arbitrum/manifest.json (Week 1, March 22 2026)
// ─────────────────────────────────────────────────────────────────────────────

import { arbitrum, arbitrumSepolia, base, polygon, optimism, mainnet } from 'viem/chains'

// ── Chain selection ───────────────────────────────────────────────────────────
export const IS_TESTNET =
  process.env.NEXT_PUBLIC_CHAIN_ID === '421614'

export const ACTIVE_CHAIN = IS_TESTNET ? arbitrumSepolia : arbitrum

// ── Genesis Reserve contract addresses (Arbitrum One mainnet) ─────────────────
export const CONTRACTS = {
  // ERC-4626 vault — primary deposit/withdraw/yield surface
  GENESIS_VAULT: '0xe164997D48395B4e24aB0f9F66c57DEA38C5E041' as `0x${string}`,

  // Strategy allocation router — 15-minute epoch rebalancing
  STRATEGY_ROUTER: '0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84' as `0x${string}`,

  // On-chain KYC/AML/OFAC registry
  COMPLIANCE_REGISTRY: '0x6D58678562387c400964737884E78f2f12e1c495' as `0x${string}`,

  // Protocol adapters (registered with StrategyRouter)
  AAVE_V3_ADAPTER: '0xa6F089338Ae75306217336054B36C02c3Bc5554D' as `0x${string}`,
  BALANCER_V3_ADAPTER: '0x6291Ed9FC028F872D14B1da79de60a63e7Ec6624' as `0x${string}`,
  TBILL_ADAPTER: '0xD27d55DB27F09443DB3Bf9f959bA0A3eB8Cc9A0e' as `0x${string}`,

  // USDC on Arbitrum One (Circle canonical)
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
} as const

// ── Protocol constants ────────────────────────────────────────────────────────
export const PROTOCOL = {
  // USDC has 6 decimals on all EVM chains
  USDC_DECIMALS: 6,

  // Platform yield spread retained (in basis points: 150 = 1.5%)
  PLATFORM_SPREAD_BPS: 150,

  // Partner yield share (in basis points: 100 = 1.0%)
  PARTNER_SPREAD_BPS: 100,

  // Genesis flat transaction fee (USD) — covers Arbitrum gas + relay + Genesis revenue.
  // Arbitrum gas: ~$0.01–0.03 | CCTP relay gas: ~$0.05–0.15 | Genesis keeps: ~$0.65+
  TX_FEE_FLAT_USD: 0.80,

  // Legacy BPS field kept for any downstream references — set to 0 (flat fee supersedes)
  TX_FEE_BPS: 0,

  // FX spread (in basis points: 25 = 0.25%)
  FX_SPREAD_BPS: 25,

  // Maximum concentration per strategy (in basis points: 4000 = 40%)
  MAX_CONCENTRATION_BPS: 4000,

  // Reservation TTL before expiry (24 hours in seconds)
  RESERVATION_TTL_SECONDS: 86_400,

  // Canary launch supply cap ($10,000 in USDC units = 10_000 * 1e6)
  CANARY_CAP_USDC: 10_000n * 1_000_000n,
} as const

// ── Testnet overrides (Arbitrum Sepolia) ──────────────────────────────────────
// Fill these in after testnet deployment in Week 2 E2E test
export const TESTNET_CONTRACTS = {
  GENESIS_VAULT: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  STRATEGY_ROUTER: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  COMPLIANCE_REGISTRY: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  AAVE_V3_ADAPTER: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  BALANCER_V3_ADAPTER: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  TBILL_ADAPTER: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  // USDC on Arbitrum Sepolia (Circle testnet faucet)
  USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as `0x${string}`,
} as const

// Export active contracts based on chain
export const ACTIVE_CONTRACTS = IS_TESTNET ? TESTNET_CONTRACTS : CONTRACTS

// ── Circle canonical USDC per chain (all 6 decimals) ─────────────────────────
// Used by WalletHome to read cross-chain portfolio balances.
export const CHAIN_USDC: Record<number, `0x${string}`> = {
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum One
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
  [polygon.id]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon (native USDC)
  [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
  [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum mainnet
}

// Human-readable chain metadata for UI display
export const CHAIN_META: Record<number, { name: string; symbol: string; color: string; bridgeUrl?: string }> = {
  [arbitrum.id]: { name: 'Arbitrum', symbol: 'ETH', color: '#28A0F0', bridgeUrl: 'https://bridge.arbitrum.io' },
  [base.id]: { name: 'Base', symbol: 'ETH', color: '#0052FF', bridgeUrl: 'https://bridge.base.org' },
  [polygon.id]: { name: 'Polygon', symbol: 'POL', color: '#8247E5', bridgeUrl: 'https://portal.polygon.technology/bridge' },
  [optimism.id]: { name: 'Optimism', symbol: 'ETH', color: '#FF0420', bridgeUrl: 'https://app.optimism.io/bridge' },
  [mainnet.id]: { name: 'Ethereum', symbol: 'ETH', color: '#627EEA', bridgeUrl: 'https://bridge.arbitrum.io/?sourceChain=mainnet' },
}
