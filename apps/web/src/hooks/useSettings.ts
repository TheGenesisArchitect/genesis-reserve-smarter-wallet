'use client'

import { useBFFData } from './useBFFData'
import type { SettingsResponse } from '../lib/bff.types'
import { SettingsResponseSchema } from '../lib/validation'

export function useSettings(walletAddress?: string) {
    return useBFFData<SettingsResponse>({
        queryKey: ['gr-settings', walletAddress],
        endpoint: `/api/gr/settings?walletAddress=${encodeURIComponent(walletAddress ?? '')}`,
        enabled: Boolean(walletAddress),
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        schema: SettingsResponseSchema,
    })
}
