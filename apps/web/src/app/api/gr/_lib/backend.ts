import { NextResponse } from 'next/server'

const backendBaseUrl = process.env.GENESIS_BACKEND_URL || process.env.NEXT_PUBLIC_GENESIS_API_URL || 'http://localhost:4000'
const partnerApiKey = process.env.GENESIS_PARTNER_API_KEY || process.env.TEST_API_KEY || ''
const BACKEND_TIMEOUT_MS = Number(process.env.GENESIS_BACKEND_TIMEOUT_MS || 8_000)

function forwardHeaders(request?: Request, extraHeaders?: Record<string, string | undefined>) {
    const headers: Record<string, string> = {
        'x-api-key': partnerApiKey,
        'content-type': 'application/json',
    }

    const authorization = request?.headers.get('authorization')
    if (authorization) {
        headers.authorization = authorization
    }

    for (const [key, value] of Object.entries(extraHeaders || {})) {
        if (typeof value === 'string' && value.length > 0) {
            headers[key] = value
        }
    }

    return headers
}

export function backendNotConfiguredResponse() {
    return NextResponse.json(
        {
            error: 'backend_not_configured',
            detail: 'Set GENESIS_BACKEND_URL and GENESIS_PARTNER_API_KEY in the frontend environment.',
        },
        { status: 500 }
    )
}

export function isBackendConfigured() {
    return Boolean(backendBaseUrl && partnerApiKey)
}

export function buildBackendUrl(path: string, queryString?: string) {
    const normalized = path.startsWith('/') ? path : `/${path}`
    const qs = queryString ? `?${queryString}` : ''
    return `${backendBaseUrl}${normalized}${qs}`
}

async function fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)
    const parentSignal = init.signal

    const onAbort = () => controller.abort()
    if (parentSignal) {
        parentSignal.addEventListener('abort', onAbort, { once: true })
    }

    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timeout)
        if (parentSignal) {
            parentSignal.removeEventListener('abort', onAbort)
        }
    }
}

export async function backendGet(path: string, queryString?: string) {
    const url = buildBackendUrl(path, queryString)
    return fetchWithTimeout(url, {
        method: 'GET',
        headers: forwardHeaders(),
        cache: 'no-store',
    })
}

export async function backendPost(
    path: string,
    body: unknown,
    idempotencyKey?: string,
    request?: Request,
    extraHeaders?: Record<string, string | undefined>
) {
    const url = buildBackendUrl(path)
    const headers: Record<string, string> = forwardHeaders(request, extraHeaders)

    if (idempotencyKey) {
        headers['idempotency-key'] = idempotencyKey
    }

    return fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
        cache: 'no-store',
        signal: request?.signal,
    })
}

export async function backendPatch(path: string, body: unknown, idempotencyKey?: string) {
    const url = buildBackendUrl(path)
    const headers: Record<string, string> = forwardHeaders()

    if (idempotencyKey) {
        headers['idempotency-key'] = idempotencyKey
    }

    return fetchWithTimeout(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body ?? {}),
        cache: 'no-store',
    })
}

export async function toJsonResponse(upstream: Response) {
    const text = await upstream.text()
    const headers = new Headers()
    headers.set('content-type', upstream.headers.get('content-type') || 'application/json')

    const requestId = upstream.headers.get('x-request-id')
    if (requestId) {
        headers.set('x-request-id', requestId)
    }

    return new Response(text || '{}', {
        status: upstream.status,
        headers,
    })
}
