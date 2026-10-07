CREATE TABLE IF NOT EXISTS mobile_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mobile_pairing_codes_expires_at_idx ON mobile_pairing_codes(expires_at);

CREATE TABLE IF NOT EXISTS mobile_pair_rate_limits (
  ip_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_started_at),
  CONSTRAINT mobile_pair_rate_limits_attempts_check CHECK (attempts BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS mobile_pair_rate_limits_window_started_at_idx ON mobile_pair_rate_limits(window_started_at);
