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

interface CachedVaultSnapshot {
  usdcBalance: string
  rawShares: string
  sharePrice: number
  walletUsdcBalance: string
  totalAUM: string
}

export interface VaultState {
  usdcBalance: string
  rawShares: bigint
  sharePrice: number
  walletUsdcBalance: string
  totalAUM: string
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

    const { walletClient } = await getConnectedWallet()
    const assets = parseUnits(usdcAmount, PROTOCOL.USDC_DECIMALS)

    // Use a reliable public RPC for receipt polling — Privy's embedded provider
    // may return before the tx is actually mined, causing the deposit to race
    // against an unconfirmed approve and revert with "transfer amount exceeds allowance".
    const reliableClient = createPublicClient({
      chain: ACTIVE_CHAIN,
      transport: http('https://arb1.arbitrum.io/rpc'),
    })

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
    return depositHash
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
    return txHash
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
    isLoading, error: error as Error | null, deposit, withdraw,
    latestTxHash, isConfirmed, isGasless: smartAccount.isReady, refresh: refetch
  }
}
