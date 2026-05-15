// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useYieldEngine.ts
//
// Master orchestration hook for the Yield Engine Layer.
// Combines:
//   - useStrategyAllocations  (on-chain allocation state, 60s poll)
//   - useHarvestEvents        (real-time WebSocket harvest events)
//   - useYieldTicker          (per-second interpolated balance ticker)
//   - useGenesisVault         (user balance + share price)
//
// This is the single hook the YieldEngineDashboard consumes.
// No component should need to call multiple yield hooks separately.
//
// Data hierarchy (highest priority wins for APY display):
//   1. Latest YieldHarvested event APY  (most recent, real-time)
//   2. YieldSnapshot.blendedApy         (from 60s poll)
//   3. useYieldTicker.apy               (derived from 30s share price delta)
//   4. Fallback: no APY                 (shown as loading until live data arrives)
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useCallback } from 'react'
import { useWalletStore } from '../store/wallet.store'
import { useStrategyAllocations } from './useStrategyAllocations'
import { useHarvestEvents } from './useHarvestEvents'
import { useYieldTicker } from './useYieldTicker'
import { useGenesisVault } from './useGenesisVault'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YieldEngineState {
  // ── Live APY (highest-confidence source) ───────────────────────────────────
  displayApy: number         // What to show in the UI (best available)
  apySource: 'harvest' | 'snapshot' | 'ticker' | 'fallback'

  // ── Per-Protocol Breakdown ──────────────────────────────────────────────────
  allocations: ReturnType<typeof useStrategyAllocations>['allocations']
  yieldSnapshot: ReturnType<typeof useStrategyAllocations>['yieldSnapshot']

  // ── Epoch / Harvest Timing ──────────────────────────────────────────────────
  epochState: ReturnType<typeof useStrategyAllocations>['epochState']
  latestHarvest: ReturnType<typeof useHarvestEvents>['latestHarvest']
  harvestHistory: ReturnType<typeof useHarvestEvents>['harvestHistory']
  wsConnected: boolean

  // ── Wallet / Vault balances (on-chain, via wagmi) ──────────────────────────
  vaultUsdcBalance: number         // User's current vault position (maxWithdraw)
  walletUsdcBalance: number         // Direct USDC held in user's wallet EOA

  // ── Live Balance Ticker ─────────────────────────────────────────────────────
  liveBalance: number
  yieldToday: number
  yieldTodayDisplay: string
  sessionYieldUsdc: number

  // ── Safety ─────────────────────────────────────────────────────────────────
  circuitBreakerActive: boolean
  usdcPrice: number

  // ── Loading / Error ─────────────────────────────────────────────────────────
  isLoading: boolean
  isGasless: boolean

  // ── APY History for chart (array of {timestamp, apy}) ──────────────────────
  apyHistory: Array<{ timestamp: number; apy: number; yieldUsdc: string }>

  // ── Actions ─────────────────────────────────────────────────────────────────
  refresh: () => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useYieldEngine(): YieldEngineState {
  const { addToast } = useWalletStore()

  // ── Layer 1: On-chain strategy state (60s poll) ───────────────────────────
  const {
    allocations,
    yieldSnapshot,
    epochState,
    circuitBreakerActive,
    usdcPrice,
    isLoading: allocLoading,
    refresh: refreshAlloc,
  } = useStrategyAllocations()

  // ── Layer 2: User vault position (30s poll) ───────────────────────────────
  const {
    usdcBalance,
    walletUsdcBalance: walletUsdcBalanceRaw,
    isLoading: vaultLoading,
    isGasless,
    refresh: refreshVault,
  } = useGenesisVault()

  const baseBalance = parseFloat(usdcBalance || '0')

  // ── Layer 3: Real-time WebSocket harvest events ───────────────────────────
  const onHarvest = useCallback((event: ReturnType<typeof useHarvestEvents>['latestHarvest'] & object) => {
    // When a harvest fires, immediately refresh vault balance and allocations
    refreshVault()
    refreshAlloc()
    // Show toast notification
    addToast(
      `⚡ Yield Harvested: +$${(event as any).totalYieldUsdc} USDC at ${(event as any).blendedApy.toFixed(2)}% APY`,
      'success'
    )
  }, [refreshVault, refreshAlloc, addToast])

  const {
    latestHarvest,
    harvestHistory,
    isConnected: wsConnected,
    sessionYieldUsdc,
  } = useHarvestEvents(onHarvest as any)

  // ── Layer 4: Per-second ticker (interpolates between harvests) ────────────
  // Use the best available APY as the ticker's basis
  const snapshotApy = yieldSnapshot?.blendedApy ?? 0
  const {
    apy: tickerApy,
    liveBalance,
    yieldToday,
    yieldTodayDisplay,
    isReady: tickerReady,
  } = useYieldTicker(baseBalance, baseBalance > 0)

  // ── APY resolution: pick highest-confidence source ────────────────────────
  const { displayApy, apySource } = useMemo(() => {
    if (latestHarvest && latestHarvest.blendedApy > 0) {
      return { displayApy: latestHarvest.blendedApy, apySource: 'harvest' as const }
    }
    if (snapshotApy > 0) {
      return { displayApy: snapshotApy, apySource: 'snapshot' as const }
    }
    if (tickerApy > 0) {
      return { displayApy: tickerApy, apySource: 'ticker' as const }
    }
    return { displayApy: 0, apySource: 'fallback' as const }
  }, [latestHarvest, snapshotApy, tickerApy])

  // ── Build APY history from harvest events ─────────────────────────────────
  const apyHistory = useMemo(() => {
    return harvestHistory
      .map(h => ({
        timestamp: h.timestamp,
        apy: h.blendedApy,
        yieldUsdc: h.totalYieldUsdc,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [harvestHistory])

  const refresh = useCallback(() => {
    refreshVault()
    refreshAlloc()
  }, [refreshVault, refreshAlloc])

  return {
    displayApy,
    apySource,
    allocations,
    yieldSnapshot,
    epochState,
    latestHarvest,
    harvestHistory,
    wsConnected,
    liveBalance,
    vaultUsdcBalance: parseFloat(usdcBalance || '0'),
    walletUsdcBalance: parseFloat(walletUsdcBalanceRaw || '0'),
    yieldToday,
    yieldTodayDisplay,
    sessionYieldUsdc,
    circuitBreakerActive,
    usdcPrice,
    isLoading: allocLoading || vaultLoading,
    isGasless,
    apyHistory,
    refresh,
  }
}
