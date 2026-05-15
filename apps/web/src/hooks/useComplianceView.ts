'use client'

import { useBFFData } from './useBFFData'
import type { ComplianceViewResponse } from '../lib/bff.types'
import { ComplianceViewResponseSchema } from '../lib/validation'

export function useComplianceView(walletAddress?: string) {
    return useBFFData<ComplianceViewResponse>({
        queryKey: ['gr-compliance-view', walletAddress],
        endpoint: `/api/gr/compliance-view?walletAddress=${encodeURIComponent(walletAddress ?? '')}`,
        enabled: Boolean(walletAddress),
        staleTime: 5 * 60_000,
        gcTime: 5 * 60_000,
        schema: ComplianceViewResponseSchema,
    })
}
