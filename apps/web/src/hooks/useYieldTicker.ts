// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useYieldTicker.ts
//
// Drives the live yield display in the Genesis Terminal UI.
// Two mechanisms:
//   1. APY estimation — derived from share price change over rolling window
//   2. Intra-epoch balance tick — interpolates yield accrual between harvests
//
// The vault harvests every 15 minutes. Between harvests, balance does not
// change on-chain. We interpolate the expected accrual so the UI ticker
// increments smoothly every second — matching the demo experience.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePublicClient }   from 'wagmi'
import { ACTIVE_CONTRACTS }  from '../config/contracts'
import { GENESIS_VAULT_ABI } from '../abis/vault.abi'

// ── Constants ─────────────────────────────────────────────────────────────────

// Harvest epoch: 15 minutes = 900 seconds
const EPOCH_SECONDS = 900

// Share price snapshot interval — poll on-chain every 30s
const PRICE_POLL_MS = 30_000

// Tick interval — update displayed balance every 1 second
const TICK_MS = 1_000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YieldTickerState {
  // Estimated annual APY (e.g. 5.32)
  apy: number
  // Today's accumulated yield in USD (e.g. 0.4823)
  yieldToday: number
  // Formatted yield string for display (e.g. "+$0.4823")
  yieldTodayDisplay: string
  // Current balance including interpolated intra-epoch yield
  liveBalance: number
  // Whether APY data is available yet
  isReady: boolean
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useYieldTicker(
  baseBalance: number,   // User's USDC balance from useGenesisVault
  enabled: boolean = true
): YieldTickerState {
  const publicClient = usePublicClient()

  // Share price snapshots for APY calculation
  const snapshotsRef = useRef<Array<{ time: number; price: number }>>([])
  const [apy, setApy]       = useState(0)
  const [isReady, setIsReady] = useState(false)

  // Intra-epoch interpolation state
  const [yieldToday, setYieldToday]   = useState(0)
  const [liveBalance, setLiveBalance] = useState(baseBalance)
  const epochStartRef    = useRef<number>(Date.now())
  const epochYieldRef    = useRef<number>(0)   // Expected yield for this epoch
  const sessionStartRef  = useRef<number>(Date.now())
  const sessionBalanceRef= useRef<number>(baseBalance)

  // ── Fetch share price from chain ─────────────────────────────────────────
  const fetchSharePrice = useCallback(async () => {
    if (!publicClient || !enabled) return

    try {
      const price = await publicClient.readContract({
        address: ACTIVE_CONTRACTS.GENESIS_VAULT,
        abi: GENESIS_VAULT_ABI,
        functionName: 'previewRedeem',
        args: [1_000_000n],   // 1 share (6 dec)
      })

      const priceFloat = Number(price) / 1e6
      const now = Date.now()

      // Keep a rolling 7-day window of snapshots for APY calculation
      snapshotsRef.current = [
        ...snapshotsRef.current.filter(s => now - s.time < 7 * 24 * 3600_000),
        { time: now, price: priceFloat },
      ]

      // Calculate APY from price change over available window
      if (snapshotsRef.current.length >= 2) {
        const oldest  = snapshotsRef.current[0]
        const newest  = snapshotsRef.current[snapshotsRef.current.length - 1]
        const elapsedSeconds = (newest.time - oldest.time) / 1000
        const priceGrowth    = newest.price / oldest.price

        // Annualise: APY = ((priceGrowth) ^ (31536000 / elapsedSeconds)) - 1
        const annualMultiple = Math.pow(priceGrowth, 31_536_000 / elapsedSeconds)
        const estimatedApy   = (annualMultiple - 1) * 100

        // Sanity-check: clamp to realistic DeFi range (0–25%)
        const clampedApy = Math.min(Math.max(estimatedApy, 0), 25)
        setApy(clampedApy)

        // Calculate expected yield per 15-minute epoch at this APY
        // epochYield = balance × APY / (365.25 × 24 × 4)   [4 epochs/hour]
        const epochYieldUsdc = baseBalance * (clampedApy / 100) / (365.25 * 24 * 4)
        epochYieldRef.current = epochYieldUsdc
        epochStartRef.current = now
        setIsReady(true)
      } else if (snapshotsRef.current.length === 1) {
        // First snapshot — use a reasonable default until we have price history
        // Fallback: assume 5% APY to get the ticker moving immediately
        const fallbackApy = 5.0
        setApy(fallbackApy)
        epochYieldRef.current = baseBalance * (fallbackApy / 100) / (365.25 * 24 * 4)
        epochStartRef.current = now
        setIsReady(true)
      }
    } catch (err) {
      console.error('[useYieldTicker] Failed to fetch share price:', err)
    }
  }, [publicClient, enabled, baseBalance])

  // ── Poll share price every 30 seconds ────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    fetchSharePrice()
    const interval = setInterval(fetchSharePrice, PRICE_POLL_MS)
    return () => clearInterval(interval)
  }, [fetchSharePrice, enabled])

  // ── Intra-epoch tick — update display every 1 second ─────────────────────
  useEffect(() => {
    if (!enabled || !isReady) return

    const tick = setInterval(() => {
      const now = Date.now()
      const epochElapsed = (now - epochStartRef.current) / 1000  // seconds
      const epochFraction = Math.min(epochElapsed / EPOCH_SECONDS, 1)

      // Interpolated yield for current epoch
      const interpolatedEpochYield = epochYieldRef.current * epochFraction

      // Total session yield (all completed epochs + current epoch fraction)
      // Using per-second rate for smoother display
      const secondsElapsedToday = (now - sessionStartRef.current) / 1000
      const dailyRate = baseBalance * (apy / 100) / 365.25
      const accruedToday = dailyRate * (secondsElapsedToday / 86_400)

      setYieldToday(accruedToday)
      setLiveBalance(sessionBalanceRef.current + accruedToday)
    }, TICK_MS)

    return () => clearInterval(tick)
  }, [enabled, isReady, baseBalance, apy])

  // Reset session baseline when base balance changes (deposit/withdraw)
  useEffect(() => {
    sessionBalanceRef.current = baseBalance
    sessionStartRef.current = Date.now()
    setLiveBalance(baseBalance)
  }, [baseBalance])

  const yieldTodayDisplay = yieldToday > 0
    ? `+$${yieldToday.toFixed(4)}`
    : '+$0.0000'

  return {
    apy,
    yieldToday,
    yieldTodayDisplay,
    liveBalance,
    isReady,
  }
}
