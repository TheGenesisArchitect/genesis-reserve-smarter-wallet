/**
 * relayer-health.ts — Genesis CCTP relayer health monitor.
 *
 * Checks the relayer EOA balance on Arbitrum One.
 * Exposed via /api/cctp/relayer-health (GET) for ops dashboards.
 *
 * Alert thresholds:
 *   WARNING  < 0.05 ETH  → schedule top-up
 *   CRITICAL < 0.01 ETH  → relayer may run out of gas mid-relay
 */

import { getRelayerBalance } from '../services/cctp-relayer'

// ── Thresholds ────────────────────────────────────────────────────────────────
const WARN_THRESHOLD_ETH = 0.05
const CRITICAL_THRESHOLD_ETH = 0.01

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelayerHealthLevel = 'healthy' | 'warning' | 'critical'

export interface RelayerHealthStatus {
    level: RelayerHealthLevel
    address: string
    balanceEth: string
    balanceWei: string
    checkedAt: string
    message: string
}

// ── Check ─────────────────────────────────────────────────────────────────────

export async function checkRelayerHealth(): Promise<RelayerHealthStatus> {
    const { address, balanceWei, balanceEth } = await getRelayerBalance()
    const ethBalance = parseFloat(balanceEth)
    const checkedAt = new Date().toISOString()

    let level: RelayerHealthLevel
    let message: string

    if (ethBalance < CRITICAL_THRESHOLD_ETH) {
        level = 'critical'
        message = `Relayer balance critically low (${balanceEth} ETH). Immediate top-up required.`
    } else if (ethBalance < WARN_THRESHOLD_ETH) {
        level = 'warning'
        message = `Relayer balance low (${balanceEth} ETH). Schedule top-up soon.`
    } else {
        level = 'healthy'
        message = `Relayer operating normally (${balanceEth} ETH).`
    }

    return {
        level,
        address,
        balanceEth,
        balanceWei: balanceWei.toString(),
        checkedAt,
        message,
    }
}
