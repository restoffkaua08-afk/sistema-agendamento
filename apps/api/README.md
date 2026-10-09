# Agenda API

This API is the shared backend for the public booking website and, as the next integration phase, the business dashboard and Android app.

## Current endpoints

- `GET /health` — reports whether server-side Supabase configuration is present.
- `GET /v1/public/:slug/catalog` — returns the active tenant, services, staff/service links and working hours.
- `GET /v1/public/:slug/appointments?staffId=<uuid>&date=YYYY-MM-DD` — returns occupied appointment intervals for availability calculations.
- `POST /v1/public/:slug/appointments` — creates a pending appointment through a PostgreSQL transaction. Requires `Idempotency-Key`.
- `GET /v1/owner/:slug/session` — validates a Supabase Auth bearer token and tenant membership.
- `GET /v1/owner/:slug/catalog` — reads services, staff and working hours for an authorized tenant.
- `GET /v1/owner/:slug/appointments?from=<ISO>&to=<ISO>&status=<optional>` — lists tenant appointments for an interval of up to 93 days.
- `PATCH /v1/owner/:slug/appointments/:id` — applies allowed appointment status transitions with a conditional update.

The booking function validates the tenant, active service, staff/service association, working hours, future date, and overlaps. It serializes writes per tenant/professional and replays a matching idempotency key. Public website calls should go through the website's server-side `/api/appointments` proxy; the API uses the Supabase publishable key only for three narrowly scoped booking RPCs; base-table access remains revoked for public roles.

## Supabase setup

1. Create or select a dedicated Supabase project for the SaaS.
2. Apply migrations in order from `supabase/migrations/`.
3. Add the first tenant, services, staff, staff-service links and working hours using an authorized administrative workflow.
4. Configure these server-only Vercel environment variables for the API project:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY` (publishable key; base-table access remains protected by grants and RLS)
   - `ALLOWED_ORIGINS` (comma-separated; include the deployed business web origin and `https://localhost` only if the native Capacitor app will call the API directly)
5. Deploy a preview and verify `/health`, catalog, availability and booking against test data before production.

Do not add a Supabase secret/service-role key to this API, a `NEXT_PUBLIC_*` variable, or the mobile app. The publishable key is not a secret; the database must keep base-table privileges revoked and expose only the validated public RPCs.

## Not yet a commercial release

The first authenticated owner API slice is now in this branch, but is not yet a complete management API: service/staff/hour editing, customer directory, reporting, mobile pairing, audit trail, persistent rate limiting, notifications, billing, and automated integration/concurrency tests remain to be implemented and verified. Apply migration `202610090007_owner_admin_access.sql` after the existing migrations. After the owner signs up through Supabase Auth, an authorized operator must insert a `tenant_members` row linking that Auth user to the tenant with role `owner`; do not expose a secret/service-role key in the browser. The admin frontend still needs to be wired to Supabase Auth and these endpoints. Do not distribute the APK or advertise the whole product as production-ready until those gates are closed.
