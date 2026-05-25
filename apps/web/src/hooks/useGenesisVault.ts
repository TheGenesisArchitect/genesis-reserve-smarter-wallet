// genesis-privy/src/hooks/useGenesisVault.ts  [FIXED v2]
// Fixes: batched approve+deposit via smart account, single tx hash state, gasless

import { useCallback, useEffect, useState } from 'react'
import { useReadContracts, useWaitForTransactionReceipt } from 'wagmi'
import { createPublicClient, createWalletClient, custom, encodeFunctionData, http, parseUnits, formatUnits, maxUint256 } from 'viem'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { ACTIVE_CHAIN, ACTIVE_CONTRACTS, PROTOCOL } from '../config/contracts'
import { GENESIS_VAULT_ABI, USDC_ABI } from '../abis/vault.abi'
import { useActiveWalletAddress } from './useActiveWalletAddress'
import { useSmartAccount } from './useSmartAccount'

const RELIABLE_RPC =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_ALCHEMY_RPC_URL) ||
  'https://rpc.ankr.com/arbitrum'

function parseDepositError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (/InactiveAccount|inactive account/i.test(msg))
    return new Error('Account not yet activated. Complete identity verification and try again.')
  if (/InsufficientFunds|insufficient funds/i.test(msg))
    return new Error('Insufficient USDC balance for this deposit amount.')
  if (/transfer amount exceeds allowance|ERC20: insufficient allowance/i.test(msg))
    return new Error('USDC approval expired. Please try again.')
  if (/ExceedsCap|exceeds.*cap/i.test(msg))
    return new Error('This deposit would exceed the vault capacity limit.')
  if (/user rejected|User rejected|ACTION_REJECTED/i.test(msg))
    return new Error('Transaction was cancelled.')
  if (/PolicyNotFound|policy.*not found/i.test(msg))
    return new Error('Account policy not found. Contact support.')
  return new Error(`Deposit failed: ${msg.slice(0, 140)}`)
}

interface CachedVaultSnapshot {
  usdcBalance: string
  rawShares: string
  sharePrice: number
  walletUsdcBalance: string
  totalAUM: string
}

// 0 = FlexibleReserve (Preserve), 1 = IncomeVault (Grow), 2 = GrowthMode (Accelerate)
export type VaultMode = 0 | 1 | 2

export interface VaultState {
  usdcBalance: string
  rawShares: bigint
  sharePrice: number
  walletUsdcBalance: string
  totalAUM: string
  vaultMode: VaultMode | null   // null = not yet activated / loading
  isVaultReady: boolean
  isLoading: boolean
  error: Error | null
  deposit: (usdcAmount: string) => Promise<`0x${string}`>
  withdraw: (usdcAmount: string) => Promise<`0x${string}`>
  latestTxHash: `0x${string}` | undefined
  isConfirmed: boolean
  isGasless: boolean
  refresh: () => void
}

export function useGenesisVault(): VaultState {
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  const resolvedAddress = useActiveWalletAddress()
  const smartAccount = useSmartAccount()
  const [latestTxHash, setLatestTxHash] = useState<`0x${string}` | undefined>()
  const [cachedSnapshot, setCachedSnapshot] = useState<CachedVaultSnapshot | null>(null)
  const snapshotKey = resolvedAddress ? `gr:vault-snapshot:${resolvedAddress.toLowerCase()}` : null

  const vaultAddress = ACTIVE_CONTRACTS.GENESIS_VAULT
  const usdcAddress = ACTIVE_CONTRACTS.USDC
  const nullAddr = '0x0000000000000000000000000000000000000000' as `0x${string}`
  const [isPageVisible, setIsPageVisible] = useState(true)

  useEffect(() => {
    if (typeof document === 'undefined') return

    const updateVisibility = () => setIsPageVisible(document.visibilityState === 'visible')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: GENESIS_VAULT_ABI, functionName: 'balanceOf', args: [resolvedAddress ?? nullAddr] },
      { address: vaultAddress, abi: GENESIS_VAULT_ABI, functionName: 'previewRedeem', args: [1_000_000n] },
      { address: usdcAddress, abi: USDC_ABI, functionName: 'balanceOf', args: [resolvedAddress ?? nullAddr] },
      { address: vaultAddress, abi: GENESIS_VAULT_ABI, functionName: 'totalAssets', args: [] },
      { address: vaultAddress, abi: GENESIS_VAULT_ABI, functionName: 'maxWithdraw', args: [resolvedAddress ?? nullAddr] },
      { address: vaultAddress, abi: GENESIS_VAULT_ABI, functionName: 'policies', args: [resolvedAddress ?? nullAddr] },
    ],
    query: {
      enabled: !!resolvedAddress,
      refetchInterval: isPageVisible ? 30_000 : 120_000,
    },
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Always reset first so a previous user's snapshot never flashes.
    setCachedSnapshot(null)

    if (!snapshotKey) return

    try {
      const raw = window.localStorage.getItem(snapshotKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as CachedVaultSnapshot
      if (parsed && typeof parsed.usdcBalance === 'string') {
        setCachedSnapshot(parsed)
      }
    } catch {
      // Ignore malformed snapshot cache.
    }
  }, [snapshotKey])

  useEffect(() => {
    if (authenticated) return
    setCachedSnapshot(null)
    setLatestTxHash(undefined)
  }, [authenticated])

  useEffect(() => {
    setLatestTxHash(undefined)
  }, [resolvedAddress])

  const hasFreshResults = Boolean(data?.[0]?.result !== undefined)

  const rawSharesFresh = (data?.[0]?.result ?? 0n) as bigint
  const sharePriceRawFresh = (data?.[1]?.result ?? 1_000_000n) as bigint
  const walletUsdcFresh = (data?.[2]?.result ?? 0n) as bigint
  const totalAUMRawFresh = (data?.[3]?.result ?? 0n) as bigint
  const maxWithdrawFresh = (data?.[4]?.result ?? 0n) as bigint
  const policyFresh = (data?.[5]?.result ?? null) as readonly unknown[] | null
  // policy tuple index 0 = mode: uint8, index 6 = active: bool
  const isVaultReady = hasFreshResults ? Boolean(policyFresh?.[6]) : false
  const vaultMode: VaultMode | null = hasFreshResults && policyFresh?.[6]
    ? ((Number(policyFresh[0]) as VaultMode) ?? null)
    : null

  useEffect(() => {
    if (!hasFreshResults || !snapshotKey || typeof window === 'undefined') return

    const nextSnapshot: CachedVaultSnapshot = {
      usdcBalance: formatUnits(maxWithdrawFresh, PROTOCOL.USDC_DECIMALS),
      rawShares: rawSharesFresh.toString(),
      sharePrice: Number(sharePriceRawFresh) / 1e6,
      walletUsdcBalance: formatUnits(walletUsdcFresh, PROTOCOL.USDC_DECIMALS),
      totalAUM: formatUnits(totalAUMRawFresh, PROTOCOL.USDC_DECIMALS),
    }

    setCachedSnapshot(nextSnapshot)
    try {
      window.localStorage.setItem(snapshotKey, JSON.stringify(nextSnapshot))
    } catch {
      // Ignore storage quota errors.
    }
  }, [
    hasFreshResults,
    snapshotKey,
    maxWithdrawFresh,
    rawSharesFresh,
    sharePriceRawFresh,
    walletUsdcFresh,
    totalAUMRawFresh,
  ])

  const rawShares = hasFreshResults
    ? rawSharesFresh
    : BigInt(cachedSnapshot?.rawShares ?? '0')
  const sharePrice = hasFreshResults
    ? Number(sharePriceRawFresh) / 1e6
    : (cachedSnapshot?.sharePrice ?? 1)
  const usdcBalance = hasFreshResults
    ? formatUnits(maxWithdrawFresh, PROTOCOL.USDC_DECIMALS)
    : (cachedSnapshot?.usdcBalance ?? '0')
  const walletUsdcBalance = hasFreshResults
    ? formatUnits(walletUsdcFresh, PROTOCOL.USDC_DECIMALS)
    : (cachedSnapshot?.walletUsdcBalance ?? '0')
  const totalAUM = hasFreshResults
    ? formatUnits(totalAUMRawFresh, PROTOCOL.USDC_DECIMALS)
    : (cachedSnapshot?.totalAUM ?? '0')

  // Gate success state on actual on-chain confirmation — FIX for race bug
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: latestTxHash,
    query: { enabled: !!latestTxHash },
  })

  const getConnectedWallet = useCallback(async () => {
    if (!resolvedAddress) {
      throw new Error('Wallet not ready. Reconnect wallet and try again.')
    }

    const wallet = wallets.find(w =>
      w.address?.toLowerCase() === resolvedAddress.toLowerCase()
    )

    if (!wallet) {
      throw new Error('Connected wallet provider not found. Reconnect and retry.')
    }

    await wallet.switchChain(ACTIVE_CHAIN.id)
    const provider = await wallet.getEthereumProvider()
    const walletClient = createWalletClient({
      chain: ACTIVE_CHAIN,
      transport: custom(provider as any),
      account: resolvedAddress,
    })

    const publicClient = createPublicClient({
      chain: ACTIVE_CHAIN,
      transport: custom(provider as any),
    })

    return { walletClient, publicClient }
  }, [resolvedAddress, wallets])

  const depositWithEoa = useCallback(async (usdcAmount: string): Promise<`0x${string}`> => {
    if (!resolvedAddress) {
      throw new Error('Wallet not ready. Reconnect wallet and try again.')
    }

    // Read pool tier from localStorage (set by VaultsPage pool selection)
    let pendingTier = 'grow'
    try {
      const raw = typeof window !== 'undefined' && window.localStorage.getItem('gr:pending-tier')
      if (raw) pendingTier = (JSON.parse(raw) as { tierKey?: string }).tierKey ?? 'grow'
    } catch { /* ignore */ }

    const { walletClient } = await getConnectedWallet()
    const assets = parseUnits(usdcAmount, PROTOCOL.USDC_DECIMALS)

    // Use a reliable public RPC for receipt polling — Privy's embedded provider
    // may return before the tx is actually mined, causing the deposit to race
    // against an unconfirmed approve and revert with "transfer amount exceeds allowance".
    const reliableClient = createPublicClient({
      chain: ACTIVE_CHAIN,
      transport: http(RELIABLE_RPC),
    })

    // Pre-flight: activate account with the correct pool mode if not already active
    try {
      const policy = await reliableClient.readContract({
        address: vaultAddress,
        abi: GENESIS_VAULT_ABI,
        functionName: 'policies',
        args: [resolvedAddress],
      }) as readonly unknown[]

      if (!Boolean(policy?.[6])) {
        const activateRes = await fetch('/api/gr/vault/activate-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: resolvedAddress, tier: pendingTier }),
        })
        const activateData = await activateRes.json().catch(() => ({})) as Record<string, unknown>
        const nowActive = activateData.status === 'activated' || activateData.status === 'already_active'
        if (!nowActive) {
          if (activateData.status === 'kyc_required')
            throw new Error('KYC verification is required before depositing.')
          if (!activateRes.ok)
            throw new Error('Account activation failed. Please try again or contact support.')
        }
        if (typeof activateData.txHash === 'string') {
          await reliableClient.waitForTransactionReceipt({
            hash: activateData.txHash as `0x${string}`,
            timeout: 30_000,
          })
        }
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('KYC') || err.message.includes('activation failed'))) throw err
      // RPC read failure — proceed optimistically; vault call will surface the real error
    }

    try {
      const currentAllowance = await reliableClient.readContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [resolvedAddress, vaultAddress],
      }) as bigint

      if (currentAllowance < assets) {
        const approveHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [vaultAddress, maxUint256],
          account: resolvedAddress,
        })
        const approveReceipt = await reliableClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') {
          throw new Error('USDC approval failed on-chain. Please try again.')
        }
      }

      const depositHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: GENESIS_VAULT_ABI,
        functionName: 'deposit',
        args: [assets, resolvedAddress],
        account: resolvedAddress,
      })

      setLatestTxHash(depositHash)

      // Post-deposit: record intent, strategy preference, and trigger immediate allocation
      try {
        await Promise.all([
          fetch('/api/gr/deposit/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: resolvedAddress, tier: pendingTier, txHash: depositHash }),
          }),
          fetch('/api/gr/deposit/strategy-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: resolvedAddress, strategy: pendingTier }),
          }),
          fetch('/api/gr/vault/trigger-allocation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: resolvedAddress, tier: pendingTier }),
          }),
        ])
      } catch { /* non-critical telemetry — deposit already succeeded */ }

      return depositHash
    } catch (err) {
      throw parseDepositError(err)
    }
  }, [getConnectedWallet, resolvedAddress, usdcAddress, vaultAddress])

  const withdrawWithEoa = useCallback(async (usdcAmount: string): Promise<`0x${string}`> => {
    if (!resolvedAddress) {
      throw new Error('Wallet not ready. Reconnect wallet and try again.')
    }

    const { walletClient } = await getConnectedWallet()
    const assets = parseUnits(usdcAmount, PROTOCOL.USDC_DECIMALS)

    const txHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: GENESIS_VAULT_ABI,
      functionName: 'withdraw',
      args: [assets, resolvedAddress, resolvedAddress],
      account: resolvedAddress,
    })

    setLatestTxHash(txHash)
    return txHash
  }, [getConnectedWallet, resolvedAddress, vaultAddress])

  // deposit — approve + deposit batched into ONE UserOperation (one Privy prompt)
  const deposit = useCallback(async (usdcAmount: string): Promise<`0x${string}`> => {
    if (!smartAccount.isReady || !smartAccount.smartAddress) {
      return depositWithEoa(usdcAmount)
    }
    const assets = parseUnits(usdcAmount, PROTOCOL.USDC_DECIMALS)
    const receiver = smartAccount.smartAddress

    // Read pool tier from VaultsPage selection so mode is set correctly on-chain
    let pendingTier = 'grow'
    try {
      const raw = typeof window !== 'undefined' && window.localStorage.getItem('gr:pending-tier')
      if (raw) pendingTier = (JSON.parse(raw) as { tierKey?: string }).tierKey ?? 'grow'
    } catch { /* ignore */ }

    // Pre-flight: ensure vault policy is active for the smart account receiver.
    // This is separate from the EOA KYC check — the smart account address needs
    // its own activation on the vault even when the EOA is already active.
    const preflight = createPublicClient({ chain: ACTIVE_CHAIN, transport: http(RELIABLE_RPC) })
    try {
      const policy = await preflight.readContract({
        address: vaultAddress,
        abi: GENESIS_VAULT_ABI,
        functionName: 'policies',
        args: [receiver],
      }) as readonly unknown[]

      if (!Boolean(policy?.[6])) {
        const activateRes = await fetch('/api/gr/vault/activate-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: receiver, tier: pendingTier }),
        })
        const activateData = await activateRes.json().catch(() => ({})) as Record<string, unknown>
        const nowActive = activateData.status === 'activated' || activateData.status === 'already_active'
        if (!nowActive) {
          if (activateData.status === 'kyc_required')
            throw new Error('KYC verification is required before depositing.')
          if (activateData.status === 'operator_role_required')
            throw new Error('Vault operator not configured. Contact support.')
          if (!activateRes.ok)
            throw new Error('Account activation failed. Please try again or contact support.')
        }
        if (typeof activateData.txHash === 'string') {
          await preflight.waitForTransactionReceipt({
            hash: activateData.txHash as `0x${string}`,
            timeout: 30_000,
          })
        }
      }
    } catch (err) {
      if (err instanceof Error && (
        err.message.includes('KYC') ||
        err.message.includes('Vault operator') ||
        err.message.includes('activation failed')
      )) throw err
      // RPC read failure — proceed optimistically; vault call will surface the real error
    }

    try {
      const approveData = encodeFunctionData({
        abi: USDC_ABI, functionName: 'approve',
        args: [vaultAddress, maxUint256]
      })
      const depositData = encodeFunctionData({
        abi: GENESIS_VAULT_ABI, functionName: 'deposit',
        args: [assets, receiver]
      })

      const txHash = await smartAccount.sendBatchUserOperation([
        { to: usdcAddress, data: approveData },
        { to: vaultAddress, data: depositData },
      ])
      setLatestTxHash(txHash)

      // Record intent + preference, then immediately trigger yield deployment
      try {
        await Promise.all([
          fetch('/api/gr/deposit/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: receiver, tier: pendingTier, txHash }),
          }),
          fetch('/api/gr/deposit/strategy-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: receiver, strategy: pendingTier }),
          }),
          fetch('/api/gr/vault/trigger-allocation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: receiver, tier: pendingTier }),
          }),
        ])
      } catch { /* non-critical — deposit already succeeded */ }

      return txHash
    } catch (err) {
      throw parseDepositError(err)
    }
  }, [depositWithEoa, smartAccount, usdcAddress, vaultAddress])

  const withdraw = useCallback(async (usdcAmount: string): Promise<`0x${string}`> => {
    if (!smartAccount.isReady || !smartAccount.smartAddress) {
      return withdrawWithEoa(usdcAmount)
    }
    const assets = parseUnits(usdcAmount, PROTOCOL.USDC_DECIMALS)
    const receiver = smartAccount.smartAddress

    const data = encodeFunctionData({
      abi: GENESIS_VAULT_ABI, functionName: 'withdraw',
      args: [assets, receiver, receiver]
    })
    const txHash = await smartAccount.sendUserOperation({ to: vaultAddress, data })
    setLatestTxHash(txHash)
    return txHash
  }, [smartAccount, vaultAddress, withdrawWithEoa])

  return {
    usdcBalance, rawShares, sharePrice, walletUsdcBalance, totalAUM,
    vaultMode, isVaultReady, isLoading, error: error as Error | null, deposit, withdraw,
    latestTxHash, isConfirmed, isGasless: smartAccount.isReady, refresh: refetch
  }
}
