CREATE TABLE IF NOT EXISTS booking_rate_limits (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  ip_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, ip_hash, window_started_at),
  CONSTRAINT booking_rate_limits_attempts_check CHECK (attempts BETWEEN 1 AND 5)
);
