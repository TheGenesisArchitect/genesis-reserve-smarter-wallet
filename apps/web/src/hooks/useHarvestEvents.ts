// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useHarvestEvents.ts
//
// Subscribes to StrategyRouter YieldHarvested events via Alchemy WebSocket.
// Fires every 15 minutes when harvest() executes on-chain.
//
// This is what drives:
//   - Real-time APY updates in the UI (not just 30s polling)
//   - "Yield Harvested" toast notifications
//   - Historical harvest log for the APY history chart
//   - Triggering vault balance refetch immediately after a harvest
//
// Architecture:
//   Alchemy WebSocket → eth_subscribe → filter YieldHarvested events
//   → decode log → update local harvest history → notify subscribers
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPublicClient, webSocket } from 'viem'
import { ACTIVE_CHAIN, ACTIVE_CONTRACTS } from '../config/contracts'
import { STRATEGY_ROUTER_ABI } from '../abis/strategy-router.abi'
import { WS_TRANSPORT_URL } from '../config/wagmi.config'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HarvestEvent {
  epochNumber: number
  totalYieldUsdc: string        // Formatted USDC yield from this harvest
  blendedApyBps: number        // APY at time of harvest (bps)
  blendedApy: number        // APY as float % (e.g. 5.32)
  timestamp: number        // Unix timestamp
  txHash: `0x${string}` // Transaction that triggered harvest
  blockNumber: bigint
}

export interface HarvestEventsState {
  // Most recent harvest event
  latestHarvest: HarvestEvent | null
  // Rolling history (last 96 harvests = 24 hours)
  harvestHistory: HarvestEvent[]
  // Whether the WebSocket is connected
  isConnected: boolean
  // Total yield harvested since hook mounted
  sessionYieldUsdc: number
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 96   // 96 × 15 min = 24 hours of history

export function useHarvestEvents(
  onHarvest?: (event: HarvestEvent) => void
): HarvestEventsState {
  const [latestHarvest, setLatestHarvest] = useState<HarvestEvent | null>(null)
  const [harvestHistory, setHarvestHistory] = useState<HarvestEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [sessionYield, setSessionYield] = useState(0)

  const wsClientRef = useRef<ReturnType<typeof createPublicClient> | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const handleLog = useCallback((log: {
    args: { epochNumber: bigint; totalYieldUsdc: bigint; blendedApyBps: bigint; timestamp: bigint }
    transactionHash: `0x${string}`
    blockNumber: bigint
  }) => {
    const { args, transactionHash, blockNumber } = log

    // Parse yield — 6 decimals
    const yieldFloat = Number(args.totalYieldUsdc) / 1e6
    const apyBps = Number(args.blendedApyBps)

    const event: HarvestEvent = {
      epochNumber: Number(args.epochNumber),
      totalYieldUsdc: yieldFloat.toFixed(4),
      blendedApyBps: apyBps,
      blendedApy: apyBps / 100,
      timestamp: Number(args.timestamp),
      txHash: transactionHash,
      blockNumber,
    }

    setLatestHarvest(event)
    setHarvestHistory(prev => [event, ...prev].slice(0, MAX_HISTORY))
    setSessionYield(prev => prev + yieldFloat)

    // Notify parent component (triggers balance refetch, toast, etc.)
    onHarvest?.(event)
  }, [onHarvest])

  useEffect(() => {
    if (!WS_TRANSPORT_URL) return

    let cancelled = false

    async function subscribe() {
      try {
        const wsClient = createPublicClient({
          chain: ACTIVE_CHAIN,
          transport: webSocket(WS_TRANSPORT_URL),
        })

        if (cancelled) return
        wsClientRef.current = wsClient
        setIsConnected(true)

        // Subscribe to YieldHarvested events from StrategyRouter
        const unwatch = wsClient.watchContractEvent({
          address: ACTIVE_CONTRACTS.STRATEGY_ROUTER,
          abi: STRATEGY_ROUTER_ABI,
          eventName: 'YieldHarvested',
          onLogs: (logs: Array<{
            args: Record<string, unknown>
            transactionHash: `0x${string}`
            blockNumber: bigint
          }>) => {
            logs.forEach((log) => {
              if (log.args.epochNumber !== undefined &&
                log.args.totalYieldUsdc !== undefined &&
                log.args.blendedApyBps !== undefined &&
                log.args.timestamp !== undefined) {
                handleLog({
                  args: {
                    epochNumber: log.args.epochNumber as bigint,
                    totalYieldUsdc: log.args.totalYieldUsdc as bigint,
                    blendedApyBps: log.args.blendedApyBps as bigint,
                    timestamp: log.args.timestamp as bigint,
                  },
                  transactionHash: log.transactionHash as `0x${string}`,
                  blockNumber: log.blockNumber as bigint,
                })
              }
            })
          },
          onError: (err: unknown) => {
            console.error('[useHarvestEvents] WebSocket error:', err)
            setIsConnected(false)
          },
        })

        if (cancelled) {
          unwatch()
          return
        }
        unsubscribeRef.current = unwatch

      } catch (err) {
        if (!cancelled) {
          console.error('[useHarvestEvents] Failed to subscribe:', err)
          setIsConnected(false)
        }
      }
    }

    subscribe()

    return () => {
      cancelled = true
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      setIsConnected(false)
    }
  }, [handleLog])

  return {
    latestHarvest,
    harvestHistory,
    isConnected,
    sessionYieldUsdc: sessionYield,
  }
}
