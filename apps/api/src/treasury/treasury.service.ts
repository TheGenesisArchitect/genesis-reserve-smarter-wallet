/**
 * treasury.service.ts
 * Genesis Reserve — Treasury Orchestration Service
 *
 * The primary API surface between partners (B2B) and the Genesis smart
 * contract layer. All operations are idempotent (Idempotency-Key enforced),
 * emit structured events to the ledger service, and maintain deterministic
 * state machines for every order.
 *
 * Architecture:
 *   Partner API → TreasuryService → GenesisVault (Solidity)
 *                                 → LedgerService (PostgreSQL)
 *                                 → ComplianceService
 *                                 → RemittanceOrchestrator
 *                                 → EventBus (Kafka)
 */

import { ethers, Contract, BigNumber } from 'ethers';
import { EventEmitter } from 'events';
import { LedgerService, LedgerEntry, EntryType } from '../ledger/ledger.service';
import { ComplianceService, ScreeningResult } from './compliance.service';
import { RemittanceOrchestrator } from './remittance.service';
import { YieldEngine } from './yield.service';
import { EventBus } from '../config/eventbus';
import { logger } from '../config/logger';
import GenesisVaultABI from '../contracts/GenesisVault.json';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export enum TreasuryMode {
  FlexibleReserve = 0,
  IncomeVault = 1,
  GrowthMode = 2,
}

export enum OrderStatus {
  Pending = 'PENDING',
  Reserved = 'RESERVED',
  InTransit = 'IN_TRANSIT',
  Settled = 'SETTLED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
  ComplianceHold = 'COMPLIANCE_HOLD',
}

export interface ProgrammableTreasuryAccount {
  accountId: string;
  ownerId: string;
  walletAddress: string;
  mode: TreasuryMode;
  kycLevel: number;
  riskTier: number;
  jurisdiction: string;
  travelRuleReq: boolean;
  policyVersion: number;
  partnerPricingId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Balance {
  accountId: string;
  available: bigint;   // USDC 6 decimals
  reserved: bigint;
  invested: bigint;
  total: bigint;
  yieldToday: bigint;
  blendedAPY: number;   // basis points
  currency: 'USDC';
  chain: string;
  timestamp: Date;
}

export interface ReserveRequest {
  accountId: string;
  amount: bigint;
  externalOrderId: string;
  expirySeconds?: number;
  idempotencyKey: string;
}

export interface ReserveResponse {
  reservationId: string;
  accountId: string;
  amount: bigint;
  expiry: Date;
  ledgerEntryId: string;
  status: 'RESERVED' | 'FAILED';
  failureReason?: string;
}

export interface RemittanceQuote {
  quoteId: string;
  accountId: string;
  sendAmount: bigint;
  sendCurrency: string;
  receiveCurrency: string;
  receiveAmount: bigint;
  fxRate: number;
  platformFeeBps: number;
  fxSpreadBps: number;
  txFeeUsdc?: bigint;
  fxFeeUsdc?: bigint;
  totalCostUsdc: bigint;
  etaSeconds: number;
  expiresAt: Date;
  complianceStatus: string;
  travelRuleReq: boolean;
  corridor: string;
  constraints: QuoteConstraints;
}

export interface QuoteConstraints {
  kycLevelRequired: number;
  maxAmount: bigint;
  minAmount: bigint;
  dailyRemaining: bigint;
}

export interface RemittanceOrder {
  orderId: string;
  quoteId: string;
  accountId: string;
  reservationId: string;
  status: OrderStatus;
  corridor: string;
  payoutMethod: string;
  recipientRef: string;
  sendAmount: bigint;
  receiveAmount: bigint;
  fxRate: number;
  platformFee: bigint;
  partnerFee: bigint;
  fxRevenue: bigint;
  txHash?: string;
  offRampRef?: string;
  ledgerEntryIds: string[];
  createdAt: Date;
  updatedAt: Date;
  settledAt?: Date;
}

export interface FinalizeRequest {
  reservationId: string;
  orderId: string;
  platformFee: bigint;
  partnerFee: bigint;
  fxDetails: { executedRate: number; slippageBps: number; provider: string };
  settlementRef: string;
  txHash: string;
}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export class TreasuryService extends EventEmitter {
  private vault: Contract;
  private provider: ethers.providers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private ledger: LedgerService;
  private compliance: ComplianceService;
  private remittance: RemittanceOrchestrator;
  private yieldEngine: YieldEngine;
  private idempotencyCache: Map<string, unknown>;

  constructor(
    private readonly config: {
      rpcUrl: string;
      vaultAddress: string;
      operatorKey: string;
      chainId: number;
    }
  ) {
    super();
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.operatorKey, this.provider);
    this.vault = new Contract(config.vaultAddress, GenesisVaultABI, this.signer);
    this.ledger = new LedgerService();
    this.compliance = new ComplianceService();
    this.remittance = new RemittanceOrchestrator();
    this.yieldEngine = new YieldEngine();
    this.idempotencyCache = new Map();
    try {
      this._bindContractEvents();
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          vaultAddress: config.vaultAddress,
        },
        'Skipping contract event binding due to ABI/deployment mismatch'
      );
    }
  }

  // ─── ACCOUNT MANAGEMENT ─────────────────────────────────────────────────

  async activateAccount(params: {
    ownerId: string;
    walletAddress: string;
    mode: TreasuryMode;
    kycLevel: number;
    riskTier: number;
    jurisdiction: string;
    partnerPricingId: string;
  }): Promise<ProgrammableTreasuryAccount> {

    // Verify compliance record exists on-chain
    const complianceCheck = await this.compliance.verifyOnChainRecord(params.walletAddress);
    if (!complianceCheck.valid) {
      throw new Error(`Compliance record missing: ${complianceCheck.reason}`);
    }

    // Activate on-chain
    const travelRuleReq = ['US', 'GB', 'DE', 'IN'].includes(params.jurisdiction);
    const tx = await this.vault.activateAccount(
      params.walletAddress,
      params.mode,
      params.kycLevel,
      params.riskTier,
      travelRuleReq,
      { gasLimit: 200_000 }
    );
    await tx.wait(1);

    const account: ProgrammableTreasuryAccount = {
      accountId: `pta-${params.ownerId.slice(0, 8)}`,
      ownerId: params.ownerId,
      walletAddress: params.walletAddress,
      mode: params.mode,
      kycLevel: params.kycLevel,
      riskTier: params.riskTier,
      jurisdiction: params.jurisdiction,
      travelRuleReq,
      policyVersion: 1,
      partnerPricingId: params.partnerPricingId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Post creation event to ledger
    await this.ledger.createAccount(account);

    logger.info({ accountId: account.accountId, wallet: params.walletAddress }, 'PTA activated');
    return account;
  }

  // ─── BALANCE ────────────────────────────────────────────────────────────

  async getBalance(accountId: string): Promise<Balance> {
    const account = await this.ledger.getAccount(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    const { available, reserved, invested } = await this._readVaultBalances();

    // Get yield data from engine
    const yieldData = await this.yieldEngine.getYieldSnapshot();

    return {
      accountId,
      available,
      reserved,
      invested,
      total: available + reserved + invested,
      yieldToday: 0n,
      blendedAPY: yieldData.blendedApyBps,
      currency: 'USDC',
      chain: this.config.chainId === 42161 ? 'arbitrum' : 'ethereum',
      timestamp: new Date(),
    };
  }

  // ─── RESERVE FLOW ───────────────────────────────────────────────────────

  /**
   * Reserve funds for an outgoing transfer.
   * Idempotent: same Idempotency-Key returns cached result.
   */
  async reserveFunds(request: ReserveRequest): Promise<ReserveResponse> {
    // Idempotency check
    const cached = this.idempotencyCache.get(request.idempotencyKey);
    if (cached) return cached as ReserveResponse;

    const account = await this.ledger.getAccount(request.accountId);
    if (!account) throw new Error(`Account not found: ${request.accountId}`);

    // Compliance pre-screen
    const screen: ScreeningResult = await this.compliance.screenTransfer({
      fromAddress: account.wallet_address,
      toAddress: account.wallet_address,
      amount: request.amount,
      orderId: request.externalOrderId,
    });
    if (screen.result !== 'PASS') {
      const resp: ReserveResponse = {
        reservationId: '',
        accountId: request.accountId,
        amount: request.amount,
        expiry: new Date(),
        ledgerEntryId: '',
        status: 'FAILED',
        failureReason: screen.result,
      };
      this.idempotencyCache.set(request.idempotencyKey, resp);
      return resp;
    }

    // Reserve on-chain
    const expiry = Math.floor(Date.now() / 1000) + (request.expirySeconds ?? 300);
    const orderId = ethers.utils.id(request.externalOrderId);

    try {
      const tx = await this.vault.reserveFunds(
        account.wallet_address,
        request.amount,
        expiry,
        orderId,
        { gasLimit: 300_000 }
      );
      const receipt = await tx.wait(1);

      // Parse reservation ID from event
      const event = receipt.events?.find((e: ethers.Event) => e.event === 'FundsReserved');
      const reservationId = event?.args?.reservationId as string;

      // Post to double-entry ledger
      const ledgerEntry = await this.ledger.postEntry({
        type: EntryType.RESERVE,
        debitAccount: `${request.accountId}:available`,
        creditAccount: `${request.accountId}:reserved`,
        amount: request.amount,
        currency: 'USDC',
        reference: reservationId,
        metadata: { orderId: request.externalOrderId, txHash: tx.hash },
      });

      const resp: ReserveResponse = {
        reservationId,
        accountId: request.accountId,
        amount: request.amount,
        expiry: new Date(expiry * 1000),
        ledgerEntryId: ledgerEntry.id,
        status: 'RESERVED',
      };

      this.idempotencyCache.set(request.idempotencyKey, resp);
      logger.info({ reservationId, amount: request.amount.toString() }, 'Funds reserved');
      return resp;

    } catch (err: unknown) {
      logger.error({ err, request }, 'reserveFunds on-chain call failed');
      throw err;
    }
  }

  // ─── QUOTE ENGINE ───────────────────────────────────────────────────────

  /**
   * Build a locked remittance quote with FX, fees, ETA, and compliance status.
   * p95 target: < 300ms (FX provider call is the critical path).
   */
  async buildQuote(params: {
    accountId: string;
    sendAmount: bigint;
    sendCurrency: string;
    receiveCurrency: string;
    corridor: string;
    payoutMethod: 'bank_transfer' | 'mobile_money' | 'cash' | 'wallet';
    idempotencyKey: string;
  }): Promise<RemittanceQuote> {
    const cached = this.idempotencyCache.get(params.idempotencyKey);
    if (cached) return cached as RemittanceQuote;

    const [account, fxData] = await Promise.all([
      this.ledger.getAccount(params.accountId),
      this.remittance.getFXQuote({
        accountId: params.accountId,
        sendAmountUsdc: params.sendAmount,
        sendCurrency: params.sendCurrency,
        receiveCurrency: params.receiveCurrency,
        corridor: params.corridor,
      }),
    ]);

    if (!account) throw new Error(`Account not found: ${params.accountId}`);
    const complianceData = await this.compliance.getAccountStatus(account.wallet_address);

    // Fee computation
    const corridorConfig = await this.remittance.getCorridorConfig(params.corridor);
    if (!corridorConfig) throw new Error(`Corridor not found: ${params.corridor}`);
    const platformFeeBps = fxData.platformFeeBps;
    const fxSpreadBps = fxData.fxSpreadBps;

    const platformFee = fxData.txFeeUsdc ?? ((params.sendAmount * BigInt(platformFeeBps)) / 10000n);
    const fxFee = fxData.fxFeeUsdc ?? ((params.sendAmount * BigInt(fxSpreadBps)) / 10000n);
    const totalCostUsdc = fxData.totalFeesUsdc ?? (platformFee + fxFee);

    const receiveAmount = fxData.receiveAmount;

    const quoteId = ethers.utils.id(`${params.accountId}:${Date.now()}`);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

    const quote: RemittanceQuote = {
      quoteId,
      accountId: params.accountId,
      sendAmount: params.sendAmount,
      sendCurrency: params.sendCurrency,
      receiveCurrency: params.receiveCurrency,
      receiveAmount,
      fxRate: fxData.fxRate,
      platformFeeBps,
      fxSpreadBps,
      txFeeUsdc: platformFee,
      fxFeeUsdc: fxFee,
      totalCostUsdc,
      etaSeconds: corridorConfig.slaHours * 3600,
      expiresAt,
      complianceStatus: complianceData?.isCompliant ? 'PASS' : 'REVIEW',
      travelRuleReq: params.sendAmount >= 3_000_000_000n, // $3,000 in USDC 6dec
      corridor: params.corridor,
      constraints: {
        kycLevelRequired: 2,
        maxAmount: account.kyc_level >= 3 ? 500_000_000_000n : 9_500_000_000n,
        minAmount: 1_000_000n,   // $1.00
        dailyRemaining: 0n,
      },
    };

    this.idempotencyCache.set(params.idempotencyKey, quote);
    this.idempotencyCache.set(quote.quoteId, quote);
    return quote;
  }

  // ─── ORDER EXECUTION ────────────────────────────────────────────────────

  /**
   * Create and execute a remittance order from a locked quote.
   * Flow: reserve → compliance → on-chain USDC → off-ramp → settle → ledger
   */
  async createOrder(params: {
    quoteId: string;
    accountId: string;
    recipientId: string;
    payoutMethod: string;
    idempotencyKey: string;
    travelRuleData?: {
      originatorName: string;
      beneficiaryName: string;
      beneficiaryVASP: string;
    };
  }): Promise<RemittanceOrder> {

    // Retrieve quote
    const quote = this.idempotencyCache.get(params.quoteId) as RemittanceQuote;
    if (!quote) throw new Error(`Quote not found or expired: ${params.quoteId}`);
    if (quote.expiresAt < new Date()) throw new Error(`Quote expired: ${params.quoteId}`);

    // Reserve funds (idempotent)
    const reservation = await this.reserveFunds({
      accountId: params.accountId,
      amount: quote.sendAmount,
      externalOrderId: params.quoteId,
      idempotencyKey: `res:${params.idempotencyKey}`,
    });
    if (reservation.status !== 'RESERVED') {
      throw new Error(`Fund reservation failed: ${reservation.failureReason}`);
    }

    // Submit Travel Rule if required
    if (quote.travelRuleReq && params.travelRuleData) {
      const account = await this.ledger.getAccount(params.accountId);
      if (!account) throw new Error(`Account not found: ${params.accountId}`);
      await this.compliance.submitTravelRule({
        orderId: params.quoteId,
        senderAddress: account.wallet_address,
        senderName: params.travelRuleData.originatorName,
        recipientAddress: params.recipientId,
        amount: quote.sendAmount,
        corridor: quote.corridor,
      });
    }

    // Execute payout via Remitation rails
    const payoutQuote = await this.remittance.getFXQuote({
      accountId: params.accountId,
      sendAmountUsdc: quote.sendAmount,
      sendCurrency: quote.sendCurrency,
      receiveCurrency: quote.receiveCurrency,
      corridor: quote.corridor,
    });
    const payoutResult = await this.remittance.executePayout({
      orderId: params.quoteId,
      reservationId: reservation.reservationId,
      quote: payoutQuote,
      recipientName: params.recipientId,
      accountId: params.accountId,
      idempotencyKey: params.idempotencyKey,
    });

    const platformFeeAmount = quote.txFeeUsdc ?? ((quote.sendAmount * BigInt(quote.platformFeeBps)) / 10000n);
    const fxRevenueAmount = quote.fxFeeUsdc ?? ((quote.sendAmount * BigInt(quote.fxSpreadBps)) / 10000n);
    const partnerFeeAmount = 0n;

    const order: RemittanceOrder = {
      orderId: params.quoteId,
      quoteId: params.quoteId,
      accountId: params.accountId,
      reservationId: reservation.reservationId,
      status: OrderStatus.InTransit,
      corridor: quote.corridor,
      payoutMethod: params.payoutMethod,
      recipientRef: params.recipientId,
      sendAmount: quote.sendAmount,
      receiveAmount: quote.receiveAmount,
      fxRate: quote.fxRate,
      platformFee: platformFeeAmount,
      partnerFee: partnerFeeAmount,
      fxRevenue: fxRevenueAmount,
      txHash: undefined,
      offRampRef: payoutResult.providerRef,
      ledgerEntryIds: [reservation.ledgerEntryId],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Persist order
    await this.ledger.createOrder(order);

    logger.info({ orderId: order.orderId, status: order.status }, 'Remittance order created');
    return order;
  }

  // ─── FINALIZATION ───────────────────────────────────────────────────────

  async finalizeOrder(request: FinalizeRequest): Promise<void> {
    const order = await this.ledger.getOrder(request.orderId);
    if (!order) throw new Error(`Order not found: ${request.orderId}`);

    // Finalize on-chain — burns shares, distributes fees
    const tx = this.vault.finalizePayment
      ? await this.vault.finalizePayment(
        request.reservationId,
        `recipient:${request.settlementRef}`,
        { gasLimit: 400_000 }
      )
      : await this.vault.finalizeReservation(
        request.reservationId,
        request.platformFee,
        request.partnerFee,
        ethers.utils.id(request.orderId),
        { gasLimit: 400_000 }
      );
    await tx.wait(1);

    // Post settlement ledger entries (double-entry)
    await Promise.all([
      this.ledger.postEntry({
        type: EntryType.SETTLEMENT,
        debitAccount: `${order.accountId}:reserved`,
        creditAccount: `settlement:${request.settlementRef}`,
        amount: order.sendAmount,
        currency: 'USDC',
        reference: request.orderId,
        metadata: { txHash: request.txHash, fxDetails: request.fxDetails },
      }),
      this.ledger.postEntry({
        type: EntryType.FEE,
        debitAccount: `${order.accountId}:reserved`,
        creditAccount: 'revenue:platform',
        amount: request.platformFee,
        currency: 'USDC',
        reference: request.orderId,
        metadata: {},
      }),
      this.ledger.postEntry({
        type: EntryType.FEE,
        debitAccount: `${order.accountId}:reserved`,
        creditAccount: 'revenue:partner',
        amount: request.partnerFee,
        currency: 'USDC',
        reference: request.orderId,
        metadata: {},
      }),
    ]);

    await this.ledger.updateOrderStatus(request.orderId, OrderStatus.Settled, new Date());

    logger.info({ orderId: request.orderId }, 'Order finalized and settled');
  }

  // ─── MODE MANAGEMENT ────────────────────────────────────────────────────

  async updateTreasuryMode(accountId: string, mode: TreasuryMode): Promise<void> {
    const account = await this.ledger.getAccount(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    const tx = await this.vault.updateMode(account.wallet_address, mode, { gasLimit: 120_000 });
    await tx.wait(1);

    await this.ledger.updateAccountMode(accountId, mode);
    logger.info({ accountId, mode }, 'Treasury mode updated');
  }

  // ─── CONTRACT EVENT BRIDGE ──────────────────────────────────────────────

  private _bindContractEvents(): void {
    // Map on-chain events → domain events → ledger entries
    this.vault.on('DepositProcessed', async (account, assets, shares, liquidAlloc, deployedAlloc, ledgerEntryId) => {
      await this.ledger.postEntry({
        type: EntryType.DEPOSIT,
        debitAccount: 'custodian:inbound',
        creditAccount: `${account}:available`,
        amount: BigInt(assets.toString()),
        currency: 'USDC',
        reference: ledgerEntryId,
        metadata: { liquidAlloc: liquidAlloc.toString(), deployedAlloc: deployedAlloc.toString() },
      });
    });
    this.vault.on('YieldAccrued', async (amount, newTotalAssets, timestamp) => {
      await this.ledger.postEntry({
        type: EntryType.YIELD,
        debitAccount: 'strategies:yield',
        creditAccount: 'vault:total_assets',
        amount: BigInt(amount.toString()),
        currency: 'USDC',
        reference: ethers.utils.id(`yield:${timestamp}`),
        metadata: { newTotalAssets: newTotalAssets.toString() },
      });
    });

    this.vault.on('FeesCollected', async (platformFee, partnerFee, timestamp) => {
      logger.info({ platformFee: platformFee.toString(), partnerFee: partnerFee.toString() }, 'Fees collected');
    });

    logger.info('Contract event listeners bound');
  }

  private async _readVaultBalances(): Promise<{ available: bigint; reserved: bigint; invested: bigint }> {
    const [liquidBuffer, reservedForPayouts, deployedAssets, totalAssets] = await Promise.all([
      this._readVaultUint('liquidBuffer'),
      this._readVaultUint('reservedForPayouts'),
      this._readVaultUint('deployedAssets'),
      this._readVaultUint('totalAssets'),
    ]);

    if (liquidBuffer !== null || reservedForPayouts !== null || deployedAssets !== null) {
      return {
        available: liquidBuffer ?? 0n,
        reserved: reservedForPayouts ?? 0n,
        invested: deployedAssets ?? 0n,
      };
    }

    return {
      available: totalAssets ?? 0n,
      reserved: 0n,
      invested: 0n,
    };
  }

  private async _readVaultUint(functionName: string): Promise<bigint | null> {
    try {
      const iface = new ethers.utils.Interface([
        `function ${functionName}() view returns (uint256)`,
      ]);
      const data = iface.encodeFunctionData(functionName, []);
      const raw = await this.provider.call({ to: this.config.vaultAddress, data });
      const [decoded] = iface.decodeFunctionResult(functionName, raw);
      return BigInt(decoded.toString());
    } catch {
      return null;
    }
  }

  // ─── RISK REPORTING ─────────────────────────────────────────────────────

  async getRiskReport(): Promise<any> {
    return await this.yieldEngine.generateRiskReport();
  }

  async getYieldReport(accountId: string, days: number = 30) {
    return await this.yieldEngine.getAccountYieldHistory(accountId, days);
  }
}
