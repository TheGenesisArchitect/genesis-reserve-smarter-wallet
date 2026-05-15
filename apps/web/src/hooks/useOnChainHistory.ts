'use client'

import { useQuery } from '@tanstack/react-query'
import type { ActivityTx } from '../app/api/gr/activity/route'

export type OnChainTx = ActivityTx

async function fetchOnChainHistory(address: string): Promise<OnChainTx[]> {
  const res = await fetch(`/api/gr/activity?address=${address}`, { cache: 'no-store' })
  if (!res.ok) return []
  const json = await res.json() as { txs: OnChainTx[] }
  return json.txs ?? []
}

export function useOnChainHistory(address?: `0x${string}`) {
  return useQuery({
    queryKey: ['on-chain-history', address?.toLowerCase()],
    queryFn: () => fetchOnChainHistory(address!),
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}
