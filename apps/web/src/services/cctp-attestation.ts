/**
 * cctp-attestation.ts — Circle Iris attestation polling (server-side).
 *
 * Polls the Circle Iris API until an attestation signature is available for
 * a given messageHash (keccak256 of the CCTP MessageSent bytes).
 *
 * Circle Iris API reference:
 *   GET https://iris.circle.com/v1/attestations/{messageHash}
 *   → { status: 'complete' | 'pending_confirmations', attestation: '0x...' }
 */

import {
    CCTP_ATTESTATION_API,
    ATTESTATION_POLL_INTERVAL_MS,
    ATTESTATION_POLL_TIMEOUT_MS,
} from '../config/cctp'
import type { Hex } from 'viem'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttestationResult {
    attestation: Hex
    status: 'complete'
}

interface IrisResponse {
    status: 'complete' | 'pending_confirmations'
    attestation?: string
}

// ── Polling ───────────────────────────────────────────────────────────────────

/**
 * Poll Circle Iris until the attestation for messageHash is complete.
 *
 * @param messageHash  keccak256(MessageSent.message) — hex string with 0x prefix
 * @param timeoutMs    Override poll timeout (default 120 000 ms)
 * @returns            Attestation signature hex
 * @throws             On timeout or non-retryable Iris API error
 */
export async function pollAttestation(
    messageHash: Hex,
    timeoutMs = ATTESTATION_POLL_TIMEOUT_MS,
): Promise<AttestationResult> {
    const deadline = Date.now() + timeoutMs
    const url = `${CCTP_ATTESTATION_API}/${messageHash}`

    while (Date.now() < deadline) {
        const response = await fetchAttestation(url)

        if (response.status === 'complete' && response.attestation) {
            return {
                attestation: response.attestation as Hex,
                status: 'complete',
            }
        }

        // pending_confirmations — wait and retry
        await sleep(ATTESTATION_POLL_INTERVAL_MS)
    }

    throw new Error(
        `CCTP attestation timed out after ${timeoutMs / 1000}s for messageHash ${messageHash}`,
    )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchAttestation(url: string): Promise<IrisResponse> {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        // No auth header needed for Iris public attestation endpoint
    })

    // 404 = message not yet indexed — treat as pending
    if (res.status === 404) {
        return { status: 'pending_confirmations' }
    }

    if (!res.ok) {
        throw new Error(
            `CCTP Iris API error: HTTP ${res.status} for ${url}`,
        )
    }

    const body = await res.json() as IrisResponse
    return body
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
