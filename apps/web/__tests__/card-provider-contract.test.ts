import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetCardServiceForTests, createCard, createCardholder } from '../src/app/api/gr/_lib/card-service'

type ProviderMode = 'mock' | 'stripe'

const originalProvider = process.env.CARD_ISSUING_PROVIDER

function baseCardholderInput() {
    return {
        accountId: 'acct_contract_1',
        legalName: 'Genesis Contract User',
        billingAddress: {
            line1: '1 Genesis Way',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
        },
    }
}

describe.each<ProviderMode>(['mock', 'stripe'])('Card Issuance Provider Contract (%s)', (provider) => {
    beforeEach(() => {
        process.env.CARD_ISSUING_PROVIDER = provider
        __resetCardServiceForTests()
    })

    afterEach(() => {
        process.env.CARD_ISSUING_PROVIDER = originalProvider
    })

    it('issues a virtual card as active with contract-required fields', async () => {
        const cardholderResult = await createCardholder(baseCardholderInput())
        expect(cardholderResult.status).toBe(201)

        const cardholderId = (cardholderResult.body as any).data.id
        const result = await createCard({
            accountId: 'acct_contract_1',
            cardholderId,
            type: 'virtual',
            brand: 'visa',
        })

        expect(result.status).toBe(201)
        const card = (result.body as any).data

        expect(card.id).toBeTruthy()
        expect(card.accountId).toBe('acct_contract_1')
        expect(card.cardholderId).toBe(cardholderId)
        expect(card.type).toBe('virtual')
        expect(card.brand).toBe('visa')
        expect(card.status).toBe('active')
        expect(card.last4).toHaveLength(4)
        expect(typeof card.expiryMonth).toBe('number')
        expect(typeof card.expiryYear).toBe('number')
        expect(card.controls).toBeTruthy()
        expect(typeof card.controls.online).toBe('boolean')
        expect(typeof card.controls.atm).toBe('boolean')
        expect(typeof card.controls.international).toBe('boolean')
        expect(card.createdAt).toBeTruthy()
    })

    it('issues a physical card as pending_fulfillment with contract-required fields', async () => {
        const cardholderResult = await createCardholder(baseCardholderInput())
        expect(cardholderResult.status).toBe(201)

        const cardholderId = (cardholderResult.body as any).data.id
        const result = await createCard({
            accountId: 'acct_contract_1',
            cardholderId,
            type: 'physical',
            brand: 'mastercard',
        })

        expect(result.status).toBe(201)
        const card = (result.body as any).data

        expect(card.id).toBeTruthy()
        expect(card.accountId).toBe('acct_contract_1')
        expect(card.cardholderId).toBe(cardholderId)
        expect(card.type).toBe('physical')
        expect(card.brand).toBe('mastercard')
        expect(card.status).toBe('pending_fulfillment')
        expect(card.last4).toHaveLength(4)
        expect(card.controls).toBeTruthy()
        expect(card.controls.international).toBe(true)
        expect(card.createdAt).toBeTruthy()
    })

    it('returns 404 for unknown cardholder across provider modes', async () => {
        const result = await createCard({
            accountId: 'acct_contract_1',
            cardholderId: 'ch_missing',
            type: 'virtual',
            brand: 'visa',
        })

        expect(result.status).toBe(404)
        const payload = result.body as any
        expect(payload.error.code).toBe('not_found')
    })
})
