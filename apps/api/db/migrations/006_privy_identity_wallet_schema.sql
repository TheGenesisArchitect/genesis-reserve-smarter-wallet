-- ============================================================
-- Genesis Reserve — Privy Identity + Wallet Schema
-- Migration 006
-- ============================================================
-- Purpose:
--   1. Formalize Privy as the user identity source for wallet UX
--   2. Support multiple wallet surfaces per user/account
--      - Privy embedded EOA
--      - ZeroDev smart account
--      - External linked wallet
--      - Regulated/custodial provider virtual wallet
--   3. Add explicit mapping between Genesis accounts and Zero Hash
--      sender/beneficiary/provider objects
--   4. Preserve backwards compatibility with current treasury_accounts model
-- ============================================================

BEGIN;

-- ============================================================
-- AUTH IDENTITIES
-- ============================================================

CREATE TABLE IF NOT EXISTS user_auth_identities (
  auth_identity_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(user_id),
  provider              TEXT NOT NULL
                        CHECK (provider IN ('PRIVY','PARTNER_SSO','EXTERNAL_WALLET','ADMIN')),
  provider_user_id      TEXT NOT NULL,
  provider_subject      TEXT,
  login_method          TEXT
                        CHECK (login_method IN ('EMAIL','SMS','GOOGLE','WALLET','MAGIC_LINK','OIDC')),
  email_hash            TEXT,
  phone_hash            TEXT,
  is_primary            BOOLEAN NOT NULL DEFAULT FALSE,
  claims_snapshot       JSONB NOT NULL DEFAULT '{}',
  last_authenticated_at TIMESTAMPTZ,
  linked_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_auth_identities_user
  ON user_auth_identities (user_id, provider, linked_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_auth_identities_provider_subject
  ON user_auth_identities (provider, provider_subject);

-- ============================================================
-- WALLET PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS wallet_profiles (
  wallet_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES users(user_id),
  account_id            TEXT REFERENCES treasury_accounts(account_id),
  auth_identity_id      UUID REFERENCES user_auth_identities(auth_identity_id),
  wallet_provider       TEXT NOT NULL
                        CHECK (wallet_provider IN ('PRIVY','ZERODEV','EXTERNAL','ZERO_HASH','GENESIS')),
  wallet_type           TEXT NOT NULL
                        CHECK (wallet_type IN (
                          'EMBEDDED_EOA',
                          'SMART_ACCOUNT',
                          'EXTERNAL_EOA',
                          'CUSTODIAL',
                          'OMNIBUS_VIRTUAL'
                        )),
  custody_model         TEXT NOT NULL DEFAULT 'USER_CONTROLLED'
                        CHECK (custody_model IN (
                          'USER_CONTROLLED',
                          'DELEGATED_SMART_ACCOUNT',
                          'PROVIDER_CONTROLLED',
                          'GENESIS_CONTROLLED'
                        )),
  chain_id              INTEGER,
  address               TEXT,
  parent_wallet_id      UUID REFERENCES wallet_profiles(wallet_id),
  signer_provider       TEXT,
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','REVOKED','CLOSED')),
  is_primary            BOOLEAN NOT NULL DEFAULT FALSE,
  capabilities          JSONB NOT NULL DEFAULT '{}',
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_profiles_address_required CHECK (
    (wallet_type IN ('EMBEDDED_EOA','SMART_ACCOUNT','EXTERNAL_EOA') AND address IS NOT NULL)
    OR (wallet_type IN ('CUSTODIAL','OMNIBUS_VIRTUAL'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_profiles_provider_address
  ON wallet_profiles (wallet_provider, chain_id, address)
  WHERE address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_profiles_user
  ON wallet_profiles (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_profiles_account
  ON wallet_profiles (account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_profiles_parent
  ON wallet_profiles (parent_wallet_id);

-- ============================================================
-- TREASURY ACCOUNT ENRICHMENT
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_source TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (auth_source IN ('PRIVY','PARTNER_API','ADMIN','UNKNOWN')),
  ADD COLUMN IF NOT EXISTS default_partner_id UUID REFERENCES partners(partner_id),
  ADD COLUMN IF NOT EXISTS user_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE treasury_accounts
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'END_USER'
    CHECK (account_type IN ('END_USER','TREASURY','PARTNER_OMNIBUS','SYSTEM')),
  ADD COLUMN IF NOT EXISTS auth_identity_id UUID,
  ADD COLUMN IF NOT EXISTS primary_wallet_id UUID,
  ADD COLUMN IF NOT EXISTS wallet_provider TEXT NOT NULL DEFAULT 'GENESIS'
    CHECK (wallet_provider IN ('GENESIS','PRIVY','ZERODEV','ZERO_HASH','EXTERNAL','HYBRID')),
  ADD COLUMN IF NOT EXISTS custody_provider TEXT,
  ADD COLUMN IF NOT EXISTS account_metadata JSONB NOT NULL DEFAULT '{}';

DO $$
BEGIN
  ALTER TABLE treasury_accounts
    ADD CONSTRAINT treasury_accounts_auth_identity_fk
    FOREIGN KEY (auth_identity_id) REFERENCES user_auth_identities(auth_identity_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE treasury_accounts
    ADD CONSTRAINT treasury_accounts_primary_wallet_fk
    FOREIGN KEY (primary_wallet_id) REFERENCES wallet_profiles(wallet_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_treasury_accounts_auth_identity
  ON treasury_accounts (auth_identity_id);

CREATE INDEX IF NOT EXISTS idx_treasury_accounts_primary_wallet
  ON treasury_accounts (primary_wallet_id);

-- ============================================================
-- ZERO HASH / PROVIDER PARTY MAPPINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_participants (
  provider_participant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id              TEXT NOT NULL REFERENCES treasury_accounts(account_id),
  wallet_id               UUID REFERENCES wallet_profiles(wallet_id),
  provider                TEXT NOT NULL,
  participant_type        TEXT NOT NULL
                          CHECK (participant_type IN ('PLATFORM','SENDER','WALLET_OWNER')),
  provider_participant_code TEXT NOT NULL,
  jurisdiction_code       TEXT,
  status                  TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','SUBMITTED','APPROVED','REJECTED','SUSPENDED')),
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, participant_type, provider_participant_code),
  UNIQUE (account_id, provider, participant_type)
);

CREATE INDEX IF NOT EXISTS idx_provider_participants_account
  ON provider_participants (account_id, provider, participant_type);

CREATE TABLE IF NOT EXISTS provider_recipient_refs (
  provider_recipient_ref_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id              TEXT NOT NULL REFERENCES remittance_recipients(recipient_id),
  provider                  TEXT NOT NULL,
  provider_beneficiary_code TEXT NOT NULL,
  jurisdiction_code         TEXT,
  status                    TEXT NOT NULL DEFAULT 'SUBMITTED'
                            CHECK (status IN ('SUBMITTED','APPROVED','PENDING_APPROVAL','REJECTED','SUSPENDED')),
  metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_beneficiary_code),
  UNIQUE (recipient_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_recipient_refs_recipient
  ON provider_recipient_refs (recipient_id, provider, status);

ALTER TABLE provider_accounts
  ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallet_profiles(wallet_id),
  ADD COLUMN IF NOT EXISTS auth_identity_id UUID REFERENCES user_auth_identities(auth_identity_id),
  ADD COLUMN IF NOT EXISTS provider_account_type TEXT NOT NULL DEFAULT 'CUSTOMER'
    CHECK (provider_account_type IN ('CUSTOMER','FLOAT','SETTLEMENT','VIRTUAL_WALLET','OMNIBUS'));

CREATE INDEX IF NOT EXISTS idx_provider_accounts_wallet
  ON provider_accounts (wallet_id);

-- ============================================================
-- OPTIONAL VIEW FOR ACCOUNT OWNERSHIP RESOLUTION
-- ============================================================

CREATE OR REPLACE VIEW v_wallet_identity_accounts AS
SELECT
  u.user_id,
  u.auth_source,
  ai.auth_identity_id,
  ai.provider,
  ai.provider_user_id,
  ai.provider_subject,
  ta.account_id,
  ta.account_type,
  ta.status AS account_status,
  wp.wallet_id,
  wp.wallet_provider,
  wp.wallet_type,
  wp.custody_model,
  wp.address,
  wp.chain_id,
  wp.is_primary AS wallet_is_primary
FROM users u
JOIN user_auth_identities ai
  ON ai.user_id = u.user_id
LEFT JOIN treasury_accounts ta
  ON ta.owner_id = u.user_id
LEFT JOIN wallet_profiles wp
  ON wp.account_id = ta.account_id
WHERE u.status IN ('PENDING','ACTIVE','SUSPENDED');

COMMIT;
