import { NextResponse } from 'next/server'
import type { AdminConsoleResponse } from '../../../../../lib/bff.types'
import { buildBackendUrl } from '../../_lib/backend'

const adminApiKey = process.env.GENESIS_ADMIN_API_KEY || process.env.ADMIN_API_KEY || ''
const backendBaseUrl = process.env.GENESIS_BACKEND_URL || process.env.NEXT_PUBLIC_GENESIS_API_URL || 'http://localhost:4000'

function unwrapDataEnvelope<T>(payload: unknown, fallback: T): T {
    if (!payload || typeof payload !== 'object') return fallback
    const record = payload as Record<string, unknown>
    return (record.data as T | undefined) ?? fallback
}

async function fetchAdmin(path: string) {
    return fetch(buildBackendUrl(path), {
        method: 'GET',
        headers: {
            'x-admin-key': adminApiKey,
            'content-type': 'application/json',
        },
        cache: 'no-store',
    })
}

export async function GET() {
    if (!backendBaseUrl || !adminApiKey) {
        return NextResponse.json(
            {
                error: 'admin_backend_not_configured',
                detail: 'Set GENESIS_BACKEND_URL and GENESIS_ADMIN_API_KEY in the frontend environment.',
            },
            { status: 500 }
        )
    }

    try {
        const [statsRes, usersRes, flagsRes, queueRes] = await Promise.all([
            fetchAdmin('/v1/admin/stats'),
            fetchAdmin('/v1/admin/users'),
            fetchAdmin('/v1/admin/feature-flags'),
            fetchAdmin('/v1/admin/queue'),
        ])

        const [statsPayload, usersPayload, flagsPayload, queuePayload] = await Promise.all([
            statsRes.json(),
            usersRes.json(),
            flagsRes.json(),
            queueRes.json(),
        ])

        if (!statsRes.ok) return NextResponse.json(statsPayload, { status: statsRes.status })
        if (!usersRes.ok) return NextResponse.json(usersPayload, { status: usersRes.status })
        if (!flagsRes.ok) return NextResponse.json(flagsPayload, { status: flagsRes.status })
        if (!queueRes.ok) return NextResponse.json(queuePayload, { status: queueRes.status })

        const response: AdminConsoleResponse = {
            stats: unwrapDataEnvelope(statsPayload, []),
            users: unwrapDataEnvelope(usersPayload, []),
            featureFlags: unwrapDataEnvelope(flagsPayload, []),
            queue: unwrapDataEnvelope(queuePayload, []),
            fetchedAt: new Date().toISOString(),
        }

        return NextResponse.json(response, {
            headers: {
                'cache-control': 'private, max-age=60',
            },
        })
    } catch (error) {
        return NextResponse.json(
            {
                error: 'admin_console_fetch_failed',
                detail: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        )
    }
}
