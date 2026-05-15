// ─────────────────────────────────────────────────────────────────────────────
// genesis-reserve-backend/src/services/yield.service.ts
//
// Backend yield engine service — the server-side complement to the frontend
// hook layer. Runs as part of the Express.js API gateway.
//
// Responsibilities:
//   1. getYieldSnapshot()     — Current blended APY + deployed capital
//   2. getStrategyAllocations()— Per-adapter allocation with live APY
//   3. getAccountYieldHistory()— User's personal yield earning history
//   4. generateRiskReport()   — Risk metrics for the compliance dashboard
//   5. triggerHarvestCheck()  — Called by cron every 15 minutes; executes
//                               harvest() on StrategyRouter if epoch elapsed
//   6. computeRollingApy()    — Derives APY from historic harvest data
//   7. getEpochSummary()      — Aggregated epoch performance for dashboards
//
// Dependencies: viem (chain reads), ioredis (caching), pg (ledger writes)
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'
import { STRATEGY_ROUTER_ABI } from '../abis/strategy-router.abi'
import { GENESIS_VAULT_ABI } from '../abis/vault.abi'

// ── Environment ──────────────────────────────────────────────────────────────

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!
const STRATEGY_ROUTER_ADDR = process.env.STRATEGY_ROUTER_ADDRESS! as `0x${string}`
const GENESIS_VAULT_ADDR = process.env.GENESIS_VAULT_ADDRESS! as `0x${string}`
const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY! as `0x${string}`

const USDC_DECIMALS = 6
const EPOCH_SECONDS = 900  // 15 minutes

// ── viem clients ─────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(ALCHEMY_RPC, { batch: true, retryCount: 3 }),
})

const operatorAccount = privateKeyToAccount(OPERATOR_KEY)

const walletClient = createWalletClient({
  account: operatorAccount,
  chain: arbitrum,
  transport: http(ALCHEMY_RPC),
})

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YieldSnapshotResult {
  totalDeployed: string   // Formatted USDC (e.g. "94,230.41")
  totalDeployedRaw: bigint
  blendedApyBps: number   // e.g. 532 = 5.32%
  blendedApy: number   // e.g. 5.32
  lastHarvestTime: number   // Unix timestamp
  nextHarvestTime: number   // Unix timestamp
  totalYieldAccrued: string   // Formatted USDC
  circuitBreakerActive: boolean
}

export interface StrategyAllocationResult {
  adapter: string
  name: string
  deployedUsdc: string
  pct: number        // Allocation percentage (0–100)
  apyBps: number
  apy: number
  riskScore: number
  liquidityBand: number       // 0=INSTANT, 1=HOURS, 2=DAYS
  isActive: boolean
}

export interface AccountYieldHistoryResult {
  epochNumber: number
  timestamp: number
  yieldEarned: string       // User's share of yield (formatted USDC)
  apyAtEpoch: number       // APY during that epoch
  balanceAtEpoch: string       // User's vault balance at harvest time
  txHash: string
}

export interface RiskReport {
  overallRisk: number   // 0–100 composite score
  concentrationRisk: number   // Highest single-protocol exposure %
  liquidityRisk: string   // "LOW" | "MEDIUM" | "HIGH"
  depegRisk: string
  usdcPrice: number
  circuitBreakerArmed: boolean
  recommendations: string[]
}

// ── 1. getYieldSnapshot ───────────────────────────────────────────────────────

export async function getYieldSnapshot(): Promise<YieldSnapshotResult> {
  const [snapshot, circuitBreaker, priceResult] = await Promise.all([
    publicClient.readContract({
      address: STRATEGY_ROUTER_ADDR,
      abi: STRATEGY_ROUTER_ABI,
      functionName: 'getYieldSnapshot',
    }),
    publicClient.readContract({
      address: STRATEGY_ROUTER_ADDR,
      abi: STRATEGY_ROUTER_ABI,
      functionName: 'isCircuitBreakerActive',
    }),
    publicClient.readContract({
      address: STRATEGY_ROUTER_ADDR,
      abi: STRATEGY_ROUTER_ABI,
      functionName: 'getUsdcPrice',
    }),
  ])

  const { totalDeployed, blendedApyBps, lastHarvestTime, nextHarvestTime, totalYieldAccrued } = snapshot as unknown as {
    totalDeployed: bigint; blendedApyBps: bigint; lastHarvestTime: bigint; nextHarvestTime: bigint; totalYieldAccrued: bigint
  }

  return {
    totalDeployed: formatUSDC(totalDeployed),
    totalDeployedRaw: totalDeployed,
    blendedApyBps: Number(blendedApyBps),
    blendedApy: Number(blendedApyBps) / 100,
    lastHarvestTime: Number(lastHarvestTime),
    nextHarvestTime: Number(nextHarvestTime),
    totalYieldAccrued: formatUSDC(totalYieldAccrued),
    circuitBreakerActive: circuitBreaker as boolean,
  }
}

// ── 2. getStrategyAllocations ─────────────────────────────────────────────────

export async function getStrategyAllocations(): Promise<StrategyAllocationResult[]> {
  const allocations = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR,
    abi: STRATEGY_ROUTER_ABI,
    functionName: 'getStrategyAllocations',
  }) as Array<{
    adapter: `0x${string}`; name: string; deployedUsdc: bigint
    maxBps: bigint; currentBps: bigint; riskScore: bigint
    liquidityBand: number; isActive: boolean
  }>

  return allocations.map(a => ({
    adapter: a.adapter,
    name: a.name,
    deployedUsdc: formatUSDC(a.deployedUsdc),
    pct: Number(a.currentBps) / 100,
    apyBps: 0,  // Fetched individually if needed
    apy: 0,
    riskScore: Number(a.riskScore),
    liquidityBand: a.liquidityBand,
    isActive: a.isActive,
  }))
}

// ── 3. getAccountYieldHistory ─────────────────────────────────────────────────
// Derives a user's personal yield history by:
//   1. Reading their historic share count at each epoch (from transfer events)
//   2. Reading the harvest yield for each epoch
//   3. Computing their proportional share: userYield = totalYield × (userShares / totalShares)

export async function getAccountYieldHistory(
  userAddress: `0x${string}`,
  epochCount: number = 96   // Default: 24 hours (96 × 15 min)
): Promise<AccountYieldHistoryResult[]> {
  // Get current epoch number
  const epochStateResult = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR,
    abi: STRATEGY_ROUTER_ABI,
    functionName: 'getEpochState',
  }) as unknown as { epochNumber: bigint; epochStartTime: bigint; epochDuration: bigint; harvestCount: bigint }

  const currentEpoch = Number(epochStateResult.epochNumber)
  const fromEpoch = Math.max(0, currentEpoch - epochCount)

  // Fetch harvest history for the range
  const harvestRecords = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR,
    abi: STRATEGY_ROUTER_ABI,
    functionName: 'getHarvestHistory',
    args: [BigInt(fromEpoch), BigInt(currentEpoch)],
  }) as Array<{
    epoch: bigint; timestamp: bigint; yieldUsdc: bigint; apyBps: bigint; totalAum: bigint
  }>

  // Get user's current share balance (simplified — in production, use historic balance)
  const [userShares, totalSupply] = await Promise.all([
    publicClient.readContract({
      address: GENESIS_VAULT_ADDR, abi: GENESIS_VAULT_ABI,
      functionName: 'balanceOf', args: [userAddress],
    }),
    publicClient.readContract({
      address: GENESIS_VAULT_ADDR, abi: GENESIS_VAULT_ABI,
      functionName: 'totalSupply',
    }),
  ])

  const userShareFraction = Number(totalSupply) > 0
    ? Number(userShares) / Number(totalSupply)
    : 0

  return harvestRecords.map(record => {
    const totalYield = Number(formatUnits(record.yieldUsdc, USDC_DECIMALS))
    const userYield = totalYield * userShareFraction

    return {
      epochNumber: Number(record.epoch),
      timestamp: Number(record.timestamp),
      yieldEarned: userYield.toFixed(6),
      apyAtEpoch: Number(record.apyBps) / 100,
      balanceAtEpoch: formatUSDC(record.totalAum),
      txHash: '',  // Populated from event logs in production
    }
  })
}

// ── 4. generateRiskReport ─────────────────────────────────────────────────────

export async function generateRiskReport(): Promise<RiskReport> {
  const [allocations, snapshot, priceResult] = await Promise.all([
    getStrategyAllocations(),
    getYieldSnapshot(),
    publicClient.readContract({
      address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
      functionName: 'getUsdcPrice',
    }) as unknown as Promise<{ price: bigint; updatedAt: bigint }>,
  ])

  const usdcPrice = Number((priceResult as any).price) / 1e8
  const maxSingleExposure = Math.max(...allocations.map(a => a.pct))
  const activeAllocs = allocations.filter(a => a.isActive)

  // Days-band exposure
  const daysExposure = activeAllocs
    .filter(a => a.liquidityBand === 2) // DAYS
    .reduce((sum, a) => sum + a.pct, 0)

  // Composite risk score
  const concentrationRisk = maxSingleExposure > 40 ? 40 : maxSingleExposure > 30 ? 25 : 10
  const liquidityRiskNum = daysExposure > 30 ? 30 : daysExposure > 20 ? 15 : 5
  const depegRiskNum = usdcPrice < 0.998 ? 40 : usdcPrice < 0.999 ? 20 : 0
  const overallRisk = Math.min(100, concentrationRisk + liquidityRiskNum + depegRiskNum)

  const recommendations: string[] = []
  if (maxSingleExposure > 40) recommendations.push('Single protocol concentration exceeds 40% limit — rebalancing required')
  if (daysExposure > 25) recommendations.push('DAYS-band exposure elevated — consider shifting to INSTANT/HOURS adapters')
  if (usdcPrice < 0.999) recommendations.push(`USDC peg at $${usdcPrice.toFixed(4)} — monitor circuit breaker threshold`)
  if (snapshot.circuitBreakerActive) recommendations.push('CIRCUIT BREAKER ACTIVE — manual review required before resuming operations')
  if (recommendations.length === 0) recommendations.push('All risk metrics within normal parameters')

  return {
    overallRisk,
    concentrationRisk: maxSingleExposure,
    liquidityRisk: daysExposure > 30 ? 'HIGH' : daysExposure > 20 ? 'MEDIUM' : 'LOW',
    depegRisk: usdcPrice < 0.997 ? 'HIGH' : usdcPrice < 0.999 ? 'MEDIUM' : 'LOW',
    usdcPrice,
    circuitBreakerArmed: !snapshot.circuitBreakerActive,
    recommendations,
  }
}

// ── 5. triggerHarvestCheck ────────────────────────────────────────────────────
// Called by cron job every 5 minutes. Checks if epoch has elapsed.
// If yes, calls StrategyRouter.harvest() via the Operator wallet.
// The harvest() function is not in the public ABI — it's restricted to HARVESTER_ROLE.

export async function triggerHarvestCheck(): Promise<{
  harvested: boolean
  txHash: string | null
  reason: string
}> {
  const epochState = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
    functionName: 'getEpochState',
  }) as unknown as { epochNumber: bigint; epochStartTime: bigint; epochDuration: bigint; harvestCount: bigint }

  const now = Math.floor(Date.now() / 1000)
  const epochEnd = Number(epochState.epochStartTime) + Number(epochState.epochDuration)

  if (now < epochEnd) {
    const remaining = epochEnd - now
    return { harvested: false, txHash: null, reason: `Epoch ${epochState.epochNumber} not yet complete. ${remaining}s remaining.` }
  }

  // Check circuit breaker
  const cbActive = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
    functionName: 'isCircuitBreakerActive',
  })
  if (cbActive) {
    return { harvested: false, txHash: null, reason: 'Circuit breaker active — harvest suspended' }
  }

  // Execute harvest via operator wallet
  // NOTE: harvest() function signature — add to ABI for operator-only backend use
  const txHash = await walletClient.writeContract({
    chain: arbitrum,
    address: STRATEGY_ROUTER_ADDR,
    abi: [...STRATEGY_ROUTER_ABI, {
      name: 'harvest', type: 'function', stateMutability: 'nonpayable',
      inputs: [], outputs: [{ name: 'yieldUsdc', type: 'uint256' }],
    }] as const,
    functionName: 'harvest',
  })

  return {
    harvested: true,
    txHash,
    reason: `Harvest executed for epoch ${epochState.epochNumber}`,
  }
}

// ── 6. computeRollingApy ─────────────────────────────────────────────────────
// Computes rolling APY over N days from harvest history.
// More accurate than per-epoch APY — smooths out single-epoch variance.

export async function computeRollingApy(days: number = 7): Promise<{
  rollingApy: number
  epochsAnalyzed: number
  totalYield: string
  avgEpochYield: string
}> {
  const epochCount = days * 24 * 4  // 4 epochs per hour × 24h × days

  const epochState = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
    functionName: 'getEpochState',
  }) as unknown as { epochNumber: bigint }

  const currentEpoch = Number(epochState.epochNumber)
  const fromEpoch = Math.max(0, currentEpoch - epochCount)

  const records = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
    functionName: 'getHarvestHistory',
    args: [BigInt(fromEpoch), BigInt(currentEpoch)],
  }) as Array<{ epoch: bigint; timestamp: bigint; yieldUsdc: bigint; apyBps: bigint; totalAum: bigint }>

  if (!records.length) return { rollingApy: 0, epochsAnalyzed: 0, totalYield: '0.00', avgEpochYield: '0.00' }

  const totalYieldRaw = records.reduce((sum, r) => sum + Number(r.yieldUsdc), 0)
  const avgAum = records.reduce((sum, r) => sum + Number(r.totalAum), 0) / records.length
  const periodSeconds = records.length * EPOCH_SECONDS
  const annualizedRate = avgAum > 0
    ? (totalYieldRaw / avgAum) * (365.25 * 86400 / periodSeconds) * 100
    : 0

  return {
    rollingApy: Math.min(25, annualizedRate),  // Cap at 25% — sanity check
    epochsAnalyzed: records.length,
    totalYield: (totalYieldRaw / 1e6).toFixed(4),
    avgEpochYield: (totalYieldRaw / records.length / 1e6).toFixed(6),
  }
}

// ── 7. getEpochSummary ────────────────────────────────────────────────────────

export async function getEpochSummary(): Promise<{
  currentEpoch: number
  epochProgress: number   // 0–100
  secondsToNext: number
  lastHarvestApy: number
  harvestCount: number
}> {
  const epochState = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
    functionName: 'getEpochState',
  }) as unknown as { epochNumber: bigint; epochStartTime: bigint; epochDuration: bigint; harvestCount: bigint }

  const now = Math.floor(Date.now() / 1000)
  const elapsed = now - Number(epochState.epochStartTime)
  const duration = Number(epochState.epochDuration)
  const secondsToNext = Math.max(0, duration - elapsed)
  const epochProgress = Math.min(100, (elapsed / duration) * 100)

  const latestHarvests = await publicClient.readContract({
    address: STRATEGY_ROUTER_ADDR, abi: STRATEGY_ROUTER_ABI,
    functionName: 'getHarvestHistory',
    args: [BigInt(Math.max(0, Number(epochState.epochNumber) - 1)), epochState.epochNumber],
  }) as unknown as Array<{ apyBps: bigint }>

  const lastHarvestApy = latestHarvests.length > 0
    ? Number(latestHarvests[latestHarvests.length - 1].apyBps) / 100
    : 0

  return {
    currentEpoch: Number(epochState.epochNumber),
    epochProgress,
    secondsToNext,
    lastHarvestApy,
    harvestCount: Number(epochState.harvestCount),
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatUSDC(raw: bigint): string {
  return Number(formatUnits(raw, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}
