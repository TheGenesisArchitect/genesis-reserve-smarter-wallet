// circle-adapter.ts — Circle Payments API for non-custodial USDC on-ramp.
//
// Non-custodial flow: user's Circle-tokenized card → POST /v1/payments →
// USDC minted natively on Arbitrum to user's Privy wallet via CCTP.
// Genesis never holds USDC — no platform wallet or pre-funded reserve required.
//
// Card tokenization: The user's debit card must be registered with Circle's card
// SDK (distinct from Stripe's SetupIntent). The frontend calls Circle's card SDK
// to obtain a circleCardId, which is stored on LinkedDebitCard alongside the
// Stripe processorTokenRef used for push-to-card payouts. Both are captured
// during the card-link flow and serve different purposes:
//   processorTokenRef / connectedAccountId — Stripe, for paying OUT to the card
//   circleCardId                           — Circle, for charging the card to buy USDC
//
// Required env vars:
//   CIRCLE_API_KEY  — Circle API key (console.circle.com → API Keys)
//
// Without CIRCLE_API_KEY, a mock payment reference is returned so development
// and tests work without live Circle credentials.

const CIRCLE_API_BASE = 'https://api.circle.com/v1'
const CIRCLE_ARB_CHAIN = 'ARB'

type CirclePaymentInput = {
    circleCardId: string       // Circle card token obtained via Circle's card SDK
    destinationAddress: string // user's Arbitrum wallet address (Privy)
    amountUsd: number          // gross USD to charge; Circle delivers USDC 1:1 on Arbitrum
    fundingId: string          // Genesis funding ID embedded in metadata for reconciliation
    accountId: string
    idempotencyKey?: string
}

export type CirclePaymentResult = {
    status: 'pending' | 'failed'
    paymentId: string | null
    transactionHash?: string | null
}

export type CircleOnChainStatus = 'pending' | 'confirmed' | 'failed'

function getCircleConfig() {
    const key = process.env.CIRCLE_API_KEY
    if (!key) return null
    return { key }
}

function formatAmount(amount: number): string {
    return amount.toFixed(2)
}

// Maps Circle payment status strings to our internal onChainStatus values.
// Circle Payments API lifecycle: pending → confirmed → paid (USDC settled on-chain) | failed
export function circleStatusToOnChain(circleStatus: string): CircleOnChainStatus {
    if (circleStatus === 'paid') return 'confirmed'
    if (circleStatus === 'failed') return 'failed'
    return 'pending'
}

// Creates a Circle payment that charges the user's Circle-tokenized card and
// delivers USDC natively on Arbitrum to their Privy wallet address via CCTP.
//
// No platform wallet needed — Circle mints USDC on demand and routes it directly
// to the destination chain. Genesis acts as technology orchestration only.
//
// Idempotency: use a stable key derived from fundingId so retries are safe.
export async function circleCreateUsdcPurchase(input: CirclePaymentInput): Promise<CirclePaymentResult> {
    const config = getCircleConfig()

    if (!config) {
        // No API key — return null paymentId so FundPage polling exits immediately
        // rather than waiting forever for an onChainStatus that never arrives.
        return { status: 'pending', paymentId: null, transactionHash: null }
    }

    if (input.amountUsd <= 0) {
        return { status: 'failed', paymentId: null }
    }

    const idempotencyKey = input.idempotencyKey ?? `circle_pay_${input.fundingId}`

    try {
        const response = await fetch(`${CIRCLE_API_BASE}/payments`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                idempotencyKey,
                amount: {
                    amount: formatAmount(input.amountUsd),
                    currency: 'USD',
                },
                source: {
                    id: input.circleCardId,
                    type: 'card',
                },
                // Deliver USDC natively on Arbitrum to the user's Privy wallet.
                // Circle uses CCTP minting authority to issue USDC on Arbitrum
                // directly — no source-chain burn or platform wallet involved.
                destination: {
                    type: 'blockchain',
                    address: input.destinationAddress,
                    chain: CIRCLE_ARB_CHAIN,
                },
                description: `USDC purchase — Genesis Reserve account ${input.accountId}`,
                metadata: {
                    genesisAccountId: input.accountId,
                    genesisFundingId: input.fundingId,
                },
            }),
        })

        if (!response.ok) {
            return { status: 'failed', paymentId: null }
        }

        const body = await response.json()
        const payment = body?.data

        if (!payment?.id) {
            return { status: 'failed', paymentId: null }
        }

        return {
            status: circleStatusToOnChain(payment.status) === 'failed' ? 'failed' : 'pending',
            paymentId: payment.id,
            transactionHash: payment.transactionHash ?? null,
        }
    } catch {
        return { status: 'failed', paymentId: null }
    }
}

// Fetches the current status of a Circle payment by ID.
// Used for polling / manual reconciliation when webhooks are unavailable.
export async function circleGetPayment(paymentId: string): Promise<{
    status: CircleOnChainStatus
    transactionHash: string | null
} | null> {
    const config = getCircleConfig()
    if (!config) return null

    try {
        const response = await fetch(`${CIRCLE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
            headers: { Authorization: `Bearer ${config.key}` },
        })
        if (!response.ok) return null
        const body = await response.json()
        const payment = body?.data
        if (!payment) return null
        return {
            status: circleStatusToOnChain(payment.status),
            transactionHash: payment.transactionHash ?? null,
        }
    } catch {
        return null
    }
}
