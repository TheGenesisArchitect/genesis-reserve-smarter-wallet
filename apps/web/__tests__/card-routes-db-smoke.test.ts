import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'
import { __resetCardServiceForTests } from '../src/app/api/gr/_lib/card-service'

import { POST as postCardholder } from '../src/app/api/gr/cardholders/route'
import { GET as getCardholder } from '../src/app/api/gr/cardholders/[cardholderId]/route'
import { POST as postCard } from '../src/app/api/gr/cards/route'
import { GET as getCard } from '../src/app/api/gr/cards/[cardId]/route'
import { POST as postLinkedCard, GET as listLinkedCards } from '../src/app/api/gr/linked-debit-cards/route'
import { POST as postAddMoney } from '../src/app/api/gr/funding/add-money/route'
import { GET as getFunding } from '../src/app/api/gr/funding/[fundingId]/route'
import { POST as postPayout } from '../src/app/api/gr/payouts/push-to-card/route'
import { GET as getPayout } from '../src/app/api/gr/payouts/[payoutId]/route'
import { POST as postCardProcessorWebhook } from '../src/app/api/gr/webhooks/card-processor/route'

function unique(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function jsonRequest(url: string, body: unknown, idempotencyKey?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey
    return new NextRequest(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
}

describe('Card Routes DB smoke', () => {
    it('handles route-level create and read flows on Postgres', async () => {
        __resetCardServiceForTests()

        const accountId = unique('acct_route_db')

        const cardholderRes = await postCardholder(
            jsonRequest(
                'http://localhost/api/gr/cardholders',
                {
                    accountId,
                    legalName: 'Route Smoke User',
                    email: 'route-smoke@example.com',
                    billingAddress: {
                        line1: '2 Route St',
                        city: 'Austin',
                        state: 'TX',
                        postalCode: '73301',
                        country: 'US',
                    },
                },
                unique('idem_cardholder')
            )
        )
        expect(cardholderRes.status).toBe(201)
        const cardholderBody = await cardholderRes.json()
        const cardholderId = cardholderBody.data.id as string

        const cardholderGetRes = await getCardholder(new NextRequest('http://localhost/api/gr/cardholders/x'), {
            params: Promise.resolve({ cardholderId }),
        })
        expect(cardholderGetRes.status).toBe(200)

        const cardRes = await postCard(
            jsonRequest(
                'http://localhost/api/gr/cards',
                {
                    accountId,
                    cardholderId,
                    type: 'virtual',
                    brand: 'visa',
                },
                unique('idem_card')
            )
        )
        expect(cardRes.status).toBe(201)
        const cardBody = await cardRes.json()
        const cardId = cardBody.data.id as string

        const cardGetRes = await getCard(new NextRequest('http://localhost/api/gr/cards/x'), {
            params: Promise.resolve({ cardId }),
        })
        expect(cardGetRes.status).toBe(200)

        const linkedRes = await postLinkedCard(
            jsonRequest(
                'http://localhost/api/gr/linked-debit-cards',
                {
                    accountId,
                    cardholderName: 'Route Smoke User',
                    processorSetupToken: unique('seti_route'),
                },
                unique('idem_linked')
            )
        )
        expect(linkedRes.status).toBe(201)
        const linkedBody = await linkedRes.json()
        const linkedCardId = linkedBody.data.id as string

        const linkedListRes = await listLinkedCards(
            new NextRequest(`http://localhost/api/gr/linked-debit-cards?accountId=${encodeURIComponent(accountId)}`)
        )
        expect(linkedListRes.status).toBe(200)
        const linkedListBody = await linkedListRes.json()
        expect((linkedListBody.data as Array<any>).some((x) => x.id === linkedCardId)).toBe(true)

        const fundingRes = await postAddMoney(
            jsonRequest(
                'http://localhost/api/gr/funding/add-money',
                {
                    accountId,
                    linkedCardId,
                    amount: { amount: '21.00', currency: 'USD' },
                },
                unique('idem_funding_route')
            )
        )
        expect(fundingRes.status).toBe(202)
        const fundingBody = await fundingRes.json()
        const fundingId = fundingBody.data.id as string

        const fundingGetRes = await getFunding(new NextRequest('http://localhost/api/gr/funding/x'), {
            params: Promise.resolve({ fundingId }),
        })
        expect(fundingGetRes.status).toBe(200)

        const payoutRes = await postPayout(
            jsonRequest(
                'http://localhost/api/gr/payouts/push-to-card',
                {
                    accountId,
                    linkedCardId,
                    amount: { amount: '11.00', currency: 'USD' },
                },
                unique('idem_payout_route')
            )
        )
        expect(payoutRes.status).toBe(202)
        const payoutBody = await payoutRes.json()
        const payoutId = payoutBody.data.id as string

        const payoutGetRes = await getPayout(new NextRequest('http://localhost/api/gr/payouts/x'), {
            params: Promise.resolve({ payoutId }),
        })
        expect(payoutGetRes.status).toBe(200)
    })

    it('accepts signed raw webhook payload and reconciles funding status', async () => {
        __resetCardServiceForTests()

        const previousSecret = process.env.STRIPE_WEBHOOK_SECRET
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_db_route_smoke'

        try {
            const accountId = unique('acct_webhook_route_db')

            const linkedRes = await postLinkedCard(
                jsonRequest(
                    'http://localhost/api/gr/linked-debit-cards',
                    {
                        accountId,
                        cardholderName: 'Webhook Route Smoke User',
                        processorSetupToken: unique('seti_webhook_route'),
                    },
                    unique('idem_linked_webhook')
                )
            )
            expect(linkedRes.status).toBe(201)
            const linkedBody = await linkedRes.json()
            const linkedCardId = linkedBody.data.id as string

            const fundingRes = await postAddMoney(
                jsonRequest(
                    'http://localhost/api/gr/funding/add-money',
                    {
                        accountId,
                        linkedCardId,
                        amount: { amount: '29.00', currency: 'USD' },
                    },
                    unique('idem_funding_webhook_route')
                )
            )
            expect(fundingRes.status).toBe(202)
            const fundingBody = await fundingRes.json()
            const fundingId = fundingBody.data.id as string

            const payload = JSON.stringify({
                id: unique('evt_funding_settled'),
                type: 'funding.settled',
                fundingId,
                createdAt: new Date().toISOString(),
                data: { processorReference: unique('pi_route_reconciled') },
            })

            const timestamp = Math.floor(Date.now() / 1000)
            const digest = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
                .update(`${timestamp}.${payload}`)
                .digest('hex')
            const signature = `t=${timestamp},v1=${digest}`

            const webhookRes = await postCardProcessorWebhook(
                new NextRequest('http://localhost/api/gr/webhooks/card-processor', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-webhook-signature': signature,
                    },
                    body: payload,
                })
            )
            expect(webhookRes.status).toBe(200)

            const fundingGetRes = await getFunding(new NextRequest('http://localhost/api/gr/funding/x'), {
                params: Promise.resolve({ fundingId }),
            })
            expect(fundingGetRes.status).toBe(200)
            const updatedFundingBody = await fundingGetRes.json()
            expect(updatedFundingBody.data.status).toBe('settled')
            expect(updatedFundingBody.data.processorReference).toBeTruthy()
        } finally {
            process.env.STRIPE_WEBHOOK_SECRET = previousSecret
        }
    })

    it('rejects invalid webhook signature with 400 and does not reconcile funding', async () => {
        __resetCardServiceForTests()

        const previousSecret = process.env.STRIPE_WEBHOOK_SECRET
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_db_route_smoke'

        try {
            const accountId = unique('acct_webhook_route_db_bad')

            const linkedRes = await postLinkedCard(
                jsonRequest(
                    'http://localhost/api/gr/linked-debit-cards',
                    {
                        accountId,
                        cardholderName: 'Webhook Route Smoke User Bad Sig',
                        processorSetupToken: unique('seti_webhook_route_bad'),
                    },
                    unique('idem_linked_webhook_bad')
                )
            )
            expect(linkedRes.status).toBe(201)
            const linkedBody = await linkedRes.json()
            const linkedCardId = linkedBody.data.id as string

            const fundingRes = await postAddMoney(
                jsonRequest(
                    'http://localhost/api/gr/funding/add-money',
                    {
                        accountId,
                        linkedCardId,
                        amount: { amount: '31.00', currency: 'USD' },
                    },
                    unique('idem_funding_webhook_route_bad')
                )
            )
            expect(fundingRes.status).toBe(202)
            const fundingBody = await fundingRes.json()
            const fundingId = fundingBody.data.id as string

            const payload = JSON.stringify({
                id: unique('evt_funding_settled_bad'),
                type: 'funding.settled',
                fundingId,
                createdAt: new Date().toISOString(),
                data: { processorReference: unique('pi_route_reconciled_bad') },
            })

            const webhookRes = await postCardProcessorWebhook(
                new NextRequest('http://localhost/api/gr/webhooks/card-processor', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-webhook-signature': 't=0,v1=deadbeef',
                    },
                    body: payload,
                })
            )

            expect(webhookRes.status).toBe(400)
            const webhookBody = await webhookRes.json()
            expect(webhookBody.error.code).toBe('invalid_request')

            const fundingGetRes = await getFunding(new NextRequest('http://localhost/api/gr/funding/x'), {
                params: Promise.resolve({ fundingId }),
            })
            expect(fundingGetRes.status).toBe(200)
            const updatedFundingBody = await fundingGetRes.json()
            expect(updatedFundingBody.data.status).not.toBe('settled')
        } finally {
            process.env.STRIPE_WEBHOOK_SECRET = previousSecret
        }
    })
})
