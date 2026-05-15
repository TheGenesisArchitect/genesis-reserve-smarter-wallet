/**
 * cctp.service.ts — CCTP message extraction service (server-side).
 *
 * Responsibility: given a confirmed burn tx hash on a source chain, extract
 * the CCTP MessageSent bytes and compute the attestation lookup key
 * (keccak256 of the message body).
 *
 * This is purely read-only — it never signs or submits transactions.
 */

import {
    createPublicClient,
    http,
    keccak256,
    parseAbiItem,
    type Hex,
    type Chain,
} from 'viem'
import { mainnet, base } from 'viem/chains'
import { CCTP_CONTRACTS, type CctpChainKey } from '../config/cctp'

// ── RPC endpoints ─────────────────────────────────────────────────────────────
function getRpcUrl(chainKey: CctpChainKey): string {
    if (chainKey === 'base') {
        return process.env.BASE_RPC_URL ?? 'https://mainnet.base.org'
    }
    // ethereum
    return process.env.ETHEREUM_RPC_URL ?? 'https://cloudflare-eth.com'
}

function getChain(chainKey: CctpChainKey): Chain {
    return chainKey === 'base' ? base : mainnet
}

// ── MessageSent event ABI ─────────────────────────────────────────────────────
const MESSAGE_SENT_EVENT = parseAbiItem('event MessageSent(bytes message)')

// ── Core extraction ───────────────────────────────────────────────────────────

export interface CctpBurnResult {
    messageBytes: Hex
    messageHash: Hex
    burnBlock: number
}

/**
 * Extract the CCTP MessageSent payload from a confirmed burn tx receipt.
 * Throws if the tx is not found or does not contain a MessageSent event.
 */
export async function extractCctpMessage(
    burnTxHash: Hex,
    chainKey: CctpChainKey,
): Promise<CctpBurnResult> {
    const client = createPublicClient({
        chain: getChain(chainKey),
        transport: http(getRpcUrl(chainKey)),
    })

    const receipt = await client.getTransactionReceipt({ hash: burnTxHash })

    if (!receipt) {
        throw new Error(`CCTP: transaction receipt not found for ${burnTxHash}`)
    }

    if (receipt.status !== 'success') {
        throw new Error(`CCTP: burn transaction reverted — hash ${burnTxHash}`)
    }

    const transmitter = CCTP_CONTRACTS[chainKey].MESSAGE_TRANSMITTER.toLowerCase()

    // Find MessageSent log emitted by MessageTransmitter
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== transmitter) continue

        try {
            const decoded = decodeMessageSentLog(log.data)
            if (!decoded) continue

            const messageHash = keccak256(decoded)
            return {
                messageBytes: decoded,
                messageHash,
                burnBlock: Number(receipt.blockNumber),
            }
        } catch {
            // Not a MessageSent log — continue scanning
        }
    }

    throw new Error(`CCTP: no MessageSent event found in tx ${burnTxHash}`)
}

/**
 * Decode raw log data as a MessageSent(bytes message) event.
 * Returns the inner `message` bytes, or null if decoding fails.
 */
function decodeMessageSentLog(data: Hex): Hex | null {
    // MessageSent(bytes) ABI-encodes as:
    // [offset: 32 bytes][length: 32 bytes][data: padded to 32-byte multiple]
    if (data.length < 4 + 64 * 2) return null

    const raw = data.slice(2) // strip 0x
    // offset to message bytes (should be 0x20 = 32)
    const length = parseInt(raw.slice(64, 128), 16)
    if (!length || length > 10_000) return null

    const messageHex = raw.slice(128, 128 + length * 2)
    if (messageHex.length !== length * 2) return null

    return `0x${messageHex}` as Hex
}

// ── Public helper re-export ───────────────────────────────────────────────────
export { keccak256 }
