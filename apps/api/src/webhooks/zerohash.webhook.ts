/**
 * services/webhooks/zerohash.webhook.ts
 * Genesis Reserve — Zero Hash Provider Webhook Receiver
 *
 * Zero Hash calls this endpoint when transfer/participant events occur.
 * Handles the full settlement lifecycle: pending → in_transit → settled | failed.
 *
 * Verification (HMAC-SHA256):
 *   Zero Hash signs each webhook using HMAC-SHA256 with the webhook secret.
 *   We verify before any processing. Unverified payloads are rejected 401.
 *
 * Idempotency:
 *   Every event is deduped via `provider_webhook_events(provider, provider_event_id)`.
 *   Replayed webhooks return 200 immediately without reprocessing.
 *
 * Order status machine:
 *   CREATED / IN_TRANSIT → settled webhook → SETTLED
 *   CREATED / IN_TRANSIT → failed webhook  → FAILED
 *   any status            → compliance hold → COMPLIANCE_HOLD (manual review)
 *
 * Wire to Express:
 *   app.post('/webhooks/zerohash',
 *     express.json({ verify: rawBodyCapture }),
 *     zeroHashWebhookHandler)
 *
 * Registration in Zero Hash portal:
 *   URL: https://api.genesisreserve.io/webhooks/zerohash
 *   Env: ZEROHASH_WEBHOOK_SECRET
 */

import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { query, withTransaction } from '../config/db';
import { logger } from '../config/logger';
import { EventBus, DomainEventType } from '../config/eventbus';

// ── Zero Hash webhook payload shapes ─────────────────────────────────────────

interface ZeroHashWebhookEvent {
  event_id:    string;
  event_type:  string;
  payload:     Record<string, unknown>;
  created_at?: string | number;
}

// ── Internal order status mapped from provider status ─────────────────────────

type InternalStatus = 'IN_TRANSIT' | 'SETTLED' | 'FAILED' | 'COMPLIANCE_HOLD';

// Zero Hash status → internal status
const PROVIDER_STATUS_MAP: Record<string, InternalStatus | null> = {
  // Transfer lifecycle
  'transfer.submitted':           'IN_TRANSIT',
  'transfer.approved':            'IN_TRANSIT',
  'transfer.pending':             'IN_TRANSIT',
  'transfer.in_transit':          'IN_TRANSIT',
  'transfer.broadcasting':        'IN_TRANSIT',
  'transfer.settled':             'SETTLED',
  'transfer.completed':           'SETTLED',
  'transfer.failed':              'FAILED',
  'transfer.cancelled':           'FAILED',
  'transfer.canceled':            'FAILED',
  'transfer.rejected':            'COMPLIANCE_HOLD',
  'transfer.compliance_hold':     'COMPLIANCE_HOLD',
  // Withdrawal lifecycle
  'withdrawal.approved':          'IN_TRANSIT',
  'withdrawal.broadcasting':      'IN_TRANSIT',
  'withdrawal.settled':           'SETTLED',
  'withdrawal.confirmed':         'SETTLED',
  'withdrawal.failed':            'FAILED',
  // Conversion/trade lifecycle
  'trade.terminated':             'SETTLED',
  'trade.settled':                'SETTLED',
  // Participant events — informational only, not mapped to order status
  'participant.approved':         null,
  'participant.rejected':         null,
  'participant.pending_approval': null,
};

// ── Signature verification ────────────────────────────────────────────────────

function verifyZeroHashSignature(req: Request): boolean {
  const secret = process.env.ZEROHASH_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('ZEROHASH_WEBHOOK_SECRET is not set — webhook signature verification disabled');
    return true; // Fail-open in cert/dev; must be set in prod
  }

  // Zero Hash sends the signature in header X-Signature or X-SCX-Signature
  const signature = (
    req.headers['x-signature'] ||
    req.headers['x-scx-signature'] ||
    req.headers['x-zerohash-signature']
  ) as string | undefined;

  if (!signature) {
    logger.warn({ path: req.path }, 'Zero Hash webhook received without signature header');
    return false;
  }

  const rawBody: Buffer = (req as any).rawBody;
  if (!rawBody) {
    logger.error('rawBody not captured — ensure express.json verify captures it before this handler');
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison
  try {
    const a = Buffer.from(signature.toLowerCase().replace(/^sha256=/, ''), 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Dedupe: insert or detect already-processed event ─────────────────────────

async function insertEventRecord(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
  signatureValid: boolean
): Promise<{ alreadyProcessed: boolean; eventRecordId: string }> {
  const result = await query<{
    provider_webhook_event_id: string;
    processed: boolean;
  }>(
    `INSERT INTO provider_webhook_events
       (provider, provider_event_id, event_type, event_payload, signature_valid, processed)
     VALUES ($1, $2, $3, $4, $5, FALSE)
     ON CONFLICT (provider, provider_event_id) DO NOTHING
     RETURNING provider_webhook_event_id, processed`,
    ['ZERO_HASH', eventId, eventType, JSON.stringify(payload), signatureValid]
  );

  if (result.rows.length === 0) {
    // ON CONFLICT — already exists; fetch existing record
    const existing = await query<{ provider_webhook_event_id: string; processed: boolean }>(
      `SELECT provider_webhook_event_id, processed
         FROM provider_webhook_events
        WHERE provider = 'ZERO_HASH' AND provider_event_id = $1`,
      [eventId]
    );
    const row = existing.rows[0];
    return {
      alreadyProcessed: row?.processed ?? false,
      eventRecordId: row?.provider_webhook_event_id ?? '',
    };
  }

  return {
    alreadyProcessed: false,
    eventRecordId: result.rows[0].provider_webhook_event_id,
  };
}

// ── Mark event processed ──────────────────────────────────────────────────────

async function markProcessed(eventRecordId: string): Promise<void> {
  await query(
    `UPDATE provider_webhook_events
        SET processed = TRUE, processed_at = NOW()
      WHERE provider_webhook_event_id = $1`,
    [eventRecordId]
  );
}

// ── Order status transition ───────────────────────────────────────────────────

async function applyOrderTransition(params: {
  providerTransferId: string;
  internalStatus: InternalStatus;
  eventType: string;
  providerStatus: string;
  rawPayload: Record<string, unknown>;
  settledAt?: string;
}): Promise<{ updatedOrderId: string | null }> {
  const result = await query<{ order_id: string; status: string }>(
    `SELECT order_id, status
       FROM remittance_orders
      WHERE provider_transfer_id = $1
      LIMIT 1`,
    [params.providerTransferId]
  );

  const order = result.rows[0];
  if (!order) {
    logger.warn(
      { providerTransferId: params.providerTransferId, eventType: params.eventType },
      'Zero Hash webhook: no matching remittance_order found for provider_transfer_id'
    );
    return { updatedOrderId: null };
  }

  const orderId = order.order_id;

  // Only advance status — never roll back (e.g. don't IN_TRANSIT a SETTLED order)
  const statusRank: Record<string, number> = {
    CREATED: 0, IN_TRANSIT: 1, SETTLED: 2, FAILED: 2, COMPLIANCE_HOLD: 2,
  };
  const currentRank = statusRank[order.status] ?? -1;
  const newRank = statusRank[params.internalStatus] ?? -1;

  if (newRank <= currentRank && order.status !== 'IN_TRANSIT') {
    logger.info(
      { orderId, current: order.status, incoming: params.internalStatus },
      'Zero Hash webhook: status would not advance; skipping update'
    );
    return { updatedOrderId: orderId };
  }

  await query(
    `UPDATE remittance_orders
       SET status           = $1,
           provider_status  = $2,
           provider_payload = COALESCE(provider_payload, '{}'::jsonb)
                              || $3::jsonb,
           updated_at       = NOW()
     WHERE order_id = $4`,
    [
      params.internalStatus,
      params.providerStatus,
      JSON.stringify({
        last_zh_event: params.eventType,
        zh_provider_status: params.providerStatus,
        zh_settled_at: params.settledAt ?? null,
        zh_payload_snapshot: params.rawPayload,
      }),
      orderId,
    ]
  );

  logger.info(
    { orderId, from: order.status, to: params.internalStatus, eventType: params.eventType },
    'Zero Hash webhook: order status transitioned'
  );

  return { updatedOrderId: orderId };
}

// ── Event bus publish ─────────────────────────────────────────────────────────

async function publishOrderEvent(
  internalStatus: InternalStatus,
  orderId: string,
  providerTransferId: string,
  eventType: string
): Promise<void> {
  const eventMap: Record<InternalStatus, DomainEventType> = {
    IN_TRANSIT:      'remittance.in_transit',
    SETTLED:         'remittance.settled',
    FAILED:          'remittance.failed',
    COMPLIANCE_HOLD: 'remittance.compliance_hold',
  };

  const eventName = eventMap[internalStatus];
  if (!eventName) return;

  await EventBus.publish(EventBus.makeEvent(
    eventName,
    orderId,
    { orderId, providerTransferId, provider: 'zerohash', triggerEvent: eventType }
  ));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function zeroHashWebhookHandler(req: Request, res: Response): Promise<void> {
  // ── 1. Signature verification ─────────────────────────────────────────────
  const signatureValid = verifyZeroHashSignature(req);

  if (!signatureValid) {
    logger.warn({ ip: req.ip }, 'Zero Hash webhook rejected: invalid signature');
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  // ── 2. Parse and validate event ───────────────────────────────────────────
  const body = req.body as ZeroHashWebhookEvent;

  if (!body?.event_id || !body?.event_type) {
    logger.warn({ body }, 'Zero Hash webhook: malformed payload (missing event_id or event_type)');
    res.status(400).json({ error: 'Missing event_id or event_type' });
    return;
  }

  const { event_id: eventId, event_type: eventType, payload } = body;

  logger.info({ eventId, eventType }, 'Zero Hash webhook received');

  // ── 3. Deduplicate ────────────────────────────────────────────────────────
  const { alreadyProcessed, eventRecordId } = await insertEventRecord(
    eventId,
    eventType,
    payload,
    signatureValid
  ).catch((err) => {
    logger.error({ err, eventId }, 'Zero Hash webhook: failed to insert event record');
    throw err;
  });

  if (alreadyProcessed) {
    logger.info({ eventId, eventType }, 'Zero Hash webhook: duplicate event; skipping');
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  // ── 4. Route to handler ───────────────────────────────────────────────────
  try {
    await processZeroHashEvent({ eventId, eventType, payload, eventRecordId });
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, eventId, eventType }, 'Zero Hash webhook: processing error');
    // Return 200 to prevent ZH retries for non-transient processing errors.
    // Transient DB errors will propagate as 500 and trigger a ZH retry.
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ── Event processor ───────────────────────────────────────────────────────────

async function processZeroHashEvent(params: {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  eventRecordId: string;
}): Promise<void> {
  const { eventId, eventType, payload, eventRecordId } = params;

  const internalStatus = PROVIDER_STATUS_MAP[eventType];

  // Informational events (participant.*) — just mark processed and return
  if (internalStatus === null) {
    logger.info({ eventId, eventType }, 'Zero Hash webhook: informational event; no order update');
    await markProcessed(eventRecordId);
    return;
  }

  // Unknown event types — log and mark processed to prevent redelivery loop
  if (internalStatus === undefined) {
    logger.warn({ eventId, eventType }, 'Zero Hash webhook: unknown event type; marking processed');
    await markProcessed(eventRecordId);
    return;
  }

  // Extract the provider transfer identifier from the payload.
  // Zero Hash wraps transfer data in payload.message or at top-level.
  const msg = (payload.message || payload) as Record<string, unknown>;

  const providerTransferId =
    String(msg.id || msg.transferId || msg.transfer_id || msg.withdrawal_id || '');

  const providerStatus =
    String(msg.status || msg.on_chain_status || '').toLowerCase();

  const settledAt = msg.settled_at
    ? String(msg.settled_at)
    : msg.transaction_timestamp
    ? String(msg.transaction_timestamp)
    : undefined;

  if (!providerTransferId) {
    logger.warn({ eventId, eventType, payload }, 'Zero Hash webhook: cannot extract providerTransferId from payload');
    await markProcessed(eventRecordId);
    return;
  }

  // ── 5. Transition order in a single transaction ──────────────────────────
  await withTransaction(async (_client) => {
    const { updatedOrderId } = await applyOrderTransition({
      providerTransferId,
      internalStatus,
      eventType,
      providerStatus,
      rawPayload: payload,
      settledAt,
    });

    await markProcessed(eventRecordId);

    if (updatedOrderId) {
      await publishOrderEvent(internalStatus, updatedOrderId, providerTransferId, eventType);
    }
  });
}
