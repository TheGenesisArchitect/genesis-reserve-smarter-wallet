import { describe, expect, it } from 'vitest'
import {
    __resetCardServiceForTests,
    createAddMoney,
    createCard,
    createCardholder,
    createPushToCardPayout,
    getCard,
    getCardholder,
    getFundingStatus,
    getPayout,
    linkDebitCard,
    listLinkedDebitCards,
} from '../src/app/api/gr/_lib/card-service'
import {
    dbEnabled,
    dbGetCard,
    dbGetCardholder,
    dbGetFunding,
    dbGetLinkedDebitCard,
    dbGetPayout,
} from '../src/app/api/gr/_lib/card-db'

function unique(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

describe('Card Service DB smoke', () => {
    it('persists and reads card data through Postgres', async () => {
        __resetCardServiceForTests()
        expect(dbEnabled()).toBe(true)

        const accountId = unique('acct_db')

        const cardholderRes = await createCardholder({
            accountId,
            legalName: 'DB Smoke User',
            email: 'db-smoke@example.com',
            billingAddress: {
                line1: '1 Smoke St',
                city: 'Phoenix',
                state: 'AZ',
                postalCode: '85001',
                country: 'US',
            },
        })
        expect(cardholderRes.status).toBe(201)

        const cardholderId = (cardholderRes.body as any).data.id as string
        expect((await dbGetCardholder(cardholderId))?.id).toBe(cardholderId)

        const cardholderGet = await getCardholder(cardholderId)
        expect(cardholderGet.status).toBe(200)

        const cardRes = await createCard({
            accountId,
            cardholderId,
            type: 'virtual',
            brand: 'visa',
        })
        expect(cardRes.status).toBe(201)

        const cardId = (cardRes.body as any).data.id as string
        expect((await dbGetCard(cardId))?.id).toBe(cardId)

        const cardGet = await getCard(cardId)
        expect(cardGet.status).toBe(200)

        const linkedRes = await linkDebitCard({
            accountId,
            cardholderName: 'DB Smoke User',
            processorSetupToken: unique('seti_mock'),
        })
        expect(linkedRes.status).toBe(201)

        const linkedCardId = (linkedRes.body as any).data.id as string
        expect((await dbGetLinkedDebitCard(linkedCardId))?.id).toBe(linkedCardId)

        const listed = await listLinkedDebitCards(new URLSearchParams({ accountId }))
        expect(listed.status).toBe(200)
        expect(((listed.body as any).data as Array<any>).some((x) => x.id === linkedCardId)).toBe(true)

        const fundingRes = await createAddMoney(
            {
                accountId,
                linkedCardId,
                amount: { amount: '25.00', currency: 'USD' },
            },
            unique('idem_funding')
        )
        expect(fundingRes.status).toBe(202)

        const fundingId = (fundingRes.body as any).data.id as string
        expect((await dbGetFunding(fundingId))?.id).toBe(fundingId)

        const fundingGet = await getFundingStatus(fundingId)
        expect(fundingGet.status).toBe(200)

        const payoutRes = await createPushToCardPayout({
            accountId,
            linkedCardId,
            amount: { amount: '10.00', currency: 'USD' },
        })
        expect(payoutRes.status).toBe(202)

        const payoutId = (payoutRes.body as any).data.id as string
        expect((await dbGetPayout(payoutId))?.id).toBe(payoutId)

        const payoutGet = await getPayout(payoutId)
        expect(payoutGet.status).toBe(200)
    })
})
