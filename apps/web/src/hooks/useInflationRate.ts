'use client'

import { useState, useEffect } from 'react'

export interface InflationData {
    rate: number      // YoY % — e.g. 2.4
    source: string    // 'worldbank' | 'static-2025'
    asOf: string
    loading: boolean
}

const FALLBACK_RATE = 2.4
const CACHE_MS = 12 * 60 * 60 * 1000 // match server TTL

// Module-level cache — survives component remounts within a session
let _cached: { rate: number; source: string; asOf: string } | null = null
let _cachedAt = 0

export function useInflationRate(): InflationData {
    const [data, setData] = useState<Omit<InflationData, 'loading'>>(() =>
        _cached ?? { rate: FALLBACK_RATE, source: 'static-2025', asOf: '' }
    )
    const [loading, setLoading] = useState(!_cached)

    useEffect(() => {
        if (_cached && Date.now() - _cachedAt < CACHE_MS) {
            setData(_cached)
            setLoading(false)
            return
        }

        let cancelled = false
        setLoading(true)

        fetch('/api/gr/inflation')
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { rate: number; source: string; asOf: string } | null) => {
                if (cancelled) return
                if (d && typeof d.rate === 'number' && d.rate > 0) {
                    _cached = d
                    _cachedAt = Date.now()
                    setData(d)
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => { cancelled = true }
    }, [])

    return { ...data, loading }
}
