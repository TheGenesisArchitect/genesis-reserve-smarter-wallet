'use client'

import { useMemo } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'

const isEvmAddress = (value: unknown): value is `0x${string}` =>
    typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

export function useActiveWalletAddress(): `0x${string}` | undefined {
    const { authenticated, user } = usePrivy()
    const { wallets } = useWallets()
    const { address: wagmiAddress } = useAccount()

    return useMemo<`0x${string}` | undefined>(() => {
        const embeddedWalletAddress = wallets.find((wallet) => {
            const maybeType = (wallet as { walletClientType?: string }).walletClientType
            return maybeType === 'privy' && isEvmAddress(wallet.address)
        })?.address as `0x${string}` | undefined

        const userWalletAddress = isEvmAddress(user?.wallet?.address) ? user.wallet.address : undefined
        const fallbackWagmiAddress = isEvmAddress(wagmiAddress) ? wagmiAddress : undefined

        if (authenticated) {
            return embeddedWalletAddress ?? userWalletAddress ?? fallbackWagmiAddress
        }

        return fallbackWagmiAddress
    }, [authenticated, wallets, user?.wallet?.address, wagmiAddress])
}
