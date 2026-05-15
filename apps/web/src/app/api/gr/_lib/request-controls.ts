type RateWindow = {
    windowStart: number
    count: number
}

type CacheEntry<T> = {
    expiresAt: number
    payload: T
}

export function getRequestIp(request: Request): string {
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) return forwardedFor.split(',')[0].trim()
    return request.headers.get('x-real-ip') ?? 'unknown'
}

export function createRateLimiter(limitPerWindow: number, windowMs: number) {
    const windows = new Map<string, RateWindow>()

    return {
        isLimited(key: string): boolean {
            const now = Date.now()
            const existing = windows.get(key)

            if (!existing || now - existing.windowStart > windowMs) {
                windows.set(key, { windowStart: now, count: 1 })
                return false
            }

            existing.count += 1
            windows.set(key, existing)
            return existing.count > limitPerWindow
        },
    }
}

export function createTtlCache<T>() {
    const store = new Map<string, CacheEntry<T>>()

    return {
        get(key: string): T | null {
            const entry = store.get(key)
            if (!entry) return null
            if (entry.expiresAt <= Date.now()) {
                store.delete(key)
                return null
            }
            return entry.payload
        },
        set(key: string, payload: T, ttlMs: number) {
            store.set(key, {
                payload,
                expiresAt: Date.now() + ttlMs,
            })
        },
    }
}
