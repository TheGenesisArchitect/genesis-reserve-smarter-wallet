import { beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'crypto'
import {
    __resetCardServiceForTests,
    createAddMoney,
    createPushToCardPayout,
    ensureNotRateLimited,
    getFundingStatus,
    handleProcessorWebhook,
    getPayout,
    linkDebitCard,
    listLinkedDebitCards,
    quotePushToCard,
    withIdempotency,
} from '../src/app/api/gr/_lib/card-service'

beforeEach(() => {
    __resetCardServiceForTests()
})

describe('Card Service API - Debit, Funding, Payout', () => {
    it('enforces idempotency-key on mutation wrapper', async () => {
        const request = new Request('http://localhost/api/gr/linked-debit-cards', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accountId: 'acct_1' }),
        })

        const response = await withIdempotency(request, 'test.mutation', async () => ({
            status: 201,
            body: { ok: true },
        }))

        expect(response.status).toBe(400)
        const json = await response.json()
        expect(json.error.code).toBe('invalid_request')
        expect(response.headers.get('X-RateLimit-Limit')).toBe('120')
    })

    it('replays same response for same idempotency key', async () => {
        let counter = 0
        const makeRequest = () =>
            new Request('http://localhost/api/gr/linked-debit-cards', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'idempotency-key': 'idem_same_123',
                },
                body: JSON.stringify({ accountId: 'acct_1' }),
            })

        const first = await withIdempotency(makeRequest(), 'test.idempotent', async () => {
            counter += 1
            return { status: 201, body: { token: `run_${counter}` } }
        })
        const firstJson = await first.json()

        const second = await withIdempotency(makeRequest(), 'test.idempotent', async () => {
            counter += 1
            return { status: 201, body: { token: `run_${counter}` } }
        })
        const secondJson = await second.json()

        expect(counter).toBe(1)
        expect(firstJson).toEqual(secondJson)
    })

    it('links debit card and supports list by account', async () => {
        const created = await linkDebitCard({
            accountId: 'acct_wallet_1',
            cardholderName: 'Genesis User',
            processorSetupToken: 'seti_mock_123',
        })

        expect(created.status).toBe(201)
        const card = (created.body as any).data
        expect(card.accountId).toBe('acct_wallet_1')
        expect(card.status).toBe('verified')

        const listed = await listLinkedDebitCards(new URLSearchParams({ accountId: 'acct_wallet_1' }))
        expect(listed.status).toBe(200)
        const rows = (listed.body as any).data
        expect(rows.length).toBe(1)
        expect(rows[0].id).toBe(card.id)
    })

    it('creates add-money transaction and retrieves status', async () => {
        const linked = await linkDebitCard({
            accountId: 'acct_wallet_1',
            cardholderName: 'Genesis User',
            processorSetupToken: 'seti_mock_456',
        })
        const linkedCardId = (linked.body as any).data.id

        const funding = await createAddMoney({
            accountId: 'acct_wallet_1',
            linkedCardId,
            amount: { amount: '25.00', currency: 'USD' },
        })

        expect(funding.status).toBe(202)
        const fundingData = (funding.body as any).data
        expect(fundingData.linkedCardId).toBe(linkedCardId)

        const fetched = await getFundingStatus(fundingData.id)
        expect(fetched.status).toBe(200)
        expect((fetched.body as any).data.id).toBe(fundingData.id)
    })

    it('blocks add-money when linked card is not funding eligible', async () => {
        const linked = await linkDebitCard({
            accountId: 'acct_wallet_1',
            cardholderName: 'Genesis User',
            processorSetupToken: 'seti_mock_654',
        })
        const linkedCardId = (linked.body as any).data.id

        const store = (globalThis as any).__grCardServiceStore
        const item = store.linkedDebitCards.get(linkedCardId)
        store.linkedDebitCards.set(linkedCardId, { ...item, fundingEligible: false })

        const funding = await createAddMoney({
            accountId: 'acct_wallet_1',
            linkedCardId,
            amount: { amount: '25.00', currency: 'USD' },
        })

        expect(funding.status).toBe(403)
        expect((funding.body as any).error.code).toBe('compliance_block')
    })

    it('validates webhook signature and reconciles funding status', async () => {
        const previousSecret = process.env.STRIPE_WEBHOOK_SECRET
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_key'
        try {
            const linked = await linkDebitCard({
                accountId: 'acct_wallet_3',
                cardholderName: 'Genesis User',
                processorSetupToken: 'seti_mock_901',
            })
            const linkedCardId = (linked.body as any).data.id

            const funding = await createAddMoney({
                accountId: 'acct_wallet_3',
                linkedCardId,
                amount: { amount: '35.00', currency: 'USD' },
            })
            const fundingId = (funding.body as any).data.id

            const payload = JSON.stringify({
                id: 'evt_funding_settled_1',
                type: 'funding.settled',
                fundingId,
                createdAt: new Date().toISOString(),
                data: { processorReference: 'pi_reconciled_1' },
            })

            const ts = Math.floor(Date.now() / 1000)
            const digest = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${ts}.${payload}`).digest('hex')
            const signature = `t=${ts},v1=${digest}`

            const webhookOk = await handleProcessorWebhook(signature, payload, JSON.parse(payload))
            expect(webhookOk.status).toBe(200)

            const updated = await getFundingStatus(fundingId)
            expect((updated.body as any).data.status).toBe('settled')
            expect((updated.body as any).data.processorReference).toBe('pi_reconciled_1')

            const webhookBad = await handleProcessorWebhook('t=0,v1=bad', payload, JSON.parse(payload))
            expect(webhookBad.status).toBe(400)
            expect((webhookBad.body as any).error.code).toBe('invalid_request')
        } finally {
            process.env.STRIPE_WEBHOOK_SECRET = previousSecret
        }
    })

    it('quotes and creates push-to-card payout', async () => {
        const linked = await linkDebitCard({
            accountId: 'acct_wallet_2',
            cardholderName: 'Genesis User',
            processorSetupToken: 'seti_mock_789',
        })
        const linkedCardId = (linked.body as any).data.id

        const quote = await quotePushToCard({
            accountId: 'acct_wallet_2',
            linkedCardId,
            amount: { amount: '15.00', currency: 'USD' },
        })
        expect(quote.status).toBe(200)
        expect((quote.body as any).data.quoteId).toBeTruthy()

        const payout = await createPushToCardPayout({
            accountId: 'acct_wallet_2',
            linkedCardId,
            amount: { amount: '15.00', currency: 'USD' },
        })
        expect(payout.status).toBe(202)

        const payoutId = (payout.body as any).data.id
        const fetched = await getPayout(payoutId)
        expect(fetched.status).toBe(200)
        expect((fetched.body as any).data.id).toBe(payoutId)
    })

    it('reconciles payouts via processor webhook events', async () => {
        const previousSecret = process.env.STRIPE_WEBHOOK_SECRET
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_key'

        try {
            const linked = await linkDebitCard({
                accountId: 'acct_wallet_5',
                cardholderName: 'Genesis User',
                processorSetupToken: 'seti_mock_321',
            })
            const linkedCardId = (linked.body as any).data.id

            const payout = await createPushToCardPayout({
                accountId: 'acct_wallet_5',
                linkedCardId,
                amount: { amount: '20.00', currency: 'USD' },
            })
            const payoutId = (payout.body as any).data.id

            const payload = JSON.stringify({
                id: 'evt_payout_paid_1',
                type: 'payout.paid',
                payoutId,
                createdAt: new Date().toISOString(),
                data: { processorReference: 'payout_ref_123' },
            })

            const ts = Math.floor(Date.now() / 1000)
            const digest = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${ts}.${payload}`).digest('hex')
            const signature = `t=${ts},v1=${digest}`

            const webhookOk = await handleProcessorWebhook(signature, payload, JSON.parse(payload))
            expect(webhookOk.status).toBe(200)

            const updated = await getPayout(payoutId)
            expect(updated.status).toBe(200)
            expect((updated.body as any).data.status).toBe('paid')
            expect((updated.body as any).data.processorReference).toBe('payout_ref_123')
        } finally {
            process.env.STRIPE_WEBHOOK_SECRET = previousSecret
        }
    })

    it('returns 429 after rate window exceeded', () => {
        const request = new Request('http://localhost/api/gr/cards', {
            headers: { 'x-forwarded-for': '203.0.113.10' },
        })

        let limitedResponse: Response | null = null
        for (let i = 0; i < 121; i += 1) {
            limitedResponse = ensureNotRateLimited(request, 'gr:rate-test')
        }

        expect(limitedResponse).toBeTruthy()
        expect(limitedResponse!.status).toBe(429)
    })
})
