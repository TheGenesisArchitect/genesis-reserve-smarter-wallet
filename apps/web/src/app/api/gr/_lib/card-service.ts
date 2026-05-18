import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import Stripe from 'stripe'
import { createRateLimiter, getRequestIp } from './request-controls'
import { circleCreateUsdcPurchase } from './circle-adapter'
import { stripeCreateFundingIntent, stripeCreatePushToCardPayout, stripeProvisionPayoutAccount, stripeResolveLinkedCard } from './stripe-card-adapter'
import {
    dbEnabled,
    dbGetCardholder, dbInsertCardholder, dbUpdateCardholder,
    dbGetCard, dbInsertCard, dbListCards, dbUpdateCardStatus, dbUpdateCardControls,
    dbGetLinkedDebitCard, dbInsertLinkedDebitCard, dbListLinkedDebitCards, dbSetLinkedDebitCardStatus, dbUpdateLinkedCardIssuerName,
    dbGetAuthorization, dbInsertAuthorization, dbListAuthorizations,
    dbGetFunding, dbInsertFunding, dbUpdateFundingStatus,
    dbGetPayout, dbInsertPayout, dbUpdatePayoutStatus,
    dbInsertWebhookEvent, dbListWebhookEvents,
} from './card-db'

type CardStatus = 'requested' | 'pending_kyc' | 'pending_fulfillment' | 'active' | 'frozen' | 'blocked' | 'canceled'
type CardType = 'virtual' | 'physical'

type Cardholder = {
    id: string
    accountId: string
    legalName: string
    email?: string
    phone?: string
    kycTier: number
    status: 'pending' | 'active' | 'restricted' | 'blocked'
    billingAddress: Record<string, unknown>
    createdAt: string
}

type Card = {
    id: string
    accountId: string
    cardholderId: string
    type: CardType
    brand: 'visa' | 'mastercard'
    status: CardStatus
    last4: string
    expiryMonth: number
    expiryYear: number
    controls: {
        online?: boolean
        atm?: boolean
        international?: boolean
        mccBlocklist?: string[]
        spendLimit?: { amount?: string; currency?: 'USD'; interval?: 'daily' | 'weekly' | 'monthly' }
    }
    createdAt: string
}

type Authorization = {
    id: string
    cardId: string
    accountId: string
    amount: { amount: string; currency: 'USD' | 'USDC' }
    status: 'approved' | 'declined' | 'reversed' | 'cleared'
    createdAt: string
    updatedAt: string
}

type LinkedDebitCard = {
    id: string
    accountId: string
    cardholderName: string
    brand: string
    bin?: string | null
    last4: string
    expMonth: number
    expYear: number
    fundingEligible: boolean
    payoutEligible: boolean
    status: 'pending' | 'verified' | 'blocked' | 'removed'
    networkTokenRef?: string | null
    processorTokenRef?: string | null
    // Stripe Connect: IDs populated automatically during card linking when CARD_ISSUING_PROVIDER=stripe.
    // connectedAccountId — the Custom connected account created for this user.
    // externalAccountId  — the debit card registered as an external account on that connected account.
    // Both are required for instant card payouts via stripeCreatePushToCardPayout().
    connectedAccountId?: string | null
    externalAccountId?: string | null
    // Circle card token — obtained via Circle's card SDK (separate from Stripe SetupIntent).
    // Required for USDC purchases: circleCreateUsdcPurchase() charges this card and
    // delivers USDC natively on Arbitrum to the user's Privy wallet via CCTP.
    circleCardId?: string | null
    issuerName?: string | null
    createdAt: string
}

type FundingStatus = 'created' | 'requires_action' | 'authorized' | 'captured' | 'settled' | 'failed' | 'reversed'
type OnChainStatus = 'pending' | 'confirmed' | 'failed'

type FundingTransaction = {
    id: string
    accountId: string
    linkedCardId: string
    amount: { amount: string; currency: 'USD' | 'USDC' }
    fee: { amount: string; currency: 'USD' | 'USDC' }
    netAmount: { amount: string; currency: 'USD' | 'USDC' }
    status: FundingStatus
    challenge?: { type: '3ds2'; clientSecret: string } | null
    processorReference?: string | null
    // Circle USDC delivery fields — populated after charge captured and USDC purchase initiated.
    // destinationAddress — user's Arbitrum wallet address for USDC delivery (Privy wallet).
    // circlePaymentId    — Circle payment ID for webhook reconciliation.
    // onChainStatus      — tracks USDC delivery independently of card charge status.
    destinationAddress?: string | null
    circlePaymentId?: string | null
    onChainStatus?: OnChainStatus | null
    createdAt: string
    updatedAt: string
}

type PayoutStatus = 'created' | 'pending_network' | 'paid' | 'failed' | 'returned'

type Payout = {
    id: string
    accountId: string
    linkedCardId: string
    amount: { amount: string; currency: 'USD' | 'USDC' }
    fee: { amount: string; currency: 'USD' | 'USDC' }
    netAmount: { amount: string; currency: 'USD' | 'USDC' }
    status: PayoutStatus
    processorReference?: string | null
    createdAt: string
    updatedAt: string
}

type DisputeStatus = 'opened' | 'under_review' | 'won' | 'lost' | 'accepted'

type Dispute = {
    id: string
    accountId?: string
    cardId?: string | null
    authorizationId?: string | null
    fundingId?: string | null
    reason: string
    status: DisputeStatus
    amount: { amount: string; currency: 'USD' | 'USDC' }
    dueAt?: string | null
    createdAt: string
    updatedAt: string
}

type WebhookEvent = {
    id: string
    type: string
    createdAt: string
    accountId?: string
    cardId?: string
    fundingId?: string
    payoutId?: string
    disputeId?: string
    data: Record<string, unknown>
}

type IdempotencyResult = {
    status: number
    body: unknown
    expiresAt: number
}

type Store = {
    cardholders: Map<string, Cardholder>
    cards: Map<string, Card>
    authorizations: Map<string, Authorization>
    linkedDebitCards: Map<string, LinkedDebitCard>
    funding: Map<string, FundingTransaction>
    payouts: Map<string, Payout>
    disputes: Map<string, Dispute>
    events: WebhookEvent[]
    idempotency: Map<string, IdempotencyResult>
}

const globalState = globalThis as typeof globalThis & {
    __grCardServiceStore?: Store
    __grCardServiceLimiter?: ReturnType<typeof createRateLimiter>
}

function getStore(): Store {
    if (!globalState.__grCardServiceStore) {
        globalState.__grCardServiceStore = {
            cardholders: new Map(),
            cards: new Map(),
            authorizations: new Map(),
            linkedDebitCards: new Map(),
            funding: new Map(),
            payouts: new Map(),
            disputes: new Map(),
            events: [],
            idempotency: new Map(),
        }
    }
    return globalState.__grCardServiceStore
}

// Exported for the Circle webhook handler to update onChainStatus on the
// in-memory funding store without going through the full service layer.
export function getCardServiceStore(): Store {
    return getStore()
}

function getLimiter() {
    if (!globalState.__grCardServiceLimiter) {
        globalState.__grCardServiceLimiter = createRateLimiter(120, 60_000)
    }
    return globalState.__grCardServiceLimiter
}

function nowIso() {
    return new Date().toISOString()
}

function makeId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function withRateHeaders(response: NextResponse, remaining = 119, retryAfterSeconds = 60) {
    response.headers.set('X-RateLimit-Limit', '120')
    response.headers.set('X-RateLimit-Remaining', String(Math.max(0, remaining)))
    response.headers.set('Retry-After', String(retryAfterSeconds))
    return response
}

function errorBody(code: string, message: string, details?: Record<string, unknown>) {
    return {
        error: {
            code,
            message,
            details: details || {},
            retryable: code === 'rate_limited',
        },
        meta: {
            source: 'mock',
            timestamp: nowIso(),
        },
    }
}

function parseMoneyLike(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
}

function formatMoney(amount: number): string {
    return amount.toFixed(2)
}

function moneyFromAmount(amount: number, currency: 'USD' | 'USDC' = 'USD') {
    return {
        amount: formatMoney(Math.max(0, amount)),
        currency,
    }
}

function getProcessorSource() {
    const mode = (process.env.CARD_ISSUING_PROVIDER || 'mock').toLowerCase()
    return mode === 'stripe' ? 'stripe' : 'mock'
}

function parseStripeStyleSignature(signature: string) {
    const parts = signature.split(',').map((p) => p.trim())
    const tsPart = parts.find((p) => p.startsWith('t='))
    const v1Parts = parts.filter((p) => p.startsWith('v1='))
    if (!tsPart || v1Parts.length === 0) return null

    const timestamp = Number(tsPart.slice(2))
    if (!Number.isFinite(timestamp)) return null

    const signatures = v1Parts.map((p) => p.slice(3)).filter(Boolean)
    if (signatures.length === 0) return null

    return { timestamp, signatures }
}

function secureHexEqual(a: string, b: string) {
    try {
        const left = Buffer.from(a, 'hex')
        const right = Buffer.from(b, 'hex')
        if (left.length !== right.length) return false
        return timingSafeEqual(left, right)
    } catch {
        return false
    }
}

function verifyWebhookSignature(signature: string | null, payload: string) {
    if (!signature) return { ok: false, reason: 'Missing webhook signature.' }

    const parsed = parseStripeStyleSignature(signature)
    if (!parsed) return { ok: false, reason: 'Invalid webhook signature format.' }

    const toleranceSec = Number(process.env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS || 300)
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - parsed.timestamp) > toleranceSec) {
        return { ok: false, reason: 'Webhook signature timestamp outside tolerance.' }
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return { ok: false, reason: 'Webhook secret is not configured.' }

    const signedPayload = `${parsed.timestamp}.${payload}`
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')
    const valid = parsed.signatures.some((candidate) => secureHexEqual(candidate, expected))
    if (!valid) return { ok: false, reason: 'Webhook signature verification failed.' }

    return { ok: true }
}

export function ensureNotRateLimited(request: Request, routeKey: string): NextResponse | null {
    const key = `${getRequestIp(request)}:${routeKey}`
    const limited = getLimiter().isLimited(key)
    if (!limited) return null

    return withRateHeaders(
        NextResponse.json(errorBody('rate_limited', 'Too many requests. Please retry later.'), { status: 429 })
    )
}

export async function withIdempotency(
    request: Request,
    operation: string,
    handler: () => Promise<{ status: number; body: unknown }>,
    ttlMs = 24 * 60 * 60 * 1000
): Promise<NextResponse> {
    const key = request.headers.get('idempotency-key')
    if (!key) {
        return withRateHeaders(
            NextResponse.json(errorBody('invalid_request', 'Missing required idempotency-key header.'), { status: 400 })
        )
    }

    const store = getStore()
    const now = Date.now()
    const idKey = `${operation}:${key}`
    const existing = store.idempotency.get(idKey)
    if (existing && existing.expiresAt > now) {
        return withRateHeaders(NextResponse.json(existing.body, { status: existing.status }))
    }

    const result = await handler()
    store.idempotency.set(idKey, {
        status: result.status,
        body: result.body,
        expiresAt: now + ttlMs,
    })
    return withRateHeaders(NextResponse.json(result.body, { status: result.status }))
}

export async function createCardholder(body: any) {
    if (!body?.accountId || !body?.legalName || !body?.billingAddress) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, legalName, and billingAddress are required.'),
        }
    }

    const item: Cardholder = {
        id: makeId('ch'),
        accountId: String(body.accountId),
        legalName: String(body.legalName),
        email: body.email ? String(body.email) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        kycTier: 1,
        status: 'active',
        billingAddress: body.billingAddress,
        createdAt: nowIso(),
    }

    if (dbEnabled()) {
        await dbInsertCardholder(item)
        await dbInsertWebhookEvent({ id: makeId('evt'), type: 'cardholder.created', accountId: item.accountId, data: { cardholderId: item.id }, createdAt: nowIso() })
    } else {
        getStore().cardholders.set(item.id, item)
        getStore().events.unshift({ id: makeId('evt'), type: 'cardholder.created', createdAt: nowIso(), accountId: item.accountId, data: { cardholderId: item.id } })
    }

    return {
        status: 201,
        body: { data: item, meta: { source: dbEnabled() ? 'db' : 'mock', timestamp: nowIso() } },
    }
}

export async function getCardholder(cardholderId: string) {
    if (dbEnabled()) {
        const item = await dbGetCardholder(cardholderId)
        if (item === undefined) return { status: 404, body: errorBody('not_found', 'Cardholder not found.') }
        return { status: 200, body: { data: item, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const item = getStore().cardholders.get(cardholderId)
    if (!item) return { status: 404, body: errorBody('not_found', 'Cardholder not found.') }
    return { status: 200, body: { data: item, meta: { source: 'mock', timestamp: nowIso() } } }
}

export async function updateCardholder(cardholderId: string, patch: any) {
    if (dbEnabled()) {
        const existing = await dbGetCardholder(cardholderId)
        if (!existing) return { status: 404, body: errorBody('not_found', 'Cardholder not found.') }
        const updated = await dbUpdateCardholder(cardholderId, {
            legalName: patch?.legalName,
            email: patch?.email,
            phone: patch?.phone,
            billingAddress: patch?.billingAddress,
        })
        if (!updated) return { status: 404, body: errorBody('not_found', 'Cardholder not found.') }
        return { status: 200, body: { data: updated, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const current = getStore().cardholders.get(cardholderId)
    if (!current) return { status: 404, body: errorBody('not_found', 'Cardholder not found.') }
    const next: Cardholder = {
        ...current,
        legalName: patch?.legalName ? String(patch.legalName) : current.legalName,
        email: patch?.email ? String(patch.email) : current.email,
        phone: patch?.phone ? String(patch.phone) : current.phone,
        billingAddress: patch?.billingAddress || current.billingAddress,
    }
    getStore().cardholders.set(cardholderId, next)
    return { status: 200, body: { data: next, meta: { source: 'mock', timestamp: nowIso() } } }
}

export async function createCard(body: any) {
    if (!body?.accountId || !body?.cardholderId || !body?.type) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, cardholderId, and type are required.'),
        }
    }

    // Resolve cardholder from DB or memory
    let cardholder: Cardholder | undefined
    if (dbEnabled()) {
        cardholder = (await dbGetCardholder(String(body.cardholderId))) as Cardholder | undefined
    } else {
        cardholder = getStore().cardholders.get(String(body.cardholderId))
    }
    if (!cardholder) {
        return { status: 404, body: errorBody('not_found', 'Cardholder not found.') }
    }

    const type = body.type === 'physical' ? 'physical' : 'virtual'
    const status: CardStatus = type === 'physical' ? 'pending_fulfillment' : 'active'

    const card: Card = {
        id: makeId('card'),
        accountId: String(body.accountId),
        cardholderId: String(body.cardholderId),
        type,
        brand: body.brand === 'mastercard' ? 'mastercard' : 'visa',
        status,
        last4: String(Math.floor(Math.random() * 9000) + 1000),
        expiryMonth: 12,
        expiryYear: new Date().getFullYear() + 3,
        controls: {
            online: true,
            atm: false,
            international: type === 'physical',
            mccBlocklist: [],
        },
        createdAt: nowIso(),
    }

    const now = nowIso()
    const authId = makeId('auth')
    const evtId = makeId('evt')

    if (dbEnabled()) {
        await dbInsertCard(card)
        await dbInsertAuthorization({ id: authId, cardId: card.id, accountId: card.accountId, amount: '1.00', currency: 'USD', status: 'approved', createdAt: now })
        await dbInsertWebhookEvent({ id: evtId, type: 'card.issued', accountId: card.accountId, cardId: card.id, data: { cardType: card.type }, createdAt: now })
    } else {
        getStore().cards.set(card.id, card)
        getStore().authorizations.set(authId, { id: authId, cardId: card.id, accountId: card.accountId, amount: { amount: '1.00', currency: 'USD' }, status: 'approved', createdAt: now, updatedAt: now })
        getStore().events.unshift({ id: evtId, type: 'card.issued', createdAt: now, accountId: card.accountId, cardId: card.id, data: { cardType: card.type } })
    }

    return { status: 201, body: { data: card, meta: { source: dbEnabled() ? 'db' : 'mock', timestamp: now } } }
}

export async function listCards(query: URLSearchParams) {
    if (dbEnabled()) {
        const sort = (query.get('sort') || 'createdAt:desc').endsWith(':asc') ? 'asc' : 'desc'
        const limit = Math.min(200, Math.max(1, Number(query.get('limit') || 50)))
        const rows = await dbListCards({ accountId: query.get('accountId') ?? undefined, cardholderId: query.get('cardholderId') ?? undefined, status: query.get('status') ?? undefined, limit, sort })
        return { status: 200, body: { data: rows ?? [], meta: { source: 'db', timestamp: nowIso(), nextCursor: null } } }
    }
    let cards = [...getStore().cards.values()]

    const accountId = query.get('accountId')
    const cardholderId = query.get('cardholderId')
    const status = query.get('status')
    const sort = query.get('sort') || 'createdAt:desc'
    const limit = Math.min(200, Math.max(1, Number(query.get('limit') || 50)))

    if (accountId) cards = cards.filter((c) => c.accountId === accountId)
    if (cardholderId) cards = cards.filter((c) => c.cardholderId === cardholderId)
    if (status) cards = cards.filter((c) => c.status === status)

    cards.sort((a, b) => {
        const d = a.createdAt.localeCompare(b.createdAt)
        return sort === 'createdAt:asc' ? d : -d
    })

    const page = cards.slice(0, limit)
    return {
        status: 200,
        body: {
            data: page,
            meta: {
                source: 'mock',
                timestamp: nowIso(),
                nextCursor: cards.length > page.length ? page[page.length - 1]?.id : null,
            },
        },
    }
}

export async function getCard(cardId: string) {
    if (dbEnabled()) {
        const card = await dbGetCard(cardId)
        if (card === undefined) return { status: 404, body: errorBody('not_found', 'Card not found.') }
        return { status: 200, body: { data: card, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const card = getStore().cards.get(cardId)
    if (!card) return { status: 404, body: errorBody('not_found', 'Card not found.') }
    return { status: 200, body: { data: card, meta: { source: 'mock', timestamp: nowIso() } } }
}

export async function mutateCardStatus(cardId: string, target: 'frozen' | 'active' | 'canceled') {
    if (dbEnabled()) {
        const existing = await dbGetCard(cardId)
        if (!existing) return { status: 404, body: errorBody('not_found', 'Card not found.') }
        if (existing.status === 'canceled' && target !== 'canceled') {
            return { status: 409, body: errorBody('invalid_state', 'Canceled card cannot transition.') }
        }
        const updated = await dbUpdateCardStatus(cardId, target)
        if (!updated) return { status: 404, body: errorBody('not_found', 'Card not found.') }
        const eventType = target === 'frozen' ? 'card.frozen' : target === 'active' ? 'card.unfrozen' : 'card.canceled'
        await dbInsertWebhookEvent({ id: makeId('evt'), type: eventType, accountId: updated.accountId, cardId: updated.id, data: {}, createdAt: nowIso() })
        return { status: 200, body: { data: updated, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const card = getStore().cards.get(cardId)
    if (!card) return { status: 404, body: errorBody('not_found', 'Card not found.') }
    if (card.status === 'canceled' && target !== 'canceled') {
        return { status: 409, body: errorBody('invalid_state', 'Canceled card cannot transition.') }
    }
    const next: Card = { ...card, status: target }
    getStore().cards.set(cardId, next)
    const eventType = target === 'frozen' ? 'card.frozen' : target === 'active' ? 'card.unfrozen' : 'card.canceled'
    getStore().events.unshift({ id: makeId('evt'), type: eventType, createdAt: nowIso(), accountId: next.accountId, cardId: next.id, data: {} })
    return { status: 200, body: { data: next, meta: { source: 'mock', timestamp: nowIso() } } }
}

export async function updateCardControls(cardId: string, patch: any) {
    if (dbEnabled()) {
        const existing = await dbGetCard(cardId)
        if (!existing) return { status: 404, body: errorBody('not_found', 'Card not found.') }
        const mergedControls = { ...existing.controls, ...patch, spendLimit: patch?.spendLimit ? { ...existing.controls?.spendLimit, ...patch.spendLimit } : existing.controls?.spendLimit }
        const updated = await dbUpdateCardControls(cardId, mergedControls)
        if (!updated) return { status: 404, body: errorBody('not_found', 'Card not found.') }
        return { status: 200, body: { data: updated, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const card = getStore().cards.get(cardId)
    if (!card) return { status: 404, body: errorBody('not_found', 'Card not found.') }
    const next: Card = {
        ...card,
        controls: { ...card.controls, ...patch, spendLimit: patch?.spendLimit ? { ...card.controls.spendLimit, ...patch.spendLimit } : card.controls.spendLimit },
    }
    getStore().cards.set(cardId, next)
    return { status: 200, body: { data: next, meta: { source: 'mock', timestamp: nowIso() } } }
}

export async function createPanRevealToken(cardId: string) {
    const card = dbEnabled() ? await dbGetCard(cardId) : getStore().cards.get(cardId)
    if (!card) return { status: 404, body: errorBody('not_found', 'Card not found.') }

    return {
        status: 201,
        body: {
            data: {
                token: makeId('pan_tok'),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                revealUrl: `https://secure.genesisreserve.io/cards/${card.id}/reveal`,
            },
            meta: { source: 'mock', timestamp: nowIso() },
        },
    }
}

export async function listAuthorizations(cardId: string, query: URLSearchParams) {
    const sort = (query.get('sort') || 'createdAt:desc').endsWith(':asc') ? 'asc' : 'desc'
    const limit = Math.min(200, Math.max(1, Number(query.get('limit') || 50)))
    if (dbEnabled()) {
        const rows = await dbListAuthorizations(cardId, { limit, sort })
        return { status: 200, body: { data: rows ?? [], meta: { source: 'db', timestamp: nowIso(), nextCursor: null } } }
    }
    let rows = [...getStore().authorizations.values()].filter((a) => a.cardId === cardId)
    rows.sort((a, b) => { const d = a.createdAt.localeCompare(b.createdAt); return sort === 'asc' ? d : -d })
    const page = rows.slice(0, limit)
    return { status: 200, body: { data: page, meta: { source: 'mock', timestamp: nowIso(), nextCursor: rows.length > page.length ? page[page.length - 1]?.id : null } } }
}

export async function getAuthorization(authorizationId: string) {
    if (dbEnabled()) {
        const row = await dbGetAuthorization(authorizationId)
        if (row === undefined) return { status: 404, body: errorBody('not_found', 'Authorization not found.') }
        return { status: 200, body: { data: row, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const row = getStore().authorizations.get(authorizationId)
    if (!row) return { status: 404, body: errorBody('not_found', 'Authorization not found.') }
    return { status: 200, body: { data: row, meta: { source: 'mock', timestamp: nowIso() } } }
}

export async function listWebhookEvents(query: URLSearchParams) {
    const sinceRaw = query.get('since')
    if (!sinceRaw) {
        return { status: 400, body: errorBody('invalid_request', 'since query parameter is required.') }
    }

    const since = new Date(sinceRaw)
    if (Number.isNaN(since.getTime())) {
        return { status: 400, body: errorBody('invalid_request', 'since must be a valid ISO datetime.') }
    }

    const untilRaw = query.get('until')
    const until = untilRaw ? new Date(untilRaw) : null
    const limit = Math.min(200, Math.max(1, Number(query.get('limit') || 50)))

    if (dbEnabled()) {
        const events = await dbListWebhookEvents({ since, until, limit })
        return { status: 200, body: { data: events ?? [], meta: { source: 'db', timestamp: nowIso(), nextCursor: null } } }
    }

    const events = getStore().events
        .filter((e) => {
            const t = new Date(e.createdAt).getTime()
            if (t < since.getTime()) return false
            if (until && t > until.getTime()) return false
            return true
        })
        .slice(0, limit)

    return {
        status: 200,
        body: {
            data: events,
            meta: { source: 'mock', timestamp: nowIso(), nextCursor: null },
        },
    }
}

export async function linkDebitCard(body: any, requestIp?: string) {
    if (!body?.accountId || !body?.cardholderName || !body?.processorSetupToken) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, cardholderName, and processorSetupToken are required.'),
        }
    }

    const source = getProcessorSource()
    const resolved =
        source === 'stripe'
            ? await stripeResolveLinkedCard(String(body.processorSetupToken))
            : {
                ok: true,
                brand: 'visa',
                last4: String(Math.floor(Math.random() * 9000) + 1000),
                expMonth: 12,
                expYear: new Date().getFullYear() + 3,
                processorTokenRef: String(body.processorSetupToken),
            }

    if (!resolved.ok) {
        return {
            status: 400,
            body: errorBody('invalid_request', resolved.error || 'Could not resolve card setup token.'),
        }
    }

    // Auto-provision a Stripe connected account and register the card as an external
    // account so the card is immediately payout-ready without any manual backend step.
    // cardToken (tok_xxx) is captured on the frontend from the same card element session
    // as the SetupIntent confirmation and sent alongside processorSetupToken.
    let connectedAccountId: string | null = null
    let externalAccountId: string | null = null

    if (source === 'stripe' && body.cardToken) {
        const provisioned = await stripeProvisionPayoutAccount(
            String(body.accountId),
            String(body.cardToken),
            requestIp
        )
        if (provisioned) {
            connectedAccountId = provisioned.connectedAccountId
            externalAccountId = provisioned.externalAccountId
        }
    }

    // circleCardId is obtained on the frontend via Circle's card SDK and submitted
    // alongside the Stripe SetupIntent. It enables USDC purchases via Circle's
    // Payments API — separate from Stripe's card tokenization which is only used
    // for push-to-card payouts (stripeCreatePushToCardPayout).
    const circleCardId: string | null = body.circleCardId ? String(body.circleCardId) : null

    const item: LinkedDebitCard = {
        id: makeId('ldc'),
        accountId: String(body.accountId),
        cardholderName: String(body.cardholderName),
        brand: resolved.brand,
        bin: resolved.bin ?? null,
        last4: resolved.last4,
        expMonth: resolved.expMonth,
        expYear: resolved.expYear,
        fundingEligible: true,
        payoutEligible: true,
        status: 'verified',
        networkTokenRef: null,
        processorTokenRef: resolved.processorTokenRef ?? String(body.processorSetupToken),
        connectedAccountId,
        externalAccountId,
        circleCardId,
        issuerName: body.issuerName ? String(body.issuerName) : null,
        createdAt: nowIso(),
    }

    if (dbEnabled()) {
        await dbInsertLinkedDebitCard(item)
        await dbInsertWebhookEvent({ id: makeId('evt'), type: 'linked_debit_card.created', accountId: item.accountId, data: { linkedCardId: item.id }, createdAt: nowIso() })
    } else {
        getStore().linkedDebitCards.set(item.id, item)
        getStore().events.unshift({ id: makeId('evt'), type: 'linked_debit_card.created', createdAt: nowIso(), accountId: item.accountId, data: { linkedCardId: item.id } })
    }

    return {
        status: 201,
        body: { data: item, meta: { source: dbEnabled() ? 'db' : source, timestamp: nowIso() } },
    }
}

export async function listLinkedDebitCards(query: URLSearchParams) {
    const sort = (query.get('sort') || 'createdAt:desc').endsWith(':asc') ? 'asc' : 'desc'
    const limit = Math.min(200, Math.max(1, Number(query.get('limit') || 50)))
    if (dbEnabled()) {
        const rows = await dbListLinkedDebitCards({ accountId: query.get('accountId') ?? undefined, limit, sort })
        return { status: 200, body: { data: rows ?? [], meta: { source: 'db', timestamp: nowIso(), nextCursor: null } } }
    }
    let rows = [...getStore().linkedDebitCards.values()]
    const accountId = query.get('accountId')
    if (accountId) rows = rows.filter((c) => c.accountId === accountId)
    rows = rows.filter((c) => c.status !== 'removed')
    rows.sort((a, b) => { const d = a.createdAt.localeCompare(b.createdAt); return sort === 'asc' ? d : -d })
    const page = rows.slice(0, limit)
    return { status: 200, body: { data: page, meta: { source: getProcessorSource(), timestamp: nowIso(), nextCursor: rows.length > page.length ? page[page.length - 1]?.id : null } } }
}

export async function updateLinkedCardIssuerName(linkedCardId: string, issuerName: string) {
    if (!issuerName || !linkedCardId) {
        return { status: 400, body: errorBody('invalid_request', 'linkedCardId and issuerName are required.') }
    }
    if (dbEnabled()) {
        const updated = await dbUpdateLinkedCardIssuerName(linkedCardId, issuerName)
        if (!updated) return { status: 404, body: errorBody('not_found', 'Linked debit card not found.') }
        return { status: 200, body: { data: updated, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const found = getStore().linkedDebitCards.get(linkedCardId)
    if (!found) return { status: 404, body: errorBody('not_found', 'Linked debit card not found.') }
    const next = { ...found, issuerName }
    getStore().linkedDebitCards.set(linkedCardId, next)
    return { status: 200, body: { data: next, meta: { source: getProcessorSource(), timestamp: nowIso() } } }
}

export async function unlinkLinkedDebitCard(linkedCardId: string) {
    if (dbEnabled()) {
        const found = await dbGetLinkedDebitCard(linkedCardId)
        if (!found) return { status: 404, body: errorBody('not_found', 'Linked debit card not found.') }
        await dbSetLinkedDebitCardStatus(linkedCardId, 'removed')
        await dbInsertWebhookEvent({ id: makeId('evt'), type: 'linked_debit_card.removed', accountId: found.accountId, data: { linkedCardId }, createdAt: nowIso() })
        return { status: 204, body: null }
    }
    const found = getStore().linkedDebitCards.get(linkedCardId)
    if (!found) return { status: 404, body: errorBody('not_found', 'Linked debit card not found.') }
    const next: LinkedDebitCard = { ...found, status: 'removed' }
    getStore().linkedDebitCards.set(linkedCardId, next)
    getStore().events.unshift({ id: makeId('evt'), type: 'linked_debit_card.removed', createdAt: nowIso(), accountId: found.accountId, data: { linkedCardId } })
    return { status: 204, body: null }
}

export function createFundingConversionQuote(body: any) {
    if (!body?.accountId || !body?.linkedCardId || !body?.sourceAmount || !body?.sourceCurrency || !body?.targetCurrency) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, linkedCardId, sourceAmount, sourceCurrency, targetCurrency are required.'),
        }
    }

    const sourceAmount = parseMoneyLike(body.sourceAmount)
    const exchangeRate = body.sourceCurrency === body.targetCurrency ? 1 : 1
    const fee = sourceAmount * 0.01
    const targetAmount = Math.max(0, sourceAmount * exchangeRate - fee)

    return {
        status: 200,
        body: {
            data: {
                quoteId: makeId('fquote'),
                sourceAmount: moneyFromAmount(sourceAmount, body.sourceCurrency === 'USDC' ? 'USDC' : 'USD'),
                targetAmount: moneyFromAmount(targetAmount, body.targetCurrency === 'USDC' ? 'USDC' : 'USD'),
                exchangeRate: exchangeRate.toFixed(8),
                fee: moneyFromAmount(fee, body.sourceCurrency === 'USDC' ? 'USDC' : 'USD'),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            },
            meta: { source: getProcessorSource(), timestamp: nowIso() },
        },
    }
}

export async function createAddMoney(body: any, idempotencyKey?: string) {
    if (!body?.accountId || !body?.linkedCardId || !body?.amount?.amount) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, linkedCardId, and amount are required.'),
        }
    }

    const linkedRaw = dbEnabled()
        ? await dbGetLinkedDebitCard(String(body.linkedCardId))
        : getStore().linkedDebitCards.get(String(body.linkedCardId))
    const linked = linkedRaw as typeof linkedRaw & { processorTokenRef?: string | null; fundingEligible?: boolean }
    if (!linked || linked.status !== 'verified') {
        return { status: 404, body: errorBody('not_found', 'Linked debit card not found or not eligible.') }
    }
    if (!linked.fundingEligible) {
        return { status: 403, body: errorBody('compliance_block', 'Linked card is not funding eligible.') }
    }

    const amountNumber = parseMoneyLike(body.amount.amount)
    if (amountNumber <= 0) {
        return { status: 400, body: errorBody('invalid_request', 'amount must be greater than zero.') }
    }

    const currency: 'USD' | 'USDC' = body.amount.currency === 'USDC' ? 'USDC' : 'USD'
    const source = getProcessorSource()

    // Generate the funding ID before external calls so it can be embedded in
    // Circle's idempotency key and used for webhook reconciliation later.
    const fundingId = makeId('fund')

    let status: FundingStatus = 'captured'
    let processorReference: string | null = null
    let challenge: FundingTransaction['challenge'] = null
    let feeAmount = amountNumber * 0.01 + 0.3

    if (source === 'stripe') {
        const adapterResult = await stripeCreateFundingIntent({
            amount: amountNumber,
            currency,
            processorTokenRef: linked.processorTokenRef || '',
            accountId: String(body.accountId),
            idempotencyKey,
        })
        status = adapterResult.status
        processorReference = adapterResult.processorReference
        feeAmount = adapterResult.feeAmount
        if (adapterResult.challengeClientSecret) {
            challenge = { type: '3ds2', clientSecret: adapterResult.challengeClientSecret }
        }
    }

    // Circle USDC purchase — fires when the charge is captured, the user provided
    // their Arbitrum wallet address, AND the linked card has a circleCardId.
    // Circle charges the card and mints USDC natively on Arbitrum via CCTP.
    // Genesis never holds the USDC — Circle delivers it directly to the user's
    // Privy wallet. Runs after the Stripe call so fees are known first.
    const destinationAddress = body.destinationAddress ? String(body.destinationAddress) : null
    const netAmountNum = Math.max(0, amountNumber - feeAmount)
    let circlePaymentId: string | null = null
    let onChainStatus: OnChainStatus | null = null

    const linkedCircleCardId = (linked as any).circleCardId as string | null | undefined
    if (status === 'captured' && destinationAddress && linkedCircleCardId) {
        const circleResult = await circleCreateUsdcPurchase({
            circleCardId: linkedCircleCardId,
            destinationAddress,
            amountUsd: netAmountNum,
            fundingId,
            accountId: String(body.accountId),
            idempotencyKey: idempotencyKey ? `circle_${idempotencyKey}` : undefined,
        })
        circlePaymentId = circleResult.paymentId
        onChainStatus = circleResult.status
    }

    const tx: FundingTransaction = {
        id: fundingId,
        accountId: String(body.accountId),
        linkedCardId: String(body.linkedCardId),
        amount: moneyFromAmount(amountNumber, currency),
        fee: moneyFromAmount(feeAmount, currency),
        netAmount: moneyFromAmount(netAmountNum, currency),
        status,
        challenge,
        processorReference,
        destinationAddress,
        circlePaymentId,
        onChainStatus,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    }

    if (dbEnabled()) {
        await dbInsertFunding({
            id: tx.id, accountId: tx.accountId, linkedCardId: tx.linkedCardId,
            amount: tx.amount.amount, currency: tx.amount.currency, fee: tx.fee.amount,
            status: tx.status, challenge: tx.challenge ?? null,
            processorReference: tx.processorReference ?? null,
            circlePaymentId: tx.circlePaymentId ?? null,
            onChainStatus: tx.onChainStatus ?? null,
            destinationAddress: tx.destinationAddress ?? null,
            idempotencyKey: idempotencyKey ?? makeId('idem'), createdAt: tx.createdAt,
        })
    } else {
        getStore().funding.set(tx.id, tx)
    }

    const evtType = status === 'requires_action' ? 'funding.requires_action'
        : status === 'failed' ? 'funding.failed'
        : 'funding.captured'
    const evtData = {
        linkedCardId: tx.linkedCardId,
        ...(circlePaymentId ? { circlePaymentId, onChainStatus } : {}),
    }

    if (dbEnabled()) {
        await dbInsertWebhookEvent({ id: makeId('evt'), type: evtType, accountId: tx.accountId, fundingId: tx.id, data: evtData, createdAt: nowIso() })
    } else {
        getStore().events.unshift({ id: makeId('evt'), type: evtType, createdAt: nowIso(), accountId: tx.accountId, fundingId: tx.id, data: evtData })
    }

    return {
        status: 202,
        body: {
            data: tx,
            meta: { source: dbEnabled() ? 'db' : source, timestamp: nowIso() },
        },
    }
}

export async function getFundingStatus(fundingId: string) {
    if (dbEnabled()) {
        const item = await dbGetFunding(fundingId)
        if (item === undefined) return { status: 404, body: errorBody('not_found', 'Funding transaction not found.') }
        return { status: 200, body: { data: item, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const item = getStore().funding.get(fundingId)
    if (!item) return { status: 404, body: errorBody('not_found', 'Funding transaction not found.') }
    return { status: 200, body: { data: item, meta: { source: getProcessorSource(), timestamp: nowIso() } } }
}

export function quotePushToCard(body: any) {
    if (!body?.accountId || !body?.linkedCardId || !body?.amount?.amount) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, linkedCardId, and amount are required.'),
        }
    }

    const amount = parseMoneyLike(body.amount.amount)
    const currency: 'USD' | 'USDC' = body.amount.currency === 'USDC' ? 'USDC' : 'USD'
    const feeAmount = amount * 0.01 + 0.25
    const netAmount = Math.max(0, amount - feeAmount)

    return {
        status: 200,
        body: {
            data: {
                quoteId: makeId('pquote'),
                amount: moneyFromAmount(amount, currency),
                fee: moneyFromAmount(feeAmount, currency),
                netAmount: moneyFromAmount(netAmount, currency),
                expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            },
            meta: { source: getProcessorSource(), timestamp: nowIso() },
        },
    }
}

export async function createPushToCardPayout(body: any) {
    if (!body?.accountId || !body?.linkedCardId || !body?.amount?.amount) {
        return {
            status: 400,
            body: errorBody('invalid_request', 'accountId, linkedCardId, and amount are required.'),
        }
    }

    const linked = dbEnabled()
        ? await dbGetLinkedDebitCard(String(body.linkedCardId))
        : getStore().linkedDebitCards.get(String(body.linkedCardId))
    if (!linked || !linked.payoutEligible || linked.status !== 'verified') {
        return { status: 403, body: errorBody('compliance_block', 'Linked card is not payout eligible.') }
    }

    const amount = parseMoneyLike(body.amount.amount)
    if (amount <= 0) {
        return { status: 400, body: errorBody('invalid_request', 'amount must be greater than zero.') }
    }

    const currency: 'USD' | 'USDC' = body.amount.currency === 'USDC' ? 'USDC' : 'USD'
    const source = getProcessorSource()

    // Generate the ID before the Stripe call so it can be embedded in processor metadata.
    const payoutId = makeId('payout')

    let payoutStatus: PayoutStatus = 'pending_network'
    let processorReference: string | null = null

    if (source === 'stripe' && linked.processorTokenRef) {
        const result = await stripeCreatePushToCardPayout({
            amount,
            currency,
            processorTokenRef: linked.processorTokenRef,
            connectedAccountId: linked.connectedAccountId,
            externalAccountId: linked.externalAccountId,
            payoutId,
            accountId: String(body.accountId),
            idempotencyKey: body.idempotencyKey,
        })
        payoutStatus = result.status
        processorReference = result.processorReference
    } else {
        processorReference = makeId('stripe_payout_ref')
    }

    if (payoutStatus === 'failed') {
        return { status: 422, body: errorBody('processor_error', 'Payout could not be initiated by the processor.') }
    }

    const feeAmount = amount * 0.01 + 0.25
    const netAmount = Math.max(0, amount - feeAmount)

    const payout: Payout = {
        id: payoutId,
        accountId: String(body.accountId),
        linkedCardId: String(body.linkedCardId),
        amount: moneyFromAmount(amount, currency),
        fee: moneyFromAmount(feeAmount, currency),
        netAmount: moneyFromAmount(netAmount, currency),
        status: payoutStatus,
        processorReference,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    }

    if (dbEnabled()) {
        await dbInsertPayout({
            id: payout.id, accountId: payout.accountId, linkedCardId: payout.linkedCardId,
            amount: payout.amount.amount, currency: payout.amount.currency, fee: payout.fee.amount,
            status: payout.status, processorReference: payout.processorReference ?? null,
            idempotencyKey: makeId('idem'), createdAt: payout.createdAt,
        })
        await dbInsertWebhookEvent({
            id: makeId('evt'),
            type: 'payout.pending_network',
            accountId: payout.accountId,
            payoutId: payout.id,
            data: { linkedCardId: payout.linkedCardId, processorReference },
            createdAt: nowIso(),
        })
    } else {
        getStore().payouts.set(payout.id, payout)
        getStore().events.unshift({
            id: makeId('evt'),
            type: 'payout.pending_network',
            createdAt: nowIso(),
            accountId: payout.accountId,
            payoutId: payout.id,
            data: { linkedCardId: payout.linkedCardId, processorReference },
        })
    }

    return {
        status: 202,
        body: {
            data: payout,
            meta: { source: dbEnabled() ? 'db' : source, timestamp: nowIso() },
        },
    }
}

export async function getPayout(payoutId: string) {
    if (dbEnabled()) {
        const item = await dbGetPayout(payoutId)
        if (item === undefined) return { status: 404, body: errorBody('not_found', 'Payout not found.') }
        return { status: 200, body: { data: item, meta: { source: 'db', timestamp: nowIso() } } }
    }
    const item = getStore().payouts.get(payoutId)
    if (!item) return { status: 404, body: errorBody('not_found', 'Payout not found.') }
    return { status: 200, body: { data: item, meta: { source: getProcessorSource(), timestamp: nowIso() } } }
}

export function __resetCardServiceForTests() {
    globalState.__grCardServiceStore = {
        cardholders: new Map(),
        cards: new Map(),
        authorizations: new Map(),
        linkedDebitCards: new Map(),
        funding: new Map(),
        payouts: new Map(),
        disputes: new Map(),
        events: [],
        idempotency: new Map(),
    }
    globalState.__grCardServiceLimiter = createRateLimiter(120, 60_000)
}

export async function getDispute(disputeId: string) {
    const item = getStore().disputes.get(disputeId)
    if (!item) return { status: 404, body: errorBody('not_found', 'Dispute not found.') }
    return { status: 200, body: { data: item, meta: { source: 'internal', timestamp: nowIso() } } }
}

export async function submitDisputeEvidence(disputeId: string, body: any) {
    const dispute = getStore().disputes.get(disputeId)
    if (!dispute) return { status: 404, body: errorBody('not_found', 'Dispute not found.') }
    if (!body?.summary) return { status: 400, body: errorBody('invalid_request', 'summary is required.') }
    const updated: Dispute = { ...dispute, status: 'under_review', updatedAt: nowIso() }
    getStore().disputes.set(disputeId, updated)
    getStore().events.unshift({ id: makeId('evt'), type: 'dispute.closed', createdAt: nowIso(), disputeId, data: { action: 'evidence_submitted' } })
    return { status: 202, body: { data: updated, meta: { source: 'internal', timestamp: nowIso() } } }
}

export async function acceptDispute(disputeId: string) {
    const dispute = getStore().disputes.get(disputeId)
    if (!dispute) return { status: 404, body: errorBody('not_found', 'Dispute not found.') }
    const updated: Dispute = { ...dispute, status: 'accepted', updatedAt: nowIso() }
    getStore().disputes.set(disputeId, updated)
    getStore().events.unshift({ id: makeId('evt'), type: 'dispute.closed', createdAt: nowIso(), disputeId, data: { action: 'accepted' } })
    return { status: 202, body: { data: updated, meta: { source: 'internal', timestamp: nowIso() } } }
}

// Real Stripe webhooks nest context under body.data.object; our internal events
// put ids at the top level. This helper resolves both.
function extractStripeEventContext(body: any): {
    fundingId?: string
    payoutId?: string
    processorReference?: string | null
} {
    // Internal event format: body.fundingId / body.payoutId
    if (body?.fundingId || body?.payoutId) {
        return {
            fundingId: body.fundingId,
            payoutId: body.payoutId,
            processorReference: typeof body.data?.processorReference === 'string' ? body.data.processorReference : null,
        }
    }

    // Real Stripe event format: body.data.object.metadata.{fundingId,payoutId}
    const obj = body?.data?.object
    if (obj) {
        const meta = obj.metadata ?? {}
        return {
            fundingId: meta.fundingId ?? undefined,
            payoutId: meta.payoutId ?? undefined,
            // For real Stripe events, the processor reference is the object id itself.
            processorReference: typeof obj.id === 'string' ? obj.id : null,
        }
    }

    return {}
}

export async function handleProcessorWebhook(signature: string | null, payloadRaw: string, body: any) {
    if (getProcessorSource() === 'stripe') {
        // Use the official Stripe SDK — handles HMAC-SHA256, timestamp tolerance, and
        // constant-time comparison internally so we don't maintain that logic ourselves.
        const secret = process.env.STRIPE_WEBHOOK_SECRET
        if (!secret) return { status: 400, body: errorBody('invalid_request', 'Webhook secret is not configured.') }
        if (!signature) return { status: 400, body: errorBody('invalid_request', 'Missing Stripe-Signature header.') }
        try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as any })
            body = stripe.webhooks.constructEvent(payloadRaw, signature, secret)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Webhook signature verification failed.'
            return { status: 400, body: errorBody('invalid_request', msg) }
        }
    } else {
        // Mock / internal events use our manual HMAC path (no live Stripe credentials needed).
        const verified = verifyWebhookSignature(signature, payloadRaw)
        if (!verified.ok) return { status: 400, body: errorBody('invalid_request', verified.reason ?? 'Invalid webhook signature.') }
    }

    const ctx = extractStripeEventContext(body)

    const evt: WebhookEvent = {
        id: body?.id ?? makeId('evt'),
        type: body?.type ?? 'unknown',
        createdAt: body?.created ? new Date(body.created * 1000).toISOString() : (body?.createdAt ?? nowIso()),
        accountId: body?.accountId ?? body?.data?.object?.metadata?.accountId,
        cardId: body?.cardId,
        fundingId: ctx.fundingId,
        payoutId: ctx.payoutId,
        disputeId: body?.disputeId,
        data: body?.data ?? {},
    }

    // Funding status mapping — internal events and real Stripe PaymentIntent events.
    const fundingStatusByEvent: Record<string, FundingStatus> = {
        // Internal event names
        'funding.requires_action': 'requires_action',
        'funding.captured': 'captured',
        'funding.settled': 'settled',
        'funding.failed': 'failed',
        // Real Stripe PaymentIntent events
        'payment_intent.requires_action': 'requires_action',
        'payment_intent.processing': 'authorized',
        'payment_intent.succeeded': 'captured',
        'payment_intent.payment_failed': 'failed',
        'payment_intent.canceled': 'failed',
    }
    const mappedFundingStatus = fundingStatusByEvent[evt.type]

    if (mappedFundingStatus && evt.fundingId) {
        if (dbEnabled()) {
            await dbUpdateFundingStatus(evt.fundingId, mappedFundingStatus, ctx.processorReference ?? null)
        } else {
            const existing = getStore().funding.get(evt.fundingId)
            if (existing) {
                getStore().funding.set(evt.fundingId, {
                    ...existing,
                    status: mappedFundingStatus,
                    processorReference: ctx.processorReference ?? existing.processorReference ?? null,
                    updatedAt: nowIso(),
                })
            }
        }
    }

    // Payout status mapping — internal events, real Stripe Payout events, and Treasury
    // OutboundTransfer events (when STRIPE_FINANCIAL_ACCOUNT_ID is configured).
    const payoutStatusByEvent: Record<string, PayoutStatus> = {
        // Internal event names
        'payout.pending_network': 'pending_network',
        'payout.paid': 'paid',
        'payout.settled': 'paid',
        'payout.failed': 'failed',
        'payout.returned': 'returned',
        // Real Stripe Payout events (Connect instant payout path)
        'payout.created': 'pending_network',
        'payout.updated': 'pending_network',
        // Real Stripe Payout terminal events
        'payout.reconciliation_completed': 'paid',
        // Real Stripe Treasury OutboundTransfer events (Treasury path)
        'treasury.outbound_transfer.created': 'pending_network',
        'treasury.outbound_transfer.posted': 'paid',
        'treasury.outbound_transfer.failed': 'failed',
        'treasury.outbound_transfer.returned': 'returned',
        'treasury.outbound_transfer.canceled': 'failed',
    }
    const mappedPayoutStatus = payoutStatusByEvent[evt.type]

    if (mappedPayoutStatus && evt.payoutId) {
        if (dbEnabled()) {
            await dbUpdatePayoutStatus(evt.payoutId, mappedPayoutStatus, ctx.processorReference ?? null)
        } else {
            const existing = getStore().payouts.get(evt.payoutId)
            if (existing) {
                getStore().payouts.set(evt.payoutId, {
                    ...existing,
                    status: mappedPayoutStatus,
                    processorReference: ctx.processorReference ?? existing.processorReference ?? null,
                    updatedAt: nowIso(),
                })
            }
        }
    }

    if (dbEnabled()) {
        await dbInsertWebhookEvent(evt)
    } else {
        const duplicate = getStore().events.some((e) => e.id === evt.id)
        if (duplicate) return { status: 200, body: { ok: true } }
        getStore().events.unshift(evt)
    }

    return { status: 200, body: { ok: true } }
}

export async function toResponse(result: { status: number; body: unknown } | Promise<{ status: number; body: unknown }>) {
    const r = await result
    if (r.status === 204) {
        return withRateHeaders(new NextResponse(null, { status: 204 }))
    }
    return withRateHeaders(NextResponse.json(r.body, { status: r.status }))
}
