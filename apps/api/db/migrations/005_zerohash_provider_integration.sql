-- ============================================================
-- Genesis Reserve — Zero Hash Provider Integration Foundation
-- Migration 005
-- ============================================================

BEGIN;

ALTER TABLE remittance_orders
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'GENESIS_STUB',
  ADD COLUMN IF NOT EXISTS provider_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_payload JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_orders_provider_transfer
  ON remittance_orders (provider, provider_transfer_id);

CREATE TABLE IF NOT EXISTS provider_accounts (
  provider_account_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id             TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  provider               TEXT NOT NULL,
  provider_customer_id   TEXT NOT NULL,
  provider_wallet_id     TEXT,
  provider_wallet_address TEXT,
  status                 TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider
  ON provider_accounts (provider, provider_customer_id);

CREATE TABLE IF NOT EXISTS provider_webhook_events (
  provider_webhook_event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider                  TEXT NOT NULL,
  provider_event_id         TEXT NOT NULL,
  event_type                TEXT NOT NULL,
  event_payload             JSONB NOT NULL,
  signature_valid           BOOLEAN NOT NULL DEFAULT FALSE,
  processed                 BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_events_unprocessed
  ON provider_webhook_events (provider, processed, created_at DESC);

COMMIT;
