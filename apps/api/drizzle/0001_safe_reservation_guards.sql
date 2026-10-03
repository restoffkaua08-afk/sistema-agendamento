-- Forward-compatible hardening for databases that already applied 0000_initial.sql.
CREATE TABLE IF NOT EXISTS idempotency_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, key));
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_staff_no_overlap') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_staff_no_overlap
      EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (status IN ('pending', 'confirmed'));
  END IF;
END $$;
