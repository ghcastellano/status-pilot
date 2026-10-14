# Connected workspace rollout

1. Use a dedicated Neon project and a separate branch for migration and preview tests.
2. Provision a `status_pilot_runtime` login role. Apply `db/schema.sql` and the versioned migrations through `npm run db:schema`, with `DATABASE_URL_UNPOOLED` set to a direct owner connection.
3. Set the production pooled `DATABASE_URL` to the restricted application role, with TLS verification enabled. Never use the owner role in the application.
4. Enable Neon Auth, register the exact production origin, and configure `NEON_AUTH_BASE_URL`, a random `NEON_AUTH_COOKIE_SECRET` of at least 32 characters, and `STATUS_PILOT_ALLOWED_EMAILS`.
5. For connected mode set `STATUS_PILOT_DEMO_ONLY=0`. Keep previews locked to `STATUS_PILOT_DEMO_ONLY=1` unless they have isolated test credentials.
6. Check authorized sign-in, session restoration, sign-out, direct unauthenticated API rejection, same-origin mutation checks, sample data isolation, and Coaching Hub persistence.

Neon Auth sends sign-in codes only when the user submits the login form. The application allowlist requires a verified email and does not expose an unrestricted auth proxy. Neon manages OTP expiry, retry limits and delivery. Configure a custom SMTP provider before scaling email delivery beyond this private installation.

All 13 application tables have RLS. Only the server role has application data permissions; browser roles receive none. The server role cannot create or truncate tables, alter schema, or read the migration ledger. Atomic snapshot functions and AI quotas retain their transaction boundaries.

The original Supabase project is inaccessible. Creating the Neon schema does not recover old data or Jira credentials. Keep the original project and any backups until a separately verified import succeeds.
