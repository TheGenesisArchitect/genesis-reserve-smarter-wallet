/**
 * services/treasury/remittance.service.ts
 * Genesis Reserve — Remittance Orchestration Service
 *
 * Manages the complete cross-border payment lifecycle:
 *   getFXQuote()      → Live FX rate + Genesis spread (60s lock)
 *   getCorridorConfig() → Per-corridor limits, payout methods, provider
 *   createOrder()     → Reserves funds + initiates MoneyGram payout
 *   executePayout()   → Submits to MoneyGram Ramps API
 *   checkOrderStatus()→ Polls MoneyGram webhook state
 *
 * Revenue model: max($0.25, 0.008% tx fee) + 0.25% FX spread.
 */

import axios from 'axios';
import { query } from '../config/db';
import { logger } from '../config/logger';
import { EventBus } from '../config/eventbus';
import { ZeroHashAdapter } from './providers/zerohash.adapter';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FXQuote {
  quoteId: string;
  sendAmountUsdc: bigint;      // Amount in USDC (6 decimals)
  receiveAmount: bigint;      // Amount in local currency (provider-specific decimals)
  receiveCurrency: string;      // e.g., 'PHP', 'MXN', 'INR'
  fxRate: number;      // Mid-market rate (e.g. 55.26 PHP/USD)
  genesisRate: number;      // Rate with 0.25% FX spread embedded
  platformFeeBps: number;      // 42 = 0.42%
  fxSpreadBps: number;      // 25 = 0.25%
  txFeeUsdc: bigint;      // Genesis tx fee in USDC (6 decimals)
  fxFeeUsdc: bigint;      // FX spread fee in USDC (6 decimals)
  totalFeesUsdc: bigint;
  netSendUsdc: bigint;      // What recipient's provider receives
  etaSeconds: number;      // Estimated delivery time
  corridor: string;      // e.g., 'US-PH'
  provider: string;      // 'moneygram' | 'circle_cctp'
  expiresAt: Date;        // 60-second lock window
}

export interface CorridorConfig {
  corridor: string;
  enabled: boolean;
  provider: string;
  minAmountUsdc: bigint;
  maxAmountUsdc: bigint;
  payoutMethods: string[];   // ['bank_transfer', 'cash_pickup', 'mobile_wallet']
  cutoffUtcHour: number;     // Hour after which next-day processing applies
  slaHours: number;     // Delivery SLA
  fxProvider: string;     // Who provides FX rate
  receiveCurrency: string;
}

export interface RemittanceOrderResult {
  orderId: string;
  quoteId: string;
  reservationId: string;
  status: 'CREATED' | 'IN_TRANSIT' | 'SETTLED' | 'FAILED';
  providerRef: string;
  etaSeconds: number;
  createdAt: Date;
}

export interface PayoutResult {
  providerRef: string;
  status: 'SUBMITTED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  confirmationCode?: string;
  failureReason?: string;
}

// ── Corridor Registry ─────────────────────────────────────────────────────────

const CORRIDORS: Record<string, CorridorConfig> = {
  'US-PH': {
    corridor: 'US-PH', enabled: true, provider: 'moneygram',
    minAmountUsdc: 1_000_000n,         // $1 minimum
    maxAmountUsdc: 5_000_000_000n,     // $5,000 maximum
    payoutMethods: ['bank_transfer', 'cash_pickup'],
    cutoffUtcHour: 20, slaHours: 1, fxProvider: 'bloomberg',
    receiveCurrency: 'PHP',
  },
  'US-MX': {
    corridor: 'US-MX', enabled: true, provider: 'moneygram',
    minAmountUsdc: 1_000_000n, maxAmountUsdc: 5_000_000_000n,
    payoutMethods: ['bank_transfer', 'cash_pickup', 'mobile_wallet'],
    cutoffUtcHour: 22, slaHours: 2, fxProvider: 'bloomberg',
    receiveCurrency: 'MXN',
  },
  'US-IN': {
    corridor: 'US-IN', enabled: true, provider: 'circle_cctp',
    minAmountUsdc: 1_000_000n, maxAmountUsdc: 10_000_000_000n,
    payoutMethods: ['bank_transfer'],
    cutoffUtcHour: 18, slaHours: 1, fxProvider: 'bloomberg',
    receiveCurrency: 'INR',
  },
  'US-NG': {
    corridor: 'US-NG', enabled: false, // Pending license
    provider: 'moneygram', minAmountUsdc: 1_000_000n, maxAmountUsdc: 2_000_000_000n,
    payoutMethods: ['bank_transfer'], cutoffUtcHour: 20, slaHours: 24,
    fxProvider: 'bloomberg', receiveCurrency: 'NGN',
  },
};

// ── FX rate cache (30-second TTL) ─────────────────────────────────────────────
const fxCache = new Map<string, { rate: number; ts: number }>();
const FX_CACHE_TTL_MS = 30_000;
const FX_SPREAD_BPS = 25;      // 0.25% Genesis FX spread
const TX_FEE_RATE_PPM = 80n;     // 0.008% transaction fee = 80 / 1,000,000
const TX_FEE_MIN_USDC = 250_000n; // $0.25 floor (USDC 6 decimals)

// ── Service ───────────────────────────────────────────────────────────────────

export class RemittanceOrchestrator {
  private readonly zeroHashAdapter = new ZeroHashAdapter();

  private shouldUseZeroHash(corridor: string): boolean {
    const configured = (process.env.REMITTANCE_PROVIDER || '').toUpperCase();
    if (configured === 'ZERO_HASH') return true;

    const allowedCorridors = (process.env.ZEROHASH_CORRIDORS || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    return allowedCorridors.includes(corridor);
  }

  async getFXQuote(params: {
    sendAmountUsdc: bigint;
    sendCurrency: string;
    receiveCurrency: string;
    corridor: string;
    accountId: string;
  }): Promise<FXQuote> {
    const config = CORRIDORS[params.corridor];
    if (!config?.enabled) {
      throw new Error(`Corridor ${params.corridor} is not available`);
    }
    if (params.sendAmountUsdc < config.minAmountUsdc) {
      throw new Error(`Minimum send amount: $${Number(config.minAmountUsdc) / 1e6}`);
    }
    if (params.sendAmountUsdc > config.maxAmountUsdc) {
      throw new Error(`Maximum send amount: $${Number(config.maxAmountUsdc) / 1e6}`);
    }

    const useZeroHash = this.shouldUseZeroHash(params.corridor);
    const providerName = useZeroHash ? 'zerohash' : config.provider;

    let midRate = await this._getFXRate(params.sendCurrency, params.receiveCurrency);
    let providerReceiveAmount: bigint | undefined;
    let providerQuoteId: string | undefined;

    if (useZeroHash) {
      try {
        const providerQuote = await this.zeroHashAdapter.createQuote({
          accountId: params.accountId,
          corridor: params.corridor,
          sendAmount: params.sendAmountUsdc.toString(),
          sendCurrency: params.sendCurrency,
          receiveCurrency: params.receiveCurrency,
        });

        if (providerQuote.fxRate) {
          const parsedRate = Number(providerQuote.fxRate);
          if (Number.isFinite(parsedRate) && parsedRate > 0) {
            midRate = parsedRate;
          }
        }

        if (providerQuote.receiveAmount) {
          const parsedAmt = BigInt(providerQuote.receiveAmount);
          if (parsedAmt > 0n) {
            providerReceiveAmount = parsedAmt;
          }
        }

        providerQuoteId = providerQuote.providerQuoteId;
      } catch (err) {
        logger.warn({ err, corridor: params.corridor }, 'Zero Hash quote failed; falling back to local quote engine');
      }
    }

    // Embed 0.25% spread: user receives rate * (1 - 0.0025)
    const genesisRate = midRate * (1 - FX_SPREAD_BPS / 10_000);

    const variableTxFeeUsdc = params.sendAmountUsdc * TX_FEE_RATE_PPM / 1_000_000n;
    const txFeeUsdc = variableTxFeeUsdc > TX_FEE_MIN_USDC ? variableTxFeeUsdc : TX_FEE_MIN_USDC;
    const fxFeeUsdc = params.sendAmountUsdc * BigInt(FX_SPREAD_BPS) / 10_000n;
    const totalFees = txFeeUsdc + fxFeeUsdc;
    const netSend = params.sendAmountUsdc - txFeeUsdc;
    const effectiveTxFeeBps = params.sendAmountUsdc > 0n
      ? Number((txFeeUsdc * 10_000n) / params.sendAmountUsdc)
      : 0;

    // receiveAmount in local currency (6 decimals → local currency decimals)
    const sendUsd = Number(netSend) / 1e6;
    const localAmt = Math.floor(sendUsd * genesisRate);

    const quoteId = `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return {
      quoteId,
      sendAmountUsdc: params.sendAmountUsdc,
      receiveAmount: providerReceiveAmount ?? BigInt(localAmt),
      receiveCurrency: config.receiveCurrency,
      fxRate: midRate,
      genesisRate,
      platformFeeBps: effectiveTxFeeBps,
      fxSpreadBps: FX_SPREAD_BPS,
      txFeeUsdc,
      fxFeeUsdc,
      totalFeesUsdc: totalFees,
      netSendUsdc: netSend,
      etaSeconds: config.slaHours * 3600,
      corridor: params.corridor,
      provider: providerName,
      expiresAt: new Date(Date.now() + 60_000), // 60-second lock
      ...(providerQuoteId ? { quoteId: providerQuoteId } : {}),
    };
  }

  async getCorridorConfig(corridor: string): Promise<CorridorConfig | null> {
    return CORRIDORS[corridor] ?? null;
  }

  async executePayout(params: {
    orderId: string;
    reservationId: string;
    quote: FXQuote;
    recipientName: string;
    recipientBank?: string;
    recipientAcct?: string;
    accountId?: string;
    idempotencyKey?: string;
  }): Promise<PayoutResult> {
    logger.info({ orderId: params.orderId, corridor: params.quote.corridor }, 'Executing payout');

    if (params.quote.provider === 'zerohash') {
      return this._submitZeroHash(params);
    }

    // In production: POST to MoneyGram Ramps API
    // https://partners.moneygram.com/en-us/api-docs/reference/send-order
    if (params.quote.provider === 'moneygram') {
      return this._submitMoneyGram(params);
    } else if (params.quote.provider === 'circle_cctp') {
      return this._submitCircleCCTP(params);
    }

    throw new Error(`Unknown payout provider: ${params.quote.provider}`);
  }

  async checkOrderStatus(orderId: string): Promise<{
    status: 'IN_TRANSIT' | 'SETTLED' | 'FAILED';
    providerRef: string;
    detail?: string;
  }> {
    const result = await query<{ status: string; provider_ref: string }>(
      `SELECT status, provider_ref FROM remittance_orders WHERE order_id = $1`,
      [orderId]
    );
    if (!result.rows[0]) throw new Error(`Order ${orderId} not found`);

    return {
      status: result.rows[0].status as any,
      providerRef: result.rows[0].provider_ref,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async _getFXRate(from: string, to: string): Promise<number> {
    const cacheKey = `${from}_${to}`;
    const cached = fxCache.get(cacheKey);

    if (cached && Date.now() - cached.ts < FX_CACHE_TTL_MS) {
      return cached.rate;
    }

    // In production: use Bloomberg, Refinitiv, or XE API
    // For MVP/testnet: return hardcoded rates with slight randomisation
    const RATES: Record<string, number> = {
      'USDC_PHP': 55.26 + (Math.random() - 0.5) * 0.1,
      'USDC_MXN': 17.12 + (Math.random() - 0.5) * 0.05,
      'USDC_INR': 83.15 + (Math.random() - 0.5) * 0.2,
      'USDC_NGN': 1580 + (Math.random() - 0.5) * 5,
      'USDC_USD': 1.0,
    };

    const rate = RATES[`${from}_${to}`] ?? 1.0;
    fxCache.set(cacheKey, { rate, ts: Date.now() });
    return rate;
  }

  private async _submitMoneyGram(params: {
    orderId: string;
    quote: FXQuote;
    recipientName: string;
  }): Promise<PayoutResult> {
    // Stub: In production, use MoneyGram Partner API
    const providerRef = `MG_${params.orderId.toUpperCase()}`;

    await query(
      `UPDATE remittance_orders
       SET status = 'IN_TRANSIT', provider_ref = $1, updated_at = NOW()
       WHERE order_id = $2`,
      [providerRef, params.orderId]
    ).catch(err => logger.warn({ err }, 'Failed to update order status'));

    await EventBus.publish(EventBus.makeEvent(
      'remittance.in_transit', params.orderId,
      { orderId: params.orderId, providerRef, provider: 'moneygram' }
    ));

    return { providerRef, status: 'IN_TRANSIT' };
  }

  private async _submitCircleCCTP(params: {
    orderId: string;
    quote: FXQuote;
  }): Promise<PayoutResult> {
    // Stub: In production, use Circle CCTP v2 bridge API
    const providerRef = `CCTP_${params.orderId}`;
    return { providerRef, status: 'SUBMITTED' };
  }

  private async _submitZeroHash(params: {
    orderId: string;
    reservationId: string;
    quote: FXQuote;
    recipientName: string;
    accountId?: string;
    idempotencyKey?: string;
  }): Promise<PayoutResult> {
    const idempotencyKey = params.idempotencyKey || `zh-${params.orderId}`;
    const accountId = params.accountId || 'unknown';

    const transfer = await this.zeroHashAdapter.createTransfer({
      accountId,
      providerQuoteId: params.quote.quoteId,
      beneficiaryRef: params.recipientName,
      idempotencyKey,
      metadata: {
        orderId: params.orderId,
        reservationId: params.reservationId,
        corridor: params.quote.corridor,
      },
    });

    const providerRef = transfer.providerTransferId;

    await query(
      `UPDATE remittance_orders
       SET status = $1,
           off_ramp_ref = $2,
           provider = 'ZERO_HASH',
           provider_transfer_id = $2,
           provider_status = $3,
           provider_payload = COALESCE(provider_payload, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE order_id = $5`,
      [
        transfer.status === 'SETTLED' ? 'SETTLED' : 'IN_TRANSIT',
        providerRef,
        transfer.status,
        JSON.stringify({ provider: 'ZERO_HASH', transferStatus: transfer.status }),
        params.orderId,
      ]
    ).catch(err => logger.warn({ err }, 'Failed to update Zero Hash order status'));

    await EventBus.publish(EventBus.makeEvent(
      'remittance.in_transit',
      params.orderId,
      { orderId: params.orderId, providerRef, provider: 'zerohash' }
    ));

    return {
      providerRef,
      status: transfer.status === 'SETTLED' ? 'DELIVERED' : 'IN_TRANSIT',
    };
  }
}
