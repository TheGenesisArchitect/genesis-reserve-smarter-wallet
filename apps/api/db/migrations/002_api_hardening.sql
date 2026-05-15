BEGIN;

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  partner_id       UUID NOT NULL REFERENCES partners(partner_id),
  operation_scope  TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PROCESSING'
                   CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  response_code    INTEGER,
  response_body    JSONB,
  locked_until     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (partner_id, operation_scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_status
  ON api_idempotency_keys (status, locked_until DESC);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_created
  ON api_idempotency_keys (created_at DESC);

COMMIT;
