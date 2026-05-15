BEGIN;

INSERT INTO partner_feature_flags (partner_id, flag_key, label, description, enabled, created_by)
SELECT NULL, seed.flag_key, seed.label, seed.description, seed.enabled, 'migration-007'
FROM (
  VALUES
    ('CONSULTIVE_MODULE', 'Consultive Module', 'Partner-facing forecasting and scenario modeling workspace', FALSE),
    ('PDF_EXPORT', 'PDF Export', 'Branded consultive and performance report export', FALSE),
    ('AUM_CAP_INDICATOR', 'AUM Cap Indicator', 'Cap utilization telemetry for staged launch controls', FALSE)
) AS seed(flag_key, label, description, enabled)
WHERE NOT EXISTS (
  SELECT 1
  FROM partner_feature_flags existing
  WHERE existing.partner_id IS NULL
    AND existing.flag_key = seed.flag_key
);

COMMIT;
