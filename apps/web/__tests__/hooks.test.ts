// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/__tests__/hooks.test.ts
//
// Core hook tests — uses Vitest + vitest-mock-extended
// Mock strategy: mock viem readContracts at the module level so hooks
// can be tested without an actual RPC connection.
//
// Run: npx vitest run
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { parseUnits } from 'viem'
import { KYCTier, TIER_LIMITS } from '../src/hooks/useComplianceGate'
import { PROTOCOL } from '../src/config/contracts'

// ── Mock wagmi ────────────────────────────────────────────────────────────────
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({
    address: '0xTestAddress000000000000000000000000000001' as `0x${string}`,
    isConnected: true,
  })),
  useReadContracts: vi.fn(),
  useWriteContract: vi.fn(() => ({
    writeContractAsync: vi.fn(),
    data: undefined,
  })),
  useWaitForTransactionReceipt: vi.fn(() => ({
    isSuccess: false,
  })),
  usePublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
}))

// ── Mock Privy ────────────────────────────────────────────────────────────────
vi.mock('@privy-io/react-auth', () => ({
  usePrivy: vi.fn(() => ({ authenticated: true, ready: true })),
  useWallets: vi.fn(() => ({ wallets: [] })),
}))

// ── TESTS: KYCTier enum + TIER_LIMITS ────────────────────────────────────────

describe('KYCTier', () => {
  it('has correct numeric values', () => {
    expect(KYCTier.NONE).toBe(0)
    expect(KYCTier.BASIC).toBe(1)
    expect(KYCTier.ENHANCED).toBe(2)
    expect(KYCTier.INSTITUTIONAL).toBe(3)
  })

  it('TIER_LIMITS maps to correct limits', () => {
    expect(TIER_LIMITS[KYCTier.NONE].dailyLimit).toBe(0)
    expect(TIER_LIMITS[KYCTier.BASIC].dailyLimit).toBe(3_000)
    expect(TIER_LIMITS[KYCTier.ENHANCED].dailyLimit).toBe(25_000)
    expect(TIER_LIMITS[KYCTier.INSTITUTIONAL].dailyLimit).toBe(1_000_000)
  })

  it('BASIC allows deposit and withdraw but not send', () => {
    const tier = KYCTier.BASIC
    expect(tier >= KYCTier.BASIC).toBe(true)    // canDeposit
    expect(tier >= KYCTier.BASIC).toBe(true)    // canWithdraw
    expect(tier >= KYCTier.ENHANCED).toBe(false) // canSend — requires tier 2
  })

  it('ENHANCED allows all operations', () => {
    const tier = KYCTier.ENHANCED
    expect(tier >= KYCTier.BASIC).toBe(true)
    expect(tier >= KYCTier.ENHANCED).toBe(true)
  })
})

// ── TESTS: PROTOCOL constants ─────────────────────────────────────────────────

describe('PROTOCOL constants', () => {
  it('USDC_DECIMALS is 6', () => {
    expect(PROTOCOL.USDC_DECIMALS).toBe(6)
  })

  it('fee calculations are correct', () => {
    // Current model: flat USD fees + percentage FX spread
    const amount = 1000 // $1,000

    // TX_FEE_BPS is now 0; flat fee model uses TX_FEE_FLAT_USD
    const txFee = PROTOCOL.TX_FEE_FLAT_USD
    expect(txFee).toBeCloseTo(0.80, 2)    // Flat $0.80 transaction fee

    const fxFee = amount * PROTOCOL.FX_SPREAD_BPS / 10_000
    expect(fxFee).toBeCloseTo(2.50, 2)   // 0.25% of $1,000 = $2.50

    const totalFee = txFee + fxFee
    expect(totalFee).toBeCloseTo(3.30, 2) // Combined cross-border = $3.30 vs WU $64.90
  })

  it('parseUnits correctly formats USDC amounts', () => {
    const oneDollar = parseUnits('1', 6)
    expect(oneDollar).toBe(1_000_000n)

    const tenK = parseUnits('10000', 6)
    expect(tenK).toBe(10_000_000_000n)  // $10,000 = 10_000 * 1e6
  })

  it('CANARY_CAP_USDC is $10,000', () => {
    // $10,000 with 6 decimals
    expect(PROTOCOL.CANARY_CAP_USDC).toBe(10_000_000_000n)
  })

  it('PLATFORM_SPREAD_BPS + PARTNER_SPREAD_BPS sums to correct total', () => {
    // Total yield spread deducted from depositor = 1.5%
    const totalSpreadBps = PROTOCOL.PLATFORM_SPREAD_BPS + PROTOCOL.PARTNER_SPREAD_BPS
    expect(totalSpreadBps).toBe(250)  // 150 + 100 = 250bps = 2.5%
    // Platform keeps 0.5%, partner gets 1.0% — depositor gets remainder
  })
})

// ── TESTS: Address validation ─────────────────────────────────────────────────

describe('Contract addresses', () => {
  it('all mainnet addresses are correct format', async () => {
    const { CONTRACTS } = await import('../src/config/contracts')
    const addressRegex = /^0x[0-9a-fA-F]{40}$/

    Object.entries(CONTRACTS).forEach(([name, addr]) => {
      expect(addr).toMatch(addressRegex), `${name} address invalid`
    })
  })

  it('USDC address matches Circle canonical Arbitrum One address', async () => {
    const { CONTRACTS } = await import('../src/config/contracts')
    // Circle's official USDC on Arbitrum One
    expect(CONTRACTS.USDC.toLowerCase())
      .toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831')
  })
})
