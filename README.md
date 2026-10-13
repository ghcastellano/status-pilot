# Status Pilot

A delivery analytics and reporting application that connects Jira activity to team metrics, coaching workflows, and AI-assisted status reports.

The project brings together a TypeScript/Node.js backend, a React dashboard, and a PostgreSQL data layer. It explores how program-management questions can be answered from a shared delivery dataset.

## Product capabilities

- Synchronize Jira boards and issues into Supabase/PostgreSQL.
- Calculate cycle time, lead time, throughput, work in progress, flow efficiency, and Scrum delivery metrics.
- Explore trends, aging work, and bottlenecks through interactive charts.
- Generate status reports and answer questions using metrics supplied to an OpenAI model.
- Track coaching plans, experiments, behavioral signals, and their history.

## Architecture and Node.js usage

| Layer | Implementation |
| --- | --- |
| User interface | React, Next.js App Router, Tailwind, and Recharts |
| Backend | TypeScript API route handlers running in the Node.js runtime |
| Integrations | Server-side Jira REST API clients and OpenAI SDK |
| Persistence | Supabase/PostgreSQL for delivery data, coaching records, cached answers, and request counters |
| Automation | TypeScript scripts executed with `tsx` for setup, synchronization, and reconciliation |
| Deployment | Next.js application configured for Vercel |

Jira data is ingested into PostgreSQL, transformed into metrics, and exposed through the application's APIs. AI requests use these calculated datasets as context. API credentials are read on the server.

This is a **Node.js backend implemented through Next.js**, not a NestJS service. Node.js also provides utilities such as SHA-256 hashing for answer-cache keys.

## Code walkthrough

| Area | Entry point | What to inspect |
| --- | --- | --- |
| Question answering | [app/api/ask/route.ts](app/api/ask/route.ts) | Input validation, cached responses, request limits, and AI orchestration |
| Jira integration | [lib/jira.ts](lib/jira.ts) | Shared provider interface and REST client implementations |
| Data synchronization | [lib/sync.ts](lib/sync.ts) | Ingestion orchestration and answer-cache invalidation |
| Metrics | [lib/metrics.ts](lib/metrics.ts) | Delivery calculations used by the dashboard |
| AI integration | [lib/llm.ts](lib/llm.ts) | Reporting and question-answering prompts |
| Coaching persistence | [lib/coaching-db.ts](lib/coaching-db.ts) | Coaching records and change history |
| Forge integration | [app/api/forge/sync/route.ts](app/api/forge/sync/route.ts) | Experimental Forge Remote ingestion path |

The Jira provider abstraction allows ingestion logic to be reused across connection methods. Cache storage is shared through PostgreSQL rather than relying on a single server process.

## Try the sample workspace

Run `npm ci` and `npm run dev`, open `/config`, and select **Open sample workspace** (or **Abrir demonstração** in Portuguese). No credentials are required for the demonstration.

The sample workspace includes Scrum and Kanban teams, delivery metrics and charts, maturity history, coaching plans, experiments, and illustrative reports. The fixture timeline is fixed at June 3, 2026; it is not live operational data. Dashboard metrics use the same calculation functions as connected data. Reports and answers are explicitly labeled deterministic examples, not live AI responses.

An HTTP-only cookie selects the isolated API responder. All API routes are intercepted in this mode, and writes are rejected. No Jira, Supabase, or OpenAI requests are made by the sample responder. Browser histories use separate storage keys. Exit restores connected mode.

For a **public demonstration deployment**, set `STATUS_PILOT_DEMO_ONLY=1` at build and runtime, and configure no live-service credentials. This locks the application to sample data even without a cookie; visitors cannot exit into live APIs. This option does not add authentication to connected mode.

The separate seed scripts can create fictional Jira records for integration development. Do not run them against an operational Jira project.

## Data and project scope

The current application is a development/demo implementation. Authentication and authorization for administrative APIs, tenant isolation, atomic rate limiting, and broader automated test coverage remain hardening priorities. The Forge integration is a spike, not a completed multi-tenant product.

## Development

Install dependencies with `npm ci`, configure a private `.env.local`, and run `npm run dev`.

| Configuration | Server-side variables |
| --- | --- |
| Database client | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Database administration scripts | `SUPABASE_DB_URL` |
| AI features | `OPENAI_API_KEY` |
| Jira connection | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| Seed project selection | `JIRA_PROJECT_KEY_SCRUM`, `JIRA_PROJECT_KEY_KANBAN` |

Use a dedicated development database and Jira tenant. Environment values are intentionally not included in a template file. The schema bootstrap in `supabase/schema.sql` drops and recreates tables; it is not a production migration procedure.

## Verification

- `npm test`: offline regression tests for demo isolation, filtering, contracts, and calculations.
- `npm run typecheck`: TypeScript checking.
- `npm run build`: Next.js build.
- `npm run test:reconcile`: compares Jira data, database records, and calculated metrics; requires configured external services.

CI runs the offline tests, type checking, and a production build without service credentials. The reconciliation script requires dedicated external services and is not run in CI.

See [the engineering review](docs/ENGINEERING_REVIEW.md) for the connected-mode security gaps and verification scope.
