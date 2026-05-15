/**
 * /api/cctp/transfer — CCTP on-ramp API routes.
 *
 * POST /api/cctp/transfer
 *   Registers a confirmed burn tx and kicks off the server-side relay pipeline.
 *   Returns the transferId immediately; relay runs async in background.
 *
 * GET  /api/cctp/transfer?transferId=…
 *   Polls transfer status (called by useCCTPTransfer hook).
 *
 * POST /api/cctp/transfer/[id]/vault-deposit is handled via the vault route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cctpTransferStore } from '../../gr/_lib/cctp-db'
import { executeCCTPOnRamp, recordVaultDeposit } from '../../../../services/cctp-orchestrator'
import { CCTP_CONTRACTS } from '../../../../config/cctp'
import type { Hex } from 'viem'

// ── Input validation ──────────────────────────────────────────────────────────

const InitiateSchema = z.object({
    burnTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid tx hash'),
    sourceChain: z.enum(['ethereum', 'base']),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid wallet address'),
    arbitrumAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Arbitrum address'),
    amountUsdc: z.string().regex(/^[0-9]+(\.[0-9]{1,6})?$/, 'Invalid amount'),
    accountId: z.string().optional().nullable(),
})

// ── POST — initiate relay ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: { code: 'invalid_request', message: 'Request body must be JSON' } },
            { status: 400 },
        )
    }

    const parsed = InitiateSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: { code: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: parsed.error.flatten() } },
            { status: 400 },
        )
    }

    const { burnTxHash, sourceChain, walletAddress, arbitrumAddress, amountUsdc, accountId } = parsed.data

    // Idempotency — return existing transfer if burn tx already registered
    const existing = await cctpTransferStore.getByBurnTxHash(burnTxHash)
    if (existing) {
        return NextResponse.json({ data: existing }, { status: 200 })
    }

    // Create DB record
    const transfer = await cctpTransferStore.create({
        walletAddress,
        arbitrumAddress,
        accountId: accountId ?? null,
        sourceChain,
        sourceDomain: CCTP_CONTRACTS[sourceChain].domain,
        amountUsdc,
    })

    if (!transfer) {
        // DB unavailable — run relay in-memory without persistence
        runRelayAsync(null, burnTxHash as Hex, sourceChain)
        return NextResponse.json({
            data: { transferId: null, status: 'relay_pending', message: 'DB unavailable — relay queued' },
        }, { status: 202 })
    }

    // Update burn tx hash immediately
    await cctpTransferStore.update(transfer.transferId, {
        burnTxHash: burnTxHash.toLowerCase(),
        status: 'burn_confirmed',
    })

    // Fire-and-forget relay pipeline
    runRelayAsync(transfer.transferId, burnTxHash as Hex, sourceChain)

    return NextResponse.json({
        data: {
            transferId: transfer.transferId,
            status: 'burn_confirmed',
        },
    }, { status: 202 })
}

// ── GET — poll status ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const transferId = searchParams.get('transferId')

    if (!transferId) {
        return NextResponse.json(
            { error: { code: 'invalid_request', message: 'transferId query param required' } },
            { status: 400 },
        )
    }

    const transfer = await cctpTransferStore.getById(transferId)
    if (!transfer) {
        return NextResponse.json(
            { error: { code: 'not_found', message: 'Transfer not found' } },
            { status: 404 },
        )
    }

    return NextResponse.json({ data: transfer })
}

// ── PATCH — record vault deposit ─────────────────────────────────────────────

const VaultDepositSchema = z.object({
    transferId: z.string().uuid('transferId must be a UUID'),
    vaultTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid vault tx hash'),
})

export async function PATCH(req: NextRequest) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: { code: 'invalid_request', message: 'Request body must be JSON' } },
            { status: 400 },
        )
    }

    const parsed = VaultDepositSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: { code: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: parsed.error.flatten() } },
            { status: 400 },
        )
    }

    const { transferId, vaultTxHash } = parsed.data
    const normalizedVaultTxHash = vaultTxHash.toLowerCase()

    const transfer = await cctpTransferStore.getById(transferId)
    if (!transfer) {
        return NextResponse.json(
            { error: { code: 'service_unavailable', message: 'Transfer lookup unavailable or not found' } },
            { status: 503 },
        )
    }

    // Idempotent success: same vault tx already recorded.
    if (transfer.status === 'vault_deposited') {
        if (transfer.vaultTxHash?.toLowerCase() === normalizedVaultTxHash) {
            return NextResponse.json({ data: transfer }, { status: 200 })
        }

        return NextResponse.json(
            {
                error: {
                    code: 'conflict',
                    message: 'Transfer already finalized with a different vaultTxHash',
                    details: {
                        transferId,
                        existingVaultTxHash: transfer.vaultTxHash,
                        submittedVaultTxHash: normalizedVaultTxHash,
                    },
                },
            },
            { status: 409 },
        )
    }

    // Enforce valid transition: only minted -> vault_deposited.
    if (transfer.status !== 'minted') {
        return NextResponse.json(
            {
                error: {
                    code: 'invalid_state',
                    message: 'Transfer must be minted before recording vault deposit',
                    details: {
                        transferId,
                        currentStatus: transfer.status,
                        requiredStatus: 'minted',
                    },
                },
            },
            { status: 409 },
        )
    }

    await recordVaultDeposit(transferId, normalizedVaultTxHash as Hex)
    const updated = await cctpTransferStore.getById(transferId)

    if (!updated) {
        return NextResponse.json(
            { error: { code: 'service_unavailable', message: 'Transfer was updated but could not be reloaded' } },
            { status: 503 },
        )
    }

    return NextResponse.json({ data: updated })
}

// ── Async relay runner ────────────────────────────────────────────────────────

function runRelayAsync(
    transferId: string | null,
    burnTxHash: Hex,
    sourceChain: 'ethereum' | 'base',
): void {
    if (!transferId) return

    void executeCCTPOnRamp(transferId, burnTxHash, sourceChain).catch(err => {
        // Error is already persisted to DB by orchestrator; log for ops visibility
        console.error(`[CCTP] Relay failed for transfer ${transferId}:`, err)
    })
}
