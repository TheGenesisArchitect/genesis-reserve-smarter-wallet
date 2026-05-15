-- ============================================================
-- Genesis Reserve — Card Issuing Schema
-- Migration: 010_card_issuing_schema.sql
-- PostgreSQL 15+
-- Depends on: 001_master_schema.sql (treasury_accounts, users)
-- ============================================================
-- Run with: psql -U genesis -d genesis_ledger -f 010_card_issuing_schema.sql
-- ============================================================

BEGIN;

-- ============================================================
-- CARDHOLDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS card_issuers (
  cardholder_id     TEXT PRIMARY KEY,                  -- ch_{timestamp}{random}
  account_id        TEXT NOT NULL,                     -- treasury_accounts.account_id ref
  legal_name        TEXT NOT NULL,
  email             TEXT,                              -- PII — encrypt at rest
  phone             TEXT,                              -- PII — encrypt at rest
  kyc_tier          SMALLINT NOT NULL DEFAULT 1
                    CHECK (kyc_tier BETWEEN 0 AND 3),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('pending','active','restricted','blocked')),
  billing_address   JSONB NOT NULL DEFAULT '{}',       -- structured address object
  processor_ref     TEXT,                              -- Stripe cardholder id or equivalent
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_issuers_account
  ON card_issuers (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_issuers_status
  ON card_issuers (status);

-- ============================================================
-- GENESIS ISSUED CARDS (virtual + physical)
-- ============================================================

CREATE TABLE IF NOT EXISTS issued_cards (
  card_id           TEXT PRIMARY KEY,                  -- card_{timestamp}{random}
  account_id        TEXT NOT NULL,
  cardholder_id     TEXT NOT NULL REFERENCES card_issuers(cardholder_id),
  card_type         TEXT NOT NULL
                    CHECK (card_type IN ('virtual','physical')),
  brand             TEXT NOT NULL
                    CHECK (brand IN ('visa','mastercard')),
  status            TEXT NOT NULL DEFAULT 'requested'
                    CHECK (status IN (
                      'requested','pending_kyc','pending_fulfillment',
                      'active','frozen','blocked','canceled'
                    )),
  last4             CHAR(4) NOT NULL,
  expiry_month      SMALLINT NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year       SMALLINT NOT NULL CHECK (expiry_year >= 2026),
  controls          JSONB NOT NULL DEFAULT '{
    "online": true,
    "atm": false,
    "international": false
  }',
  shipping          JSONB,                             -- null for virtual
  processor_ref     TEXT,                              -- Stripe card id or equivalent
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issued_cards_account
  ON issued_cards (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issued_cards_cardholder
  ON issued_cards (cardholder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issued_cards_status
  ON issued_cards (status, created_at DESC);

-- ============================================================
-- LINKED EXTERNAL DEBIT CARDS
-- ============================================================

CREATE TABLE IF NOT EXISTS linked_debit_cards (
  linked_card_id    TEXT PRIMARY KEY,                  -- ldc_{timestamp}{random}
  account_id        TEXT NOT NULL,
  cardholder_name   TEXT NOT NULL,
  brand             TEXT NOT NULL,
  bin               CHAR(6),                           -- first 6 digits (BIN)
  last4             CHAR(4) NOT NULL,
  exp_month         SMALLINT NOT NULL,
  exp_year          SMALLINT NOT NULL,
  funding_eligible  BOOLEAN NOT NULL DEFAULT TRUE,
  payout_eligible   BOOLEAN NOT NULL DEFAULT TRUE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','blocked','removed')),
  network_token_ref TEXT,                              -- MDES / Visa Token Service ref
  processor_token_ref TEXT,                           -- Stripe payment method id or equiv
  billing_address   JSONB,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_linked_debit_cards_account
  ON linked_debit_cards (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_linked_debit_cards_status
  ON linked_debit_cards (status);

-- ============================================================
-- CARD AUTHORIZATIONS (real-time auth events)
-- ============================================================

CREATE TABLE IF NOT EXISTS card_authorizations (
  authorization_id  TEXT PRIMARY KEY,                  -- auth_{timestamp}{random}
  card_id           TEXT NOT NULL REFERENCES issued_cards(card_id),
  account_id        TEXT NOT NULL,
  merchant_name     TEXT,
  mcc               CHAR(4),
  amount            NUMERIC(18,2) NOT NULL,
  currency          CHAR(4) NOT NULL DEFAULT 'USD',
  settled_amount    NUMERIC(18,2),
  settled_currency  CHAR(4),
  status            TEXT NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('approved','declined','reversed','cleared')),
  decline_code      TEXT,
  processor_ref     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_auth_card
  ON card_authorizations (card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_auth_account
  ON card_authorizations (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_auth_status
  ON card_authorizations (status, created_at DESC);

-- ============================================================
-- FUNDING TRANSACTIONS (add-money flows)
-- ============================================================

CREATE TABLE IF NOT EXISTS card_funding_transactions (
  funding_id        TEXT PRIMARY KEY,                  -- fund_{timestamp}{random}
  account_id        TEXT NOT NULL,
  linked_card_id    TEXT NOT NULL REFERENCES linked_debit_cards(linked_card_id),
  amount            NUMERIC(18,2) NOT NULL,
  currency          CHAR(4) NOT NULL DEFAULT 'USD',
  fee               NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(18,2) GENERATED ALWAYS AS (amount - fee) STORED,
  status            TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN (
                      'created','requires_action','authorized',
                      'captured','settled','failed','reversed'
                    )),
  challenge         JSONB,                             -- 3DS2 challenge payload if present
  processor_ref     TEXT,
  idempotency_key   TEXT NOT NULL,
  conversion_quote_id TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_funding_idempotency
  ON card_funding_transactions (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_card_funding_account
  ON card_funding_transactions (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_funding_status
  ON card_funding_transactions (status, created_at DESC);

-- ============================================================
-- PUSH-TO-CARD PAYOUTS (withdrawal flows)
-- ============================================================

CREATE TABLE IF NOT EXISTS card_payouts (
  payout_id         TEXT PRIMARY KEY,                  -- po_{timestamp}{random}
  account_id        TEXT NOT NULL,
  linked_card_id    TEXT NOT NULL REFERENCES linked_debit_cards(linked_card_id),
  amount            NUMERIC(18,2) NOT NULL,
  currency          CHAR(4) NOT NULL DEFAULT 'USD',
  fee               NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(18,2) GENERATED ALWAYS AS (amount - fee) STORED,
  transfer_type     TEXT NOT NULL DEFAULT 'withdrawal'
                    CHECK (transfer_type IN ('withdrawal','transfer')),
  status            TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN (
                      'created','pending_network','paid','failed','returned'
                    )),
  processor_ref     TEXT,
  statement_descriptor TEXT,
  idempotency_key   TEXT NOT NULL,
  quote_id          TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_payouts_idempotency
  ON card_payouts (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_card_payouts_account
  ON card_payouts (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_payouts_status
  ON card_payouts (status, created_at DESC);

-- ============================================================
-- DISPUTES
-- ============================================================

CREATE TABLE IF NOT EXISTS card_disputes (
  dispute_id        TEXT PRIMARY KEY,                  -- disp_{timestamp}{random}
  account_id        TEXT NOT NULL,
  card_id           TEXT REFERENCES issued_cards(card_id),
  authorization_id  TEXT REFERENCES card_authorizations(authorization_id),
  funding_id        TEXT REFERENCES card_funding_transactions(funding_id),
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'opened'
                    CHECK (status IN ('opened','under_review','won','lost','accepted')),
  amount            NUMERIC(18,2) NOT NULL,
  currency          CHAR(4) NOT NULL DEFAULT 'USD',
  evidence          JSONB NOT NULL DEFAULT '[]',       -- array of evidence documents
  due_at            TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_disputes_account
  ON card_disputes (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_disputes_status
  ON card_disputes (status);

-- ============================================================
-- CARD STATUS AUDIT LOG (immutable state transitions)
-- ============================================================

CREATE TABLE IF NOT EXISTS card_status_log (
  log_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id           TEXT NOT NULL REFERENCES issued_cards(card_id),
  from_status       TEXT,
  to_status         TEXT NOT NULL,
  reason            TEXT,
  actor_type        TEXT NOT NULL DEFAULT 'system'
                    CHECK (actor_type IN ('user','system','compliance','processor')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_status_log_card
  ON card_status_log (card_id, created_at DESC);

-- Audit log is append-only
CREATE OR REPLACE RULE card_status_log_no_update
  AS ON UPDATE TO card_status_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE card_status_log_no_delete
  AS ON DELETE TO card_status_log DO INSTEAD NOTHING;

-- ============================================================
-- WEBHOOK EVENTS (outbound delivery tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS card_webhook_events (
  event_id          TEXT PRIMARY KEY,                  -- evt_{timestamp}{random}
  event_type        TEXT NOT NULL,
  account_id        TEXT,
  card_id           TEXT,
  funding_id        TEXT,
  payout_id         TEXT,
  dispute_id        TEXT,
  payload           JSONB NOT NULL DEFAULT '{}',
  delivery_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (delivery_status IN (
                      'pending','delivered','failed','dead_lettered'
                    )),
  attempts          SMALLINT NOT NULL DEFAULT 0,
  next_retry_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_card_events_type
  ON card_webhook_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_events_account
  ON card_webhook_events (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_events_delivery
  ON card_webhook_events (delivery_status, next_retry_at ASC NULLS LAST);

-- Dead-letter index for recovery via GET /v1/webhooks/events
CREATE INDEX IF NOT EXISTS idx_card_events_dead_letter
  ON card_webhook_events (delivery_status, created_at DESC)
  WHERE delivery_status = 'dead_lettered';

COMMIT;
