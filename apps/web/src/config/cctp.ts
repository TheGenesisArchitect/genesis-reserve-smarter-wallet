// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/config/cctp.ts
//
// CCTP v2 — Circle Cross-Chain Transfer Protocol configuration.
// PRIMARY on-ramp: Ethereum / Base  →  burn  →  attest  →  mint  →  Arbitrum
// Fast-finality path: minFinalityThreshold=1000 → ~24 s vs 13 min.
//
// Contract addresses verified from:
//   https://developers.circle.com/stablecoins/docs/evm-smart-contracts
// ─────────────────────────────────────────────────────────────────────────────

import { mainnet, arbitrum, base } from 'viem/chains'

// ── CCTP domain IDs ───────────────────────────────────────────────────────────
export const CCTP_DOMAINS = {
    ETHEREUM: 0,
    ARBITRUM: 3,
    BASE: 6,
} as const

export type CctpDomain = typeof CCTP_DOMAINS[keyof typeof CCTP_DOMAINS]

// ── CCTP v2 contract addresses per chain ─────────────────────────────────────
export const CCTP_CONTRACTS = {
    ethereum: {
        TOKEN_MESSENGER: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155' as `0x${string}`,
        MESSAGE_TRANSMITTER: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81' as `0x${string}`,
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
        domain: CCTP_DOMAINS.ETHEREUM,
        chain: mainnet,
        label: 'Ethereum' as const,
    },
    arbitrum: {
        TOKEN_MESSENGER: '0x19330d10D9Cc8751218eaf51E8885D058642E08A' as `0x${string}`,
        MESSAGE_TRANSMITTER: '0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca' as `0x${string}`,
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
        domain: CCTP_DOMAINS.ARBITRUM,
        chain: arbitrum,
        label: 'Arbitrum One' as const,
    },
    base: {
        TOKEN_MESSENGER: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962' as `0x${string}`,
        MESSAGE_TRANSMITTER: '0xAD09780d193884d503182aD4588450C416D6F9D4' as `0x${string}`,
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
        domain: CCTP_DOMAINS.BASE,
        chain: base,
        label: 'Base' as const,
    },
} as const

export type CctpChainKey = keyof typeof CCTP_CONTRACTS

// ── Source chains available for burn ─────────────────────────────────────────
export const CCTP_SOURCE_CHAINS: CctpChainKey[] = ['ethereum', 'base']

// ── Destination is always Arbitrum One ───────────────────────────────────────
export const CCTP_DESTINATION: typeof CCTP_CONTRACTS['arbitrum'] = CCTP_CONTRACTS.arbitrum

// ── Fast-finality threshold ───────────────────────────────────────────────────
// 1000 → instant confirmation path (~24 s). 0 → full 65 confirmations (~13 min).
export const MIN_FINALITY_THRESHOLD = 1_000 as const

// ── Circle Iris attestation API ───────────────────────────────────────────────
export const CCTP_ATTESTATION_API: string =
    process.env.CCTP_ATTESTATION_API ?? 'https://iris.circle.com/v1/attestations'

// ── Attestation poll config ───────────────────────────────────────────────────
export const ATTESTATION_POLL_INTERVAL_MS = 3_000
export const ATTESTATION_POLL_TIMEOUT_MS = 120_000   // 2 minutes

// ── Utility: EVM address → bytes32 (CCTP wire format) ────────────────────────
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
    return `0x${address.slice(2).toLowerCase().padStart(64, '0')}` as `0x${string}`
}
