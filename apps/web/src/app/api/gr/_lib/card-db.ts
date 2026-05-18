/**
 * card-db.ts — PostgreSQL persistence layer for the card issuing service.
 *
 * Only active when DATABASE_URL is set in the environment.
 * When DATABASE_URL is absent (tests, local dev without DB), every function
 * returns null and the caller falls back to the in-memory store.
 *
 * Depends on migration: gr/gr/db/migrations/010_card_issuing_schema.sql
 */

import { Pool } from 'pg'

// ─── Pool singleton ──────────────────────────────────────────────────────────

const globalState = globalThis as typeof globalThis & { __grCardDbPool?: Pool }

export function getPool(): Pool | null {
    if (!process.env.DATABASE_URL) return null
    if (!globalState.__grCardDbPool) {
        globalState.__grCardDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30_000,
        })
    }
    return globalState.__grCardDbPool
}

export function dbEnabled(): boolean {
    return Boolean(process.env.DATABASE_URL)
}

// ─── Row → domain mappers ─────────────────────────────────────────────────────

function mapCardholder(row: any) {
    return {
        id: row.cardholder_id,
        accountId: row.account_id,
        legalName: row.legal_name,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        kycTier: row.kyc_tier,
        status: row.status,
        billingAddress: row.billing_address,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }
}

function mapCard(row: any) {
    return {
        id: row.card_id,
        accountId: row.account_id,
        cardholderId: row.cardholder_id,
        type: row.card_type,
        brand: row.brand,
        status: row.status,
        last4: row.last4,
        expiryMonth: row.expiry_month,
        expiryYear: row.expiry_year,
        controls: row.controls ?? {},
        shipping: row.shipping ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }
}

function mapLinkedDebitCard(row: any) {
    return {
        id: row.linked_card_id,
        accountId: row.account_id,
        cardholderName: row.cardholder_name,
        brand: row.brand,
        bin: row.bin ?? null,
        last4: row.last4,
        expMonth: row.exp_month,
        expYear: row.exp_year,
        fundingEligible: row.funding_eligible,
        payoutEligible: row.payout_eligible,
        status: row.status,
        networkTokenRef: row.network_token_ref ?? null,
        processorTokenRef: row.processor_token_ref ?? null,
        connectedAccountId: row.connected_account_id ?? null,
        externalAccountId: row.external_account_id ?? null,
        circleCardId: row.circle_card_id ?? null,
        issuerName: row.issuer_name ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }
}

function mapAuthorization(row: any) {
    return {
        id: row.authorization_id,
        cardId: row.card_id,
        accountId: row.account_id,
        merchantName: row.merchant_name ?? null,
        mcc: row.mcc ?? null,
        amount: { amount: String(row.amount), currency: row.currency },
        settledAmount: row.settled_amount != null
            ? { amount: String(row.settled_amount), currency: row.settled_currency ?? row.currency }
            : undefined,
        status: row.status,
        declineCode: row.decline_code ?? null,
        processorReference: row.processor_ref ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }
}

function mapFunding(row: any) {
    return {
        id: row.funding_id,
        accountId: row.account_id,
        linkedCardId: row.linked_card_id,
        amount: { amount: String(row.amount), currency: row.currency },
        fee: { amount: String(row.fee), currency: row.currency },
        netAmount: { amount: String(row.net_amount), currency: row.currency },
        status: row.status,
        challenge: row.challenge ?? null,
        processorReference: row.processor_ref ?? null,
        destinationAddress: row.destination_address ?? null,
        circlePaymentId: row.circle_payment_id ?? null,
        onChainStatus: row.on_chain_status ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }
}

function mapPayout(row: any) {
    return {
        id: row.payout_id,
        accountId: row.account_id,
        linkedCardId: row.linked_card_id,
        amount: { amount: String(row.amount), currency: row.currency },
        fee: { amount: String(row.fee), currency: row.currency },
        netAmount: { amount: String(row.net_amount), currency: row.currency },
        status: row.status,
        processorReference: row.processor_ref ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }
}

function mapWebhookEvent(row: any) {
    return {
        id: row.event_id,
        type: row.event_type,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        accountId: row.account_id ?? undefined,
        cardId: row.card_id ?? undefined,
        fundingId: row.funding_id ?? undefined,
        payoutId: row.payout_id ?? undefined,
        disputeId: row.dispute_id ?? undefined,
        data: row.payload ?? {},
    }
}

// ─── Cardholders ─────────────────────────────────────────────────────────────

export async function dbGetCardholder(id: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM card_issuers WHERE cardholder_id = $1',
        [id]
    )
    return rows[0] ? mapCardholder(rows[0]) : undefined
}

export async function dbInsertCardholder(item: {
    id: string; accountId: string; legalName: string
    email?: string; phone?: string; kycTier: number
    status: string; billingAddress: Record<string, unknown>
    createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO card_issuers
         (cardholder_id, account_id, legal_name, email, phone, kyc_tier, status, billing_address, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         ON CONFLICT (cardholder_id) DO NOTHING`,
        [item.id, item.accountId, item.legalName, item.email ?? null, item.phone ?? null,
        item.kycTier, item.status, JSON.stringify(item.billingAddress), item.createdAt]
    )
    return item
}

export async function dbUpdateCardholder(id: string, patch: {
    legalName?: string; email?: string; phone?: string; billingAddress?: Record<string, unknown>
}) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE card_issuers
         SET legal_name     = COALESCE($2, legal_name),
             email          = COALESCE($3, email),
             phone          = COALESCE($4, phone),
             billing_address = COALESCE($5::jsonb, billing_address),
             updated_at     = NOW()
         WHERE cardholder_id = $1
         RETURNING *`,
        [id, patch.legalName ?? null, patch.email ?? null, patch.phone ?? null,
            patch.billingAddress ? JSON.stringify(patch.billingAddress) : null]
    )
    return rows[0] ? mapCardholder(rows[0]) : null
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export async function dbGetCard(id: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM issued_cards WHERE card_id = $1',
        [id]
    )
    return rows[0] ? mapCard(rows[0]) : undefined
}

export async function dbInsertCard(item: {
    id: string; accountId: string; cardholderId: string
    type: string; brand: string; status: string
    last4: string; expiryMonth: number; expiryYear: number
    controls: Record<string, unknown>; createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO issued_cards
         (card_id, account_id, cardholder_id, card_type, brand, status,
          last4, expiry_month, expiry_year, controls, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)`,
        [item.id, item.accountId, item.cardholderId, item.type, item.brand, item.status,
        item.last4, item.expiryMonth, item.expiryYear, JSON.stringify(item.controls), item.createdAt]
    )
    return item
}

export async function dbUpdateCardStatus(id: string, status: string, actor: string = 'system') {
    const pool = getPool()
    if (!pool) return null
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const { rows } = await client.query(
            `UPDATE issued_cards SET status = $2, updated_at = NOW()
             WHERE card_id = $1 RETURNING *`,
            [id, status]
        )
        if (rows[0]) {
            await client.query(
                `INSERT INTO card_status_log (card_id, to_status, actor_type) VALUES ($1,$2,$3)`,
                [id, status, actor]
            )
        }
        await client.query('COMMIT')
        return rows[0] ? mapCard(rows[0]) : null
    } catch (err) {
        await client.query('ROLLBACK')
        throw err
    } finally {
        client.release()
    }
}

export async function dbUpdateCardControls(id: string, controls: Record<string, unknown>) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE issued_cards
         SET controls = controls || $2::jsonb, updated_at = NOW()
         WHERE card_id = $1 RETURNING *`,
        [id, JSON.stringify(controls)]
    )
    return rows[0] ? mapCard(rows[0]) : null
}

export async function dbListCards(params: {
    accountId?: string; cardholderId?: string; status?: string
    limit: number; sort: 'asc' | 'desc'
}) {
    const pool = getPool()
    if (!pool) return null
    const conditions: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (params.accountId) { conditions.push(`account_id = $${idx++}`); values.push(params.accountId) }
    if (params.cardholderId) { conditions.push(`cardholder_id = $${idx++}`); values.push(params.cardholderId) }
    if (params.status) { conditions.push(`status = $${idx++}`); values.push(params.status) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const order = params.sort === 'asc' ? 'ASC' : 'DESC'
    values.push(params.limit)

    const { rows } = await pool.query(
        `SELECT * FROM issued_cards ${where} ORDER BY created_at ${order} LIMIT $${idx}`,
        values
    )
    return rows.map(mapCard)
}

// ─── Linked debit cards ───────────────────────────────────────────────────────

export async function dbGetLinkedDebitCard(id: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM linked_debit_cards WHERE linked_card_id = $1',
        [id]
    )
    return rows[0] ? mapLinkedDebitCard(rows[0]) : undefined
}

export async function dbInsertLinkedDebitCard(item: {
    id: string; accountId: string; cardholderName: string
    brand: string; bin?: string | null; last4: string
    expMonth: number; expYear: number
    fundingEligible: boolean; payoutEligible: boolean
    status: string; networkTokenRef?: string | null
    processorTokenRef?: string | null
    connectedAccountId?: string | null
    externalAccountId?: string | null
    circleCardId?: string | null
    issuerName?: string | null
    createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO linked_debit_cards
         (linked_card_id, account_id, cardholder_name, brand, bin, last4,
          exp_month, exp_year, funding_eligible, payout_eligible, status,
          network_token_ref, processor_token_ref,
          connected_account_id, external_account_id, circle_card_id,
          issuer_name, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
        [item.id, item.accountId, item.cardholderName, item.brand, item.bin ?? null,
        item.last4, item.expMonth, item.expYear, item.fundingEligible, item.payoutEligible,
        item.status, item.networkTokenRef ?? null, item.processorTokenRef ?? null,
        item.connectedAccountId ?? null, item.externalAccountId ?? null,
        item.circleCardId ?? null, item.issuerName ?? null, item.createdAt]
    )
    return item
}

export async function dbUpdateLinkedCardIssuerName(id: string, issuerName: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE linked_debit_cards SET issuer_name = $2, updated_at = NOW()
         WHERE linked_card_id = $1 RETURNING *`,
        [id, issuerName]
    )
    return rows[0] ? mapLinkedDebitCard(rows[0]) : null
}

export async function dbSetLinkedDebitCardStatus(id: string, status: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE linked_debit_cards SET status = $2, updated_at = NOW()
         WHERE linked_card_id = $1 RETURNING *`,
        [id, status]
    )
    return rows[0] ? mapLinkedDebitCard(rows[0]) : null
}

export async function dbListLinkedDebitCards(params: { accountId?: string; limit: number; sort: 'asc' | 'desc' }) {
    const pool = getPool()
    if (!pool) return null
    const conditions: string[] = ['status != \'removed\'']
    const values: unknown[] = []
    let idx = 1

    if (params.accountId) { conditions.push(`account_id = $${idx++}`); values.push(params.accountId) }

    const where = `WHERE ${conditions.join(' AND ')}`
    const order = params.sort === 'asc' ? 'ASC' : 'DESC'
    values.push(params.limit)

    const { rows } = await pool.query(
        `SELECT * FROM linked_debit_cards ${where} ORDER BY created_at ${order} LIMIT $${idx}`,
        values
    )
    return rows.map(mapLinkedDebitCard)
}

// ─── Authorizations ───────────────────────────────────────────────────────────

export async function dbGetAuthorization(id: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM card_authorizations WHERE authorization_id = $1',
        [id]
    )
    return rows[0] ? mapAuthorization(rows[0]) : undefined
}

export async function dbInsertAuthorization(item: {
    id: string; cardId: string; accountId: string
    amount: string; currency: string; status: string; createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO card_authorizations
         (authorization_id, card_id, account_id, amount, currency, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [item.id, item.cardId, item.accountId, item.amount, item.currency, item.status, item.createdAt]
    )
    return item
}

export async function dbListAuthorizations(cardId: string, params: { limit: number; sort: 'asc' | 'desc' }) {
    const pool = getPool()
    if (!pool) return null
    const order = params.sort === 'asc' ? 'ASC' : 'DESC'
    const { rows } = await pool.query(
        `SELECT * FROM card_authorizations WHERE card_id = $1 ORDER BY created_at ${order} LIMIT $2`,
        [cardId, params.limit]
    )
    return rows.map(mapAuthorization)
}

// ─── Funding ──────────────────────────────────────────────────────────────────

export async function dbGetFunding(id: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM card_funding_transactions WHERE funding_id = $1',
        [id]
    )
    return rows[0] ? mapFunding(rows[0]) : undefined
}

export async function dbInsertFunding(item: {
    id: string; accountId: string; linkedCardId: string
    amount: string; currency: string; fee: string
    status: string; challenge?: { type: string; clientSecret: string } | null
    processorReference?: string | null
    circlePaymentId?: string | null
    onChainStatus?: string | null
    destinationAddress?: string | null
    idempotencyKey: string; createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO card_funding_transactions
         (funding_id, account_id, linked_card_id, amount, currency, fee,
          status, challenge, processor_ref, circle_payment_id, on_chain_status,
          destination_address, idempotency_key, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$14)`,
        [item.id, item.accountId, item.linkedCardId, item.amount, item.currency, item.fee,
        item.status, item.challenge ? JSON.stringify(item.challenge) : null,
        item.processorReference ?? null, item.circlePaymentId ?? null,
        item.onChainStatus ?? null, item.destinationAddress ?? null,
        item.idempotencyKey, item.createdAt]
    )
    return item
}

export async function dbUpdateFundingStatus(id: string, status: string, processorReference?: string | null) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE card_funding_transactions
         SET status = $2,
             processor_ref = COALESCE($3, processor_ref),
             updated_at = NOW()
         WHERE funding_id = $1
         RETURNING *`,
        [id, status, processorReference ?? null]
    )
    return rows[0] ? mapFunding(rows[0]) : null
}

// Updates Circle USDC delivery fields on a funding transaction.
// Called when a Circle payment is initiated (sets circlePaymentId + onChainStatus = 'pending')
// and again when a Circle webhook confirms settlement (onChainStatus = 'confirmed' | 'failed').
export async function dbUpdateFundingCirclePayment(
    id: string,
    circlePaymentId: string | null,
    onChainStatus: string,
    transactionHash?: string | null
) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE card_funding_transactions
         SET circle_payment_id = COALESCE($2, circle_payment_id),
             on_chain_status   = $3,
             updated_at        = NOW()
         WHERE funding_id = $1
         RETURNING *`,
        [id, circlePaymentId ?? null, onChainStatus]
    )
    return rows[0] ? mapFunding(rows[0]) : null
}

// Looks up a funding transaction by its Circle payment ID.
// Used in the Circle webhook handler to find the record to update.
export async function dbGetFundingByCirclePaymentId(circlePaymentId: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM card_funding_transactions WHERE circle_payment_id = $1 LIMIT 1',
        [circlePaymentId]
    )
    return rows[0] ? mapFunding(rows[0]) : undefined
}

export async function dbUpdatePayoutStatus(id: string, status: string, processorReference?: string | null) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        `UPDATE card_payouts
         SET status = $2,
             processor_ref = COALESCE($3, processor_ref),
             updated_at = NOW()
         WHERE payout_id = $1
         RETURNING *`,
        [id, status, processorReference ?? null]
    )
    return rows[0] ? mapPayout(rows[0]) : null
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export async function dbGetPayout(id: string) {
    const pool = getPool()
    if (!pool) return null
    const { rows } = await pool.query(
        'SELECT * FROM card_payouts WHERE payout_id = $1',
        [id]
    )
    return rows[0] ? mapPayout(rows[0]) : undefined
}

export async function dbInsertPayout(item: {
    id: string; accountId: string; linkedCardId: string
    amount: string; currency: string; fee: string
    status: string; processorReference?: string | null
    idempotencyKey: string; createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO card_payouts
         (payout_id, account_id, linked_card_id, amount, currency, fee,
          status, processor_ref, idempotency_key, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [item.id, item.accountId, item.linkedCardId, item.amount, item.currency, item.fee,
        item.status, item.processorReference ?? null, item.idempotencyKey, item.createdAt]
    )
    return item
}

// ─── Webhook events ───────────────────────────────────────────────────────────

export async function dbInsertWebhookEvent(item: {
    id: string; type: string; accountId?: string; cardId?: string
    fundingId?: string; payoutId?: string; disputeId?: string; data: Record<string, unknown>; createdAt: string
}) {
    const pool = getPool()
    if (!pool) return null
    await pool.query(
        `INSERT INTO card_webhook_events
         (event_id, event_type, account_id, card_id, funding_id, payout_id, dispute_id, payload, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT (event_id) DO NOTHING`,
        [item.id, item.type, item.accountId ?? null, item.cardId ?? null,
        item.fundingId ?? null, item.payoutId ?? null, item.disputeId ?? null,
        JSON.stringify(item.data), item.createdAt]
    )
    return item
}

export async function dbListWebhookEvents(params: {
    since: Date; until?: Date | null; limit: number
}) {
    const pool = getPool()
    if (!pool) return null
    const values: unknown[] = [params.since, params.limit]
    let where = 'WHERE created_at >= $1'
    if (params.until) { where += ' AND created_at <= $3'; values.push(params.until) }

    const { rows } = await pool.query(
        `SELECT * FROM card_webhook_events ${where} ORDER BY created_at DESC LIMIT $2`,
        values
    )
    return rows.map(mapWebhookEvent)
}
