/**
 * services/treasury/yield.service.ts
 * Genesis Reserve — Backend Yield Engine Service
 *
 * Server-side yield management:
 *   getYieldSnapshot()       → Current blended APY + deployed capital
 *   getStrategyAllocations() → Per-adapter allocation + live APY
 *   getAccountYieldHistory() → User's personal yield earning history
 *   generateRiskReport()     → Composite risk score (0–100)
 *   triggerHarvestCheck()    → Cron-callable: execute harvest() if epoch elapsed
 *   computeRollingApy()      → N-day rolling APY from harvest history
 *
 * Called by API gateway routes and the 5-minute harvest cron job.
 */

import { ethers, Contract, BigNumber, providers } from 'ethers';
import { query } from '../config/db';
import { logger } from '../config/logger';
import { EventBus } from '../config/eventbus';
import StrategyRouterABI from './strategy-router.abi.json';

// ── Environment ───────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || process.env.ALCHEMY_RPC_URL || '';
const ROUTER_ADDR = process.env.STRATEGY_ROUTER_ADDRESS || '';
const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY || '';
const USDC_DECIMALS = 6;
const EPOCH_SECONDS = 900;  // 15 minutes
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YieldSnapshot {
  totalDeployed: string;
  blendedApyBps: number;
  blendedApy: number;
  lastHarvestTime: number;
  nextHarvestTime: number;
  totalYieldAccrued: string;
  circuitBreakerActive: boolean;
}

export interface StrategyAllocation {
  adapter: string;
  name: string;
  deployedUsdc: string;
  pct: number;
  apyBps: number;
  apy: number;
  riskScore: number;
  liquidityBand: number;
  isActive: boolean;
}

export interface AccountYieldEntry {
  epochNumber: number;
  timestamp: number;
  yieldEarned: string;
  apyAtEpoch: number;
  txHash: string;
}

export interface RiskReport {
  overallRisk: number;
  concentrationRisk: number;
  liquidityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  depegRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  usdcPrice: number;
  circuitBreakerArmed: boolean;
  recommendations: string[];
}

export interface HarvestResult {
  harvested: boolean;
  txHash: string | null;
  yieldUsdc?: string;
  epochNumber?: number;
  reason: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class YieldEngine {
  private provider!: providers.JsonRpcProvider;
  private router!: Contract;
  private operator!: ethers.Wallet;
  private initialized = false;

  private async _init() {
    if (this.initialized || !RPC_URL || !ROUTER_ADDR) return;
    this.provider = new providers.JsonRpcProvider(RPC_URL);
    this.router = new Contract(ROUTER_ADDR, StrategyRouterABI, this.provider);
    if (OPERATOR_KEY) {
      this.operator = new ethers.Wallet(OPERATOR_KEY, this.provider);
    }
    this.initialized = true;
  }

  async getYieldSnapshot(): Promise<YieldSnapshot> {
    await this._init();

    try {
      const [snapshot, cbActive] = await Promise.all([
        this.router.getYieldSnapshot(),
        this.router.isCircuitBreakerActive(),
      ]);

      return {
        totalDeployed: this._formatUsdc(snapshot.totalDeployed),
        blendedApyBps: snapshot.blendedApyBps.toNumber(),
        blendedApy: snapshot.blendedApyBps.toNumber() / 100,
        lastHarvestTime: snapshot.lastHarvestTime.toNumber(),
        nextHarvestTime: snapshot.nextHarvestTime.toNumber(),
        totalYieldAccrued: this._formatUsdc(snapshot.totalYieldAccrued),
        circuitBreakerActive: cbActive,
      };
    } catch (err) {
      logger.warn({ err }, 'getYieldSnapshot failed — returning defaults');
      return {
        totalDeployed: '0.00', blendedApyBps: 0, blendedApy: 0,
        lastHarvestTime: 0, nextHarvestTime: 0, totalYieldAccrued: '0.0000',
        circuitBreakerActive: false,
      };
    }
  }

  async getStrategyAllocations(): Promise<StrategyAllocation[]> {
    await this._init();

    try {
      const allocs = await this.router.getStrategyAllocations();
      return allocs.map((a: any) => ({
        adapter: a.adapter,
        name: a.name,
        deployedUsdc: this._formatUsdc(a.deployedUsdc),
        pct: a.currentBps.toNumber() / 100,
        apyBps: 0,  // fetched separately if needed
        apy: 0,
        riskScore: a.riskScore,
        liquidityBand: a.liquidityBand,
        isActive: a.isActive,
      }));
    } catch (err) {
      logger.warn({ err }, 'getStrategyAllocations failed');
      return [];
    }
  }

  async getAccountYieldHistory(
    walletAddress: string,
    epochCount: number = 96
  ): Promise<AccountYieldEntry[]> {
    // Read from DB (yield_accruals table) — faster than on-chain for history
    try {
      const result = await query<{
        accrued_at: Date;
        amount: string;
        apy_bps: number;
      }>(
        `SELECT ya.accrued_at, ya.amount, ya.apy_bps
         FROM yield_accruals ya
         JOIN treasury_accounts ta ON ta.account_id = ya.account_id
         WHERE LOWER(ta.wallet_address) = LOWER($1)
         ORDER BY ya.accrued_at DESC
         LIMIT $2`,
        [walletAddress, epochCount]
      );

      return result.rows.map((row, idx) => ({
        epochNumber: idx + 1,
        timestamp: Math.floor(new Date(row.accrued_at).getTime() / 1000),
        yieldEarned: row.amount,
        apyAtEpoch: row.apy_bps / 100,
        txHash: '',
      }));
    } catch (err) {
      logger.warn({ err }, 'getAccountYieldHistory DB error');
      return [];
    }
  }

  async generateRiskReport(): Promise<RiskReport> {
    const [allocations, snapshot] = await Promise.all([
      this.getStrategyAllocations(),
      this.getYieldSnapshot(),
    ]);

    const maxSingleExposure = Math.max(...allocations.map(a => a.pct), 0);
    const daysExposure = allocations
      .filter(a => a.isActive && a.liquidityBand === 2)
      .reduce((sum, a) => sum + a.pct, 0);

    const concentrationRisk = maxSingleExposure > 40 ? 40 : maxSingleExposure > 30 ? 25 : 10;
    const liquidityRiskNum = daysExposure > 30 ? 30 : daysExposure > 20 ? 15 : 5;
    const usdcPrice = 1.0; // TODO: fetch from Chainlink
    const depegRiskNum = usdcPrice < 0.998 ? 40 : usdcPrice < 0.999 ? 20 : 0;
    const overallRisk = Math.min(100, concentrationRisk + liquidityRiskNum + depegRiskNum);

    const recommendations: string[] = [];
    if (maxSingleExposure > 40) recommendations.push('Concentration cap breached — rebalancing required');
    if (daysExposure > 25) recommendations.push('DAYS-band exposure elevated');
    if (usdcPrice < 0.999) recommendations.push(`USDC peg at $${usdcPrice.toFixed(4)}`);
    if (snapshot.circuitBreakerActive) recommendations.push('CIRCUIT BREAKER ACTIVE');
    if (recommendations.length === 0) recommendations.push('All risk metrics within normal parameters');

    return {
      overallRisk,
      concentrationRisk: maxSingleExposure,
      liquidityRisk: daysExposure > 30 ? 'HIGH' : daysExposure > 20 ? 'MEDIUM' : 'LOW',
      depegRisk: usdcPrice < 0.997 ? 'HIGH' : usdcPrice < 0.999 ? 'MEDIUM' : 'LOW',
      usdcPrice,
      circuitBreakerArmed: !snapshot.circuitBreakerActive,
      recommendations,
    };
  }

  /**
   * triggerHarvestCheck — called by 5-minute cron job.
   * Checks if the current epoch has elapsed and executes harvest() if so.
   */
  async triggerHarvestCheck(): Promise<HarvestResult> {
    await this._init();
    if (!this.operator) {
      return { harvested: false, txHash: null, reason: 'Operator wallet not configured' };
    }

    try {
      const epochState = await this.router.getEpochState();
      const now = Math.floor(Date.now() / 1000);
      const epochEnd = epochState.epochStartTime.toNumber() + epochState.epochDuration.toNumber();

      if (now < epochEnd) {
        return {
          harvested: false, txHash: null,
          reason: `Epoch ${epochState.epochNumber} not complete. ${epochEnd - now}s remaining.`,
        };
      }

      const cbActive = await this.router.isCircuitBreakerActive();
      if (cbActive) {
        return { harvested: false, txHash: null, reason: 'Circuit breaker active — harvest suspended' };
      }

      // Execute harvest via operator wallet
      const routerWithSigner = this.router.connect(this.operator);
      const tx = await routerWithSigner.harvest();
      const receipt = await tx.wait(1);

      // Parse YieldHarvested event from receipt
      const harvestEvent = receipt.events?.find((e: any) => e.event === 'YieldHarvested');
      const yieldUsdc = harvestEvent?.args?.totalYieldUsdc
        ? this._formatUsdc(harvestEvent.args.totalYieldUsdc)
        : '0.0000';

      logger.info({
        epochNumber: epochState.epochNumber.toNumber(),
        txHash: receipt.transactionHash,
        yieldUsdc,
      }, 'Harvest executed');

      // Persist yield accrual to DB
      await this._persistHarvestRecord(
        epochState.epochNumber.toNumber(),
        harvestEvent?.args?.blendedApyBps?.toNumber() || 0,
        harvestEvent?.args?.totalYieldUsdc || BigNumber.from(0),
        receipt.transactionHash
      );

      await EventBus.publish(EventBus.makeEvent('protocol.harvest', 'genesis-vault', {
        epochNumber: epochState.epochNumber.toNumber(),
        yieldUsdc,
        txHash: receipt.transactionHash,
      }));

      return {
        harvested: true,
        txHash: receipt.transactionHash,
        yieldUsdc,
        epochNumber: epochState.epochNumber.toNumber(),
        reason: `Harvest executed for epoch ${epochState.epochNumber}`,
      };
    } catch (err: any) {
      logger.error({ err }, 'Harvest execution failed');
      return {
        harvested: false,
        txHash: null,
        reason: err?.message || 'Harvest failed',
      };
    }
  }

  async computeRollingApy(days: number = 7): Promise<{
    rollingApy: number;
    epochsAnalyzed: number;
    totalYield: string;
  }> {
    try {
      const result = await query<{
        count: string;
        total_yield: string;
        period_seconds: string;
      }>(
        `SELECT COUNT(*) as count,
                COALESCE(SUM(amount::bigint), 0) as total_yield,
                EXTRACT(EPOCH FROM (MAX(accrued_at) - MIN(accrued_at))) as period_seconds
         FROM yield_accruals
         WHERE accrued_at > NOW() - INTERVAL '${Math.round(days)} days'`
      );

      const row = result.rows[0];
      if (!row || !row.count || row.count === '0') {
        return { rollingApy: 0, epochsAnalyzed: 0, totalYield: '0.0000' };
      }

      const totalYieldRaw = BigInt(row.total_yield || '0');
      const periodSeconds = Number(row.period_seconds || '1');
      const annualizedRate = periodSeconds > 0
        ? (Number(totalYieldRaw) / 1_000_000) * (SECONDS_PER_YEAR / periodSeconds) * 0.01
        : 0;

      return {
        rollingApy: Math.min(25, annualizedRate),
        epochsAnalyzed: parseInt(row.count),
        totalYield: (Number(totalYieldRaw) / 1e6).toFixed(4),
      };
    } catch (err) {
      logger.warn({ err }, 'computeRollingApy DB error');
      return { rollingApy: 0, epochsAnalyzed: 0, totalYield: '0.0000' };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _formatUsdc(raw: BigNumber | bigint): string {
    const n = typeof raw === 'bigint' ? Number(raw) : raw.toNumber();
    return (n / 1e6).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 4,
    });
  }

  private async _persistHarvestRecord(
    epochNumber: number,
    apyBps: number,
    yieldUsdc: BigNumber,
    txHash: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_log
           (actor, action, object_type, object_ref, prev_hash, hash, metadata, logged_at)
         VALUES
           (
             'yield-engine',
             'HARVEST',
             'PROTOCOL',
             $1,
             COALESCE((SELECT hash FROM audit_log ORDER BY logged_at DESC LIMIT 1), 'GENESIS'),
             encode(digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'),
             $2,
             NOW()
           )`,
        [
          `epoch:${epochNumber}`,
          JSON.stringify({ epochNumber, apyBps, yieldUsdc: yieldUsdc.toString(), txHash }),
        ]
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to persist harvest record');
    }
  }
}

// Stub ABI needed for ethers.Contract — full ABI in strategy-router.abi.json
// This service file imports it inline
