/**
 * src/server.ts
 * Genesis Reserve â€” Production API Gateway
 *
 * Entry point for all external API traffic. Enforces:
 *   - API key authentication (partners) + JWT (operators)
 *   - Per-partner rate limiting (100 req/min default)
 *   - Idempotency-Key validation on all state-changing endpoints
 *   - Request/response logging with OpenTelemetry tracing
 *   - Structured error responses (RFC 7807 Problem Details)
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { ethers } from 'ethers';
import { createHash } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

import { TreasuryService, TreasuryMode } from './';
import { ComplianceService } from './';
import { LedgerService } from './';
import { AdminService } from './';
import { PrivyAuthService } from './';
import { WalletIdentityService } from './';
import { checkDbHealth, query } from './';

// â”€â”€â”€ LOGGER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// â”€â”€â”€ ERROR TYPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: string
  ) { super(message); }
}

const Errors = {
  UNAUTHORIZED: new ApiError(401, 'UNAUTHORIZED', 'Authentication required'),
  FORBIDDEN: new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'),
  NOT_FOUND: (r: string) => new ApiError(404, 'NOT_FOUND', `${r} not found`),
  IDEMPOTENCY_REQUIRED: new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED',
    'Idempotency-Key header is required for this operation'),
  COMPLIANCE_FAILED: (r: string) => new ApiError(403, 'COMPLIANCE_FAILED',
    'Compliance check failed', r),
  RATE_LIMITED: new ApiError(429, 'RATE_LIMITED', 'Rate limit exceeded'),
  INTERNAL: new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'),
};

const validTreasuryStrategies = new Set(['aave', 'morpho', 'balancer', 'tbills']);

const mapTreasuryError = (err: unknown): ApiError | undefined => {
  if (err instanceof ApiError) return err;

  const message = err instanceof Error ? err.message : '';
  if (!message) return undefined;

  if (message.startsWith('Quote not found or expired:')) {
    return new ApiError(404, 'QUOTE_NOT_FOUND', 'Quote not found or expired', message);
  }

  if (message.startsWith('Quote expired:')) {
    return new ApiError(410, 'QUOTE_EXPIRED', 'Quote expired', message);
  }

  if (message.startsWith('Fund reservation failed:')) {
    return new ApiError(422, 'RESERVATION_FAILED', 'Fund reservation failed', message);
  }

  if (message.startsWith('Order not found:')) {
    return new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found', message);
  }

  if (message.startsWith('Account not found:')) {
    return new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found', message);
  }

  return undefined;
};

// â”€â”€â”€ MIDDLEWARE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Validate Idempotency-Key header on state-changing requests */
const requireIdempotencyKey = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.headers['idempotency-key']) {
    return next(Errors.IDEMPOTENCY_REQUIRED);
  }
  next();
};

/** API Key authentication for partner integrations */
const authenticateApiKey = async (req: Request, _res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) return next(Errors.UNAUTHORIZED);

  try {
    const keyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(apiKey));
    const result = await query<{
      partner_id: string;
      name: string;
      integration_level: number;
      status: string;
      ip_allowlist: string[] | null;
    }>(
      `SELECT partner_id, name, integration_level, status, ip_allowlist
       FROM partners
       WHERE api_key_hash = $1
       LIMIT 1`,
      [keyHash]
    );

    const partner = result.rows[0];
    if (!partner || partner.status !== 'ACTIVE') return next(Errors.UNAUTHORIZED);

    if (partner.ip_allowlist?.length) {
      const sourceIp = (req.ip || '').replace('::ffff:', '');
      const isAllowed = partner.ip_allowlist.some((ip) => sourceIp === ip || sourceIp.endsWith(ip));
      if (!isAllowed) {
        return next(new ApiError(403, 'IP_NOT_ALLOWED', 'Source IP not in partner allowlist'));
      }
    }

    (req as any).partnerId = partner.partner_id;
    (req as any).partnerName = partner.name;
    (req as any).partnerIntegrationLevel = partner.integration_level;
    (req as any).partnerKeyHash = keyHash;
    next();
  } catch (err) {
    next(err);
  }
};

const authenticateAdminKey = async (req: Request, _res: Response, next: NextFunction) => {
  const configuredAdminKey = process.env.GENESIS_ADMIN_API_KEY || '';
  const headerKey = (req.headers['x-admin-key'] as string | undefined)
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);

  if (!configuredAdminKey) {
    return next(new ApiError(500, 'ADMIN_NOT_CONFIGURED', 'GENESIS_ADMIN_API_KEY is not configured'));
  }

  if (!headerKey || headerKey !== configuredAdminKey) {
    return next(new ApiError(401, 'ADMIN_UNAUTHORIZED', 'Admin authentication required'));
  }

  (req as any).adminActor = (req.headers['x-admin-email'] as string | undefined) || 'system-admin';
  next();
};

const privyAuth = new PrivyAuthService();
const walletIdentity = new WalletIdentityService();

const authenticatePrivyUser = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const auth = await privyAuth.authenticate(req.headers as Record<string, unknown>);
    if (!auth) {
      return next(new ApiError(401, 'PRIVY_UNAUTHORIZED', 'Privy authentication required'));
    }

    (req as any).privyAuth = auth;
    const existingUserId = await walletIdentity.resolveUserIdByProviderUserId(auth.providerUserId);
    if (existingUserId) {
      (req as any).authenticatedUserId = existingUserId;
    }

    next();
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    const message = (detail || '').toLowerCase();
    const isTokenError = message.includes('jwt')
      || message.includes('jwk')
      || message.includes('token')
      || message.includes('signature')
      || message.includes('authorization');

    if (isTokenError) {
      return next(new ApiError(401, 'PRIVY_TOKEN_INVALID', 'Invalid Privy bearer token', detail));
    }

    next(err);
  }
};

const requireOwnedAccount = (source: 'params' | 'body' = 'params', field = 'accountId') => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = (req as any).privyAuth;
      if (!auth) {
        return next(new ApiError(401, 'PRIVY_UNAUTHORIZED', 'Privy authentication required'));
      }

      const userId = (req as any).authenticatedUserId || await walletIdentity.resolveUserIdByProviderUserId(auth.providerUserId);
      if (!userId) {
        return next(new ApiError(403, 'ACCOUNT_NOT_LINKED', 'No Genesis account is linked to this Privy identity'));
      }

      const accountId = source === 'params'
        ? req.params[field]
        : (req.body?.[field] as string | undefined);

      if (!accountId || typeof accountId !== 'string') {
        return next(new ApiError(400, 'ACCOUNT_ID_REQUIRED', `${field} is required`));
      }

      const owned = await walletIdentity.assertAccountOwnership(userId, accountId);
      if (!owned) {
        return next(new ApiError(403, 'ACCOUNT_OWNERSHIP_FAILED', 'Requested account does not belong to authenticated user'));
      }

      (req as any).authenticatedUserId = userId;
      (req as any).authenticatedAccountId = accountId;
      next();
    } catch (err) {
      next(err);
    }
  };
};

const hasPrivyAuthHint = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) return true;

  return Boolean(
    req.headers['x-privy-user-id']
    || req.headers['x-wallet-address']
    || req.headers['x-genesis-wallet-address']
    || req.headers['x-smart-account-address']
  );
};

const authenticatePrivyUserIfPresent = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!hasPrivyAuthHint(req)) return next();

    const auth = await privyAuth.authenticate(req.headers as Record<string, unknown>);
    if (!auth) {
      return next(new ApiError(401, 'PRIVY_UNAUTHORIZED', 'Privy authentication required'));
    }

    (req as any).privyAuth = auth;
    const existingUserId = await walletIdentity.resolveUserIdByProviderUserId(auth.providerUserId);
    if (existingUserId) {
      (req as any).authenticatedUserId = existingUserId;
    }

    next();
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    const message = (detail || '').toLowerCase();
    const isTokenError = message.includes('jwt')
      || message.includes('jwk')
      || message.includes('token')
      || message.includes('signature')
      || message.includes('authorization');

    if (isTokenError) {
      return next(new ApiError(401, 'PRIVY_TOKEN_INVALID', 'Invalid Privy bearer token', detail));
    }

    next(err);
  }
};

const requireOwnedAccountIfPrivy = (source: 'params' | 'body' = 'params', field = 'accountId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!hasPrivyAuthHint(req)) return next();

    await authenticatePrivyUserIfPresent(req, res, async (err?: any) => {
      if (err) return next(err);
      await requireOwnedAccount(source, field)(req, res, next);
    });
  };
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, [key, val]) => {
        acc[key] = canonicalize(val);
        return acc;
      }, {});
    return sorted;
  }
  return value;
};

const buildRequestHash = (req: Request): string => {
  const payload = {
    method: req.method,
    path: `${req.baseUrl}${req.path}`,
    body: canonicalize(req.body || {}),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const enforceIdempotency = async (req: Request, res: Response, next: NextFunction) => {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey) return next(Errors.IDEMPOTENCY_REQUIRED);

  const partnerId = (req as any).partnerId as string | undefined;
  if (!partnerId) return next(Errors.UNAUTHORIZED);

  const operationScope = `${req.method}:${req.baseUrl}${req.path}`;
  const requestHash = buildRequestHash(req);

  try {
    const existingResult = await query<{
      idempotency_key: string;
      request_hash: string;
      status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
      response_code: number | null;
      response_body: unknown;
      locked_until: Date | null;
    }>(
      `SELECT idempotency_key, request_hash, status, response_code, response_body, locked_until
       FROM api_idempotency_keys
       WHERE partner_id = $1 AND operation_scope = $2 AND idempotency_key = $3
       LIMIT 1`,
      [partnerId, operationScope, idempotencyKey]
    );

    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash) {
        return next(new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key reused with different request payload'));
      }

      if (existing.status === 'COMPLETED') {
        const code = existing.response_code ?? 200;
        return res.status(code).json(existing.response_body as Record<string, unknown>);
      }

      if (existing.status === 'PROCESSING' && existing.locked_until && existing.locked_until > new Date()) {
        return next(new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is already processing'));
      }

      await query(
        `UPDATE api_idempotency_keys
         SET status = 'PROCESSING', locked_until = NOW() + INTERVAL '2 minutes', updated_at = NOW()
         WHERE partner_id = $1 AND operation_scope = $2 AND idempotency_key = $3`,
        [partnerId, operationScope, idempotencyKey]
      );
    } else {
      await query(
        `INSERT INTO api_idempotency_keys
           (partner_id, operation_scope, idempotency_key, request_hash, status, locked_until)
         VALUES ($1, $2, $3, $4, 'PROCESSING', NOW() + INTERVAL '2 minutes')`,
        [partnerId, operationScope, idempotencyKey, requestHash]
      );
    }

    const originalJson = res.json.bind(res);
    let responseBody: unknown;
    res.json = ((body: unknown) => {
      responseBody = body;
      return originalJson(body);
    }) as Response['json'];

    res.on('finish', async () => {
      try {
        if (res.statusCode >= 500) {
          await query(
            `UPDATE api_idempotency_keys
             SET status = 'FAILED', response_code = $4, response_body = $5::jsonb,
                 locked_until = NULL, updated_at = NOW()
             WHERE partner_id = $1 AND operation_scope = $2 AND idempotency_key = $3`,
            [partnerId, operationScope, idempotencyKey, res.statusCode, JSON.stringify(responseBody ?? { error: 'internal_error' })]
          );
          return;
        }

        await query(
          `UPDATE api_idempotency_keys
           SET status = 'COMPLETED', response_code = $4, response_body = $5::jsonb,
               locked_until = NULL, completed_at = NOW(), updated_at = NOW()
           WHERE partner_id = $1 AND operation_scope = $2 AND idempotency_key = $3`,
          [partnerId, operationScope, idempotencyKey, res.statusCode, JSON.stringify(responseBody ?? {})]
        );
      } catch (err) {
        logger.warn({ err, idempotencyKey, partnerId }, 'Failed to persist idempotency response state');
      }
    });

    next();
  } catch (err) {
    next(err);
  }
};

/** Validate address format for path params */
const validateAddress = (param: string) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const addr = req.params[param];
    if (!ethers.utils.isAddress(addr)) {
      return next(new ApiError(400, 'INVALID_ADDRESS', `${param} is not a valid Ethereum address`));
    }
    next();
  };

/** Validate account ID format */
const validateAccountId = (req: Request, _res: Response, next: NextFunction) => {
  const { accountId } = req.params;
  if (!accountId || !accountId.startsWith('pta-')) {
    return next(new ApiError(400, 'INVALID_ACCOUNT_ID', 'Account ID must start with pta-'));
  }
  next();
};

// â”€â”€â”€ SERVICES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ WEBHOOKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { onfidoWebhookHandler } from './';
import { chainalysisWebhookHandler } from './';
import { zeroHashWebhookHandler } from './';

const treasury = new TreasuryService({
  rpcUrl: process.env.RPC_URL || 'https://arb-sepolia.g.alchemy.com/v2/...',
  vaultAddress: process.env.GENESIS_VAULT_ADDRESS || '',
  operatorKey: process.env.OPERATOR_PRIVATE_KEY || '',
  chainId: parseInt(process.env.CHAIN_ID || '421614'),
});
const ledger = new LedgerService();
const compliance = new ComplianceService();
const admin = new AdminService();

// â”€â”€â”€ APP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BigInt serialization: convert to string when JSON.stringify encounters BigInt
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// Per-IP global rate limit
app.use(rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
}));

// Per-partner stricter rate limit (applied to auth'd routes)
const partnerRateLimit = rateLimit({
  windowMs: 60_000,
  max: 100,
  keyGenerator: (req) => (req as any).partnerId || req.ip,
});

const adminRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => (req as any).adminActor || req.ip,
});

const walletRateLimit = rateLimit({
  windowMs: 60_000,
  max: 90,
  keyGenerator: (req) => (req as any).authenticatedUserId || (req as any).privyAuth?.providerUserId || req.ip,
});

// â”€â”€â”€ HEALTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() });
});
app.get('/ready', async (_req, res) => {
  try {
    const dbOk = await checkDbHealth();
    let chainOk = false;
    try {
      const provider = new ethers.providers.JsonRpcProvider(
        process.env.RPC_URL || process.env.ALCHEMY_RPC_URL || ''
      );
      const block = await provider.getBlockNumber();
      chainOk = Number.isFinite(block) && block > 0;
    } catch {
      chainOk = false;
    }

    if (!dbOk || !chainOk) {
      return res.status(503).json({
        status: 'not_ready',
        components: { db: dbOk ? 'ok' : 'down', chain: chainOk ? 'ok' : 'down', redis: 'unknown' },
      });
    }

    res.json({ status: 'ready', components: { db: 'ok', chain: 'ok', redis: 'unknown' } });
  } catch (e) {
    res.status(503).json({ status: 'not_ready' });
  }
});

// â”€â”€â”€ TREASURY ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const treasuryRouter = express.Router();
treasuryRouter.use(authenticateApiKey, partnerRateLimit, authenticatePrivyUserIfPresent);

/**
 * POST /v1/treasury/accounts
 * Activate a new Programmable Treasury Account after KYC completion.
 * Idempotent: same wallet address returns existing account.
 */
treasuryRouter.post('/accounts', requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { walletAddress, mode, kycLevel, riskTier, jurisdiction } = req.body;
    if (!ethers.utils.isAddress(walletAddress)) {
      throw new ApiError(400, 'INVALID_ADDRESS', 'walletAddress is not valid');
    }
    const account = await treasury.activateAccount({
      ownerId: req.body.ownerId || walletAddress,
      walletAddress,
      mode: mode ?? TreasuryMode.FlexibleReserve,
      kycLevel: kycLevel ?? 1,
      riskTier: riskTier ?? 0,
      jurisdiction: jurisdiction || 'US',
      partnerPricingId: (req as any).partnerId,
    });
    res.status(201).json({ data: account });
  } catch (e) { next(e); }
});

/**
 * GET /v1/treasury/accounts/:accountId
 * Retrieve account details and current balance.
 */
treasuryRouter.get('/accounts/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const balance = await treasury.getBalance(req.params.accountId);
    res.json({ data: balance });
  } catch (e) { next(e); }
});

/**
 * GET /v1/treasury/balance/:accountId
 * Real-time balance (available, reserved, invested, yield).
 */
treasuryRouter.get('/balance/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const balance = await treasury.getBalance(req.params.accountId);
    res.json({ data: balance });
  } catch (e) { next(e); }
});

/**
 * GET /v1/treasury/strategy-preference/:walletAddress
 * Resolve persisted strategy preference for a wallet.
 */
treasuryRouter.get('/strategy-preference/:walletAddress', async (req, res, next) => {
  try {
    const walletAddress = String(req.params.walletAddress || '').toLowerCase();
    if (!ethers.utils.isAddress(walletAddress)) {
      throw new ApiError(400, 'INVALID_ADDRESS', 'walletAddress is not valid');
    }

    const pref = await query<{ strategy: string | null; updated_by: string | null; updated_at: string | null }>(
      `SELECT strategy, updated_by, updated_at::text
       FROM treasury_strategy_preferences
       WHERE wallet_address = $1
       LIMIT 1`,
      [walletAddress]
    );

    res.json({
      data: {
        walletAddress,
        strategy: pref.rows[0]?.strategy ?? null,
        updatedBy: pref.rows[0]?.updated_by ?? null,
        updatedAt: pref.rows[0]?.updated_at ?? null,
      },
    });
  } catch (e) { next(e); }
});

/**
 * POST /v1/treasury/strategy-preference
 * Persist a user's selected strategy profile.
 */
treasuryRouter.post('/strategy-preference', requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const walletAddress = String(req.body.walletAddress || '').toLowerCase();
    const strategy = String(req.body.strategy || '').toLowerCase();
    const updatedBy = req.body.updatedBy ? String(req.body.updatedBy) : null;

    if (!ethers.utils.isAddress(walletAddress)) {
      throw new ApiError(400, 'INVALID_ADDRESS', 'walletAddress is not valid');
    }

    if (!validTreasuryStrategies.has(strategy)) {
      throw new ApiError(400, 'INVALID_STRATEGY', 'strategy must be one of aave, morpho, balancer, tbills');
    }

    const result = await query<{ strategy: string; updated_by: string | null; updated_at: string }>(
      `INSERT INTO treasury_strategy_preferences (wallet_address, strategy, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address)
       DO UPDATE SET strategy = EXCLUDED.strategy, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING strategy, updated_by, updated_at::text`,
      [walletAddress, strategy, updatedBy]
    );

    res.status(201).json({
      data: {
        walletAddress,
        strategy: result.rows[0]?.strategy ?? strategy,
        updatedBy: result.rows[0]?.updated_by ?? updatedBy,
        updatedAt: result.rows[0]?.updated_at ?? new Date().toISOString(),
      },
    });
  } catch (e) { next(e); }
});

/**
 * POST /v1/treasury/deposit-intents
 * Record intent telemetry for vault deposit orchestration.
 */
treasuryRouter.post('/deposit-intents', requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const walletAddress = String(req.body.walletAddress || '').toLowerCase();
    const strategy = String(req.body.strategy || '').toLowerCase();
    const amountValue = Number(req.body.amount || 0);
    const accountId = req.body.accountId ? String(req.body.accountId) : null;
    const source = req.body.source ? String(req.body.source) : 'wallet-usdc';
    const metadata = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

    if (!ethers.utils.isAddress(walletAddress)) {
      throw new ApiError(400, 'INVALID_ADDRESS', 'walletAddress is not valid');
    }

    if (!validTreasuryStrategies.has(strategy)) {
      throw new ApiError(400, 'INVALID_STRATEGY', 'strategy must be one of aave, morpho, balancer, tbills');
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new ApiError(400, 'INVALID_AMOUNT', 'amount must be a positive numeric value');
    }

    const intent = await query<{ intent_id: string; created_at: string }>(
      `INSERT INTO treasury_deposit_intents
         (wallet_address, strategy, amount, account_id, source, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'RECORDED')
       RETURNING intent_id::text, created_at::text`,
      [walletAddress, strategy, amountValue.toString(), accountId, source, JSON.stringify(metadata)]
    );

    res.status(201).json({
      data: {
        intentId: intent.rows[0]?.intent_id,
        walletAddress,
        strategy,
        amount: amountValue.toString(),
        accountId,
        source,
        metadata,
        status: 'RECORDED',
        createdAt: intent.rows[0]?.created_at ?? new Date().toISOString(),
      },
    });
  } catch (e) { next(e); }
});

/**
 * POST /v1/treasury/reserve
 * Reserve funds for an outgoing transfer.
 * MUST be called before any remittance order is executed.
 */
treasuryRouter.post('/reserve', requireOwnedAccountIfPrivy('body', 'accountId'), requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { accountId, amount, externalOrderId, expirySeconds } = req.body;
    if (!accountId || !amount) {
      throw new ApiError(400, 'MISSING_PARAMS', 'accountId and amount are required');
    }
    const reservation = await treasury.reserveFunds({
      accountId,
      amount: BigInt(amount),
      externalOrderId: externalOrderId || `ext-${Date.now()}`,
      expirySeconds: expirySeconds || 300,
      idempotencyKey: req.headers['idempotency-key'] as string,
    });
    res.status(reservation.status === 'RESERVED' ? 201 : 422).json({ data: reservation });
  } catch (e) { next(e); }
});

/**
 * POST /v1/treasury/finalize
 * Finalize a reservation after successful payout.
 */
treasuryRouter.post('/finalize', requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { reservationId, orderId, platformFee, partnerFee, fxDetails, settlementRef, txHash } = req.body;
    await treasury.finalizeOrder({
      reservationId,
      orderId,
      platformFee: BigInt(platformFee || 0),
      partnerFee: BigInt(partnerFee || 0),
      fxDetails: fxDetails || { executedRate: 0, slippageBps: 0, provider: 'genesis' },
      settlementRef: settlementRef || '',
      txHash: txHash || '',
    });
    res.json({ data: { status: 'SETTLED', orderId } });
  } catch (e) {
    next(mapTreasuryError(e) ?? e);
  }
});

/**
 * POST /v1/treasury/mode
 * Update an account's treasury mode (FlexibleReserve, IncomeVault, GrowthMode).
 */
treasuryRouter.post('/mode', requireOwnedAccountIfPrivy('body', 'accountId'), requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { accountId, mode } = req.body;
    if (mode === undefined || mode < 0 || mode > 2) {
      throw new ApiError(400, 'INVALID_MODE', 'mode must be 0 (Flexible), 1 (Income), or 2 (Growth)');
    }
    await treasury.updateTreasuryMode(accountId, mode as TreasuryMode);
    res.json({ data: { accountId, mode, status: 'APPLIED' } });
  } catch (e) { next(e); }
});

/**
 * GET /v1/treasury/risk
 * Platform risk report: concentration, liquidity bands, stress test.
 */
treasuryRouter.get('/risk', async (_req, res, next) => {
  try {
    const report = await treasury.getRiskReport();
    res.json({ data: report });
  } catch (e) { next(e); }
});

/**
 * GET /v1/treasury/yield/:accountId
 * Yield history for an account.
 */
treasuryRouter.get('/yield/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string || '30');
    const report = await treasury.getYieldReport(req.params.accountId, days);
    res.json({ data: report });
  } catch (e) { next(e); }
});

// â”€â”€â”€ REMITTANCE ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const remittanceRouter = express.Router();
remittanceRouter.use(authenticateApiKey, partnerRateLimit, authenticatePrivyUserIfPresent);

/**
 * POST /v1/remittance/quote
 * Build a locked FX quote. Valid for 5 minutes.
 */
remittanceRouter.post('/quote', requireOwnedAccountIfPrivy('body', 'accountId'), requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { accountId, sendAmount, sendCurrency, receiveCurrency, corridor, payoutMethod } = req.body;
    const quote = await treasury.buildQuote({
      accountId,
      sendAmount: BigInt(sendAmount || 0),
      sendCurrency: sendCurrency || 'USDC',
      receiveCurrency: receiveCurrency || 'PHP',
      corridor: corridor || 'US-PH',
      payoutMethod: payoutMethod || 'bank_transfer',
      idempotencyKey: req.headers['idempotency-key'] as string,
    });
    res.status(201).json({ data: quote });
  } catch (e) { next(e); }
});

/**
 * POST /v1/remittance/order
 * Execute a remittance from a locked quote.
 */
remittanceRouter.post('/order', requireOwnedAccountIfPrivy('body', 'accountId'), requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { quoteId, accountId, recipientId, payoutMethod, travelRuleData } = req.body;
    const order = await treasury.createOrder({
      quoteId,
      accountId,
      recipientId,
      payoutMethod: payoutMethod || 'bank_transfer',
      idempotencyKey: req.headers['idempotency-key'] as string,
      travelRuleData,
    });
    res.status(201).json({ data: order });
  } catch (e) {
    next(mapTreasuryError(e) ?? e);
  }
});

/**
 * GET /v1/remittance/order/:orderId
 * Order status and tracking.
 */
remittanceRouter.get('/order/:orderId', async (req, res, next) => {
  try {
    const order = await ledger.getOrder(req.params.orderId);
    if (!order) throw Errors.NOT_FOUND('Order');
    res.json({ data: order });
  } catch (e) { next(e); }
});

// â”€â”€â”€ RECIPIENTS ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const recipientsRouter = express.Router();
recipientsRouter.use(authenticateApiKey, partnerRateLimit, authenticatePrivyUserIfPresent);

/**
 * GET /v1/remittance/recipients/:accountId
 * List saved recipients for an account (where status='ACTIVE').
 */
recipientsRouter.get('/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const { corridor, payoutMethod } = req.query as Record<string, string>;
    let sql = `
      SELECT
        recipient_id, account_id, display_name, recipient_type, corridor,
        payout_method, recipient_address, recipient_name, recipient_phone,
        recipient_email, bank_code, bank_name, branch_code, account_number,
        account_type, mobile_provider, mobile_number, metadata,
        verification_status, verified_at, memo, is_default, status, created_at, updated_at
      FROM remittance_recipients
      WHERE account_id = $1 AND status = 'ACTIVE'
    `;
    const params: any[] = [req.params.accountId];
    const pIdx = params.length;

    if (corridor) {
      params.push(corridor);
      sql += ` AND corridor = $${pIdx + 1}`;
    }
    if (payoutMethod) {
      params.push(payoutMethod);
      sql += ` AND payout_method = $${pIdx + (corridor ? 2 : 1)}`;
    }

    sql += ` ORDER BY is_default DESC, updated_at DESC`;

    const result = await query<any>(sql, params);
    res.json({
      data: {
        accountId: req.params.accountId,
        recipients: result.rows || [],
        fetchedAt: new Date().toISOString(),
      }
    });
  } catch (e) { next(e); }
});

/**
 * POST /v1/remittance/recipients
 * Create or update a saved recipient.
 */
recipientsRouter.post('/', requireOwnedAccountIfPrivy('body', 'accountId'), requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const {
      accountId, displayName, recipientType, corridor, payoutMethod,
      recipientAddress, recipientName, recipientPhone, recipientEmail,
      bankCode, bankName, branchCode, accountNumber, accountType,
      mobileProvider, mobileNumber, memo, isDefault, metadata,
    } = req.body;

    if (!accountId || !displayName || !corridor || !payoutMethod) {
      throw new ApiError(400, 'MISSING_PARAMS', 'accountId, displayName, corridor, payoutMethod are required');
    }

    const recipientId = `recip-${accountId.split('-')[1]}-${Math.random().toString(36).slice(2, 8)}`;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    // If marking as default, unset others in same corridor
    if (isDefault) {
      await query(
        `UPDATE remittance_recipients
         SET is_default = FALSE
         WHERE account_id = $1 AND corridor = $2 AND status = 'ACTIVE'`,
        [accountId, corridor]
      );
    }

    await query(
      `INSERT INTO remittance_recipients
       (recipient_id, account_id, display_name, recipient_type, corridor, payout_method,
        recipient_address, recipient_name, recipient_phone, recipient_email,
        bank_code, bank_name, branch_code, account_number, account_type,
        mobile_provider, mobile_number, memo, is_default, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'ACTIVE')`,
      [
        recipientId, accountId, displayName, recipientType || 'INDIVIDUAL', corridor, payoutMethod,
        recipientAddress, recipientName, recipientPhone, recipientEmail,
        bankCode, bankName, branchCode, accountNumber, accountType,
        mobileProvider, mobileNumber, memo, isDefault || false,
        JSON.stringify(metadata || {}),
      ]
    );

    const result = await query(`SELECT * FROM remittance_recipients WHERE recipient_id = $1`, [recipientId]);
    res.status(201).json({ data: result.rows[0] });
  } catch (e) { next(e); }
});

/**
 * PATCH /v1/remittance/recipients/:recipientId
 * Update a recipient's details.
 */
recipientsRouter.patch('/:recipientId', requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { displayName, memo, isDefault, verificationStatus } = req.body;
    const recipientId = req.params.recipientId;

    // Get current recipient to check account_id and corridor
    const existing = await query<any>(
      `SELECT account_id, corridor FROM remittance_recipients WHERE recipient_id = $1`,
      [recipientId]
    );
    if (!existing.rows[0]) throw Errors.NOT_FOUND('Recipient');

    const { account_id: accountId, corridor } = existing.rows[0];

    // If setting as default, unset other defaults in same corridor
    if (isDefault) {
      await query(
        `UPDATE remittance_recipients
         SET is_default = FALSE
         WHERE account_id = $1 AND corridor = $2 AND recipient_id != $3 AND status = 'ACTIVE'`,
        [accountId, corridor, recipientId]
      );
    }

    const updates = [];
    const params: any[] = [];
    let idx = 1;

    if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); params.push(displayName); }
    if (memo !== undefined) { updates.push(`memo = $${idx++}`); params.push(memo); }
    if (isDefault !== undefined) { updates.push(`is_default = $${idx++}`); params.push(isDefault); }
    if (verificationStatus !== undefined) { updates.push(`verification_status = $${idx++}`); params.push(verificationStatus); }

    if (updates.length === 0) {
      const result = await query(`SELECT * FROM remittance_recipients WHERE recipient_id = $1`, [recipientId]);
      return res.json({ data: result.rows[0] });
    }

    updates.push(`updated_at = NOW()`);
    params.push(recipientId);

    const result = await query(
      `UPDATE remittance_recipients SET ${updates.join(', ')} WHERE recipient_id = $${idx} RETURNING *`,
      params
    );

    res.json({ data: result.rows[0] });
  } catch (e) { next(e); }
});

// â”€â”€â”€ LEDGER ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ledgerRouter = express.Router();
ledgerRouter.use(authenticateApiKey, partnerRateLimit, authenticatePrivyUserIfPresent);

/**
 * GET /v1/ledger/entries/:accountId
 * Paginated ledger entry history for an account.
 */
ledgerRouter.get('/entries/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20', types, from, to } = req.query as Record<string, string>;
    const result = await ledger.getEntries({
      accountId: req.params.accountId,
      types: types ? types.split(',') as any : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: parseInt(page),
      pageSize: Math.min(parseInt(pageSize), 100),
    });
    res.json({ data: result });
  } catch (e) { next(e); }
});

/**
 * GET /v1/ledger/balance/:accountId
 * Derived balance snapshot from ledger entries.
 */
ledgerRouter.get('/balance/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const balance = await ledger.getAccountLedger(req.params.accountId);
    res.json({ data: balance });
  } catch (e) { next(e); }
});

/**
 * GET /v1/ledger/export/:accountId
 * ISO 20022 camt.053 export for bank reconciliation.
 */
ledgerRouter.get('/export/:accountId', validateAccountId, requireOwnedAccountIfPrivy('params', 'accountId'), async (req, res, next) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const statement = await ledger.exportISO20022(
      req.params.accountId,
      from ? new Date(from) : new Date(Date.now() - 30 * 86400_000),
      to ? new Date(to) : new Date()
    );
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="statement-${req.params.accountId}-${Date.now()}.json"`);
    res.json(statement);
  } catch (e) { next(e); }
});

/**
 * POST /v1/ledger/reconcile
 * Trigger on-demand reconciliation check.
 */
ledgerRouter.post('/reconcile', async (req, res, next) => {
  try {
    const { onChainAvailable, onChainReserved, onChainDeployed } = req.body;
    const report = await ledger.reconcile({
      available: BigInt(onChainAvailable || 0),
      reserved: BigInt(onChainReserved || 0),
      deployed: BigInt(onChainDeployed || 0),
    });
    res.json({ data: report });
  } catch (e) { next(e); }
});

// â”€â”€â”€ COMPLIANCE ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const complianceRouter = express.Router();
complianceRouter.use(authenticateApiKey, partnerRateLimit);

/**
 * GET /v1/compliance/status/:walletAddress
 * On-chain compliance record for a wallet.
 */
complianceRouter.get('/status/:walletAddress', validateAddress('walletAddress'), async (req, res, next) => {
  try {
    const status = await compliance.getAccountStatus(req.params.walletAddress);
    if (!status) throw Errors.NOT_FOUND('Wallet compliance status');
    res.json({ data: status });
  } catch (e) { next(e); }
});

/**
 * POST /v1/compliance/screen
 * On-demand AML/sanctions screening.
 */
complianceRouter.post('/screen', requireIdempotencyKey, enforceIdempotency, async (req, res, next) => {
  try {
    const { walletAddress, toAddress, amount, orderId, corridor } = req.body;
    const screen = await compliance.screenTransfer({
      fromAddress: walletAddress,
      toAddress: toAddress || walletAddress,
      amount: BigInt(amount || 0),
      orderId: orderId || `scr_${Date.now().toString(36)}`,
      corridor,
    });
    res.json({ data: screen });
  } catch (e) { next(e); }
});

// â”€â”€â”€ ADMIN ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const adminRouter = express.Router();
adminRouter.use(authenticateAdminKey, adminRateLimit);

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    res.json({ data: await admin.getStats() });
  } catch (e) { next(e); }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '8'), 25);
    res.json({ data: await admin.getUsers(limit) });
  } catch (e) { next(e); }
});

adminRouter.get('/queue', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '10'), 25);
    res.json({ data: await admin.getQueue(limit) });
  } catch (e) { next(e); }
});

adminRouter.get('/feature-flags', async (_req, res, next) => {
  try {
    res.json({ data: await admin.getFeatureFlags() });
  } catch (e) { next(e); }
});

// â”€â”€â”€ WALLET / PRIVY ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const walletRouter = express.Router();
walletRouter.use(authenticatePrivyUser, walletRateLimit);

walletRouter.post('/register', async (req, res, next) => {
  try {
    const registration = await walletIdentity.registerWallets({
      auth: (req as any).privyAuth,
      embeddedWalletAddress: req.body.embeddedWalletAddress || req.body.walletAddress || req.headers['x-wallet-address'],
      smartAccountAddress: req.body.smartAccountAddress || req.headers['x-smart-account-address'],
      externalWalletAddress: req.body.externalWalletAddress,
      chainId: req.body.chainId ? Number(req.body.chainId) : undefined,
      country: req.body.country,
      jurisdiction: req.body.jurisdiction,
      loginMethod: req.body.loginMethod,
      accountId: req.body.accountId,
    });

    (req as any).authenticatedUserId = registration.userId;

    res.status(201).json({
      data: {
        userId: registration.userId,
        authIdentityId: registration.authIdentityId,
        primaryWalletId: registration.primaryWalletId,
        activeAccountId: registration.accountId,
        accounts: [
          {
            accountId: registration.accountId,
            label: `Primary ${registration.accountId}`,
            mode: 0,
          },
        ],
        wallets: registration.wallets,
      },
    });
  } catch (e) { next(e); }
});

walletRouter.get('/me', async (req, res, next) => {
  try {
    const auth = (req as any).privyAuth;
    const userId = (req as any).authenticatedUserId || await walletIdentity.resolveUserIdByProviderUserId(auth.providerUserId);
    if (!userId) {
      return next(new ApiError(404, 'USER_NOT_LINKED', 'Privy identity is not linked to a Genesis user yet'));
    }

    const accounts = await walletIdentity.getAccountsForUser(userId);
    res.json({ data: { userId, accounts } });
  } catch (e) { next(e); }
});

walletRouter.get('/accounts/:accountId', validateAccountId, requireOwnedAccount('params', 'accountId'), async (req, res, next) => {
  try {
    const balance = await treasury.getBalance(req.params.accountId);
    res.json({ data: balance });
  } catch (e) { next(e); }
});

// â”€â”€â”€ WEBHOOK ROUTES (no auth â€” signature verified inside handlers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const rawBodyCapture = (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; };

app.post('/webhooks/onfido', express.json({ verify: rawBodyCapture }), onfidoWebhookHandler);
app.post('/webhooks/chainalysis', express.json(), chainalysisWebhookHandler);
app.post('/webhooks/zerohash', express.json({ verify: rawBodyCapture }), zeroHashWebhookHandler);

// â”€â”€â”€ ROUTE MOUNTING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const v1 = express.Router();
v1.use('/treasury', treasuryRouter);
v1.use('/remittance', remittanceRouter);
v1.use('/remittance/recipients', recipientsRouter);
v1.use('/ledger', ledgerRouter);
v1.use('/compliance', complianceRouter);
v1.use('/admin', adminRouter);
v1.use('/wallets', walletRouter);
app.use('/v1', v1);

// â”€â”€â”€ GLOBAL ERROR HANDLER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof ApiError ? err.status : 500;
  const code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
  const msg = err instanceof ApiError ? err.message : 'Internal server error';

  if (status >= 500) {
    logger.error({ err, url: req.url, method: req.method }, 'Unhandled API error');
  }

  res.status(status).json({
    error: {
      code,
      message: msg,
      detail: err.detail || undefined,
      request_id: req.headers['x-request-id'] || null,
      timestamp: new Date().toISOString(),
    }
  });
});

// â”€â”€â”€ START â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PORT = parseInt(process.env.PORT || '4000');
app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' },
    'âš¡ Genesis Reserve API Gateway running');
});

export default app;
export { logger };

