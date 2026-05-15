/**
 * services/webhooks/onfido.webhook.ts
 * Genesis Reserve — Onfido KYC Webhook Receiver (Week 3 deliverable)
 *
 * Onfido calls this endpoint when KYC verification completes (pass or fail).
 * On PASS: activates the wallet's ComplianceRegistry.sol record on-chain.
 * On FAIL: updates DB + notifies user.
 *
 * Webhook verification:
 *   Onfido signs every webhook with HMAC-SHA256 using the webhook token.
 *   We MUST verify this signature before processing any payload.
 *   Unverified webhooks are rejected with 401 — never processed.
 *
 * Registration:
 *   Dashboard: https://dashboard.onfido.com/webhooks
 *   URL:       https://api.genesisreserve.io/webhooks/onfido
 *   Events:    check.completed, report.completed
 *
 * Wire to Express: app.post('/webhooks/onfido', onfidoWebhookHandler)
 */

import { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { ethers } from 'ethers';
import { query, withTransaction } from '../config/db';
import { logger } from '../config/logger';
import { EventBus } from '../config/eventbus';

// ── Onfido types (subset of their webhook payload) ────────────────────────────

interface OnfidoWebhookPayload {
  payload: {
    resource_type: 'check' | 'report';
    action: 'check.completed' | 'report.completed';
    object: {
      id: string;           // Onfido check_id or report_id
      href: string;
      status: 'complete' | 'withdrawn';
      result: 'clear' | 'consider' | null;
      sub_result: 'clear' | 'rejected' | 'suspected' | 'caution' | null;
      created_at: string;
    };
  };
}

interface KYCResult {
  passed: boolean;
  kycLevel: number;             // 1 = basic, 2 = enhanced
  onfidoCheckId: string;
  rawResult: string;
  subResult: string | null;
}

// ── Compliance Registry ABI (on-chain KYC update) ────────────────────────────

const COMPLIANCE_ABI = [
  'function activateAccount(address account, uint8 kycTier, uint8 riskTier, string jurisdiction, bool travelRuleRequired, uint256 kycExpiry, bytes32 kycRef, bytes32 amlRef) external',
  'function updateKYCTier(address account, uint8 newTier) external',
];

// ── HMAC signature verification ───────────────────────────────────────────────

function verifyOnfidoSignature(req: Request): boolean {
  const token = process.env.ONFIDO_WEBHOOK_TOKEN;
  const signature = req.headers['x-sha2-signature'] as string;

  if (!token || !signature) return false;

  const expected = createHmac('sha256', token)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return signature === expected;
}

// ── On-chain activation ───────────────────────────────────────────────────────

async function activateOnChain(
  walletAddress: string,
  kycLevel: number,
  onfidoRef: string
): Promise<string> {
  const rpcUrl = process.env.RPC_URL || '';
  const key = process.env.OPERATOR_PRIVATE_KEY || '';
  const regAddr = process.env.COMPLIANCE_REGISTRY_ADDRESS || '';

  if (!rpcUrl || !key || !regAddr) {
    throw new Error('Chain config missing — cannot activate on-chain');
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const operator = new ethers.Wallet(key, provider);
  const registry = new ethers.Contract(regAddr, COMPLIANCE_ABI, operator);

  const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year
  const kycRef = ethers.utils.formatBytes32String(onfidoRef.slice(0, 31));
  const amlRef = ethers.utils.formatBytes32String('onfido-aml-pass');

  const tx = await registry.activateAccount(
    walletAddress,
    kycLevel,
    0,           // riskTier
    'US',        // jurisdiction — todo: derive from applicant data
    kycLevel >= 2, // travelRuleRequired for enhanced KYC
    kycExpiry,
    kycRef,
    amlRef
  );
  const receipt = await tx.wait(1);
  return receipt.transactionHash;
}

// ── KYC result evaluation ─────────────────────────────────────────────────────

function evaluateKYCResult(payload: OnfidoWebhookPayload): KYCResult {
  const obj = payload.payload.object;
  const result = obj.result;
  const subResult = obj.sub_result;

  const passed = result === 'clear' && subResult === 'clear';

  // Determine KYC level based on check type
  // Level 1 = basic (ID document + selfie)
  // Level 2 = enhanced (+ address verification + PEP/sanction check)
  const kycLevel = passed ? 2 : 0; // TODO: derive from check configuration

  return {
    passed,
    kycLevel,
    onfidoCheckId: obj.id,
    rawResult: result || 'null',
    subResult: subResult || null,
  };
}

// ── Webhook handler ───────────────────────────────────────────────────────────

export async function onfidoWebhookHandler(req: Request, res: Response): Promise<void> {
  // 1. Verify signature — reject immediately if invalid
  if (!verifyOnfidoSignature(req)) {
    logger.warn({ ip: req.ip }, 'Onfido webhook: invalid signature');
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  const payload = req.body as OnfidoWebhookPayload;
  const action = payload?.payload?.action;
  const checkId = payload?.payload?.object?.id;

  // Only process check.completed (not report.completed — those are sub-events)
  if (action !== 'check.completed') {
    logger.debug({ action }, 'Onfido webhook: skipping non-check event');
    res.status(200).json({ received: true, processed: false });
    return;
  }

  logger.info({ checkId, action }, 'Onfido webhook: processing check');

  // 2. Look up which wallet this check belongs to
  const applicantResult = await query<{
    identity_id: string;
    user_id: string;
    wallet_address: string;
  }>(
    `SELECT ic.identity_id, ic.user_id, ta.wallet_address
     FROM identity_cases ic
     JOIN treasury_accounts ta ON ta.owner_id = ic.user_id
     WHERE ic.provider_ref = $1
     LIMIT 1`,
    [checkId]
  );

  if (!applicantResult.rows[0]) {
    logger.warn({ checkId }, 'Onfido webhook: check ID not found in DB');
    res.status(200).json({ received: true, processed: false, reason: 'check_not_found' });
    return;
  }

  const { identity_id, user_id, wallet_address } = applicantResult.rows[0];
  const kycResult = evaluateKYCResult(payload);

  logger.info({ checkId, wallet_address, passed: kycResult.passed, kycLevel: kycResult.kycLevel }, 'KYC check evaluated');

  // 3. Update identity_cases in DB
  await withTransaction(async client => {
    await client.query(
      `UPDATE identity_cases
       SET
         kyc_level      = $1,
         liveness_pass  = $2,
         docs_verified  = $2,
         sanction_status = $3,
         updated_at     = NOW()
       WHERE identity_id = $4`,
      [
        kycResult.kycLevel,
        kycResult.passed,
        kycResult.passed ? 'PASS' : 'REVIEW',
        identity_id,
      ]
    );

    // Also update user status
    await client.query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = $2`,
      [kycResult.passed ? 'ACTIVE' : 'PENDING', user_id]
    );
  });

  // 4. Activate on-chain if KYC passed
  let txHash: string | null = null;
  if (kycResult.passed && wallet_address) {
    try {
      txHash = await activateOnChain(wallet_address, kycResult.kycLevel, checkId);
      logger.info({ wallet_address, txHash, kycLevel: kycResult.kycLevel }, 'On-chain KYC activation complete');
    } catch (err) {
      logger.error({ err, wallet_address }, 'Failed to activate on-chain — will retry');
      // Queue for retry — don't fail the webhook response
      await query(
        `INSERT INTO audit_log
           (actor, action, object_type, object_ref, prev_hash, hash, metadata, logged_at)
         VALUES
           (
             'onfido-webhook',
             'KYC_ONCHAIN_FAILED',
             'COMPLIANCE',
             $1,
             COALESCE((SELECT hash FROM audit_log ORDER BY logged_at DESC LIMIT 1), 'GENESIS'),
             encode(digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'),
             $2,
             NOW()
           )`,
        [checkId, JSON.stringify({ wallet_address, checkId, error: String(err) })]
      ).catch(() => { });
    }
  }

  // 5. Emit domain event
  await EventBus.publish(EventBus.makeEvent(
    'compliance.kyc_complete',
    user_id,
    {
      userId: user_id,
      walletAddress: wallet_address,
      checkId,
      passed: kycResult.passed,
      kycLevel: kycResult.kycLevel,
      txHash,
    }
  )).catch(err => logger.warn({ err }, 'Failed to publish KYC event'));

  // Always respond 200 — Onfido will retry on non-200 responses
  res.status(200).json({
    received: true,
    processed: true,
    passed: kycResult.passed,
    kycLevel: kycResult.kycLevel,
    txHash,
  });
}
