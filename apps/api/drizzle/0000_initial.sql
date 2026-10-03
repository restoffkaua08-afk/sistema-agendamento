-- Initial Agenda schema. Apply with the configured Drizzle migration runner.
-- The application keeps tenant_id on every business table; destructive changes are intentionally absent.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL, timezone text NOT NULL DEFAULT 'America/Sao_Paulo', config jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS memberships (tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL DEFAULT 'reception', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, user_id));
CREATE TABLE IF NOT EXISTS services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, description text NOT NULL DEFAULT '', duration_minutes integer NOT NULL, buffer_minutes integer NOT NULL DEFAULT 0, price_cents integer, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, name));
CREATE TABLE IF NOT EXISTS staff (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, role text NOT NULL DEFAULT 'professional', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS staff_services (staff_id uuid NOT NULL REFERENCES staff(id), service_id uuid NOT NULL REFERENCES services(id), PRIMARY KEY (staff_id, service_id));
CREATE TABLE IF NOT EXISTS working_hours (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), staff_id uuid NOT NULL REFERENCES staff(id), weekday integer NOT NULL, starts_at text NOT NULL, ends_at text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS time_off (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), staff_id uuid NOT NULL REFERENCES staff(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, email text, phone text, anonymized_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), customer_id uuid NOT NULL REFERENCES customers(id), staff_id uuid NOT NULL REFERENCES staff(id), service_id uuid NOT NULL REFERENCES services(id), service_name_snapshot text NOT NULL, duration_minutes_snapshot integer NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', origin text NOT NULL DEFAULT 'public', manage_token_hash text NOT NULL UNIQUE, manage_token_expires_at timestamptz NOT NULL, readable_number text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, readable_number));
CREATE TABLE IF NOT EXISTS appointment_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), appointment_id uuid NOT NULL REFERENCES appointments(id), type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), actor_user_id uuid REFERENCES users(id), action text NOT NULL, entity_type text NOT NULL, entity_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notification_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), appointment_id uuid REFERENCES appointments(id), kind text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS idempotency_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, key));

CREATE INDEX IF NOT EXISTS appointments_staff_time_idx ON appointments(staff_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS time_off_staff_time_idx ON time_off(staff_id, starts_at, ends_at);

CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_staff_no_overlap') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_staff_no_overlap
      EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (status IN ('pending', 'confirmed'));
  END IF;
END $$;
