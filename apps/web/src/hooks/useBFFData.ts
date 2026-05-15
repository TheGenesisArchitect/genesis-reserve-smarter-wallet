'use client'

import { useQuery, type UseQueryOptions, type QueryKey } from '@tanstack/react-query'
import type { ZodType } from 'zod'
import { getJson } from '../lib/apiClient'

interface UseBFFDataOptions<TData> {
    queryKey: QueryKey
    endpoint: string
    enabled?: boolean
    staleTime?: number
    gcTime?: number
    refetchInterval?: number
    select?: (data: TData) => TData
    schema?: ZodType<TData>
}

export function useBFFData<TData>({
    queryKey,
    endpoint,
    enabled = true,
    staleTime = 30_000,
    gcTime = 5 * 60_000,
    refetchInterval,
    select,
    schema,
}: UseBFFDataOptions<TData>) {
    return useQuery<TData>({
        queryKey,
        queryFn: () => getJson<TData>(endpoint, undefined, schema),
        enabled,
        staleTime,
        gcTime,
        refetchInterval,
        select,
    } as UseQueryOptions<TData>)
}
