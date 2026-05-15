/**
 * cctp-db.ts — PostgreSQL persistence layer for CCTP transfer state.
 *
 * Follows the card-db.ts pattern:
 * - Null-safe when DATABASE_URL is absent (tests / local dev without DB).
 * - All mutations are idempotent.
 *
 * Depends on migration: gr/gr/db/migrations/011_cctp_transfers.sql
 */

import { Pool } from 'pg'

// ─── Pool singleton (shared with card-db pool logic) ─────────────────────────
const globalState = globalThis as typeof globalThis & { __grCctpDbPool?: Pool }

function getPool(): Pool | null {
    if (!process.env.DATABASE_URL) return null
    if (!globalState.__grCctpDbPool) {
        globalState.__grCctpDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30_000,
        })
    }
    return globalState.__grCctpDbPool
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CctpTransferStatus =
    | 'burn_pending'
    | 'burn_confirmed'
    | 'attestation_pending'
    | 'attestation_ready'
    | 'relay_pending'
    | 'minted'
    | 'vault_deposited'
    | 'failed'
    | 'expired'

export interface CctpTransfer {
    transferId: string
    walletAddress: string
    arbitrumAddress: string
    accountId: string | null
    sourceChain: 'ethereum' | 'base'
    sourceDomain: number
    destinationDomain: number
    amountUsdc: string
    burnTxHash: string | null
    burnBlock: number | null
    messageHash: string | null
    messageBytes: string | null
    attestation: string | null
    attestedAt: string | null
    relayTxHash: string | null
    relayBlock: number | null
    mintedAt: string | null
    vaultTxHash: string | null
    vaultDepositedAt: string | null
    status: CctpTransferStatus
    failureReason: string | null
    retryCount: number
    createdAt: string
    updatedAt: string
}

export interface CreateCctpTransferInput {
    walletAddress: string
    arbitrumAddress: string
    accountId?: string | null
    sourceChain: 'ethereum' | 'base'
    sourceDomain: number
    amountUsdc: string
}

export interface UpdateCctpTransferInput {
    status?: CctpTransferStatus
    burnTxHash?: string
    burnBlock?: number
    messageHash?: string
    messageBytes?: string
    attestation?: string
    attestedAt?: string
    relayTxHash?: string
    relayBlock?: number
    mintedAt?: string
    vaultTxHash?: string
    vaultDepositedAt?: string
    failureReason?: string
    retryCount?: number
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): CctpTransfer {
    return {
        transferId: row.transfer_id as string,
        walletAddress: row.wallet_address as string,
        arbitrumAddress: row.arbitrum_address as string,
        accountId: (row.account_id as string | null) ?? null,
        sourceChain: row.source_chain as 'ethereum' | 'base',
        sourceDomain: row.source_domain as number,
        destinationDomain: row.destination_domain as number,
        amountUsdc: String(row.amount_usdc),
        burnTxHash: (row.burn_tx_hash as string | null) ?? null,
        burnBlock: (row.burn_block as number | null) ?? null,
        messageHash: (row.message_hash as string | null) ?? null,
        messageBytes: (row.message_bytes as string | null) ?? null,
        attestation: (row.attestation as string | null) ?? null,
        attestedAt: row.attested_at instanceof Date ? row.attested_at.toISOString() : (row.attested_at as string | null) ?? null,
        relayTxHash: (row.relay_tx_hash as string | null) ?? null,
        relayBlock: (row.relay_block as number | null) ?? null,
        mintedAt: row.minted_at instanceof Date ? row.minted_at.toISOString() : (row.minted_at as string | null) ?? null,
        vaultTxHash: (row.vault_tx_hash as string | null) ?? null,
        vaultDepositedAt: row.vault_deposited_at instanceof Date ? row.vault_deposited_at.toISOString() : (row.vault_deposited_at as string | null) ?? null,
        status: row.status as CctpTransferStatus,
        failureReason: (row.failure_reason as string | null) ?? null,
        retryCount: row.retry_count as number,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at as string,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at as string,
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const cctpTransferStore = {

    async create(input: CreateCctpTransferInput): Promise<CctpTransfer | null> {
        const pool = getPool()
        if (!pool) return null

        const { rows } = await pool.query<Record<string, unknown>>(
            `INSERT INTO cctp_transfers
              (wallet_address, arbitrum_address, account_id, source_chain,
               source_domain, destination_domain, amount_usdc, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'burn_pending')
             RETURNING *`,
            [
                input.walletAddress.toLowerCase(),
                input.arbitrumAddress.toLowerCase(),
                input.accountId ?? null,
                input.sourceChain,
                input.sourceDomain,
                3, // Arbitrum domain
                input.amountUsdc,
            ],
        )
        return rows[0] ? mapRow(rows[0]) : null
    },

    async update(transferId: string, input: UpdateCctpTransferInput): Promise<CctpTransfer | null> {
        const pool = getPool()
        if (!pool) return null

        const setClauses: string[] = []
        const values: unknown[] = []
        let idx = 1

        const fieldMap: Record<keyof UpdateCctpTransferInput, string> = {
            status: 'status',
            burnTxHash: 'burn_tx_hash',
            burnBlock: 'burn_block',
            messageHash: 'message_hash',
            messageBytes: 'message_bytes',
            attestation: 'attestation',
            attestedAt: 'attested_at',
            relayTxHash: 'relay_tx_hash',
            relayBlock: 'relay_block',
            mintedAt: 'minted_at',
            vaultTxHash: 'vault_tx_hash',
            vaultDepositedAt: 'vault_deposited_at',
            failureReason: 'failure_reason',
            retryCount: 'retry_count',
        }

        for (const [key, col] of Object.entries(fieldMap) as [keyof UpdateCctpTransferInput, string][]) {
            if (input[key] !== undefined) {
                setClauses.push(`${col} = $${idx++}`)
                values.push(input[key])
            }
        }

        if (setClauses.length === 0) return this.getById(transferId)

        values.push(transferId)
        const { rows } = await pool.query<Record<string, unknown>>(
            `UPDATE cctp_transfers SET ${setClauses.join(', ')} WHERE transfer_id = $${idx} RETURNING *`,
            values,
        )
        return rows[0] ? mapRow(rows[0]) : null
    },

    async getById(transferId: string): Promise<CctpTransfer | null> {
        const pool = getPool()
        if (!pool) return null

        const { rows } = await pool.query<Record<string, unknown>>(
            'SELECT * FROM cctp_transfers WHERE transfer_id = $1',
            [transferId],
        )
        return rows[0] ? mapRow(rows[0]) : null
    },

    async getByBurnTxHash(burnTxHash: string): Promise<CctpTransfer | null> {
        const pool = getPool()
        if (!pool) return null

        const { rows } = await pool.query<Record<string, unknown>>(
            'SELECT * FROM cctp_transfers WHERE burn_tx_hash = $1',
            [burnTxHash.toLowerCase()],
        )
        return rows[0] ? mapRow(rows[0]) : null
    },

    /** Returns active (non-terminal) transfers awaiting attestation or relay. */
    async listPendingRelay(): Promise<CctpTransfer[]> {
        const pool = getPool()
        if (!pool) return []

        const { rows } = await pool.query<Record<string, unknown>>(
            `SELECT * FROM cctp_transfers
             WHERE status IN ('attestation_pending', 'attestation_ready', 'relay_pending')
             ORDER BY created_at ASC`,
        )
        return rows.map(mapRow)
    },

    async listByWallet(walletAddress: string, limit = 20): Promise<CctpTransfer[]> {
        const pool = getPool()
        if (!pool) return []

        const { rows } = await pool.query<Record<string, unknown>>(
            `SELECT * FROM cctp_transfers
             WHERE wallet_address = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [walletAddress.toLowerCase(), limit],
        )
        return rows.map(mapRow)
    },
}
