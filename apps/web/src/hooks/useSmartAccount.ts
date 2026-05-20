// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/hooks/useSmartAccount.ts
//
// Bridges Privy's embedded wallet into a ZeroDev kernel smart account.
// This is what makes every transaction gasless — the ZeroDev Paymaster
// covers Arbitrum gas so users never need ETH.
//
// Architecture:
//   Privy embeddedWallet (EOA signer)
//     → ZeroDev ECDSA Validator
//       → Kernel v3 Smart Account
//         → ZeroDev Bundler + Paymaster (Alchemy RPC)
//           → Arbitrum One EntryPoint (ERC-4337)
//
// The smart account address is deterministic from the EOA signer —
// users get the same address every time they log in.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from '@zerodev/sdk'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { KERNEL_V3_1 } from '@zerodev/sdk/constants'
import {
  createPublicClient,
  http,
  type WalletClient,
  type Address,
} from 'viem'
import { toOwner } from 'permissionless/utils'
import { ACTIVE_CHAIN } from '../config/contracts'

// ── Environment ──────────────────────────────────────────────────────────────

const BUNDLER_URL = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL ?? ''
const PAYMASTER_URL = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL ?? ''
const ALCHEMY_RPC = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ?? ''

const parseRpcList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0)

const SMART_ACCOUNT_RPC_CANDIDATES = Array.from(new Set([
  ...(ALCHEMY_RPC && !ALCHEMY_RPC.includes('PASTE') ? [ALCHEMY_RPC] : []),
  ...parseRpcList(process.env.NEXT_PUBLIC_ARBITRUM_RPC_FALLBACKS),
  'https://rpc.ankr.com/arbitrum',
  'https://arbitrum-one.publicnode.com',
  'https://arb1.arbitrum.io/rpc',
]))

// Returns true only when ZeroDev has been configured with a real project ID.
// Guards against crashes when placeholder values are still in .env.local.
const ZERODEV_CONFIGURED =
  BUNDLER_URL.length > 0 && !BUNDLER_URL.includes('PASTE_ZERODEV')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SmartAccountState {
  // The smart account address (deterministic from Privy EOA)
  smartAddress: Address | null
  // Whether the smart account client is ready for transactions
  isReady: boolean
  // Current error, if any
  error: Error | null
  // Execute a transaction through the smart account (gasless)
  // Returns the transaction hash
  sendUserOperation: (args: {
    to: Address
    data: `0x${string}`
    value?: bigint
  }) => Promise<`0x${string}`>
  // Execute multiple transactions atomically in one UserOperation
  sendBatchUserOperation: (
    calls: Array<{ to: Address; data: `0x${string}`; value?: bigint }>
  ) => Promise<`0x${string}`>
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSmartAccount(): SmartAccountState {
  const { authenticated, ready } = usePrivy()
  const { wallets } = useWallets()

  const [smartAddress, setSmartAddress] = useState<Address | null>(null)
  const [kernelClient, setKernelClient] = useState<ReturnType<
    typeof createKernelAccountClient
  > | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // ── Initialize smart account when Privy wallet is available ─────────────
  useEffect(() => {
    if (!ready || !authenticated) {
      setIsReady(false)
      setSmartAddress(null)
      setKernelClient(null)
      return
    }

    // ZeroDev not yet configured — smart account / gasless features unavailable.
    // Normal wallet login still works; transactions will require the user to pay gas.
    if (!ZERODEV_CONFIGURED) {
      return
    }

    // Find the Privy embedded wallet (created on email/SMS login)
    const embeddedWallet = wallets.find(
      w => w.walletClientType === 'privy'
    )

    if (!embeddedWallet) return

    let cancelled = false

    async function initSmartAccount() {
      try {
        // Step 1: Get a viem WalletClient from the Privy embedded wallet
        // switchChain ensures the wallet is on Arbitrum One before signing
        await embeddedWallet!.switchChain(ACTIVE_CHAIN.id)
        const walletClient = await embeddedWallet!.getEthereumProvider() as unknown as WalletClient

        // Step 2: Create a public client for on-chain reads
        const publicClient = createPublicClient({
          chain: ACTIVE_CHAIN,
          transport: http(SMART_ACCOUNT_RPC_CANDIDATES[0]),
        })

        // Step 3: Convert Privy WalletClient → local owner signer for ZeroDev
        const signer = await toOwner({ owner: walletClient })

        // Step 4: Create ECDSA validator (Privy EOA is the owner)
        const ecdsaValidator = await (signerToEcdsaValidator as any)(publicClient, {
          signer,
          kernelVersion: KERNEL_V3_1,
        })

        // Step 5: Create the Kernel v3 smart account
        // Address is deterministic: same EOA always → same smart account address
        const kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: ecdsaValidator,
          },
          kernelVersion: KERNEL_V3_1,
        })

        if (cancelled) return

        // Step 6: Create the Paymaster client (ZeroDev sponsors gas)
        const paymasterClient = createZeroDevPaymasterClient({
          chain: ACTIVE_CHAIN,
          transport: http(PAYMASTER_URL),
        })

        // Step 7: Create the Kernel account client — this is what sends txs
        const client = createKernelAccountClient({
          account: kernelAccount,
          chain: ACTIVE_CHAIN,
          bundlerTransport: http(BUNDLER_URL),
          paymaster: {
            getPaymasterData: (userOperation: any) =>
              paymasterClient.sponsorUserOperation({ userOperation }),
          },
        })

        if (cancelled) return

        setKernelClient(client as any)
        setSmartAddress(kernelAccount.address)
        setIsReady(true)
        setError(null)

      } catch (err) {
        if (cancelled) return
        console.error('[useSmartAccount] init failed:', err)
        setError(err instanceof Error ? err : new Error('Smart account init failed'))
        setIsReady(false)
      }
    }

    initSmartAccount()
    return () => { cancelled = true }
  }, [ready, authenticated, wallets])

  // ── sendUserOperation — single gasless transaction ────────────────────────
  const sendUserOperation = useCallback(
    async (args: {
      to: Address
      data: `0x${string}`
      value?: bigint
    }): Promise<`0x${string}`> => {
      if (!kernelClient) {
        throw new Error('Smart account not ready. Is the user logged in?')
      }

      const txHash = await (kernelClient as any).sendTransaction({
        to: args.to,
        data: args.data,
        value: args.value ?? 0n,
      })

      return txHash as `0x${string}`
    },
    [kernelClient]
  )

  // ── sendBatchUserOperation — multiple txs in one UserOperation ────────────
  // Key use case: approve() + deposit() in a single gasless UserOperation.
  // This is the Permit2-equivalent UX without requiring Permit2 — the two
  // transactions are atomically batched and the user sees ONE Privy prompt.
  const sendBatchUserOperation = useCallback(
    async (
      calls: Array<{ to: Address; data: `0x${string}`; value?: bigint }>
    ): Promise<`0x${string}`> => {
      if (!kernelClient) {
        throw new Error('Smart account not ready. Is the user logged in?')
      }

      const txHash = await (kernelClient as any).sendTransactions({
        transactions: calls.map(c => ({
          to: c.to,
          data: c.data,
          value: c.value ?? 0n,
        })),
      })

      return txHash as `0x${string}`
    },
    [kernelClient]
  )

  return {
    smartAddress,
    isReady,
    error,
    sendUserOperation,
    sendBatchUserOperation,
  }
}
