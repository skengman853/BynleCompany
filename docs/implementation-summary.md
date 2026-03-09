# Bynle Implementation Summary

Last updated: 2026-02-12

## What we built

This repo is now a working multi-tenant chatbot platform with:

1. Admin dashboard (`Next.js`) for tenant operations.
2. Chat API (`Fastify`) for widget chat + tenant-scoped admin endpoints.
3. Background worker for document ingestion/indexing.
4. Shared schema/types package and Prisma data layer.

## Core features completed

### 1. Multi-tenant foundation
- Tenant-scoped API behavior is enforced across settings, FAQs, docs, analytics, chat, and leads.
- Widget uses `tenantKey` and API resolves it to `tenantId`.

### 2. Admin product (portal)
- Login with Auth.js credentials provider.
- Settings page with save/persist behavior.
- FAQ CRUD.
- Document upload page + status list + delete.
- Analytics page (top questions, conversations, leads).
- Widget install page/snippet.
- Billing usage page.
- Observability page.

Main admin routes:
- `apps/admin-web/app/dashboard/page.tsx`
- `apps/admin-web/app/dashboard/settings/page.tsx`
- `apps/admin-web/app/dashboard/faqs/page.tsx`
- `apps/admin-web/app/dashboard/documents/page.tsx`
- `apps/admin-web/app/dashboard/analytics/page.tsx`
- `apps/admin-web/app/dashboard/billing/page.tsx`
- `apps/admin-web/app/dashboard/observability/page.tsx`
- `apps/admin-web/app/dashboard/widget/page.tsx`

### 3. Real admin->API session verification
- Admin now sends Auth.js session token header (`x-authjs-session-token`).
- API verifies/decrypts Auth.js JWT using `AUTH_SECRET`.
- API then validates user/tenant/role against DB.

Auth files:
- `apps/admin-web/auth.ts`
- `apps/admin-web/lib/adminApiAuth.ts`
- `apps/assist-api/src/admin-auth.ts`

### 4. Chat pipeline upgrades
- RAG context includes tenant settings + active FAQs + indexed document chunks.
- Hybrid retrieval: lexical scoring + embedding similarity.
- Emergency detection route behavior remains guarded.
- Structured LLM output with action routing.

Core chat files:
- `apps/assist-api/src/server.ts`
- `apps/assist-api/src/rag.ts`
- `apps/assist-api/src/llm/openai.ts`
- `apps/assist-api/src/policy.ts`

### 5. Document ingestion and indexing
- Upload endpoint stores file and queues ingestion job.
- Worker extracts text from `.txt`, `.pdf`, `.docx`.
- Text is chunked, embeddings are generated (if configured), chunks saved.
- Document status transitions: `PENDING -> INDEXED` or `FAILED`.
- Delete endpoint removes doc, chunks, pending/running jobs, and local file.

Ingestion files:
- `apps/assist-api/src/jobs.ts`
- `apps/assist-worker/src/worker.ts`
- `apps/assist-worker/src/ingestion.ts`
- `apps/assist-worker/src/embeddings/index.ts`

### 6. Billing and usage enforcement
- Tenant-level monthly limits supported in schema.
- Chat allowance check runs before generation.
- Hard-cap behavior can return lead-capture response when over limit.
- Daily usage counters track chats/tokens/errors/rate-limit events.

Billing files:
- `apps/assist-api/src/billing.ts`
- `apps/assist-api/src/billing-policy.ts`
- `packages/db/scripts/set-tenant-plan.mjs`

### 7. Observability
- Chat telemetry recorded per request:
  - latency
  - context count / KB context count
  - token usage
  - status (`SUCCESS`, `ERROR`, `RATE_LIMITED`, `EMERGENCY`, `BLOCKED`)
- Summary endpoint computes:
  - p50/p95 latency
  - 24h error rate
  - 30d error budget consumption
  - alert conditions
- Added simple metrics endpoint for scraping.

Observability files:
- `apps/assist-api/src/observability.ts`
- `apps/assist-api/src/server.ts` (`/v1/observability`, `/metrics`)

### 8. Tests and CI gates
- Added backend unit tests for:
  - billing allowance logic
  - embedding utility functions
- Added CI workflow.
- Added root `ci` command for local gate checks.

Quality files:
- `tests/billing-policy.test.ts`
- `tests/embeddings-utils.test.ts`
- `.github/workflows/ci.yml`
- `package.json` scripts

## Database/schema changes

Updated Prisma schema includes:
- `BillingPlan` enum and tenant plan/limit fields.
- `ChatTelemetry` model for request-level observability.
- Extended `TenantUsageDaily` with error/rate-limit counters.
- Existing auth, KB, lead, and job models retained.

Schema file:
- `packages/db/prisma/schema.prisma`

## API endpoints now available

Widget/chat:
- `GET /widget.js`
- `POST /v1/chat`
- `POST /v1/leads`

Admin data:
- `GET/PUT /v1/settings`
- `GET/POST/PUT/DELETE /v1/faqs`
- `POST /v1/kb/upload`
- `GET /v1/kb/documents`
- `DELETE /v1/kb/documents/:id`
- `GET /v1/analytics`
- `GET /v1/billing/usage`
- `GET /v1/observability`
- `GET /metrics`

## Local run flow

From repo root:

1. `npx prisma generate --schema packages/db/prisma/schema.prisma`
2. `npm run db:push -w packages/db`
3. Run three terminals:
   - `npm run dev:assist-api`
   - `npm run dev:assist-worker`
   - `npm run dev:admin-web`

## Bootstrap scripts

- Create admin + tenant + tenant key:
  - `node packages/db/scripts/create-admin.mjs <email> <password> [tenantName]`
- Create another tenant key for existing owner:
  - `node packages/db/scripts/create-tenant-key.mjs <ownerEmail> [label]`
- Update plan/limits:
  - `node packages/db/scripts/set-tenant-plan.mjs <ownerEmail> <STARTER|PRO|ENTERPRISE> [chatLimit] [tokenLimit] [hardLimit:true|false]`
- Requeue stuck pending docs:
  - `node packages/db/scripts/requeue-pending-docs.mjs [tenantId]`

## Known notes

1. Embeddings run when `OPENAI_API_KEY` is set; fallback behavior still works without embeddings.
2. Chat model and embedding model are configurable via `.env`.
3. Worker must be running for document `PENDING` items to become `INDEXED`.

## Next high-impact steps

1. Add integration tests for auth/session and upload->ingest->chat retrieval.
2. Add export/retention tooling for leads and compliance operations.
3. Add stronger production monitoring stack (OpenTelemetry/Sentry/Prometheus wiring).
4. Add Stripe subscription + automatic plan enforcement from billing webhooks.
