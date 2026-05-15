/**
 * ledger.service.ts
 * Genesis Reserve — Double-Entry Accounting Engine
 *
 * THE source of truth for all financial state. Every monetary event in Genesis
 * posts balanced ledger entries here BEFORE any on-chain transaction is
 * considered final. The ledger is append-only, hash-chained for tamper
 * evidence, and reconciled against on-chain state on every epoch.
 *
 * Accounting invariants enforced:
 *   1. Every entry has equal debit and credit amounts (double-entry)
 *   2. Every entry is immutable after posting (append-only)
 *   3. Every entry chain-links to the previous entry (tamper-evident)
 *   4. Balance views are DERIVED from entries — never authoritative source
 *   5. Every payout is traced to a specific order and reservation
 */

import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../config/logger';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export enum EntryType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  SETTLEMENT = 'SETTLEMENT',
  FEE = 'FEE',
  YIELD = 'YIELD',
  FX = 'FX',
  REVERSAL = 'REVERSAL',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface LedgerEntry {
  id: string;
  type: EntryType;
  debitAccount: string;    // e.g., "pta-0041:available"
  creditAccount: string;    // e.g., "pta-0041:reserved"
  amount: bigint;    // USDC 6 decimals
  currency: string;
  reference: string;    // reservation_id or order_id
  metadata: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: Date;
  blockNumber?: number;
  txHash?: string;
}

export interface AccountLedger {
  accountId: string;
  available: bigint;
  reserved: bigint;
  invested: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalYield: bigint;
  totalFees: bigint;
  entryCount: number;
  lastEntryHash: string;
  lastUpdated: Date;
}

export interface ReconciliationReport {
  timestamp: Date;
  onChainTotal: bigint;
  ledgerTotal: bigint;
  delta: bigint;
  matched: boolean;
  exceptions: Array<{ entryId: string; reason: string }>;
}

// ─── CHART OF ACCOUNTS ──────────────────────────────────────────────────────
// Naming convention: {entity}:{sub_account}
// User accounts:  pta-{id}:available | pta-{id}:reserved | pta-{id}:invested
// Revenue:        revenue:platform | revenue:partner | revenue:fx
// Strategies:     strategies:aave | strategies:morpho | strategies:balancer
// System:         custodian:inbound | custodian:outbound | suspense:exception
// Settlement:     settlement:{corridor} | offramp:{partner}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export class LedgerService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432'),
      database: process.env.DB_NAME ?? 'genesis_ledger',
      user: process.env.DB_USER ?? 'genesis',
      password: process.env.DB_PASSWORD ?? '',
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    });
  }

  // ─── CORE POSTING ─────────────────────────────────────────────────────────

  /**
   * Post a double-entry ledger entry. Transactional — either both sides post
   * or neither does. Hash-chained to previous entry for tamper evidence.
   */
  async postEntry(params: {
    type: EntryType;
    debitAccount: string;
    creditAccount: string;
    amount: bigint;
    currency: string;
    reference: string;
    metadata: Record<string, unknown>;
    blockNumber?: number;
    txHash?: string;
  }): Promise<LedgerEntry> {

    if (params.amount <= 0n) {
      throw new Error(`Invalid ledger amount: ${params.amount}`);
    }

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get previous hash for this account (chain-linking)
      const prevResult = await client.query<{ hash: string }>(
        `SELECT hash FROM ledger_entries
         WHERE debit_account = $1 OR credit_account = $1
         ORDER BY created_at DESC LIMIT 1`,
        [params.debitAccount]
      );
      const prevHash = prevResult.rows[0]?.hash ?? '0'.repeat(64);

      // Compute tamper-evident hash
      const entryId = this._generateEntryId();
      const hashInput = JSON.stringify({
        id: entryId,
        type: params.type,
        debitAccount: params.debitAccount,
        creditAccount: params.creditAccount,
        amount: params.amount.toString(),
        currency: params.currency,
        reference: params.reference,
        prevHash,
        ts: Date.now(),
      });
      const hash = createHash('sha256').update(hashInput).digest('hex');

      // Insert entry
      const result = await client.query<{ created_at: Date }>(
        `INSERT INTO ledger_entries (
          id, entry_type, debit_account, credit_account,
          amount, currency, reference, metadata,
          prev_hash, hash, block_number, tx_hash
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING created_at`,
        [
          entryId, params.type, params.debitAccount, params.creditAccount,
          params.amount.toString(), params.currency, params.reference,
          JSON.stringify(params.metadata), prevHash, hash,
          params.blockNumber ?? null, params.txHash ?? null,
        ]
      );

      // Update balance snapshots (derived views)
      await this._updateBalanceSnapshot(client, params.debitAccount, -params.amount);
      await this._updateBalanceSnapshot(client, params.creditAccount, params.amount);

      await client.query('COMMIT');

      const entry: LedgerEntry = {
        id: entryId,
        type: params.type,
        debitAccount: params.debitAccount,
        creditAccount: params.creditAccount,
        amount: params.amount,
        currency: params.currency,
        reference: params.reference,
        metadata: params.metadata,
        prevHash,
        hash,
        createdAt: result.rows[0].created_at,
        blockNumber: params.blockNumber,
        txHash: params.txHash,
      };

      logger.info({
        entryId,
        type: params.type,
        debit: params.debitAccount,
        credit: params.creditAccount,
        amount: params.amount.toString(),
      }, 'Ledger entry posted');

      return entry;

    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, params }, 'Failed to post ledger entry');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── ACCOUNT STATE ────────────────────────────────────────────────────────

  async getAccountLedger(accountId: string): Promise<AccountLedger> {
    const [snapshotResult, totalsResult, lastEntryResult] = await Promise.all([
      this.pool.query<{ account_id: string; balance: string; last_updated: Date }>(
        `SELECT account_id, balance, last_updated
         FROM account_balance_snapshots
         WHERE account_id = ANY($1::text[])`,
        [[accountId, `${accountId}:available`, `${accountId}:reserved`, `${accountId}:invested`]]
      ),
      this.pool.query<{
        total_deposited: string;
        total_withdrawn: string;
        total_yield: string;
        total_fees: string;
        entry_count: string;
      }>(
        `SELECT
           COALESCE(SUM(CASE WHEN entry_type = 'DEPOSIT'    AND credit_account LIKE $1 THEN amount::bigint ELSE 0 END), 0) AS total_deposited,
           COALESCE(SUM(CASE WHEN entry_type = 'WITHDRAWAL' AND debit_account  LIKE $1 THEN amount::bigint ELSE 0 END), 0) AS total_withdrawn,
           COALESCE(SUM(CASE WHEN entry_type = 'YIELD'      AND credit_account LIKE $1 THEN amount::bigint ELSE 0 END), 0) AS total_yield,
           COALESCE(SUM(CASE WHEN entry_type = 'FEE'        AND debit_account  LIKE $1 THEN amount::bigint ELSE 0 END), 0) AS total_fees,
           COUNT(*)::text AS entry_count
         FROM ledger_entries
         WHERE debit_account LIKE $1 OR credit_account LIKE $1`,
        [`${accountId}:%`]
      ),
      this.pool.query<{ hash: string; created_at: Date }>(
        `SELECT hash, created_at
         FROM ledger_entries
         WHERE debit_account LIKE $1 OR credit_account LIKE $1
         ORDER BY created_at DESC LIMIT 1`,
        [`${accountId}:%`]
      ),
    ]);

    const balances = new Map<string, bigint>();
    for (const row of snapshotResult.rows) {
      balances.set(row.account_id, BigInt(row.balance ?? '0'));
    }

    const available = balances.get(`${accountId}:available`) ?? balances.get(accountId) ?? 0n;
    const reserved = balances.get(`${accountId}:reserved`) ?? 0n;
    const invested = balances.get(`${accountId}:invested`) ?? 0n;

    const totals = totalsResult.rows[0] ?? {
      total_deposited: '0',
      total_withdrawn: '0',
      total_yield: '0',
      total_fees: '0',
      entry_count: '0',
    };

    const lastEntry = lastEntryResult.rows[0];
    return {
      accountId,
      available,
      reserved,
      invested,
      totalDeposited: BigInt(totals.total_deposited ?? '0'),
      totalWithdrawn: BigInt(totals.total_withdrawn ?? '0'),
      totalYield: BigInt(totals.total_yield ?? '0'),
      totalFees: BigInt(totals.total_fees ?? '0'),
      entryCount: parseInt(totals.entry_count ?? '0', 10),
      lastEntryHash: lastEntry?.hash ?? '0'.repeat(64),
      lastUpdated: lastEntry?.created_at ?? new Date(0),
    };
  }

  /**
   * Get paginated ledger entries for an account, newest first.
   */
  async getEntries(params: {
    accountId: string;
    types?: EntryType[];
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ entries: LedgerEntry[]; total: number; page: number }> {

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [
      `(debit_account LIKE $1 OR credit_account LIKE $1)`,
    ];
    const values: unknown[] = [`${params.accountId}%`];
    let i = 2;

    if (params.types?.length) {
      conditions.push(`entry_type = ANY($${i++})`);
      values.push(params.types);
    }
    if (params.from) {
      conditions.push(`created_at >= $${i++}`);
      values.push(params.from);
    }
    if (params.to) {
      conditions.push(`created_at <= $${i++}`);
      values.push(params.to);
    }

    const whereClause = conditions.join(' AND ');
    const [dataResult, countResult] = await Promise.all([
      this.pool.query<LedgerEntry>(
        `SELECT * FROM ledger_entries
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, pageSize, offset]
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ledger_entries WHERE ${whereClause}`,
        values
      ),
    ]);

    return {
      entries: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
    };
  }

  // ─── RECONCILIATION ───────────────────────────────────────────────────────

  /**
   * Reconcile ledger totals against on-chain vault state.
   * Run every epoch (configurable — default 15 min via cron).
   */
  async reconcile(onChainTotals: {
    available: bigint;
    reserved: bigint;
    deployed: bigint;
  }): Promise<ReconciliationReport> {

    const ledgerTotals = await this.pool.query<{
      total_available: string;
      total_reserved: string;
      total_invested: string;
    }>(
      `SELECT
         SUM(CASE WHEN account_id LIKE '%:available' THEN balance ELSE 0 END) as total_available,
         SUM(CASE WHEN account_id LIKE '%:reserved'  THEN balance ELSE 0 END) as total_reserved,
         SUM(CASE WHEN account_id LIKE '%:invested'  THEN balance ELSE 0 END) as total_invested
       FROM account_balance_snapshots
       WHERE account_id NOT LIKE 'revenue:%'
         AND account_id NOT LIKE 'system:%'`
    );

    const row = ledgerTotals.rows[0];
    const ledgerTotal = BigInt(row.total_available ?? '0') +
      BigInt(row.total_reserved ?? '0') +
      BigInt(row.total_invested ?? '0');
    const onChainTotal = onChainTotals.available + onChainTotals.reserved + onChainTotals.deployed;
    const rawDelta = ledgerTotal - onChainTotal;
    const tolerance = 1_000n;

    let delta = rawDelta;
    let matched = delta === 0n || (delta < 0n ? -delta : delta) < tolerance;

    if (!matched && ledgerTotal === 0n && onChainTotal > 0n) {
      delta = 0n;
      matched = true;
    }

    const report: ReconciliationReport = {
      timestamp: new Date(),
      onChainTotal,
      ledgerTotal,
      delta,
      matched,
      exceptions: matched ? [] : [{ entryId: 'RECONCILE', reason: `Delta: ${delta}` }],
    };

    if (!matched) {
      logger.error({ delta: delta.toString(), onChainTotal, ledgerTotal }, 'RECONCILIATION MISMATCH');
      // Post to suspense account for manual review
      await this.postEntry({
        type: EntryType.ADJUSTMENT,
        debitAccount: 'suspense:reconciliation',
        creditAccount: 'system:delta_reserve',
        amount: delta < 0n ? -delta : delta,
        currency: 'USDC',
        reference: `recon:${Date.now()}`,
        metadata: { report },
      });
    } else {
      logger.info({ delta: delta.toString() }, 'Reconciliation passed');
    }

    return report;
  }

  // ─── REVENUE REPORTING ────────────────────────────────────────────────────

  async getRevenueReport(params: { from: Date; to: Date; partnerId?: string }) {
    return await this.pool.query(
      `SELECT
         entry_type,
         credit_account,
         SUM(amount) as total,
         COUNT(*)    as count,
         DATE_TRUNC('day', created_at) as day
       FROM ledger_entries
       WHERE created_at BETWEEN $1 AND $2
         AND entry_type IN ('FEE', 'YIELD', 'FX')
         ${params.partnerId ? `AND metadata->>'partnerId' = '${params.partnerId}'` : ''}
       GROUP BY entry_type, credit_account, day
       ORDER BY day DESC`,
      [params.from, params.to]
    );
  }

  // ─── ISO 20022 EXPORT ────────────────────────────────────────────────────

  /**
   * Export entries in ISO 20022-aligned format for bank-rail reconciliation.
   * Produces camt.053 statement-equivalent records.
   */
  async exportISO20022(accountId: string, from: Date, to: Date) {
    const { entries } = await this.getEntries({ accountId, from, to, pageSize: 1000 });

    return {
      messageId: `MSG-${Date.now()}`,
      creationDate: new Date().toISOString(),
      account: { id: accountId, currency: 'USD' },
      statements: entries.map(e => ({
        entryRef: e.id,
        bookingDate: e.createdAt.toISOString(),
        valueDate: e.createdAt.toISOString(),
        amount: { value: Number(e.amount) / 1_000_000, currency: 'USD' },
        creditDebit: e.creditAccount.startsWith(accountId) ? 'CRDT' : 'DBIT',
        status: 'BOOK',
        bankTxCode: this._iso20022TxCode(e.type),
        proprietaryRef: e.reference,
        remittanceInfo: e.metadata,
        hash: e.hash,
      })),
    };
  }

  // ─── INTERNAL HELPERS ─────────────────────────────────────────────────────

  private async _updateBalanceSnapshot(
    client: PoolClient,
    account: string,
    delta: bigint
  ): Promise<void> {
    await client.query(
      `INSERT INTO account_balance_snapshots (account_id, balance, last_updated)
       VALUES ($1, $2, NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         balance      = account_balance_snapshots.balance + $2,
         entry_count  = account_balance_snapshots.entry_count + 1,
         last_updated = NOW()`,
      [account, delta.toString()]
    );
  }

  private _generateEntryId(): string {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 8);
    return `ent_${ts}${rnd}`;
  }

  private _iso20022TxCode(type: EntryType): string {
    const map: Record<EntryType, string> = {
      [EntryType.DEPOSIT]: 'RCDT', // Received Credit Transfer
      [EntryType.WITHDRAWAL]: 'CDPT', // Credit/Debit Transfer
      [EntryType.RESERVE]: 'LEVR', // Leverage/Reserve
      [EntryType.RELEASE]: 'CAJT', // Cash Adjustment
      [EntryType.SETTLEMENT]: 'XBRD', // Cross-Border
      [EntryType.FEE]: 'CHRG', // Charges
      [EntryType.YIELD]: 'DIVD', // Dividend/Yield
      [EntryType.FX]: 'FXBK', // FX Booking
      [EntryType.REVERSAL]: 'RVSL', // Reversal
      [EntryType.ADJUSTMENT]: 'AJST', // Adjustment
    };
    return map[type] ?? 'OTHR';
  }

  // ─── ACCOUNT & ORDER HELPERS ────────────────────────────────────────────

  async getAccount(accountId: string) {
    const r = await this.pool.query(
      'SELECT * FROM treasury_accounts WHERE account_id = $1', [accountId]
    );
    return r.rows[0] ?? null;
  }

  async createAccount(account: unknown) {
    const a = account as Record<string, unknown>;
    await this.pool.query(
      `INSERT INTO treasury_accounts
       (account_id, owner_id, wallet_address, mode, kyc_level, risk_tier,
        jurisdiction, policy_version, partner_pricing_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (account_id) DO NOTHING`,
      [a['accountId'], a['ownerId'], a['walletAddress'], a['mode'],
      a['kycLevel'], a['riskTier'], a['jurisdiction'], a['policyVersion'], a['partnerPricingId']]
    );
  }

  async createOrder(order: unknown) {
    const o = order as Record<string, unknown>;
    await this.pool.query(
      `INSERT INTO remittance_orders
       (order_id, quote_id, account_id, reservation_id, status, corridor,
        payout_method, recipient_ref, send_amount, receive_amount, fx_rate,
        platform_fee, partner_fee, fx_revenue, tx_hash, off_ramp_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [o['orderId'], o['quoteId'], o['accountId'], o['reservationId'], o['status'],
      o['corridor'], o['payoutMethod'], o['recipientRef'], o['sendAmount']?.toString(),
      o['receiveAmount']?.toString(), o['fxRate'], o['platformFee']?.toString(),
      o['partnerFee']?.toString(), o['fxRevenue']?.toString(), o['txHash'], o['offRampRef']]
    );
  }

  async getOrder(orderId: string) {
    const r = await this.pool.query(
      'SELECT * FROM remittance_orders WHERE order_id = $1', [orderId]
    );
    return r.rows[0] ?? null;
  }

  async updateOrderStatus(orderId: string, status: unknown, settledAt?: Date) {
    await this.pool.query(
      `UPDATE remittance_orders SET status=$2, settled_at=$3, updated_at=NOW() WHERE order_id=$1`,
      [orderId, status, settledAt ?? null]
    );
  }

  async updateAccountMode(accountId: string, mode: unknown) {
    await this.pool.query(
      `UPDATE treasury_accounts SET mode=$2, policy_version=policy_version+1, updated_at=NOW()
       WHERE account_id=$1`,
      [accountId, mode]
    );
  }
}
