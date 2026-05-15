import Stripe from 'stripe'

type LinkedCardResolution = {
    ok: boolean
    brand: string
    last4: string
    expMonth: number
    expYear: number
    bin?: string | null
    processorTokenRef?: string
    error?: string
}

type FundingIntentInput = {
    amount: number
    currency: 'USD' | 'USDC'
    processorTokenRef: string
    accountId: string
    idempotencyKey?: string
}

type FundingIntentResult = {
    status: 'requires_action' | 'authorized' | 'captured' | 'failed'
    processorReference: string | null
    challengeClientSecret?: string
    feeAmount: number
}

const STRIPE_VERSION = '2026-04-22.dahlia'

function getStripeClient() {
    const secret = process.env.STRIPE_SECRET_KEY
    if (!secret) return null
    return new Stripe(secret, { apiVersion: STRIPE_VERSION })
}

function toStripeCurrency(currency: 'USD' | 'USDC') {
    return currency.toLowerCase()
}

function isStripePaymentMethodToken(token: string) {
    return token.startsWith('pm_')
}

function calcFeeAmount(amount: number) {
    return amount * 0.029 + 0.3
}

export async function stripeResolveLinkedCard(processorSetupToken: string): Promise<LinkedCardResolution> {
    const stripe = getStripeClient()
    if (!stripe) {
        return {
            ok: true,
            brand: 'visa',
            last4: String(Math.floor(Math.random() * 9000) + 1000),
            expMonth: 12,
            expYear: new Date().getFullYear() + 3,
            processorTokenRef: processorSetupToken,
        }
    }

    try {
        if (isStripePaymentMethodToken(processorSetupToken)) {
            const paymentMethod = await stripe.paymentMethods.retrieve(processorSetupToken, {
                expand: ['card'],
            })

            if (paymentMethod.type !== 'card' || !paymentMethod.card || typeof paymentMethod.card === 'string') {
                return {
                    ok: false,
                    brand: 'unknown',
                    last4: '0000',
                    expMonth: 1,
                    expYear: new Date().getFullYear(),
                    error: 'Payment method token must resolve to a card.',
                }
            }

            return {
                ok: true,
                brand: paymentMethod.card.brand,
                last4: paymentMethod.card.last4,
                expMonth: paymentMethod.card.exp_month,
                expYear: paymentMethod.card.exp_year,
                bin: null,
                processorTokenRef: paymentMethod.id,
            }
        }

        const setupIntent = await stripe.setupIntents.retrieve(processorSetupToken, {
            expand: ['payment_method'],
        })

        if (!setupIntent || !setupIntent.payment_method || typeof setupIntent.payment_method === 'string') {
            return {
                ok: false,
                brand: 'unknown',
                last4: '0000',
                expMonth: 1,
                expYear: new Date().getFullYear(),
                error: 'Setup token did not contain a reusable payment method.',
            }
        }

        const pm = setupIntent.payment_method
        if (pm.type !== 'card' || !pm.card) {
            return {
                ok: false,
                brand: 'unknown',
                last4: '0000',
                expMonth: 1,
                expYear: new Date().getFullYear(),
                error: 'Setup token must resolve to a card payment method.',
            }
        }

        return {
            ok: true,
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
            bin: null,
            processorTokenRef: pm.id,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to resolve setup token'
        const errorMessage = message.includes('No such setupintent')
            ? 'Stripe SetupIntent not found. Verify the frontend publishable key and backend secret key belong to the same Stripe account and mode.'
            : message

        return {
            ok: false,
            brand: 'unknown',
            last4: '0000',
            expMonth: 1,
            expYear: new Date().getFullYear(),
            error: errorMessage,
        }
    }
}

type PayoutAccountResult = {
    connectedAccountId: string
    externalAccountId: string
}

type PayoutIntentInput = {
    amount: number
    currency: 'USD' | 'USDC'
    processorTokenRef: string
    connectedAccountId?: string | null
    externalAccountId?: string | null
    payoutId: string
    accountId: string
    idempotencyKey?: string
}

type PayoutIntentResult = {
    status: 'pending_network' | 'failed'
    processorReference: string | null
    feeAmount: number
}

// Creates a Stripe Custom connected account for a user and registers their debit card
// as an external account on it. Called automatically during card linking when
// CARD_ISSUING_PROVIDER=stripe and the frontend provides a cardToken (tok_xxx).
//
// cardToken must be produced by stripe.createToken(cardElement) on the frontend
// in the same session as the SetupIntent confirmation — it tokenizes the raw card
// data in a form Stripe accepts for external account registration.
//
// tosIp should be the user's IP address from the linking request; Stripe requires
// it to record acceptance of the Recipient Agreement on the user's behalf.
export async function stripeProvisionPayoutAccount(
    accountId: string,
    cardToken: string,
    tosIp?: string
): Promise<PayoutAccountResult | null> {
    const stripe = getStripeClient()
    if (!stripe) return null

    try {
        const account = await stripe.accounts.create({
            type: 'custom',
            country: 'US',
            capabilities: {
                transfers: { requested: true },
            },
            // 'recipient' service agreement covers individuals receiving payouts
            // without requiring full business verification for standard payout amounts.
            tos_acceptance: {
                service_agreement: 'recipient',
                date: Math.floor(Date.now() / 1000),
                ...(tosIp ? { ip: tosIp } : {}),
            },
            metadata: { genesisAccountId: accountId },
        })

        const externalAccount = await stripe.accounts.createExternalAccount(account.id, {
            external_account: cardToken,
            default_for_currency: true,
        })

        return { connectedAccountId: account.id, externalAccountId: externalAccount.id }
    } catch {
        return null
    }
}

// Push-to-card requires one of two Stripe setups:
//
// A) Stripe Connect (recommended for instant card payouts):
//    - Each user has a connected account with their debit card as an external account.
//    - Set `connectedAccountId` on the LinkedDebitCard record when the card is linked.
//    - Funds are transferred to the connected account, then paid out via instant payout.
//    - External account registration happens during card linking (not handled here).
//
// B) Stripe Treasury (for ACH / bank-based payouts):
//    - Set STRIPE_FINANCIAL_ACCOUNT_ID to a Treasury FinancialAccount on the platform.
//    - `destination_payment_method` must be a `us_bank_account` PM — NOT a card pm_xxx.
//    - This path does NOT support instant card payouts.
//
// If neither is configured, a mock reference is returned and the payout stays in
// pending_network until manually reconciled or the processor is configured.
export async function stripeCreatePushToCardPayout(input: PayoutIntentInput): Promise<PayoutIntentResult> {
    const feeAmount = input.amount * 0.01 + 0.25
    const stripe = getStripeClient()

    if (!stripe) {
        return {
            status: 'pending_network',
            processorReference: `stripe_mock_payout_${Date.now().toString(36)}`,
            feeAmount,
        }
    }

    const amountMinor = Math.round(input.amount * 100)
    if (amountMinor <= 0) {
        return { status: 'failed', processorReference: null, feeAmount }
    }

    const financialAccountId = process.env.STRIPE_FINANCIAL_ACCOUNT_ID

    if (financialAccountId) {
        try {
            const transfer = await stripe.treasury.outboundTransfers.create(
                {
                    financial_account: financialAccountId,
                    amount: amountMinor,
                    currency: toStripeCurrency(input.currency),
                    destination_payment_method: input.processorTokenRef,
                    description: `Genesis Reserve payout ${input.payoutId}`,
                    metadata: { payoutId: input.payoutId, accountId: input.accountId },
                },
                input.idempotencyKey ? { idempotencyKey: `${input.idempotencyKey}_otr` } : undefined
            )
            return { status: 'pending_network', processorReference: transfer.id, feeAmount }
        } catch {
            return { status: 'failed', processorReference: null, feeAmount }
        }
    }

    if (input.connectedAccountId) {
        try {
            const transfer = await stripe.transfers.create(
                {
                    amount: amountMinor,
                    currency: toStripeCurrency(input.currency),
                    destination: input.connectedAccountId,
                    metadata: { payoutId: input.payoutId, accountId: input.accountId },
                },
                input.idempotencyKey ? { idempotencyKey: `${input.idempotencyKey}_tr` } : undefined
            )

            const payout = await stripe.payouts.create(
                {
                    amount: amountMinor,
                    currency: toStripeCurrency(input.currency),
                    method: 'instant',
                    // Target the specific registered card. When externalAccountId is absent,
                    // Stripe uses the connected account's default external account.
                    ...(input.externalAccountId ? { destination: input.externalAccountId } : {}),
                    metadata: { payoutId: input.payoutId, transferId: transfer.id },
                },
                {
                    stripeAccount: input.connectedAccountId,
                    ...(input.idempotencyKey ? { idempotencyKey: `${input.idempotencyKey}_po` } : {}),
                }
            )

            return { status: 'pending_network', processorReference: payout.id, feeAmount }
        } catch {
            return { status: 'failed', processorReference: null, feeAmount }
        }
    }

    // No payout path configured — return a mock reference so the record is created
    // and can be reconciled manually or once Connect / Treasury is set up.
    return {
        status: 'pending_network',
        processorReference: `stripe_mock_payout_${Date.now().toString(36)}`,
        feeAmount,
    }
}

export async function stripeCreateFundingIntent(input: FundingIntentInput): Promise<FundingIntentResult> {
    const feeAmount = calcFeeAmount(input.amount)
    const stripe = getStripeClient()

    if (!stripe) {
        return {
            status: 'captured',
            processorReference: `stripe_mock_${Date.now().toString(36)}`,
            feeAmount,
        }
    }

    const amountMinor = Math.round(input.amount * 100)
    if (amountMinor <= 0) {
        return {
            status: 'failed',
            processorReference: null,
            feeAmount,
        }
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: amountMinor,
                currency: toStripeCurrency(input.currency),
                payment_method: input.processorTokenRef,
                off_session: true,
                confirm: true,
                metadata: {
                    accountId: input.accountId,
                },
            },
            input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
        )

        if (paymentIntent.status === 'requires_action') {
            return {
                status: 'requires_action',
                processorReference: paymentIntent.id,
                challengeClientSecret: paymentIntent.client_secret || undefined,
                feeAmount,
            }
        }

        if (paymentIntent.status === 'succeeded') {
            return {
                status: 'captured',
                processorReference: paymentIntent.id,
                feeAmount,
            }
        }

        if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') {
            return {
                status: 'authorized',
                processorReference: paymentIntent.id,
                feeAmount,
            }
        }

        return {
            status: 'failed',
            processorReference: paymentIntent.id,
            feeAmount,
        }
    } catch {
        return {
            status: 'failed',
            processorReference: null,
            feeAmount,
        }
    }
}
