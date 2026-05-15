'use client'

import { useQuery } from '@tanstack/react-query'

export type ChainBalance = {
  chainId: number
  nativeAmount: number  // in native token units (ETH, POL, etc.)
  usdcAmount: number    // in USDC (already divided by 1e6)
}

// Route all balance reads through the Next.js BFF — avoids browser CORS/rate-limit issues
// with block explorer APIs (Etherscan, Arbiscan, etc.)
async function fetchAllBalances(address: string): Promise<ChainBalance[]> {
  const res = await fetch(`/api/gr/portfolio?address=${address}`, { cache: 'no-store' })
  if (!res.ok) return []
  const json = await res.json() as { balances: ChainBalance[] }
  return json.balances ?? []
}

export function usePortfolioBalances(address?: `0x${string}`) {
  return useQuery({
    queryKey: ['portfolio-balances', address?.toLowerCase()],
    queryFn: () => fetchAllBalances(address!),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 2,
  })
}
