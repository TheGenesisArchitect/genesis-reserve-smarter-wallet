import { NextResponse } from 'next/server'
import { createTtlCache } from '../_lib/request-controls'

interface InflationPayload {
    rate: number
    source: string
    asOf: string
}

const cache = createTtlCache<InflationPayload>()
const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12h — CPI is monthly data
const CACHE_KEY = 'us-cpi'

// Current US CPI YoY rate — updated when World Bank fetch succeeds
// Source: US Bureau of Labor Statistics via World Bank
const STATIC_FALLBACK_RATE = 2.4

async function fetchWorldBankInflation(): Promise<number | null> {
    try {
        const url =
            'https://api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG' +
            '?format=json&mrv=3&per_page=3'
        const res = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(8_000),
            headers: { accept: 'application/json' },
        })
        if (!res.ok) return null

        const body = await res.json().catch(() => null)
        if (!Array.isArray(body) || body.length < 2) return null

        const records = body[1]
        if (!Array.isArray(records)) return null

        for (const record of records) {
            const val = record?.value
            if (typeof val === 'number' && val > 0) {
                return Number(val.toFixed(2))
            }
        }
        return null
    } catch {
        return null
    }
}

export async function GET() {
    const cached = cache.get(CACHE_KEY)
    if (cached) {
        return NextResponse.json(cached, {
            headers: {
                'cache-control': 'private, max-age=43200',
                'x-rpc-cache': 'hit',
            },
        })
    }

    const liveRate = await fetchWorldBankInflation()
    const payload: InflationPayload = liveRate !== null
        ? { rate: liveRate, source: 'worldbank', asOf: new Date().toISOString() }
        : { rate: STATIC_FALLBACK_RATE, source: 'static-2025', asOf: new Date().toISOString() }

    cache.set(CACHE_KEY, payload, CACHE_TTL_MS)

    return NextResponse.json(payload, {
        headers: {
            'cache-control': 'private, max-age=43200',
            'x-rpc-cache': 'miss',
        },
    })
}
