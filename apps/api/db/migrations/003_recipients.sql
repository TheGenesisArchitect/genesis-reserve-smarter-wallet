-- ============================================================
-- Genesis Reserve — Remittance Recipients (Saved Payees)
-- Migration 003
-- ============================================================
-- Creates the remittance_recipients table for storing
-- saved recipient details per account.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS remittance_recipients (
  recipient_id      TEXT PRIMARY KEY,           -- 'recip-{accountId}-{base36_hash}'
  account_id        TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  display_name      TEXT NOT NULL,              -- User-friendly label
  recipient_type    TEXT NOT NULL DEFAULT 'INDIVIDUAL'
                    CHECK (recipient_type IN ('INDIVIDUAL','BUSINESS')),
  corridor          TEXT NOT NULL,              -- e.g. 'US-PH', 'US-MX'
  payout_method     TEXT NOT NULL,              -- 'bank_transfer', 'cashout', 'wallet'
  
  -- Recipient identification (country-specific)
  recipient_address TEXT,                       -- ETH address or bank account
  recipient_name    TEXT,                       -- Full name of recipient
  recipient_phone   TEXT,                       -- Phone number (hashed in prod)
  recipient_email   TEXT,                       -- Email (hashed in prod)
  
  -- Bank details (PH, MX, etc)
  bank_code         TEXT,                       -- Central bank code
  bank_name         TEXT,
  branch_code       TEXT,
  account_number    TEXT,                       -- Masked: last 4 digits visible
  account_type      TEXT CHECK (account_type IN ('CHECKING','SAVINGS','MONEYLENDER')),
  
  -- Mobile/wallet details
  mobile_provider   TEXT,                       -- 'GLOBE', 'SMART', 'SUN', etc.
  mobile_number     TEXT,                       -- E.164 format: +639171234567
  
  -- Metadata
  metadata          JSONB NOT NULL DEFAULT '{}', -- customs, notes, verification refs
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
                    CHECK (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','FAILED')),
  verified_at       TIMESTAMPTZ,
  
  -- Lifecycle
  memo              TEXT,                       -- User's private note
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  deleted_at        TIMESTAMPTZ,
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_recipients_account
  ON remittance_recipients (account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipients_corridor
  ON remittance_recipients (account_id, corridor, payout_method);

CREATE INDEX IF NOT EXISTS idx_recipients_verified
  ON remittance_recipients (account_id, verification_status, updated_at DESC);

-- Unique constraint: one "is_default" per account per corridor
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipients_default_per_corridor
  ON remittance_recipients (account_id, corridor)
  WHERE is_default = TRUE AND status = 'ACTIVE';

-- Soft delete: recipients marked DELETED should not appear in normal queries
CREATE INDEX IF NOT EXISTS idx_recipients_active
  ON remittance_recipients (account_id, status)
  WHERE status = 'ACTIVE';

-- Prevent any actual deletes (WORM principle)
CREATE OR REPLACE RULE recipients_no_delete AS ON DELETE TO remittance_recipients
  DO INSTEAD UPDATE remittance_recipients
     SET status = 'DELETED', deleted_at = NOW(), updated_at = NOW()
     WHERE recipient_id = OLD.recipient_id;

COMMIT;
