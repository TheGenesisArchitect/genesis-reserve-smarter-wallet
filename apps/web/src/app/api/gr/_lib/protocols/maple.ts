import { backendPost, isBackendConfigured } from '../backend'

/**
 * Checks Maple accreditation status via the Genesis compliance backend.
 * Returns true (permissive) when the backend is not configured or on
 * transient network errors so development environments are not blocked.
 */
export async function checkMapleAccreditation(
    walletAddress: string,
    request?: Request
): Promise<boolean> {
    if (!isBackendConfigured()) return true

    try {
        const res = await backendPost(
            '/v1/compliance/accreditation-status',
            { walletAddress, protocol: 'maple' },
            `maple-accreditation-${walletAddress}`,
            request
        )
        if (!res.ok) return false
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        return body.accredited === true
    } catch {
        return true // permissive on transient failure
    }
}
