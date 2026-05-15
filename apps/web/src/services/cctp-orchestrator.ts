/**
 * cctp-orchestrator.ts — CCTP on-ramp orchestration (server-side).
 *
 * Ties together: message extraction → attestation polling → Arbitrum relay.
 * Called by the /api/cctp/transfer POST route after the user's burn tx confirms.
 *
 * Flow:
 *   1. extractCctpMessage(burnTxHash, sourceChain)  → messageBytes + messageHash
 *   2. cctpTransferStore.update(…, { burn_confirmed + message fields })
 *   3. pollAttestation(messageHash)                 → attestation signature
 *   4. cctpTransferStore.update(…, { attestation_ready })
 *   5. mintOnArbitrum(messageBytes, attestation)    → relay tx on Arbitrum
 *   6. cctpTransferStore.update(…, { minted })
 *
 * The vault deposit (step 7) is user-initiated from the frontend once status
 * reaches 'minted' — the hook presents a "Deposit to Vault" CTA.
 */

import { extractCctpMessage } from './cctp.service'
import { pollAttestation } from './cctp-attestation'
import { mintOnArbitrum } from './cctp-relayer'
import { cctpTransferStore } from '../app/api/gr/_lib/cctp-db'
import type { CctpChainKey } from '../config/cctp'
import type { Hex } from 'viem'

// ── Result type ───────────────────────────────────────────────────────────────

export interface OrchestratorResult {
    transferId: string
    relayTxHash: Hex
    relayBlock: number
    status: 'minted'
}

// ── Main orchestration function ───────────────────────────────────────────────

/**
 * Execute the full server-side CCTP on-ramp pipeline for a confirmed burn tx.
 *
 * @param transferId  DB record ID (created when user submitted burn tx)
 * @param burnTxHash  Confirmed burn transaction hash on source chain
 * @param sourceChain 'ethereum' | 'base'
 */
export async function executeCCTPOnRamp(
    transferId: string,
    burnTxHash: Hex,
    sourceChain: CctpChainKey,
): Promise<OrchestratorResult> {

    // ── Step 1: Extract CCTP message from burn receipt ────────────────────────
    let messageBytes: Hex
    let messageHash: Hex
    let burnBlock: number

    try {
        const extracted = await extractCctpMessage(burnTxHash, sourceChain)
        messageBytes = extracted.messageBytes
        messageHash = extracted.messageHash
        burnBlock = extracted.burnBlock
    } catch (err) {
        await cctpTransferStore.update(transferId, {
            status: 'failed',
            failureReason: `Message extraction failed: ${String(err)}`,
        })
        throw err
    }

    // ── Step 2: Persist burn confirmation + message data ──────────────────────
    await cctpTransferStore.update(transferId, {
        status: 'attestation_pending',
        burnTxHash: burnTxHash.toLowerCase(),
        burnBlock,
        messageHash: messageHash.toLowerCase(),
        messageBytes: messageBytes,
    })

    // ── Step 3: Poll Circle Iris for attestation ──────────────────────────────
    let attestation: Hex

    try {
        const result = await pollAttestation(messageHash)
        attestation = result.attestation
    } catch (err) {
        await cctpTransferStore.update(transferId, {
            status: 'failed',
            failureReason: `Attestation polling failed: ${String(err)}`,
        })
        throw err
    }

    // ── Step 4: Record attestation received ───────────────────────────────────
    await cctpTransferStore.update(transferId, {
        status: 'attestation_ready',
        attestation: attestation,
        attestedAt: new Date().toISOString(),
    })

    // ── Step 5: Relay to Arbitrum (Genesis pays gas) ──────────────────────────
    let relayTxHash: Hex
    let relayBlock: number

    try {
        await cctpTransferStore.update(transferId, { status: 'relay_pending' })
        const relayResult = await mintOnArbitrum(messageBytes, attestation)
        relayTxHash = relayResult.relayTxHash
        relayBlock = relayResult.relayBlock
    } catch (err) {
        // Increment retry count; caller may retry
        const current = await cctpTransferStore.getById(transferId)
        await cctpTransferStore.update(transferId, {
            status: 'failed',
            failureReason: `Relay failed: ${String(err)}`,
            retryCount: (current?.retryCount ?? 0) + 1,
        })
        throw err
    }

    // ── Step 6: Mark minted — user's USDC is now live on Arbitrum ─────────────
    await cctpTransferStore.update(transferId, {
        status: 'minted',
        relayTxHash: relayTxHash.toLowerCase(),
        relayBlock,
        mintedAt: new Date().toISOString(),
    })

    return { transferId, relayTxHash, relayBlock, status: 'minted' }
}

/**
 * Record that the user has completed the vault deposit step.
 * Called by the /api/cctp/transfer/[id]/vault-deposit endpoint.
 */
export async function recordVaultDeposit(
    transferId: string,
    vaultTxHash: Hex,
): Promise<void> {
    await cctpTransferStore.update(transferId, {
        status: 'vault_deposited',
        vaultTxHash: vaultTxHash.toLowerCase(),
        vaultDepositedAt: new Date().toISOString(),
    })
}
