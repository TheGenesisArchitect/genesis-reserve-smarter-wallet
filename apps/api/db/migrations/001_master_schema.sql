-- ============================================================
-- Genesis Reserve — Master Database Schema
-- PostgreSQL 15+ with pgcrypto, uuid-ossp
-- ============================================================
-- Run with: psql -U genesis -d genesis_ledger -f 001_master_schema.sql
-- ============================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- IDENTITY & COMPLIANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  user_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_hash        TEXT NOT NULL UNIQUE,      -- SHA-256 of email (PII tokenized)
  phone_hash        TEXT,
  country           CHAR(2) NOT NULL,
  risk_tier         SMALLINT NOT NULL DEFAULT 0 CHECK (risk_tier BETWEEN 0 AND 3),
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','BLOCKED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_cases (
  identity_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(user_id),
  kyc_level         SMALLINT NOT NULL DEFAULT 0,
  kyc_provider      TEXT NOT NULL,              -- e.g., 'onfido', 'jumio'
  provider_ref      TEXT NOT NULL,
  docs_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  liveness_pass     BOOLEAN NOT NULL DEFAULT FALSE,
  address_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  pep_flag          BOOLEAN NOT NULL DEFAULT FALSE,
  sanction_status   TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (sanction_status IN ('PENDING','PASS','REVIEW','BLOCKED')),
  aml_status        TEXT NOT NULL DEFAULT 'PENDING',
  kyc_expiry        TIMESTAMPTZ,
  jurisdiction      CHAR(2) NOT NULL,
  evidence_urls     JSONB NOT NULL DEFAULT '[]', -- encrypted S3 references
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_screenings (
  screening_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(user_id),
  screening_type    TEXT NOT NULL CHECK (screening_type IN ('SANCTION','AML','PEP','VELOCITY')),
  result            TEXT NOT NULL,
  lists_checked     TEXT[],
  provider          TEXT NOT NULL,
  risk_score        INTEGER,
  order_ref         UUID,
  screened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TREASURY ACCOUNTS (PTAs)
-- ============================================================

CREATE TABLE IF NOT EXISTS treasury_accounts (
  account_id            TEXT PRIMARY KEY,       -- e.g., 'pta-abc123'
  owner_id              UUID NOT NULL REFERENCES users(user_id),
  wallet_address        TEXT NOT NULL UNIQUE,
  mode                  SMALLINT NOT NULL DEFAULT 0  -- 0=Flexible,1=Income,2=Growth
                        CHECK (mode IN (0,1,2)),
  kyc_level             SMALLINT NOT NULL DEFAULT 0,
  risk_tier             SMALLINT NOT NULL DEFAULT 0,
  jurisdiction          CHAR(2) NOT NULL,
  travel_rule_required  BOOLEAN NOT NULL DEFAULT FALSE,
  policy_version        INTEGER NOT NULL DEFAULT 1,
  partner_pricing_id    TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','SUSPENDED','FROZEN','CLOSED')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_balance_snapshots (
  account_id    TEXT PRIMARY KEY,               -- matches chart of accounts naming
  balance       NUMERIC(36,0) NOT NULL DEFAULT 0, -- USDC 6 decimals as integer
  entry_count   INTEGER NOT NULL DEFAULT 0,
  last_entry_hash TEXT,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LEDGER (DOUBLE-ENTRY — APPEND ONLY)
-- ============================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
  id              TEXT PRIMARY KEY,             -- ent_{timestamp_base36}{random}
  entry_type      TEXT NOT NULL
                  CHECK (entry_type IN (
                    'DEPOSIT','WITHDRAWAL','RESERVE','RELEASE',
                    'SETTLEMENT','FEE','YIELD','FX','REVERSAL','ADJUSTMENT'
                  )),
  debit_account   TEXT NOT NULL,
  credit_account  TEXT NOT NULL,
  amount          NUMERIC(36,0) NOT NULL CHECK (amount > 0),
  currency        CHAR(4) NOT NULL DEFAULT 'USDC',
  reference       TEXT NOT NULL,               -- order_id or reservation_id
  metadata        JSONB NOT NULL DEFAULT '{}',
  prev_hash       TEXT NOT NULL,               -- SHA-256 of prior entry (chain)
  hash            TEXT NOT NULL UNIQUE,        -- SHA-256 of this entry
  block_number    BIGINT,
  tx_hash         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ledger is append-only — no UPDATE or DELETE permitted
-- Enforced via row-level security and application constraint

CREATE INDEX IF NOT EXISTS idx_ledger_debit   ON ledger_entries (debit_account,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_credit  ON ledger_entries (credit_account, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref     ON ledger_entries (reference);
CREATE INDEX IF NOT EXISTS idx_ledger_type    ON ledger_entries (entry_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ts      ON ledger_entries (created_at DESC);

-- Prevent any updates or deletes on the ledger (WORM)
CREATE OR REPLACE RULE ledger_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE OR REPLACE RULE ledger_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;

-- ============================================================
-- REMITTANCE ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS remittance_quotes (
  quote_id          TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  send_amount       NUMERIC(36,0) NOT NULL,
  send_currency     CHAR(4) NOT NULL,
  receive_currency  CHAR(4) NOT NULL,
  receive_amount    NUMERIC(36,0) NOT NULL,
  fx_rate           NUMERIC(18,8) NOT NULL,
  platform_fee_bps  INTEGER NOT NULL,
  fx_spread_bps     INTEGER NOT NULL,
  total_cost        NUMERIC(36,0) NOT NULL,
  eta_seconds       INTEGER NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  corridor          TEXT NOT NULL,
  payout_method     TEXT NOT NULL,
  compliance_status TEXT NOT NULL DEFAULT 'PASS',
  travel_rule_req   BOOLEAN NOT NULL DEFAULT FALSE,
  constraints       JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remittance_orders (
  order_id         TEXT PRIMARY KEY,
  quote_id         TEXT NOT NULL REFERENCES remittance_quotes(quote_id),
  account_id       TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  reservation_id   TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN (
                     'PENDING','RESERVED','IN_TRANSIT','SETTLED',
                     'FAILED','CANCELLED','COMPLIANCE_HOLD'
                   )),
  corridor         TEXT NOT NULL,
  payout_method    TEXT NOT NULL,
  recipient_ref    TEXT NOT NULL,
  send_amount      NUMERIC(36,0) NOT NULL,
  receive_amount   NUMERIC(36,0) NOT NULL,
  fx_rate          NUMERIC(18,8) NOT NULL,
  platform_fee     NUMERIC(36,0) NOT NULL DEFAULT 0,
  partner_fee      NUMERIC(36,0) NOT NULL DEFAULT 0,
  fx_revenue       NUMERIC(36,0) NOT NULL DEFAULT 0,
  tx_hash          TEXT,
  off_ramp_ref     TEXT,
  failure_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_account ON remittance_orders (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON remittance_orders (status, created_at DESC);

-- ============================================================
-- RESERVATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS fund_reservations (
  reservation_id   TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  order_id         TEXT,
  amount           NUMERIC(36,0) NOT NULL,
  currency         CHAR(4) NOT NULL DEFAULT 'USDC',
  expiry           TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','SETTLED','RELEASED','EXPIRED')),
  chain_tx_hash    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRAVEL RULE
-- ============================================================

CREATE TABLE IF NOT EXISTS travel_rule_records (
  record_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          TEXT NOT NULL,
  originator_id     TEXT NOT NULL,
  beneficiary_id    TEXT,
  originator_name   TEXT NOT NULL,
  beneficiary_name  TEXT NOT NULL,
  originator_vasp   TEXT NOT NULL,   -- e.g., 'Genesis Reserve / genesis-reserve.io'
  beneficiary_vasp  TEXT NOT NULL,
  amount            NUMERIC(36,0) NOT NULL,
  currency          CHAR(4) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'SUBMITTED'
                    CHECK (status IN ('SUBMITTED','ACKNOWLEDGED','REJECTED')),
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at   TIMESTAMPTZ
);

-- ============================================================
-- YIELD & STRATEGY POSITIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_positions (
  position_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  protocol          TEXT NOT NULL,             -- 'aave_v3', 'morpho', 'balancer_v3'
  chain             TEXT NOT NULL DEFAULT 'arbitrum',
  contract_address  TEXT NOT NULL,
  notional          NUMERIC(36,0) NOT NULL,   -- USDC 6 dec
  shares            NUMERIC(36,18),           -- strategy shares/gTokens
  current_apy_bps   INTEGER NOT NULL,
  liquidity_band    SMALLINT NOT NULL DEFAULT 0,
  risk_score        SMALLINT NOT NULL,
  pnl               NUMERIC(36,0) NOT NULL DEFAULT 0,
  last_valuation    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS yield_accruals (
  accrual_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  protocol          TEXT NOT NULL,
  amount            NUMERIC(36,0) NOT NULL,
  apy_bps           INTEGER NOT NULL,
  ledger_entry_id   TEXT REFERENCES ledger_entries(id),
  accrued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARTNER / B2B
-- ============================================================

CREATE TABLE IF NOT EXISTS partners (
  partner_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  api_key_hash      TEXT NOT NULL UNIQUE,
  integration_level SMALLINT NOT NULL DEFAULT 1 CHECK (integration_level IN (1,2,3)),
  yield_share_bps   INTEGER NOT NULL DEFAULT 100,  -- 1.0%
  tx_fee_share_bps  INTEGER NOT NULL DEFAULT 40,   -- 40% of platform fee
  fx_share_bps      INTEGER NOT NULL DEFAULT 0,
  monthly_saas_usd  NUMERIC(10,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  webhook_url       TEXT,
  ip_allowlist      INET[],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_revenue (
  rev_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id        UUID NOT NULL REFERENCES partners(partner_id),
  order_id          TEXT,
  rev_type          TEXT NOT NULL CHECK (rev_type IN ('YIELD_SHARE','TX_FEE','FX','SAAS')),
  amount            NUMERIC(36,0) NOT NULL,
  ledger_entry_id   TEXT REFERENCES ledger_entries(id),
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG (HASH-CHAINED, WORM)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  log_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor        TEXT NOT NULL,                  -- system | user_id | operator address
  action       TEXT NOT NULL,
  object_type  TEXT NOT NULL,
  object_ref   TEXT NOT NULL,
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE RULE audit_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ============================================================
-- MONITORING VIEWS
-- ============================================================

-- Real-time revenue summary
CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT
  DATE_TRUNC('day', created_at)  AS day,
  entry_type,
  credit_account,
  SUM(amount)                    AS total_amount,
  COUNT(*)                       AS entry_count
FROM ledger_entries
WHERE entry_type IN ('FEE', 'YIELD', 'FX')
GROUP BY day, entry_type, credit_account
ORDER BY day DESC;

-- Account health view
CREATE OR REPLACE VIEW v_account_health AS
SELECT
  ta.account_id,
  ta.mode,
  ta.status,
  ta.jurisdiction,
  ta.kyc_level,
  abs.balance                            AS ledger_balance,
  (SELECT COUNT(*) FROM remittance_orders ro
   WHERE ro.account_id = ta.account_id
     AND ro.status = 'SETTLED'
     AND ro.created_at > NOW() - INTERVAL '30 days') AS orders_30d,
  (SELECT SUM(ya.amount)
   FROM yield_accruals ya
   WHERE ya.account_id = ta.account_id
     AND ya.accrued_at > NOW() - INTERVAL '30 days') AS yield_30d
FROM treasury_accounts ta
LEFT JOIN account_balance_snapshots abs
  ON abs.account_id = ta.account_id || ':available';

-- Corridor performance
CREATE OR REPLACE VIEW v_corridor_performance AS
SELECT
  corridor,
  payout_method,
  COUNT(*)                               AS total_orders,
  COUNT(*) FILTER (WHERE status='SETTLED')  AS settled,
  COUNT(*) FILTER (WHERE status='FAILED')   AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status='SETTLED')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  )                                      AS stp_rate_pct,
  AVG(EXTRACT(EPOCH FROM (settled_at - created_at)))
    FILTER (WHERE status='SETTLED')      AS avg_settlement_secs,
  SUM(send_amount)                       AS total_volume,
  SUM(platform_fee + partner_fee)        AS total_fees_collected
FROM remittance_orders
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY corridor, payout_method
ORDER BY total_volume DESC;

-- ============================================================
-- INITIAL CHART OF ACCOUNTS SETUP
-- ============================================================

INSERT INTO account_balance_snapshots (account_id, balance) VALUES
  ('revenue:platform',       0),
  ('revenue:partner',        0),
  ('revenue:fx',             0),
  ('system:float',           0),
  ('custodian:inbound',      0),
  ('custodian:outbound',     0),
  ('strategies:aave_v3',     0),
  ('strategies:morpho',      0),
  ('strategies:balancer_v3', 0),
  ('strategies:tbills',      0),
  ('suspense:exception',     0),
  ('suspense:reconciliation',0)
ON CONFLICT (account_id) DO NOTHING;

COMMIT;

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_identity_user
  ON identity_cases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_screening_user
  ON compliance_screenings (user_id, screened_at DESC);

CREATE INDEX IF NOT EXISTS idx_ta_owner
  ON treasury_accounts (owner_id);

CREATE INDEX IF NOT EXISTS idx_ta_wallet
  ON treasury_accounts (wallet_address);

CREATE INDEX IF NOT EXISTS idx_positions_account
  ON strategy_positions (account_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_yield_account
  ON yield_accruals (account_id, accrued_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_rev
  ON partner_revenue (partner_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_tr_order
  ON travel_rule_records (order_id);

-- ============================================================
-- ROW-LEVEL SECURITY (enable in production)
-- ============================================================

-- ALTER TABLE treasury_accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ledger_entries    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
-- Policies configured per role (operator, partner_api, read_only_auditor)
