import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rlsMigration = await readFile(new URL("../../drizzle/0005_enable_rls.sql", import.meta.url), "utf8");
const initialMigration = await readFile(new URL("../../drizzle/0000_initial.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("./schema.ts", import.meta.url), "utf8");

test("Supabase hardening revokes Data API access for existing and future tables", () => {
  assert.match(rlsMigration, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;/i);
  assert.match(rlsMigration, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;/i);
  for (const table of ["tenants", "memberships", "customers", "appointments", "mobile_pairing_codes"]) {
    assert.match(rlsMigration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, "i"));
  }
});

test("the staff-time lookup index stays non-unique so cancelled slots can be reused", () => {
  assert.match(initialMigration, /CREATE INDEX IF NOT EXISTS appointments_staff_time_idx\s+ON appointments\s*\(staff_id, starts_at, ends_at\);/i);
  assert.match(schema, /index\("appointments_staff_time_idx"\)\.on\(table\.staffId, table\.startsAt, table\.endsAt\)/);
  assert.doesNotMatch(schema, /uniqueIndex\("appointments_staff_time_idx"\)/);
});
