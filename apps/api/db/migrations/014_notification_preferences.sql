-- Per-account notification preferences.
-- Stores alert toggle state with sane on-by-default values.
-- The API route uses CREATE TABLE IF NOT EXISTS for self-bootstrap,
-- so this file documents the schema and can be replayed safely.

CREATE TABLE IF NOT EXISTS notification_preferences (
    account_id      TEXT PRIMARY KEY,
    deposit_alerts  BOOLEAN NOT NULL DEFAULT true,
    send_alerts     BOOLEAN NOT NULL DEFAULT true,
    cashout_alerts  BOOLEAN NOT NULL DEFAULT true,
    security_alerts BOOLEAN NOT NULL DEFAULT true,
    marketing       BOOLEAN NOT NULL DEFAULT false,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
