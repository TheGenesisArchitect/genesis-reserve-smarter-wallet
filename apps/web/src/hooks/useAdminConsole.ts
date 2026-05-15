'use client'

import { useBFFData } from './useBFFData'
import type { AdminConsoleResponse } from '../lib/bff.types'
import { AdminConsoleResponseSchema } from '../lib/validation'

export function useAdminConsole() {
    return useBFFData<AdminConsoleResponse>({
        queryKey: ['gr-admin-console'],
        endpoint: '/api/gr/admin/console',
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        schema: AdminConsoleResponseSchema,
    })
}
