-- Issuer name for linked debit card visual branding.
--
-- Stores the user-selected bank name (e.g. 'navy federal', 'chase') so
-- LinkedCardVisual can render the correct colors and pattern on any device.
-- Without this column the brand is only cached in localStorage and
-- disappears when the user switches browsers or devices.

ALTER TABLE linked_debit_cards
    ADD COLUMN IF NOT EXISTS issuer_name TEXT;
