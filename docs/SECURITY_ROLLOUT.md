# Connected workspace rollout

The security release requires database and authentication configuration before promotion. It has not been applied to the production database by this review.

1. Back up the workspace database and restore it into staging. Use a dedicated Supabase project for previews; never share production service-role credentials.
2. Set `SUPABASE_DB_URL` privately and run `npm run db:schema` against staging. The runner applies the bootstrap and migrations within one transaction, records checksums, and rejects edits to applied migrations. It requires a database administrator; HTTP API keys cannot run DDL.
3. Configure Supabase Auth with an existing confirmed account. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on the server. Set `STATUS_PILOT_ALLOWED_USER_IDS` to that user's immutable ID. A comma-separated list of confirmed emails is an alternative. Never put service-role keys in `NEXT_PUBLIC_*` values.
4. Exercise login, unauthorized access, Jira synchronization, coaching updates, and AI budget exhaustion against staging. All authorized users share one workspace; resource-level membership is outside this release.
5. Apply the migration to production, configure the authorized accounts, then promote the matching application commit. Missing authentication configuration returns 503 for connected APIs. Missing RPCs fail closed. The sample workspace remains usable without these services.
6. Verify anonymous access is rejected, authorized access succeeds, and the sample workspace makes no provider calls. Inspect logs for sanitized failure events and verify a previous snapshot survives a failed sync.

## Optional Forge integration

`FORGE_REMOTE_AUDIENCE` must be the Forge **app ARI** (`ari:cloud:ecosystem::app/...`), not the backend URL. Configure `FORGE_ALLOWED_CLOUD_ID` and `FORGE_ALLOWED_INSTALLATION_ID` from the trusted installation. JWT signature, issuer, audience, expiry, cloud, installation, and canonical Jira API URL are checked. Missing configuration disables the endpoint.

## Release status

Local tests, TypeScript checks, and a production build passed. No live account was created, migration applied, provider request made, or production configuration changed in this security release. Vercel's team-scoped environment request returned 403, and no authenticated CLI or Supabase administration connection was available. These are rollout prerequisites, not completed production work.
