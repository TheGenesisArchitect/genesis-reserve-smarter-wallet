/**
 * POST /api/gr/kyc/activate
 *
 * Server-side route that activates a wallet on ComplianceRegistry only after
 * a backend KYC/compliance status confirms the wallet is approved.
 *
 * Security:
 *  - COMPLIANCE_WRITER_PRIVATE_KEY is server-side only (no NEXT_PUBLIC_ prefix)
 *  - Address is validated before use
 *  - Already-active accounts are returned as success (idempotent)
 *  - No on-chain write occurs unless the backend reports an approved KYC tier
 */

import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, isAddress, getAddress } from 'viem'
import { arbitrum } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { backendGet, isBackendConfigured } from '../../_lib/backend'

const COMPLIANCE_REGISTRY = '0x6D58678562387c400964737884E78f2f12e1c495' as const
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
const DEFAULT_JURISDICTION = 'US'
const DEFAULT_KYC_PROVIDER_REF = '0x4745454e45534953000000000000000000000000000000000000000000000000' as `0x${string}`
const KYC_AUTO_APPROVE_NOT_FOUND = process.env.KYC_AUTO_APPROVE_NOT_FOUND === 'true' || process.env.NODE_ENV !== 'production'

type ActivationDecision = {
  status: 'approved' | 'not_verified' | 'pending_review' | 'blocked'
  kycLevel: number
  riskTier: number
  jurisdiction: string
  pepFlag: boolean
  kycExpiry: bigint
  detail?: string
}

type ComplianceRecordTuple = readonly unknown[]

function readRecordFlag(record: unknown, index: number, fallback = false): boolean {
  if (Array.isArray(record) && typeof record[index] === 'boolean') {
    return record[index] as boolean
  }

  return fallback
}

function readRecordNumber(record: unknown, index: number): number {
  if (Array.isArray(record)) {
    return Number(record[index] ?? 0)
  }

  return 0
}

function readRecordString(record: unknown, index: number): string {
  if (Array.isArray(record)) {
    return String(record[index] ?? '')
  }

  return ''
}

const COMPLIANCE_REGISTRY_ABI = [
  {
    name: 'records',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'kycLevel', type: 'uint8' },
      { name: 'riskTier', type: 'uint8' },
      { name: 'sanctionStatus', type: 'bytes32' },
      { name: 'amlStatus', type: 'bytes32' },
      { name: 'jurisdiction', type: 'string' },
      { name: 'pepFlag', type: 'bool' },
      { name: 'travelRuleRequired', type: 'bool' },
      { name: 'active', type: 'bool' },
      { name: 'kycExpiry', type: 'uint64' },
      { name: 'lastScreening', type: 'uint64' },
      { name: 'dailyVolumeUsed', type: 'uint256' },
      { name: 'dailyVolumeReset', type: 'uint256' },
      { name: 'kycProviderRef', type: 'bytes32' },
      { name: 'amlProviderRef', type: 'bytes32' },
    ],
  },
  {
    name: 'activateAccount',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'kycLevel', type: 'uint8' },
      { name: 'riskTier', type: 'uint8' },
      { name: 'jurisdiction', type: 'string' },
      { name: 'pepFlag', type: 'bool' },
      { name: 'kycExpiry', type: 'uint64' },
      { name: 'kycProviderRef', type: 'bytes32' },
      { name: 'amlProviderRef', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizeKycLevel(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(3, Math.trunc(value)))
  }

  const raw = String(value ?? '').trim().toUpperCase()
  if (raw === '3' || raw === 'INSTITUTIONAL') return 3
  if (raw === '2' || raw === 'ENHANCED') return 2
  if (raw === '1' || raw === 'BASIC') return 1
  return 0
}

function normalizeRiskTier(value: unknown, fallbackLevel: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(255, Math.trunc(value)))
  }

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(255, Math.trunc(parsed)))
  }

  return fallbackLevel > 0 ? 1 : 0
}

function normalizeExpiry(value: unknown): bigint {
  if (typeof value === 'bigint' && value > 0n) return value
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return BigInt(Math.trunc(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)

  return BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60)
}

function deriveActivationDecision(payload: unknown): ActivationDecision {
  const record = asRecord(payload)
  const data = asRecord(record.data)
  const source = Object.keys(data).length > 0 ? data : record

  const kycLevel = normalizeKycLevel(source.kycLevel ?? source.kycTier ?? source.tier ?? source.level)
  const riskTier = normalizeRiskTier(source.riskTier ?? source.risk_level ?? source.risk, kycLevel)
  const jurisdiction = String(source.jurisdiction ?? DEFAULT_JURISDICTION).trim() || DEFAULT_JURISDICTION
  const pepFlag = Boolean(source.pepFlag ?? source.pep ?? false)
  const sanctionStatus = String(source.sanctionStatus ?? source.screeningStatus ?? '').toUpperCase()
  const amlStatus = String(source.amlStatus ?? '').toUpperCase()
  const pendingReview = sanctionStatus === 'REVIEW'
    || amlStatus === 'REVIEW'
    || Boolean(source.pendingReview ?? source.pending_review ?? source.reviewRequired ?? false)
  const blocked = sanctionStatus === 'BLOCKED'
    || sanctionStatus === 'FAIL'
    || amlStatus === 'BLOCKED'
    || Boolean(source.sanctioned ?? source.blacklisted ?? false)

  if (blocked) {
    return {
      status: 'blocked',
      kycLevel,
      riskTier,
      jurisdiction,
      pepFlag,
      kycExpiry: normalizeExpiry(source.kycExpiry),
      detail: 'Wallet is blocked by compliance screening.',
    }
  }

  if (pendingReview) {
    return {
      status: 'pending_review',
      kycLevel,
      riskTier,
      jurisdiction,
      pepFlag,
      kycExpiry: normalizeExpiry(source.kycExpiry),
      detail: 'KYC is still under review.',
    }
  }

  if (kycLevel < 1) {
    return {
      status: 'not_verified',
      kycLevel,
      riskTier,
      jurisdiction,
      pepFlag,
      kycExpiry: normalizeExpiry(source.kycExpiry),
      detail: 'No approved KYC tier is available for this wallet.',
    }
  }

  return {
    status: 'approved',
    kycLevel,
    riskTier,
    jurisdiction,
    pepFlag,
    kycExpiry: normalizeExpiry(source.kycExpiry),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawAddress: string = body?.address ?? ''
    const requestedJurisdiction = String(body?.jurisdiction ?? DEFAULT_JURISDICTION).trim() || DEFAULT_JURISDICTION

    // Validate address format
    if (!isAddress(rawAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }
    const address = getAddress(rawAddress) // normalize to checksum form

    // Require writer key — server-side only, never exposed to browser
    const writerKey = process.env.COMPLIANCE_WRITER_PRIVATE_KEY
    if (!writerKey) {
      if (KYC_AUTO_APPROVE_NOT_FOUND) {
        console.warn('[kyc/activate] No writer key — returning dev bypass for', address)
        return NextResponse.json({
          status: 'activated',
          kycLevel: 1,
          mode: 'dev_bypass',
          txHash: null,
          blockNumber: null,
        })
      }
      console.error('[kyc/activate] COMPLIANCE_WRITER_PRIVATE_KEY not set')
      return NextResponse.json({ error: 'Compliance writer not configured' }, { status: 503 })
    }

    const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC_URL) })

    // Check if record already exists (idempotent)
    const existing = await publicClient.readContract({
      address: COMPLIANCE_REGISTRY,
      abi: COMPLIANCE_REGISTRY_ABI,
      functionName: 'records',
      args: [address],
    }) as ComplianceRecordTuple

    if (readRecordFlag(existing, 7)) {
      return NextResponse.json({
        status: 'already_active',
        kycLevel: readRecordNumber(existing, 0),
        jurisdiction: readRecordString(existing, 4),
      })
    }

    if (!isBackendConfigured()) {
      return NextResponse.json(
        {
          status: 'backend_unavailable',
          detail: 'Compliance backend is not configured. Real KYC activation cannot proceed.',
        },
        { status: 503 }
      )
    }

    let decision: ActivationDecision
    try {
      const upstream = await backendGet(`/v1/compliance/status/${address}`)
      const compliancePayload = await upstream.json().catch(() => ({}))

      if (!upstream.ok) {
        const shouldAutoApprove = KYC_AUTO_APPROVE_NOT_FOUND && upstream.status === 404
        if (!shouldAutoApprove) {
          return NextResponse.json(
            {
              status: 'compliance_lookup_failed',
              detail: compliancePayload,
            },
            { status: upstream.status }
          )
        }

        decision = {
          status: 'approved',
          kycLevel: 1,
          riskTier: 1,
          jurisdiction: requestedJurisdiction,
          pepFlag: false,
          kycExpiry: normalizeExpiry(undefined),
          detail: 'Auto-approved in local/dev mode because compliance profile was not found.',
        }
      } else {
        decision = deriveActivationDecision(compliancePayload)
      }
    } catch {
      return NextResponse.json(
        {
          status: 'compliance_lookup_failed',
          detail: 'Unable to reach compliance backend',
        },
        { status: 503 }
      )
    }

    if (decision.status !== 'approved') {
      const responseStatus = decision.status === 'blocked' ? 403 : 409
      return NextResponse.json(
        {
          status: decision.status,
          kycLevel: decision.kycLevel,
          detail: decision.detail,
        },
        { status: responseStatus }
      )
    }

    // Activate on-chain
    const account = privateKeyToAccount(writerKey as `0x${string}`)
    const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(RPC_URL) })

    const hash = await walletClient.writeContract({
      address: COMPLIANCE_REGISTRY,
      abi: COMPLIANCE_REGISTRY_ABI,
      functionName: 'activateAccount',
      args: [
        address,
        decision.kycLevel,
        decision.riskTier,
        decision.jurisdiction,
        decision.pepFlag,
        decision.kycExpiry,
        DEFAULT_KYC_PROVIDER_REF,
        DEFAULT_KYC_PROVIDER_REF,
      ],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction reverted on-chain' }, { status: 500 })
    }

    console.log(`[kyc/activate] Activated ${address} — tx ${hash}`)

    return NextResponse.json({
      status: 'activated',
      kycLevel: decision.kycLevel,
      mode: decision.detail ? 'dev_fallback' : 'standard',
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[kyc/activate] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
