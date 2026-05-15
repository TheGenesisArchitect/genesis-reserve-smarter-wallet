/**
 * /api/cctp/relayer-health — Relayer balance and health check endpoint.
 * Used by ops dashboards and internal monitoring.
 */

import { NextResponse } from 'next/server'
import { checkRelayerHealth } from '../../../../monitors/relayer-health'

export async function GET() {
    try {
        const health = await checkRelayerHealth()
        const httpStatus = health.level === 'critical' ? 503 : 200
        return NextResponse.json({ data: health }, { status: httpStatus })
    } catch (err) {
        return NextResponse.json(
            {
                data: {
                    level:      'critical' as const,
                    message:    `Health check failed: ${String(err)}`,
                    checkedAt:  new Date().toISOString(),
                },
            },
            { status: 503 },
        )
    }
}
