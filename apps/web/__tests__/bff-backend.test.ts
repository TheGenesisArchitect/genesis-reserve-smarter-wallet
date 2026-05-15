import { describe, it, expect } from 'vitest'
import { toJsonResponse } from '../src/app/api/gr/_lib/backend'

describe('BFF backend passthrough', () => {
    it('preserves upstream status and error JSON body', async () => {
        const upstreamBody = {
            error: {
                code: 'RESERVATION_FAILED',
                message: 'Fund reservation failed',
                detail: 'Fund reservation failed: FAIL',
            },
        }

        const upstream = new Response(JSON.stringify(upstreamBody), {
            status: 422,
            headers: {
                'content-type': 'application/json',
            },
        })

        const downstream = await toJsonResponse(upstream)
        const downstreamJson = await downstream.json()

        expect(downstream.status).toBe(422)
        expect(downstream.headers.get('content-type')).toContain('application/json')
        expect(downstreamJson).toEqual(upstreamBody)
    })

    it('forwards x-request-id when present', async () => {
        const upstream = new Response(JSON.stringify({ ok: false }), {
            status: 404,
            headers: {
                'content-type': 'application/json',
                'x-request-id': 'req_12345',
            },
        })

        const downstream = await toJsonResponse(upstream)

        expect(downstream.status).toBe(404)
        expect(downstream.headers.get('x-request-id')).toBe('req_12345')
    })
})
