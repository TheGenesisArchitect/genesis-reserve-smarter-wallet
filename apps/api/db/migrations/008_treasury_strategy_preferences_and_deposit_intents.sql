BEGIN;

CREATE TABLE IF NOT EXISTS treasury_strategy_preferences (
  wallet_address TEXT PRIMARY KEY,
  strategy TEXT NOT NULL CHECK (strategy IN ('aave', 'morpho', 'balancer', 'tbills')),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treasury_deposit_intents (
  intent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('aave', 'morpho', 'balancer', 'tbills')),
  amount NUMERIC(24,6) NOT NULL CHECK (amount > 0),
  account_id TEXT,
  source TEXT NOT NULL DEFAULT 'wallet-usdc',
  metadata JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'PROCESSED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_deposit_intents_wallet_created
  ON treasury_deposit_intents (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_deposit_intents_strategy_created
  ON treasury_deposit_intents (strategy, created_at DESC);

COMMIT;
