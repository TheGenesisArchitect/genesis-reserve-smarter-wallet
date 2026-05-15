/**
 * services/cron/harvest.cron.ts
 * Genesis Reserve — Yield Harvest Cron Job
 *
 * MOST OPERATIONALLY CRITICAL SERVICE.
 * Runs every 5 minutes. Checks if the 15-minute epoch has elapsed.
 * If yes → calls StrategyRouter.harvest() via Operator wallet.
 *
 * Without this service running:
 *   - Yield accrues in protocols but GenesisVault.previewRedeem() never updates
 *   - User balances stay flat even as interest accumulates on-chain
 *   - The YieldEngineDashboard shows stale APY
 *
 * Monitoring:
 *   - Datadog metric: genesis.yield.harvest.success / genesis.yield.harvest.failure
 *   - PagerDuty alert: 3 consecutive failures → page on-call
 *   - Slack alert: every harvest → #ops-yield channel
 *
 * Schedule: every 5 minutes (cron: "star-slash-5")
 * Runs as: node dist/services/cron/harvest.cron.js
 * Or via docker-compose target: harvest-cron
 */

import cron from 'node-cron';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

import { YieldEngine } from '../treasury/yield.service';
import { logger } from '../config/logger';

// ── Config ────────────────────────────────────────────────────────────────────

const CRON_SCHEDULE = process.env.HARVEST_CRON_SCHEDULE || '*/5 * * * *';
const MAX_CONSECUTIVE_FAILURES = 3;
const PAGERDUTY_KEY = process.env.PAGERDUTY_INTEGRATION_KEY;
const SLACK_WEBHOOK = process.env.SLACK_HARVEST_WEBHOOK;
const DATADOG_API_KEY = process.env.DATADOG_API_KEY;

// ── State ─────────────────────────────────────────────────────────────────────

let consecutiveFailures = 0;
let totalHarvests = 0;
let totalYieldCollected = 0;   // in USDC (float)
let lastHarvestTime: Date | null = null;
let isRunning = false;

const yieldEngine = new YieldEngine();

// ── Harvest execution ─────────────────────────────────────────────────────────

async function runHarvestCheck(): Promise<void> {
  // Prevent overlapping runs (safety guard for slow chain confirmations)
  if (isRunning) {
    logger.warn('Harvest check already in progress — skipping this tick');
    return;
  }
  isRunning = true;

  const start = Date.now();
  logger.info({ totalHarvests, consecutiveFailures }, 'Running harvest check');

  try {
    const result = await yieldEngine.triggerHarvestCheck();

    if (!result.harvested) {
      // Not an error — epoch may not be complete yet
      logger.debug({ reason: result.reason }, 'Harvest skipped');
      consecutiveFailures = 0;  // Reset failures — this is expected behavior
      await emitMetric('genesis.yield.harvest.skipped', 1);
      return;
    }

    // ── Successful harvest ──────────────────────────────────────────────────
    consecutiveFailures = 0;
    totalHarvests++;
    lastHarvestTime = new Date();

    const yieldFloat = parseFloat(result.yieldUsdc?.replace(/,/g, '') || '0');
    totalYieldCollected += yieldFloat;

    logger.info({
      epochNumber: result.epochNumber,
      yieldUsdc: result.yieldUsdc,
      txHash: result.txHash,
      durationMs: Date.now() - start,
      totalHarvests,
      totalYieldCollected,
    }, '✅ Harvest successful');

    await Promise.all([
      emitMetric('genesis.yield.harvest.success', 1),
      emitMetric('genesis.yield.harvest.yield_usdc', yieldFloat),
      notifySlack({
        type: 'success',
        epoch: result.epochNumber,
        yield: result.yieldUsdc,
        txHash: result.txHash,
        elapsed: Date.now() - start,
      }),
    ]);

  } catch (err: any) {
    consecutiveFailures++;
    const errMsg = err?.message || String(err);

    logger.error({
      err,
      consecutiveFailures,
      maxAllowed: MAX_CONSECUTIVE_FAILURES,
    }, '❌ Harvest failed');

    await emitMetric('genesis.yield.harvest.failure', 1);

    // Page on-call if failures exceed threshold
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.fatal({ consecutiveFailures }, 'CRITICAL: consecutive harvest failures — paging on-call');
      await alertPagerDuty({
        summary: `Genesis Harvest FAILED ${consecutiveFailures} times consecutively`,
        detail: errMsg,
        severity: 'critical',
      });
    }

    // Also send Slack alert on every failure
    await notifySlack({
      type: 'failure',
      error: errMsg,
      count: consecutiveFailures,
    });

  } finally {
    isRunning = false;
  }
}

// ── Alerting helpers ─────────────────────────────────────────────────────────

async function alertPagerDuty(params: {
  summary: string;
  detail: string;
  severity: 'critical' | 'error' | 'warning';
}): Promise<void> {
  if (!PAGERDUTY_KEY) {
    logger.warn('PAGERDUTY_INTEGRATION_KEY not set — alert suppressed');
    return;
  }
  try {
    await axios.post('https://events.pagerduty.com/v2/enqueue', {
      routing_key: PAGERDUTY_KEY,
      event_action: 'trigger',
      payload: {
        summary: params.summary,
        source: 'genesis-harvest-cron',
        severity: params.severity,
        custom_details: { detail: params.detail, consecutiveFailures },
      },
    });
  } catch (e) {
    logger.error({ e }, 'PagerDuty alert failed');
  }
}

async function notifySlack(params: Record<string, unknown>): Promise<void> {
  if (!SLACK_WEBHOOK) return;
  try {
    const isSuccess = params.type === 'success';
    await axios.post(SLACK_WEBHOOK, {
      text: isSuccess
        ? `✅ *Harvest #${totalHarvests}* | Epoch ${params.epoch} | +$${params.yield} USDC | ${params.elapsed}ms`
        : `❌ *Harvest FAILED* (#${params.count} consecutive) | ${params.error}`,
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: isSuccess
            ? `✅ *Yield Harvest Complete*\nEpoch: ${params.epoch}\nYield: \`$${params.yield} USDC\`\nTx: \`${String(params.txHash || '').slice(0, 12)}...\`\nTime: ${params.elapsed}ms`
            : `❌ *Harvest Failed* (${params.count}/${MAX_CONSECUTIVE_FAILURES} before page)\n\`${params.error}\``,
        },
      }],
    });
  } catch {
    // Non-critical — don't throw on Slack failure
  }
}

async function emitMetric(metricName: string, value: number): Promise<void> {
  if (!DATADOG_API_KEY) return;
  try {
    await axios.post(
      'https://api.datadoghq.com/api/v2/series',
      {
        series: [{
          metric: metricName,
          points: [{ timestamp: Math.floor(Date.now() / 1000), value }],
          type: 3,  // gauge
          tags: [`env:${process.env.NODE_ENV || 'development'}`],
        }],
      },
      { headers: { 'DD-API-KEY': DATADOG_API_KEY } }
    );
  } catch {
    // Non-critical
  }
}

// ── Startup health check ──────────────────────────────────────────────────────

async function startup(): Promise<void> {
  logger.info({ schedule: CRON_SCHEDULE }, 'Genesis Harvest Cron starting');

  // Validate operator key is set
  if (!process.env.OPERATOR_PRIVATE_KEY) {
    logger.fatal('OPERATOR_PRIVATE_KEY not set — harvest cron cannot execute');
    process.exit(1);
  }
  if (!process.env.STRATEGY_ROUTER_ADDRESS) {
    logger.fatal('STRATEGY_ROUTER_ADDRESS not set — harvest cron cannot execute');
    process.exit(1);
  }

  // Run once immediately on startup to sync epoch state
  logger.info('Running initial harvest check on startup...');
  await runHarvestCheck();

  // Schedule recurring execution
  cron.schedule(CRON_SCHEDULE, runHarvestCheck, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info({
    schedule: CRON_SCHEDULE,
    pagerduty: !!PAGERDUTY_KEY,
    slack: !!SLACK_WEBHOOK,
    datadog: !!DATADOG_API_KEY,
  }, '✅ Harvest cron scheduled');
}

// ── Status endpoint (for health checks) ─────────────────────────────────────

import http from 'http';

const statusServer = http.createServer((_req, res) => {
  const healthy = consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
  res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: healthy ? 'healthy' : 'degraded',
    consecutiveFailures,
    totalHarvests,
    totalYieldCollected: totalYieldCollected.toFixed(4),
    lastHarvestTime: lastHarvestTime?.toISOString() || null,
    isRunning,
  }));
});

statusServer.listen(parseInt(process.env.CRON_STATUS_PORT || '4001'), () => {
  logger.info('Harvest cron status endpoint on :4001');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — stopping harvest cron');
  statusServer.close();
  process.exit(0);
});

// ── Main ─────────────────────────────────────────────────────────────────────

startup().catch(err => {
  logger.fatal({ err }, 'Harvest cron startup failed');
  process.exit(1);
});
