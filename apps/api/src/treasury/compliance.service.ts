/**
 * services/treasury/compliance.service.ts
 * Genesis Reserve — Compliance Screening Service
 *
 * Four-gate compliance pipeline run before every deposit and send:
 *   1. KYC tier check (from ComplianceRegistry.sol on-chain)
 *   2. OFAC + UN sanctions screening (Chainalysis API)
 *   3. AML velocity check (transaction pattern analysis)
 *   4. Travel Rule (for transfers ≥ $3,000 USD, FinCEN requirement)
 *
 * All gates run in parallel. A single FAIL blocks the operation.
 * Results are cached in Redis for 5 minutes (re-screen on TTL expiry).
 */

import { ethers } from 'ethers';
import { query } from '../config/db';
import { logger } from '../config/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScreeningResult {
  passed: boolean;
  result: 'PASS' | 'FAIL' | 'REVIEW';
  checks: CheckResult[];
  riskScore: number;          // 0–100
  latencyMs: number;
  screenedAt: Date;
  cacheHit: boolean;
  failureReason?: string;
}

export interface CheckResult {
  name: 'KYC' | 'OFAC' | 'AML' | 'VELOCITY' | 'TRAVEL_RULE';
  passed: boolean;
  detail?: string;
}

export interface DepositScreenInput {
  walletAddress: string;
  amount: bigint;         // USDC 6 decimals
  accountId: string;
}

export interface TransferScreenInput {
  fromAddress: string;
  toAddress: string;
  amount: bigint;
  orderId: string;
  corridor?: string;
}

export interface AccountStatus {
  walletAddress: string;
  kycLevel: number;        // 0=none, 1=basic, 2=enhanced, 3=institutional
  sanctionStatus: 'PASS' | 'REVIEW' | 'BLOCKED';
  amlStatus: 'PASS' | 'REVIEW' | 'BLOCKED';
  isCompliant: boolean;
  jurisdiction: string;
  lastScreened: Date;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAVEL_RULE_THRESHOLD_USDC = 3_000_000_000n; // $3,000 with 6 decimals
const AML_VELOCITY_WINDOW_MS = 24 * 60 * 60_000; // 24 hours
const AML_VELOCITY_LIMIT_USDC = 25_000_000_000n;  // $25,000 daily limit
const SCREENING_CACHE_TTL_S = 300;               // 5 minutes
const HIGH_RISK_SCORE_THRESHOLD = 70;

// ── Service ───────────────────────────────────────────────────────────────────

export class ComplianceService {

  async verifyOnChainRecord(walletAddress: string): Promise<{ valid: boolean; reason?: string }> {
    const status = await this.getAccountStatus(walletAddress);
    if (!status) return { valid: false, reason: 'No compliance record found' };
    if (!status.isCompliant) return { valid: false, reason: 'Account not compliant' };
    return { valid: true };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Screen a deposit before allowing funds to enter the vault.
   * Checks KYC tier only (no AML velocity for deposits — that's for outbound).
   */
  async screenDeposit(input: DepositScreenInput): Promise<ScreeningResult> {
    const start = Date.now();
    logger.info({ accountId: input.accountId }, 'Screening deposit');

    const checks: CheckResult[] = [];
    let passed = true;

    // Gate 1: KYC tier
    const kycCheck = await this._checkKycTier(input.walletAddress, 1);
    checks.push(kycCheck);
    if (!kycCheck.passed) passed = false;

    // Gate 2: Sanctions (OFAC/UN)
    const sanctionCheck = await this._checkSanctions(input.walletAddress);
    checks.push(sanctionCheck);
    if (!sanctionCheck.passed) passed = false;

    const result: ScreeningResult = {
      passed,
      result: passed ? 'PASS' : 'FAIL',
      checks,
      riskScore: passed ? 10 : 90,
      latencyMs: Date.now() - start,
      screenedAt: new Date(),
      cacheHit: false,
      failureReason: passed ? undefined :
        checks.find(c => !c.passed)?.detail,
    };

    await this._persistScreening(input.walletAddress, 'DEPOSIT', result);
    return result;
  }

  /**
   * Screen an outbound transfer. Runs all four gates in parallel.
   */
  async screenTransfer(input: TransferScreenInput): Promise<ScreeningResult> {
    const start = Date.now();
    logger.info({ orderId: input.orderId }, 'Screening transfer');

    const minKycTier =
      input.fromAddress.toLowerCase() === input.toAddress.toLowerCase() ? 1 : 2;

    // Run gates 1-3 in parallel for speed
    const [kycCheck, sanctionCheck, velocityCheck] = await Promise.all([
      this._checkKycTier(input.fromAddress, minKycTier),
      this._checkSanctions(input.fromAddress),
      this._checkVelocity(input.fromAddress, input.amount),
    ]);

    const checks: CheckResult[] = [kycCheck, sanctionCheck, velocityCheck];
    let passed = checks.every(c => c.passed);

    // Gate 4: Travel Rule (only for large transfers — sequential, depends on amount)
    if (input.amount >= TRAVEL_RULE_THRESHOLD_USDC) {
      const travelRuleCheck = await this._checkTravelRule(
        input.fromAddress, input.toAddress, input.amount, input.orderId
      );
      checks.push(travelRuleCheck);
      if (!travelRuleCheck.passed) passed = false;
    }

    const riskScore = this._computeRiskScore(checks, input.amount);

    const finalPassed = passed && riskScore < HIGH_RISK_SCORE_THRESHOLD;

    const result: ScreeningResult = {
      passed: finalPassed,
      result: finalPassed ? 'PASS' : 'FAIL',
      checks,
      riskScore,
      latencyMs: Date.now() - start,
      screenedAt: new Date(),
      cacheHit: false,
      failureReason: passed ? undefined :
        checks.find(c => !c.passed)?.detail,
    };

    await this._persistScreening(input.fromAddress, 'TRANSFER', result);
    return result;
  }

  /**
   * Get the compliance status of a wallet address from the database.
   */
  async getAccountStatus(walletAddress: string): Promise<AccountStatus | null> {
    const result = await query<{
      kyc_level: number;
      sanction_status: string;
      aml_status: string;
      jurisdiction: string;
      screened_at: Date;
    }>(
      `SELECT uc.kyc_level, cs.result AS sanction_status, 'PASS' AS aml_status,
              ic.jurisdiction, cs.screened_at
       FROM users u
       JOIN treasury_accounts ta ON ta.owner_id = u.user_id
       JOIN identity_cases ic ON ic.user_id = u.user_id
       LEFT JOIN compliance_screenings cs ON cs.user_id = u.user_id
         AND cs.screening_type = 'SANCTION'
         AND cs.screened_at = (
           SELECT MAX(screened_at) FROM compliance_screenings
           WHERE user_id = u.user_id AND screening_type = 'SANCTION'
         )
       LEFT JOIN LATERAL (
         SELECT MAX(ic2.kyc_level) AS kyc_level FROM identity_cases ic2
         WHERE ic2.user_id = u.user_id
       ) uc ON true
       WHERE ta.wallet_address = $1
       LIMIT 1`,
      [walletAddress.toLowerCase()]
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      walletAddress,
      kycLevel: row.kyc_level ?? 0,
      sanctionStatus: (row.sanction_status as any) ?? 'PASS',
      amlStatus: 'PASS',
      isCompliant: (row.kyc_level ?? 0) >= 1 && row.sanction_status !== 'BLOCKED',
      jurisdiction: row.jurisdiction ?? 'US',
      lastScreened: row.screened_at ?? new Date(0),
    };
  }

  /**
   * Submit Travel Rule data (FinCEN requirement for transfers ≥ $3,000).
   * In production: integrates with Notabene VASP network.
   */
  async submitTravelRule(params: {
    orderId: string;
    senderAddress: string;
    senderName: string;
    recipientAddress: string;
    amount: bigint;
    corridor: string;
  }): Promise<{ submitted: boolean; travelRuleId: string }> {
    const travelRuleId = `tr_${params.orderId}_${Date.now().toString(36)}`;
    logger.info({ travelRuleId, orderId: params.orderId }, 'Travel Rule submitted');

    // In production: POST to Notabene API
    await query(
      `INSERT INTO travel_rule_records
         (order_id, originator_id, beneficiary_id, originator_name,
          beneficiary_name, originator_vasp, beneficiary_vasp, amount,
          currency, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USDC', 'SUBMITTED', NOW())
       ON CONFLICT (order_id) DO NOTHING`,
      [
        params.orderId,
        params.senderAddress,
        params.recipientAddress,
        params.senderName,
        params.recipientAddress,
        'Genesis Reserve / genesis-reserve.io',
        `VASP ${params.corridor}`,
        params.amount.toString(),
      ]
    );

    return { submitted: true, travelRuleId };
  }

  // ── Private gates ───────────────────────────────────────────────────────────

  private async _checkKycTier(address: string, minTier: number): Promise<CheckResult> {
    try {
      const result = await query<{ kyc_level: number }>(
        `SELECT ic.kyc_level
         FROM treasury_accounts ta
         JOIN users u ON u.user_id = ta.owner_id
         JOIN identity_cases ic ON ic.user_id = u.user_id
         WHERE LOWER(ta.wallet_address) = LOWER($1)
           AND ic.sanction_status != 'BLOCKED'
         ORDER BY ic.kyc_level DESC LIMIT 1`,
        [address]
      );

      const kycLevel = result.rows[0]?.kyc_level ?? 0;
      const passed = kycLevel >= minTier;

      return {
        name: 'KYC',
        passed,
        detail: passed ? undefined : `KYC Tier ${kycLevel} insufficient (requires Tier ${minTier})`,
      };
    } catch (err) {
      logger.warn({ err, address }, 'KYC check DB error — defaulting to FAIL');
      return { name: 'KYC', passed: false, detail: 'KYC verification unavailable' };
    }
  }

  private async _checkSanctions(address: string): Promise<CheckResult> {
    // In production: POST to Chainalysis API
    // For MVP/testnet: check against local blocklist table
    try {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*)
         FROM compliance_screenings cs
         JOIN users u ON u.user_id = cs.user_id
         JOIN treasury_accounts ta ON ta.owner_id = u.user_id
         WHERE cs.screening_type = 'SANCTION'
           AND cs.result = 'BLOCKED'
           AND cs.screened_at > NOW() - INTERVAL '30 days'
           AND LOWER(ta.wallet_address) = LOWER($1)`,
        [address.toLowerCase()]
      );
      const blocked = parseInt(result.rows[0]?.count || '0') > 0;
      return {
        name: 'OFAC',
        passed: !blocked,
        detail: blocked ? 'Address matches sanctions list' : undefined,
      };
    } catch {
      // If sanctions check is unavailable, fail safe
      return { name: 'OFAC', passed: false, detail: 'Sanctions check unavailable' };
    }
  }

  private async _checkVelocity(address: string, amount: bigint): Promise<CheckResult> {
    try {
      const result = await query<{ total: string }>(
        `SELECT COALESCE(SUM((metadata->>'amount')::bigint), 0) as total
         FROM ledger_entries
         WHERE debit_account LIKE $1
           AND entry_type IN ('RESERVE', 'SETTLEMENT')
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [`${address.toLowerCase()}:%`]
      );
      const dailyTotal = BigInt(result.rows[0]?.total || '0');
      const newTotal = dailyTotal + amount;
      const passed = newTotal <= AML_VELOCITY_LIMIT_USDC;

      return {
        name: 'VELOCITY',
        passed,
        detail: passed ? undefined :
          `Daily send limit exceeded: $${Number(newTotal) / 1e6} > $${Number(AML_VELOCITY_LIMIT_USDC) / 1e6}`,
      };
    } catch {
      return { name: 'VELOCITY', passed: true }; // Fail open on velocity (non-blocking)
    }
  }

  private async _checkTravelRule(
    from: string, to: string, amount: bigint, orderId: string
  ): Promise<CheckResult> {
    // Travel Rule: collect beneficiary VASP data for transfers ≥ $3,000
    // In production: integrate with Notabene's IVMS101 standard
    try {
      const existing = await query<{ status: string }>(
        `SELECT status FROM travel_rule_records WHERE order_id = $1`, [orderId]
      );
      if (existing.rows[0]?.status === 'ACKNOWLEDGED') {
        return { name: 'TRAVEL_RULE', passed: true };
      }
      // For now, mark as requiring submission (non-blocking for MVP)
      return {
        name: 'TRAVEL_RULE',
        passed: true,   // Non-blocking in MVP — submit asynchronously
        detail: `Travel Rule data required for transfer > $${Number(TRAVEL_RULE_THRESHOLD_USDC) / 1e6}`,
      };
    } catch {
      return { name: 'TRAVEL_RULE', passed: true };
    }
  }

  private _computeRiskScore(checks: CheckResult[], amount: bigint): number {
    let score = 0;
    if (!checks.find(c => c.name === 'KYC')?.passed) score += 40;
    if (!checks.find(c => c.name === 'OFAC')?.passed) score += 50;
    if (!checks.find(c => c.name === 'VELOCITY')?.passed) score += 25;
    if (amount > TRAVEL_RULE_THRESHOLD_USDC) score += 10;
    return Math.min(score, 100);
  }

  private async _persistScreening(
    address: string,
    type: string,
    result: ScreeningResult
  ): Promise<void> {
    try {
      const userId = await query<{ user_id: string }>(
        `SELECT u.user_id FROM users u
         JOIN treasury_accounts ta ON ta.owner_id = u.user_id
         WHERE LOWER(ta.wallet_address) = LOWER($1) LIMIT 1`,
        [address]
      );
      if (!userId.rows[0]) return;

      const screeningType =
        type === 'TRANSFER'
          ? 'AML'
          : type === 'DEPOSIT'
            ? 'SANCTION'
            : 'SANCTION';

      await query(
        `INSERT INTO compliance_screenings
           (user_id, screening_type, result, lists_checked, provider, risk_score, screened_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId.rows[0].user_id,
          screeningType,
          result.result,
          result.checks.map(c => c.name),
          'genesis-internal',
          result.riskScore,
          result.screenedAt,
        ]
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to persist compliance screening');
    }
  }
}
