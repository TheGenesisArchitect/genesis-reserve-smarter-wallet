import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    getById,
    getByBurnTxHash,
    create,
    update,
    recordVaultDeposit,
} = vi.hoisted(() => ({
    getById: vi.fn(),
    getByBurnTxHash: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    recordVaultDeposit: vi.fn(),
}))

vi.mock('../src/app/api/gr/_lib/cctp-db', () => ({
    cctpTransferStore: {
        getById,
        getByBurnTxHash,
        create,
        update,
    },
}))

vi.mock('../src/services/cctp-orchestrator', () => ({
    executeCCTPOnRamp: vi.fn(),
    recordVaultDeposit,
}))

import { PATCH } from '../src/app/api/cctp/transfer/route'

function patchRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/cctp/transfer', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

describe('CCTP transfer route PATCH', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('records vault deposit when transfer is minted', async () => {
        getById
            .mockResolvedValueOnce({
                transferId: '550e8400-e29b-41d4-a716-446655440000',
                status: 'minted',
                vaultTxHash: null,
            })
            .mockResolvedValueOnce({
                transferId: '550e8400-e29b-41d4-a716-446655440000',
                status: 'vault_deposited',
                vaultTxHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            })

        const res = await PATCH(
            patchRequest({
                transferId: '550e8400-e29b-41d4-a716-446655440000',
                vaultTxHash: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            })
        )

        expect(res.status).toBe(200)
        expect(recordVaultDeposit).toHaveBeenCalledTimes(1)
        expect(recordVaultDeposit).toHaveBeenCalledWith(
            '550e8400-e29b-41d4-a716-446655440000',
            '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )

        const json = await res.json()
        expect(json.data.status).toBe('vault_deposited')
    })

    it('is idempotent when already vault_deposited with same vaultTxHash', async () => {
        getById.mockResolvedValueOnce({
            transferId: '550e8400-e29b-41d4-a716-446655440001',
            status: 'vault_deposited',
            vaultTxHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        })

        const res = await PATCH(
            patchRequest({
                transferId: '550e8400-e29b-41d4-a716-446655440001',
                vaultTxHash: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            })
        )

        expect(res.status).toBe(200)
        expect(recordVaultDeposit).not.toHaveBeenCalled()

        const json = await res.json()
        expect(json.data.status).toBe('vault_deposited')
    })

    it('returns conflict when already vault_deposited with different vaultTxHash', async () => {
        getById.mockResolvedValueOnce({
            transferId: '550e8400-e29b-41d4-a716-446655440002',
            status: 'vault_deposited',
            vaultTxHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        })

        const res = await PATCH(
            patchRequest({
                transferId: '550e8400-e29b-41d4-a716-446655440002',
                vaultTxHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
            })
        )

        expect(res.status).toBe(409)
        expect(recordVaultDeposit).not.toHaveBeenCalled()

        const json = await res.json()
        expect(json.error.code).toBe('conflict')
    })
})
