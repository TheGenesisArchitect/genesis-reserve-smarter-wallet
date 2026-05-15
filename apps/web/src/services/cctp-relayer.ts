/**
 * cctp-relayer.ts — Genesis relayer: submits receiveMessage on Arbitrum (server-side).
 *
 * The relayer holds an Arbitrum One EOA funded with ETH to pay gas.
 * It calls MessageTransmitter.receiveMessage(message, attestation) which mints
 * USDC to the recipient's wallet on Arbitrum.
 *
 * SECURITY:
 * - GENESIS_RELAYER_PRIVATE_KEY must be in env; module is lazy — key is never
 *   accessed at import time. Missing key → error only when mintOnArbitrum() called.
 * - Relayer only calls receiveMessage; it never touches user funds.
 *
 * Required env vars:
 *   GENESIS_RELAYER_PRIVATE_KEY  — 0x-prefixed hex private key
 *   ARBITRUM_RPC_URL             — Arbitrum One RPC endpoint
 */

import {
    createPublicClient,
    createWalletClient,
    http,
    type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'
import { CCTP_CONTRACTS } from '../config/cctp'
import { MESSAGE_TRANSMITTER_ABI } from '../config/cctp-abi'

// ── RPC client (public — read only) ──────────────────────────────────────────
function getArbitrumRpc(): string {
    return process.env.ARBITRUM_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'
}

const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(getArbitrumRpc()),
})

// ── Lazy relayer account initialization ──────────────────────────────────────
// NOT called at module load — only when mintOnArbitrum() is invoked.
function getRelayerAccount() {
    const pk = process.env.GENESIS_RELAYER_PRIVATE_KEY
    if (!pk || !pk.startsWith('0x') || pk.length !== 66) {
        throw new Error(
            'CCTP Relayer: GENESIS_RELAYER_PRIVATE_KEY is not set or invalid. ' +
            'Set a 32-byte hex private key in environment variables.',
        )
    }
    return privateKeyToAccount(pk as Hex)
}

// ── Relay result ──────────────────────────────────────────────────────────────

export interface RelayResult {
    relayTxHash: Hex
    relayBlock: number
}

// ── Core relay function ───────────────────────────────────────────────────────

/**
 * Submit receiveMessage to Arbitrum One MessageTransmitter.
 * Mints USDC to the mintRecipient encoded in the message.
 *
 * @param messageBytes   Full CCTP message bytes (from MessageSent event)
 * @param attestation    Circle Iris attestation signature
 * @returns              Relay tx hash and confirmation block
 */
export async function mintOnArbitrum(
    messageBytes: Hex,
    attestation: Hex,
): Promise<RelayResult> {
    const account = getRelayerAccount()

    const walletClient = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(getArbitrumRpc()),
    })

    const transmitterAddress = CCTP_CONTRACTS.arbitrum.MESSAGE_TRANSMITTER

    // Simulate first to catch reverts early
    await publicClient.simulateContract({
        address: transmitterAddress,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: 'receiveMessage',
        args: [messageBytes, attestation],
        account: account.address,
    })

    const txHash = await walletClient.writeContract({
        address: transmitterAddress,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: 'receiveMessage',
        args: [messageBytes, attestation],
    })

    // Wait for 1 confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
    })

    if (receipt.status !== 'success') {
        throw new Error(`CCTP Relay: receiveMessage reverted — tx ${txHash}`)
    }

    return {
        relayTxHash: txHash,
        relayBlock: Number(receipt.blockNumber),
    }
}

// ── Relayer balance check (used by health monitor) ────────────────────────────

export async function getRelayerBalance(): Promise<{
    address: Hex
    balanceWei: bigint
    balanceEth: string
}> {
    const account = getRelayerAccount()
    const balanceWei = await publicClient.getBalance({ address: account.address })
    const balanceEth = (Number(balanceWei) / 1e18).toFixed(6)
    return { address: account.address, balanceWei, balanceEth }
}
