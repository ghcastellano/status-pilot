# Engineering review

Reviewed on October 14, 2026. Source review and isolated verification; not a production penetration test or a complete Git-history secret scan.

## Implemented in the security branch

| Area | Change | Verification |
| --- | --- | --- |
| API access | Supabase-verified session and explicit workspace membership on every connected API; same-origin mutation policy | Allowlist/origin unit tests and route coverage guard |
| Database access | RLS enabled; table and RPC privileges denied to browser roles and PUBLIC; server-only access | Embedded PostgreSQL permission tests |
| AI budgets | Atomic per-user and workspace-wide counters; database failures deny requests | Quota exhaustion and simultaneous request tests |
| Data integrity | Transactional snapshot and history replacement with team scope validation | Failure injection proves previous data survives rollback |
| Forge | JWT verification and installation/cloud/canonical-host binding | Scope and host rejection tests; live installation not exercised |
| Error handling | Generic connected API failures; structured logs without raw provider errors | Source review |
| Dependencies | Next.js 15.5.27 and Tailwind 4 updates; patched lockfile | Full npm audit reports zero known vulnerabilities; typecheck and build pass |

The 14 automated tests include existing sample workspace and English translation coverage. Database tests use PGlite's PostgreSQL engine; they do not prove compatibility with every policy, extension, or legacy object in the production database.

## Remaining work

- Complete the [connected workspace rollout](SECURITY_ROLLOUT.md): staging migration, authorized account configuration, live authentication and provider smoke tests, then production promotion.
- Verify that the actual production database matches the migration assumptions and that legacy policies/functions do not grant unintended access.
- Broaden runtime validation of coaching mutation payloads and input size limits.
- Review Jira pagination and retention semantics before large-board operation; atomicity does not establish completeness of the imported window.
- Add team-level permissions and credential ownership if this single shared workspace becomes a multi-tenant product.
- Perform a complete repository-history secret scan before changing GitHub visibility.

## Public demonstration

The sample responder is allowlisted and read-only, uses deterministic synthetic data, and makes no database, Jira, or AI calls. `STATUS_PILOT_DEMO_ONLY=1` locks a deployment to that mode. Browser-visible endpoint URLs and Supabase publishable keys are expected; privileged credentials must remain server-only. Hidden URLs or buttons do not provide authorization.
