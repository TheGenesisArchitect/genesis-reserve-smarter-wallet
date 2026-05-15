import type { ZodType } from 'zod'

export class ApiError extends Error {
    readonly status: number
    readonly detail?: string

    constructor(status: number, message: string, detail?: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.detail = detail
    }
}

export async function getJson<T>(url: string, init?: RequestInit, schema?: ZodType<T>): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers || {}),
        },
        cache: init?.cache ?? 'no-store',
    })

    if (!response.ok) {
        let payload: Record<string, unknown> | null = null

        try {
            payload = (await response.json()) as Record<string, unknown>
        } catch {
            payload = null
        }

        const message = String(payload?.error ?? response.statusText ?? 'request_failed')
        const detail = payload?.detail ? String(payload.detail) : undefined
        throw new ApiError(response.status, message, detail)
    }

    const json = (await response.json()) as unknown
    return schema ? schema.parse(json) : (json as T)
}
