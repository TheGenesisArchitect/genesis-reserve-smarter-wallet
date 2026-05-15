// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useComplianceGate.ts
//
// Reads the user's KYC tier from ComplianceRegistry.sol and exposes
// simple boolean guards for deposit, withdraw, and send operations.
//
// KYC Tiers (from ComplianceRegistry.sol):
//   Tier 0 — Not verified          → No operations permitted
//   Tier 1 — Basic KYC (ID + selfie) → Deposit + Withdraw only
//   Tier 2 — Enhanced KYC          → All operations including sends
//   Tier 3 — Institutional         → All operations + higher limits
//
// Dev bypass: set NEXT_PUBLIC_KYC_DEV_BYPASS=true in .env.local to skip
// the on-chain check and grant Basic tier access for local development.
// ─────────────────────────────────────────────────────────────────────────────

import { useReadContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { ACTIVE_CONTRACTS } from '../config/contracts'
import { COMPLIANCE_REGISTRY_ABI } from '../abis/vault.abi'
import { useActiveWalletAddress } from './useActiveWalletAddress'

// ── Dev bypass ───────────────────────────────────────────────────────────────
const KYC_DEV_BYPASS = process.env.NEXT_PUBLIC_KYC_DEV_BYPASS === 'true'

// ── Tier definitions ──────────────────────────────────────────────────────────

export enum KYCTier {
  NONE = 0,
  BASIC = 1,   // Deposit, Withdraw
  ENHANCED = 2,   // + Send (domestic + international)
  INSTITUTIONAL = 3,   // + Higher limits
}

// Transaction limits per tier (USD)
export const TIER_LIMITS: Record<KYCTier, { dailyLimit: number; txLimit: number }> = {
  [KYCTier.NONE]: { dailyLimit: 0, txLimit: 0 },
  [KYCTier.BASIC]: { dailyLimit: 3_000, txLimit: 1_000 },
  [KYCTier.ENHANCED]: { dailyLimit: 25_000, txLimit: 10_000 },
  [KYCTier.INSTITUTIONAL]: { dailyLimit: 1_000_000, txLimit: 250_000 },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComplianceGate {
  tier: KYCTier
  canDeposit: boolean
  canWithdraw: boolean
  /** Direct on-chain crypto sends (USDC/ETH/USDT) — allowed at Basic (Tier 1) */
  canSend: boolean
  /** Fiat remittance / international transfers — requires Enhanced (Tier 2) */
  canRemit: boolean
  isBlacklisted: boolean
  dailyLimit: number
  txLimit: number
  isLoading: boolean
  // Formatted tier label for UI display
  tierLabel: string
  // Error message if compliance check failed
  complianceError: string | null
}

const TIER_LABELS: Record<KYCTier, string> = {
  [KYCTier.NONE]: 'Not Verified',
  [KYCTier.BASIC]: 'Verified (Basic)',
  [KYCTier.ENHANCED]: 'Verified (Enhanced)',
  [KYCTier.INSTITUTIONAL]: 'Institutional',
}

function readTupleValue<T>(value: unknown, index: number): T | undefined {
  if (Array.isArray(value)) {
    return value[index] as T | undefined
  }

  return undefined
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useComplianceGate(addressOverride?: string | null): ComplianceGate {
  const activeAddress = useActiveWalletAddress()
  const address = addressOverride ?? activeAddress

  // ── Dev bypass: skip on-chain check entirely ──────────────────────────────
  // Reads the full ComplianceRecord struct via the public `records` mapping getter.
  const { data, isLoading, error: readError } = useReadContract({
    address: ACTIVE_CONTRACTS.COMPLIANCE_REGISTRY,
    abi: COMPLIANCE_REGISTRY_ABI,
    functionName: 'records',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: {
      enabled: !KYC_DEV_BYPASS && !!address,
      staleTime: 60_000,
      retry: 2,
    },
  })

  if (KYC_DEV_BYPASS) {
    const limits = TIER_LIMITS[KYCTier.BASIC]
    return {
      tier: KYCTier.BASIC,
      canDeposit: true,
      canWithdraw: true,
      canSend: true,
      canRemit: false,
      isBlacklisted: false,
      dailyLimit: limits.dailyLimit,
      txLimit: limits.txLimit,
      isLoading: false,
      tierLabel: TIER_LABELS[KYCTier.BASIC],
      complianceError: null,
    }
  }

  if (!address) {
    return {
      tier: KYCTier.NONE,
      canDeposit: false,
      canWithdraw: false,
      canSend: false,
      canRemit: false,
      isBlacklisted: false,
      dailyLimit: 0,
      txLimit: 0,
      isLoading: true,
      tierLabel: TIER_LABELS[KYCTier.NONE],
      complianceError: null,
    }
  }

  const chainTier = Number(readTupleValue<bigint | number>(data, 0) ?? 0) as KYCTier
  const needsServerFallback = !!address && !KYC_DEV_BYPASS && (!!readError || chainTier === KYCTier.NONE)

  const { data: serverCompliance, isLoading: isServerLoading } = useQuery({
    queryKey: ['kyc-activate-fallback', address],
    enabled: needsServerFallback,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<{ kycLevel: number } | null> => {
      const res = await fetch('/api/gr/kyc/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      if (!res.ok) return null
      const json = await res.json() as { kycLevel?: number }
      if (typeof json.kycLevel !== 'number') return null
      return { kycLevel: json.kycLevel }
    },
  })

  // `records(address)` returns a named tuple; destructure kycLevel and sanctionStatus.
  // If no record exists all fields default to zero values.
  // viem returns uint8/uint256 as BigInt — coerce with Number() before enum compare.
  const fallbackTier = Number(serverCompliance?.kycLevel ?? 0) as KYCTier
  const tier = (chainTier >= KYCTier.BASIC ? chainTier : fallbackTier) as KYCTier
  // BLOCKED constant in contract is bytes32("BLOCKED") right-padded with zeros
  const BLOCKED_HEX = '0x424c4f434b454400000000000000000000000000000000000000000000000000'
  const sanctionStatus = readTupleValue<string>(data, 2)
  const isBlacklisted = sanctionStatus === BLOCKED_HEX
  const limits = TIER_LIMITS[tier]

  const canDeposit = !isBlacklisted && tier >= KYCTier.BASIC
  const canWithdraw = !isBlacklisted && tier >= KYCTier.BASIC
  const canSend = !isBlacklisted && tier >= KYCTier.BASIC
  const canRemit = !isBlacklisted && tier >= KYCTier.ENHANCED

  let complianceError: string | null = null
  if (isBlacklisted) {
    complianceError = 'This address has been flagged by our compliance system. Contact support@genesisreserve.io.'
  } else if (tier === KYCTier.NONE && !isLoading && !isServerLoading) {
    complianceError = 'Identity verification required. Complete KYC to access Genesis Reserve.'
  }

  return {
    tier,
    canDeposit,
    canWithdraw,
    canSend,
    canRemit,
    isBlacklisted,
    dailyLimit: limits.dailyLimit,
    txLimit: limits.txLimit,
    isLoading: isLoading || isServerLoading,
    tierLabel: TIER_LABELS[tier],
    complianceError,
  }
}
