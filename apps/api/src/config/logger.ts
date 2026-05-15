/**
 * services/config/logger.ts
 * Genesis Reserve — Structured Logger
 *
 * Shared pino logger instance. All services import from here so log
 * configuration is in one place. In production, logs are streamed to
 * Datadog via the pino transport. In development, pino-pretty colorizes output.
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: {
    service: process.env.SERVICE_NAME || 'genesis-api',
    version: process.env.npm_package_version || '1.0.0',
    env:     process.env.NODE_ENV || 'development',
  },
  // ISO timestamps in production (parseable by log aggregators)
  // pino-pretty handles human-readable format in dev
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  // Redact PII fields from logs
  redact: {
    paths: [
      'email', 'email_hash', 'phone', 'phone_hash',
      'walletAddress', 'req.headers.authorization',
      'req.headers["x-api-key"]', 'body.privateKey',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/** Create a child logger with a fixed context (useful per service/module) */
export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
