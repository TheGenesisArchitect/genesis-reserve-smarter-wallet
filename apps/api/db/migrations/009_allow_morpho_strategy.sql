BEGIN;

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'treasury_strategy_preferences'
          AND c.contype = 'c'
          AND a.attname = 'strategy'
    LOOP
        EXECUTE format('ALTER TABLE treasury_strategy_preferences DROP CONSTRAINT %I', rec.conname);
    END LOOP;
END $$;

ALTER TABLE treasury_strategy_preferences
    ADD CONSTRAINT treasury_strategy_preferences_strategy_check
    CHECK (strategy IN ('aave', 'morpho', 'balancer', 'tbills'));

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'treasury_deposit_intents'
          AND c.contype = 'c'
          AND a.attname = 'strategy'
    LOOP
        EXECUTE format('ALTER TABLE treasury_deposit_intents DROP CONSTRAINT %I', rec.conname);
    END LOOP;
END $$;

ALTER TABLE treasury_deposit_intents
    ADD CONSTRAINT treasury_deposit_intents_strategy_check
    CHECK (strategy IN ('aave', 'morpho', 'balancer', 'tbills'));

COMMIT;
