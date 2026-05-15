-- 012_funding_circle_payment.sql
-- Adds Circle Payments API tracking columns to card_funding_transactions and
-- Circle card token column to linked_debit_cards.
--
-- Non-custodial USDC on-ramp flow:
--   User's Circle-tokenized card → Circle Payments API → USDC minted natively
--   on Arbitrum to user's Privy wallet via CCTP. Genesis never holds USDC.
--
-- card_funding_transactions columns:
--   destination_address  — user's on-chain Arbitrum wallet (Privy wallet)
--   circle_payment_id    — Circle payment UUID for webhook reconciliation (indexed)
--   on_chain_status      — 'pending' | 'confirmed' | 'failed'
--
-- linked_debit_cards columns:
--   connected_account_id — Stripe Custom connected account for push-to-card payouts
--   external_account_id  — Stripe external account (card) on that connected account
--   circle_card_id       — Circle card token for USDC purchases via Payments API

ALTER TABLE card_funding_transactions
    ADD COLUMN IF NOT EXISTS destination_address VARCHAR(42),
    ADD COLUMN IF NOT EXISTS circle_payment_id   VARCHAR(64),
    ADD COLUMN IF NOT EXISTS on_chain_status     VARCHAR(16)
        CHECK (on_chain_status IN ('pending', 'confirmed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_card_funding_circle_payment_id
    ON card_funding_transactions (circle_payment_id)
    WHERE circle_payment_id IS NOT NULL;

ALTER TABLE linked_debit_cards
    ADD COLUMN IF NOT EXISTS connected_account_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS external_account_id  VARCHAR(64),
    ADD COLUMN IF NOT EXISTS circle_card_id       VARCHAR(64);
