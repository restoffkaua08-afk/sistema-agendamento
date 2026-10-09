# Agenda API

This API is the shared backend for the public booking website and, as the next integration phase, the business dashboard and Android app.

## Current endpoints

- `GET /health` — reports whether server-side Supabase configuration is present.
- `GET /v1/public/:slug/catalog` — returns the active tenant, services, staff/service links and working hours.
- `GET /v1/public/:slug/appointments?staffId=<uuid>&date=YYYY-MM-DD` — returns occupied appointment intervals for availability calculations.
- `POST /v1/public/:slug/appointments` — creates a pending appointment through a PostgreSQL transaction. Requires `Idempotency-Key`.

The booking function validates the tenant, active service, staff/service association, working hours, future date, and overlaps. It serializes writes per tenant/professional and replays a matching idempotency key. Public website calls should go through the website's server-side `/api/appointments` proxy; do not expose the Supabase server secret in a browser or mobile bundle.

## Supabase setup

1. Create or select a dedicated Supabase project for the SaaS.
2. Apply migrations in order from `supabase/migrations/`.
3. Add the first tenant, services, staff, staff-service links and working hours using an authorized administrative workflow.
4. Configure these server-only Vercel environment variables for the API project:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOWED_ORIGINS` (comma-separated; include the deployed business web origin and `https://localhost` only if the native Capacitor app will call the API directly)
5. Deploy a preview and verify `/health`, catalog, availability and booking against test data before production.

Never set `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_*` variable or put it in the mobile app.

## Not yet a commercial release

Owner authentication, tenant membership authorization, mobile pairing/session endpoints, owner appointment/service management, cancellation/rescheduling, billing/subscription webhooks, domain verification, audit trail, persistent rate limiting, notifications and automated integration/concurrency tests remain to be implemented and verified. The mobile app currently expects `/v1/mobile/pair` and `/v1/owner/*`; those routes are not yet implemented by this API. Do not distribute the APK or advertise the whole product as production-ready until those gates are closed.
