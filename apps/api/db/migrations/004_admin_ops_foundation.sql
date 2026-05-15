-- ============================================================
-- Genesis Reserve — Admin / Ops Foundation
-- Migration 004
-- ============================================================
-- Creates the first operational control-plane tables needed for:
--   - admin authentication/roles
--   - feature flags
--   - support/compliance queue
--   - audit events
--   - notifications
--   - scheduled sends
--   - batch operations
-- ============================================================

BEGIN;

-- ============================================================
-- ADMIN CONTROL PLANE
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
  admin_user_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email              TEXT NOT NULL UNIQUE,
  display_name       TEXT NOT NULL,
  role               TEXT NOT NULL
                     CHECK (role IN ('SUPER_ADMIN','OPS','COMPLIANCE','SUPPORT','AUDITOR')),
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REVOKED')),
  last_login_at      TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_feature_flags (
  feature_flag_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id         UUID REFERENCES partners(partner_id),
  flag_key           TEXT NOT NULL,
  label              TEXT NOT NULL,
  description        TEXT NOT NULL,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         TEXT NOT NULL DEFAULT 'system',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_feature_flags_scope
  ON partner_feature_flags (COALESCE(partner_id::text, 'GLOBAL'), flag_key);

CREATE TABLE IF NOT EXISTS support_queue (
  queue_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category           TEXT NOT NULL,
  subject            TEXT NOT NULL,
  amount_usdc        NUMERIC(36,0),
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','REVIEW','AWAITING','ESCALATED','RESOLVED')),
  account_id         TEXT REFERENCES treasury_accounts(account_id),
  order_id           TEXT REFERENCES remittance_orders(order_id),
  priority           SMALLINT NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  assigned_admin_id  UUID REFERENCES admin_users(admin_user_id),
  details            JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_queue_status_created
  ON support_queue (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_queue_account
  ON support_queue (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type         TEXT NOT NULL
                     CHECK (actor_type IN ('partner_api','operator','compliance_officer','system','auditor')),
  actor_ref          TEXT NOT NULL,
  action             TEXT NOT NULL,
  resource_type      TEXT NOT NULL,
  resource_ref       TEXT NOT NULL,
  partner_id         UUID REFERENCES partners(partner_id),
  metadata           JSONB NOT NULL DEFAULT '{}',
  prev_hash          TEXT NOT NULL,
  hash               TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
  ON audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events (actor_type, actor_ref, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_resource
  ON audit_events (resource_type, resource_ref, created_at DESC);

CREATE OR REPLACE RULE audit_events_no_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_events_no_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         TEXT REFERENCES treasury_accounts(account_id),
  partner_id         UUID REFERENCES partners(partner_id),
  event_type         TEXT NOT NULL,
  channel            TEXT NOT NULL DEFAULT 'IN_APP'
                     CHECK (channel IN ('IN_APP','EMAIL','WEBHOOK','SMS')),
  title              TEXT NOT NULL,
  message            TEXT NOT NULL,
  read_at            TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_account_created
  ON notifications (account_id, created_at DESC);

-- ============================================================
-- SCHEDULED SENDS
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_sends (
  schedule_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  recipient_id       TEXT REFERENCES remittance_recipients(recipient_id),
  amount             NUMERIC(36,0) NOT NULL,
  send_currency      CHAR(4) NOT NULL DEFAULT 'USDC',
  receive_currency   CHAR(4) NOT NULL,
  corridor           TEXT NOT NULL,
  payout_method      TEXT NOT NULL,
  frequency          TEXT NOT NULL
                     CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY')),
  memo               TEXT,
  next_execution_at  TIMESTAMPTZ NOT NULL,
  last_execution_at  TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','PAUSED','CANCELLED','FAILED')),
  created_by         TEXT NOT NULL DEFAULT 'system',
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due
  ON scheduled_sends (status, next_execution_at ASC);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_account
  ON scheduled_sends (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_send_runs (
  run_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id        UUID NOT NULL REFERENCES scheduled_sends(schedule_id),
  idempotency_key    TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED','CANCELLED')),
  quote_id           TEXT,
  order_id           TEXT,
  reservation_id     TEXT,
  error_code         TEXT,
  error_message      TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_send_runs_idempotency
  ON scheduled_send_runs (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_scheduled_send_runs_schedule
  ON scheduled_send_runs (schedule_id, started_at DESC);

-- ============================================================
-- BATCH OPERATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS batch_jobs (
  batch_job_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  source_type        TEXT NOT NULL DEFAULT 'CSV'
                     CHECK (source_type IN ('CSV','API')),
  file_name          TEXT,
  file_checksum      TEXT,
  idempotency_key    TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','VALIDATED','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  total_rows         INTEGER NOT NULL DEFAULT 0,
  success_count      INTEGER NOT NULL DEFAULT 0,
  failure_count      INTEGER NOT NULL DEFAULT 0,
  total_amount       NUMERIC(36,0) NOT NULL DEFAULT 0,
  submitted_by       TEXT NOT NULL DEFAULT 'system',
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_jobs_idempotency
  ON batch_jobs (account_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status_created
  ON batch_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS batch_rows (
  batch_row_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_job_id       UUID NOT NULL REFERENCES batch_jobs(batch_job_id),
  row_number         INTEGER NOT NULL,
  recipient_id       TEXT REFERENCES remittance_recipients(recipient_id),
  recipient_label    TEXT NOT NULL,
  amount             NUMERIC(36,0) NOT NULL,
  corridor           TEXT NOT NULL,
  payout_method      TEXT NOT NULL,
  memo               TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','VALID','INVALID','PROCESSING','SUCCESS','FAILED','CANCELLED')),
  order_id           TEXT,
  error_code         TEXT,
  error_message      TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_rows_job_number
  ON batch_rows (batch_job_id, row_number);

CREATE INDEX IF NOT EXISTS idx_batch_rows_status
  ON batch_rows (status, updated_at DESC);

-- ============================================================
-- DEFAULT GLOBAL FEATURE FLAGS
-- ============================================================

INSERT INTO partner_feature_flags (partner_id, flag_key, label, description, enabled, created_by)
SELECT NULL, seed.flag_key, seed.label, seed.description, seed.enabled, 'migration-004'
FROM (
  VALUES
    ('YIELD_ENGINE', 'Yield Engine', 'Live APY and harvest view', TRUE),
    ('SEND_FLOW', 'Send Flow', 'Cross-border remittance corridors', TRUE),
    ('CSV_EXPORT', 'CSV Export', 'History ledger download', TRUE),
    ('ANALYTICS', 'Analytics', 'Strategy and ROI dashboards', TRUE),
    ('BATCH_OPS', 'Batch Operations', 'Multi-recipient remittance', FALSE),
    ('SCHEDULED_SENDS', 'Scheduled Sends', 'Recurring payout automation', FALSE),
    ('INVOICING', 'Invoicing', 'Invoice issue and tracking', FALSE)
) AS seed(flag_key, label, description, enabled)
WHERE NOT EXISTS (
  SELECT 1
  FROM partner_feature_flags existing
  WHERE existing.partner_id IS NULL
    AND existing.flag_key = seed.flag_key
);

COMMIT;
