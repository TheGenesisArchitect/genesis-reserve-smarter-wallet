// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useStrategyAllocations.ts
//
// Reads live allocation state from StrategyRouter.sol every 60 seconds.
// Replaces the hardcoded mock data in WalletBalance.tsx.
//
// Returns:
//   - allocations[]  — per-adapter deployment amounts + APY + liquidity band
//   - blendedApy     — weighted average APY across all strategies (float, %)
//   - totalDeployed  — total USDC deployed (not sitting in liquid buffer)
//   - liquidBuffer   — USDC sitting in vault awaiting deployment
//   - circuitBreaker — whether the emergency pause is active
//   - epochState     — current epoch number + time-to-next-harvest
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { ACTIVE_CONTRACTS, PROTOCOL } from '../config/contracts'
import { STRATEGY_ROUTER_ABI, LiquidityBand, BAND_LABELS, BAND_COLORS } from '../abis/strategy-router.abi'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StrategyAllocation {
  adapter: `0x${string}`
  name: string
  deployedUsdc: string          // Formatted USDC (e.g. "42,150.00")
  deployedRaw: bigint
  currentBps: number          // Current allocation bps (e.g. 2000 = 20%)
  pct: number          // Percentage for display (e.g. 20.0)
  apyBps: number          // Per-adapter APY bps
  apy: number          // Per-adapter APY as float % (e.g. 4.12)
  riskScore: number          // 0–100
  liquidityBand: LiquidityBand
  bandLabel: string          // "INSTANT" | "HOURS" | "DAYS"
  bandColor: string          // Hex color for UI
  isActive: boolean
}

export interface EpochState {
  epochNumber: number
  epochStartTime: number        // Unix timestamp
  epochDuration: number        // Seconds (900 = 15 min)
  harvestCount: number
  secondsToNext: number        // Seconds until next harvest
  pctComplete: number        // 0–100, how far through current epoch
}

export interface YieldSnapshot {
  totalDeployed: string      // Formatted USDC
  blendedApy: number      // Weighted APY float %
  blendedApyBps: number      // Weighted APY bps
  lastHarvestTime: number      // Unix timestamp
  nextHarvestTime: number      // Unix timestamp
  totalYieldAccrued: string      // Formatted USDC
}

export interface StrategyAllocationsState {
  allocations: StrategyAllocation[]
  yieldSnapshot: YieldSnapshot | null
  epochState: EpochState | null
  circuitBreakerActive: boolean
  usdcPrice: number      // USDC/USD price from Chainlink
  isLoading: boolean
  error: Error | null
  refresh: () => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useStrategyAllocations(): StrategyAllocationsState {
  const routerAddress = ACTIVE_CONTRACTS.STRATEGY_ROUTER

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      // [0] Full allocation array
      {
        address: routerAddress,
        abi: STRATEGY_ROUTER_ABI,
        functionName: 'getStrategyAllocations',
        args: [],
      },
      // [1] Yield snapshot — blended APY, total deployed, last harvest
      {
        address: routerAddress,
        abi: STRATEGY_ROUTER_ABI,
        functionName: 'getYieldSnapshot',
        args: [],
      },
      // [2] Epoch state — for time-to-next-harvest countdown
      {
        address: routerAddress,
        abi: STRATEGY_ROUTER_ABI,
        functionName: 'getEpochState',
        args: [],
      },
      // [3] Circuit breaker status
      {
        address: routerAddress,
        abi: STRATEGY_ROUTER_ABI,
        functionName: 'isCircuitBreakerActive',
        args: [],
      },
      // [4] USDC/USD Chainlink price
      {
        address: routerAddress,
        abi: STRATEGY_ROUTER_ABI,
        functionName: 'getUsdcPrice',
        args: [],
      },
    ],
    query: {
      refetchInterval: 60_000,   // Refresh every 60s (allocation shifts are slow)
      staleTime: 30_000,
    },
  })

  // ── Parse allocation array ────────────────────────────────────────────────
  const rawAllocations = (data?.[0]?.result ?? []) as Array<{
    adapter: `0x${string}`
    name: string
    deployedUsdc: bigint
    maxBps: bigint
    currentBps: bigint
    riskScore: bigint
    liquidityBand: number
    isActive: boolean
  }>

  const allocations: StrategyAllocation[] = useMemo(() => {
    if (!rawAllocations.length) return FALLBACK_ALLOCATIONS

    return rawAllocations
      .filter(a => a.isActive)
      .map(a => {
        const band = a.liquidityBand as LiquidityBand
        const currentBps = Number(a.currentBps)
        return {
          adapter: a.adapter,
          name: a.name,
          deployedUsdc: Number(formatUnits(a.deployedUsdc, PROTOCOL.USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          deployedRaw: a.deployedUsdc,
          currentBps,
          pct: currentBps / 100,
          apyBps: 0,      // Populated individually by useYieldEngine if needed
          apy: 0,
          riskScore: Number(a.riskScore),
          liquidityBand: band,
          bandLabel: BAND_LABELS[band],
          bandColor: BAND_COLORS[band],
          isActive: a.isActive,
        }
      })
  }, [rawAllocations])

  // ── Parse yield snapshot ──────────────────────────────────────────────────
  const rawSnapshot = data?.[1]?.result as {
    totalDeployed: bigint
    blendedApyBps: bigint
    lastHarvestTime: bigint
    nextHarvestTime: bigint
    totalYieldAccrued: bigint
  } | undefined

  const yieldSnapshot: YieldSnapshot | null = rawSnapshot ? {
    totalDeployed: Number(formatUnits(rawSnapshot.totalDeployed, PROTOCOL.USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    blendedApy: Number(rawSnapshot.blendedApyBps) / 100,
    blendedApyBps: Number(rawSnapshot.blendedApyBps),
    lastHarvestTime: Number(rawSnapshot.lastHarvestTime),
    nextHarvestTime: Number(rawSnapshot.nextHarvestTime),
    totalYieldAccrued: Number(formatUnits(rawSnapshot.totalYieldAccrued, PROTOCOL.USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 4 }),
  } : null

  // ── Parse epoch state ─────────────────────────────────────────────────────
  const rawEpoch = data?.[2]?.result as {
    epochNumber: bigint
    epochStartTime: bigint
    epochDuration: bigint
    harvestCount: bigint
  } | undefined

  const epochState: EpochState | null = useMemo(() => {
    if (!rawEpoch) return null
    const now = Math.floor(Date.now() / 1000)
    const startTime = Number(rawEpoch.epochStartTime)
    const duration = Number(rawEpoch.epochDuration)
    const elapsed = now - startTime
    const secondsToNext = Math.max(0, duration - elapsed)
    const pctComplete = Math.min(100, (elapsed / duration) * 100)
    return {
      epochNumber: Number(rawEpoch.epochNumber),
      epochStartTime: startTime,
      epochDuration: duration,
      harvestCount: Number(rawEpoch.harvestCount),
      secondsToNext,
      pctComplete,
    }
  }, [rawEpoch])

  // ── Parse circuit breaker + USDC price ───────────────────────────────────
  const circuitBreakerActive = (data?.[3]?.result ?? false) as boolean
  const rawPrice = data?.[4]?.result as { price: bigint; updatedAt: bigint } | undefined
  const usdcPrice = rawPrice ? Number(rawPrice.price) / 1e8 : 1.0

  return {
    allocations,
    yieldSnapshot,
    epochState,
    circuitBreakerActive,
    usdcPrice,
    isLoading,
    error: error as Error | null,
    refresh: refetch,
  }
}

// ── Fallback allocations (shown before first on-chain read completes) ─────────
// Matches Week 1 deployment: Aave V3 + Balancer V3 only (Morpho pending)
const FALLBACK_ALLOCATIONS: StrategyAllocation[] = [
  {
    adapter: '0xa6F089338Ae75306217336054B36C02c3Bc5554D' as `0x${string}`,
    name: 'Aave V3',
    deployedUsdc: '0.00',
    deployedRaw: 0n,
    currentBps: 4000,
    pct: 40,
    apyBps: 412,
    apy: 4.12,
    riskScore: 15,
    liquidityBand: LiquidityBand.INSTANT,
    bandLabel: 'INSTANT',
    bandColor: BAND_COLORS[LiquidityBand.INSTANT],
    isActive: true,
  },
  {
    adapter: '0x6291Ed9FC028F872D14B1da79de60a63e7Ec6624' as `0x${string}`,
    name: 'Balancer V3',
    deployedUsdc: '0.00',
    deployedRaw: 0n,
    currentBps: 3500,
    pct: 35,
    apyBps: 621,
    apy: 6.21,
    riskScore: 40,
    liquidityBand: LiquidityBand.HOURS,
    bandLabel: 'HOURS',
    bandColor: BAND_COLORS[LiquidityBand.HOURS],
    isActive: true,
  },
  {
    adapter: ACTIVE_CONTRACTS.TBILL_ADAPTER,
    name: 'T-Bills (Ondo)',
    deployedUsdc: '0.00',
    deployedRaw: 0n,
    currentBps: 2500,
    pct: 25,
    apyBps: 492,
    apy: 4.92,
    riskScore: 10,
    liquidityBand: LiquidityBand.DAYS,
    bandLabel: 'DAYS',
    bandColor: BAND_COLORS[LiquidityBand.DAYS],
    isActive: true,
  },
  {
    adapter: '0x0000000000000000000000000000000000000004' as `0x${string}`,
    name: 'Morpho Blue',
    deployedUsdc: '0.00',
    deployedRaw: 0n,
    currentBps: 1000,
    pct: 10,
    apyBps: 584,
    apy: 5.84,
    riskScore: 30,
    liquidityBand: LiquidityBand.HOURS,
    bandLabel: 'HOURS',
    bandColor: BAND_COLORS[LiquidityBand.HOURS],
    isActive: false, // Morpho not yet on Arbitrum — pending Week 3 research
  },
]
