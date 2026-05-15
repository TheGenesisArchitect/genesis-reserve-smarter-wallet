'use client'

/**
 * useCCTPTransfer.ts — React hook for CCTP on-ramp state machine.
 *
 * Handles the full client-side pipeline:
 *   idle → approving → burning → relaying → minted → vault_deposited
 *
 * The user signs approve + depositForBurnWithCaller on the source chain
 * via their Privy wallet. The hook then POSTs to /api/cctp/transfer and
 * polls for relay completion.
 *
 * Vault deposit (final step) is user-triggered via depositToVault().
 */

import { useState, useCallback, useRef } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
    createPublicClient,
    createWalletClient,
    custom,
    parseUnits,
    formatUnits,
    maxUint256,
    type Hex,
    type Chain,
} from 'viem'
import { mainnet, base, arbitrum } from 'viem/chains'
import {
    CCTP_CONTRACTS,
    CCTP_DESTINATION,
    MIN_FINALITY_THRESHOLD,
    addressToBytes32,
    type CctpChainKey,
} from '../config/cctp'
import { TOKEN_MESSENGER_ABI, USDC_APPROVE_ABI } from '../config/cctp-abi'
import type { CctpTransfer } from '../app/api/gr/_lib/cctp-db'

// ── Transfer status type ──────────────────────────────────────────────────────

export type CctpPhase =
    | 'idle'
    | 'approving'       // waiting for USDC approve tx
    | 'burning'         // waiting for depositForBurnWithCaller tx
    | 'relaying'        // waiting for server attestation + receiveMessage
    | 'minted'          // USDC on Arbitrum, ready to vault deposit
    | 'vault_depositing'// waiting for vault deposit tx
    | 'vault_deposited' // complete
    | 'failed'

export interface CctpTransferState {
    phase: CctpPhase
    transferId: string | null
    burnTxHash: string | null
    relayTxHash: string | null
    mintedAmount: string | null
    error: string | null
    /** Initiate the burn from the source chain */
    burn: (params: BurnParams) => Promise<void>
    /** After minted, trigger vault deposit from Arbitrum wallet */
    depositToVault: (vaultTxHash: Hex) => Promise<void>
    reset: () => void
}

export interface BurnParams {
    amountUsdc: string          // human-readable e.g. "100.00"
    sourceChain: CctpChainKey    // 'ethereum' | 'base'
    arbitrumAddress: string          // destination mint address (user's Arbitrum wallet)
    accountId?: string | null
}

// ── Poll config ───────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 4_000
const POLL_MAX_ATTEMPTS = 60  // 4 min at 4s intervals

// ── Chain helper ──────────────────────────────────────────────────────────────
function getChain(chainKey: CctpChainKey): Chain {
    return chainKey === 'base' ? base : mainnet
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCCTPTransfer(): CctpTransferState {
    const { user } = usePrivy()
    const { wallets } = useWallets()

    const [phase, setPhase] = useState<CctpPhase>('idle')
    const [transferId, setTransferId] = useState<string | null>(null)
    const [burnTxHash, setBurnTxHash] = useState<string | null>(null)
    const [relayTxHash, setRelayTxHash] = useState<string | null>(null)
    const [mintedAmount, setMintedAmount] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Poll server for relay status ──────────────────────────────────────────
    const startPolling = useCallback((tid: string, amount: string) => {
        let attempts = 0

        const tick = async () => {
            if (attempts++ >= POLL_MAX_ATTEMPTS) {
                setPhase('failed')
                setError('Transfer timed out waiting for attestation. Please contact support.')
                return
            }

            try {
                const res = await fetch(`/api/cctp/transfer?transferId=${tid}`)
                const json = await res.json() as { data?: CctpTransfer; error?: { message: string } }

                if (!res.ok || !json.data) {
                    pollRef.current = setTimeout(tick, POLL_INTERVAL_MS)
                    return
                }

                const t = json.data

                if (t.status === 'minted' || t.status === 'vault_deposited') {
                    setRelayTxHash(t.relayTxHash)
                    setMintedAmount(amount)
                    setPhase(t.status === 'vault_deposited' ? 'vault_deposited' : 'minted')
                    return
                }

                if (t.status === 'failed' || t.status === 'expired') {
                    setPhase('failed')
                    setError(t.failureReason ?? 'Transfer failed on-chain. Please try again.')
                    return
                }

                // Still in progress — keep polling
                pollRef.current = setTimeout(tick, POLL_INTERVAL_MS)
            } catch {
                // Network error — retry
                pollRef.current = setTimeout(tick, POLL_INTERVAL_MS)
            }
        }

        pollRef.current = setTimeout(tick, POLL_INTERVAL_MS)
    }, [])

    // ── Main burn function ────────────────────────────────────────────────────
    const burn = useCallback(async (params: BurnParams) => {
        const { amountUsdc, sourceChain, arbitrumAddress, accountId } = params

        setError(null)
        setPhase('approving')

        try {
            // Find the embedded wallet or the first connected wallet
            const wallet = wallets.find(w => w.walletClientType === 'privy')
                ?? wallets[0]

            if (!wallet) throw new Error('No wallet connected. Please connect your wallet.')

            const sourceContracts = CCTP_CONTRACTS[sourceChain]
            const chain = getChain(sourceChain)

            // Switch wallet to source chain
            await wallet.switchChain(chain.id)

            const provider = await wallet.getEthereumProvider()
            const walletAddress = wallet.address as Hex

            const walletClient = createWalletClient({
                account: walletAddress,
                chain,
                transport: custom(provider),
            })

            const publicClient = createPublicClient({
                chain,
                transport: custom(provider),
            })

            // Amount in USDC atomic units (6 decimals)
            const amountAtomic = parseUnits(amountUsdc, 6)

            // ── Step 0: Pre-flight balance check ─────────────────────────────
            const balance = await publicClient.readContract({
                address: sourceContracts.USDC,
                abi: USDC_APPROVE_ABI,
                functionName: 'balanceOf',
                args: [walletAddress],
            }) as bigint

            if (balance < amountAtomic) {
                const chainLabel = sourceChain === 'base' ? 'Base' : 'Ethereum'
                throw new Error(
                    `Insufficient USDC balance on ${chainLabel}. ` +
                    `Your wallet has ${formatUnits(balance, 6)} USDC but ${amountUsdc} USDC is required.`
                )
            }

            // ── Step 1: Check + set allowance ────────────────────────────────
            const currentAllowance = await publicClient.readContract({
                address: sourceContracts.USDC,
                abi: USDC_APPROVE_ABI,
                functionName: 'allowance',
                args: [walletAddress, sourceContracts.TOKEN_MESSENGER],
            }) as bigint

            if (currentAllowance < amountAtomic) {
                const approveTxHash = await walletClient.writeContract({
                    address: sourceContracts.USDC,
                    abi: USDC_APPROVE_ABI,
                    functionName: 'approve',
                    args: [sourceContracts.TOKEN_MESSENGER, maxUint256],
                })
                await publicClient.waitForTransactionReceipt({
                    hash: approveTxHash,
                    confirmations: 1,
                })
            }

            // ── Step 2: Burn USDC via CCTP ───────────────────────────────────
            setPhase('burning')

            // Encode destination address as bytes32 (CCTP wire format)
            const mintRecipient = addressToBytes32(arbitrumAddress as Hex)

            // Use depositForBurn (4-param, CCTP v1 compatible).
            // The deployed Ethereum TokenMessenger (0xBd3fa81B...) is CCTP v1 —
            // depositForBurnWithCaller with minFinalityThreshold is v2 only and reverts on v1.
            const burnTx = await walletClient.writeContract({
                address: sourceContracts.TOKEN_MESSENGER,
                abi: TOKEN_MESSENGER_ABI,
                functionName: 'depositForBurn',
                args: [
                    amountAtomic,
                    CCTP_DESTINATION.domain,
                    mintRecipient,
                    sourceContracts.USDC,
                ],
            })

            // Wait for burn confirmation
            await publicClient.waitForTransactionReceipt({ hash: burnTx, confirmations: 1 })

            setBurnTxHash(burnTx)
            setPhase('relaying')

            // ── Step 3: Notify server to start relay ─────────────────────────
            const serverRes = await fetch('/api/cctp/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    burnTxHash: burnTx,
                    sourceChain,
                    walletAddress: walletAddress.toLowerCase(),
                    arbitrumAddress: arbitrumAddress.toLowerCase(),
                    amountUsdc,
                    accountId: accountId ?? null,
                }),
            })

            const serverJson = await serverRes.json() as {
                data?: { transferId?: string | null }
                error?: { message: string }
            }

            const tid = serverJson.data?.transferId ?? null
            setTransferId(tid)

            // ── Step 4: Poll for minted status ───────────────────────────────
            if (tid) {
                startPolling(tid, amountUsdc)
            } else {
                // DB unavailable — still optimistically show relaying state
                setMintedAmount(amountUsdc)
            }

        } catch (err) {
            setPhase('failed')
            setError(err instanceof Error ? err.message : 'CCTP transfer failed. Please try again.')
        }
    }, [wallets, startPolling])

    // ── Vault deposit record ──────────────────────────────────────────────────
    const depositToVault = useCallback(async (vaultTxHash: Hex) => {
        if (!transferId) return
        setPhase('vault_depositing')
        try {
            await fetch(`/api/cctp/transfer`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transferId, vaultTxHash }),
            })
            setPhase('vault_deposited')
        } catch {
            // Non-critical — vault deposit is the user's action; just mark local state
            setPhase('vault_deposited')
        }
    }, [transferId])

    const reset = useCallback(() => {
        if (pollRef.current) clearTimeout(pollRef.current)
        setPhase('idle')
        setTransferId(null)
        setBurnTxHash(null)
        setRelayTxHash(null)
        setMintedAmount(null)
        setError(null)
    }, [])

    return {
        phase,
        transferId,
        burnTxHash,
        relayTxHash,
        mintedAmount,
        error,
        burn,
        depositToVault,
        reset,
    }
}
