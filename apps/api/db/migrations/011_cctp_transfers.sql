-- ============================================================
-- 011_cctp_transfers.sql
-- Genesis Reserve — CCTP Transfer state tracking
-- Depends on: 001_master_schema.sql (treasury_accounts)
-- Run with: psql -U genesis -d genesis_ledger -f 011_cctp_transfers.sql
-- ============================================================

BEGIN;

-- ── CCTP transfer status enum ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cctp_transfer_status') THEN
    CREATE TYPE cctp_transfer_status AS ENUM (
      'burn_pending',       -- user approved + burn tx submitted
      'burn_confirmed',     -- burn tx confirmed on source chain
      'attestation_pending',-- waiting for Circle Iris attestation
      'attestation_ready',  -- attestation received, relayer queued
      'relay_pending',      -- relayer submitted receiveMessage tx on Arbitrum
      'minted',             -- USDC minted to user wallet on Arbitrum
      'vault_deposited',    -- user deposited minted USDC into GenesisVault
      'failed',             -- terminal failure state
      'expired'             -- timed out before attestation arrived
    );
  END IF;
END
$$;

-- ── CCTP transfers table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cctp_transfers (
  transfer_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User identity (nullable — pre-auth flows allowed for UX)
  wallet_address        TEXT        NOT NULL,               -- source chain sender
  arbitrum_address      TEXT        NOT NULL,               -- destination mint address
  account_id            TEXT        REFERENCES treasury_accounts(account_id) ON DELETE SET NULL,

  -- Transfer parameters
  source_chain          TEXT        NOT NULL                -- 'ethereum' | 'base'
                        CHECK (source_chain IN ('ethereum', 'base')),
  source_domain         INTEGER     NOT NULL,               -- CCTP domain ID
  destination_domain    INTEGER     NOT NULL DEFAULT 3,     -- Arbitrum = 3
  amount_usdc           NUMERIC(20,6) NOT NULL
                        CHECK (amount_usdc > 0),

  -- On-chain references (source chain)
  burn_tx_hash          TEXT        UNIQUE,                 -- hex, set after burn confirmed
  burn_block            BIGINT,
  message_hash          TEXT        UNIQUE,                 -- keccak256(MessageSent.message)
  message_bytes         TEXT,                               -- hex-encoded full message

  -- Attestation (Circle Iris)
  attestation           TEXT,                               -- hex-encoded attestation signature
  attested_at           TIMESTAMPTZ,

  -- Relay (destination Arbitrum)
  relay_tx_hash         TEXT        UNIQUE,                 -- receiveMessage tx hash on Arbitrum
  relay_block           BIGINT,
  minted_at             TIMESTAMPTZ,

  -- Vault deposit (post-mint)
  vault_tx_hash         TEXT,
  vault_deposited_at    TIMESTAMPTZ,

  -- Status lifecycle
  status                cctp_transfer_status NOT NULL DEFAULT 'burn_pending',
  failure_reason        TEXT,
  retry_count           SMALLINT    NOT NULL DEFAULT 0,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cctp_transfers_wallet
  ON cctp_transfers (wallet_address);

CREATE INDEX IF NOT EXISTS idx_cctp_transfers_status
  ON cctp_transfers (status)
  WHERE status NOT IN ('minted', 'vault_deposited', 'failed', 'expired');

CREATE INDEX IF NOT EXISTS idx_cctp_transfers_burn_tx
  ON cctp_transfers (burn_tx_hash)
  WHERE burn_tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cctp_transfers_message_hash
  ON cctp_transfers (message_hash)
  WHERE message_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cctp_transfers_created
  ON cctp_transfers (created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_cctp_transfer_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cctp_transfers_updated_at ON cctp_transfers;
CREATE TRIGGER trg_cctp_transfers_updated_at
  BEFORE UPDATE ON cctp_transfers
  FOR EACH ROW EXECUTE FUNCTION update_cctp_transfer_updated_at();

COMMIT;
