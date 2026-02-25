# Bynle

Multi-tenant chatbot platform with a client widget, tenant admin, and a policy-aware chat API.

## Repo structure
- `docs/` Product, architecture, API, and data model specs.
- `apps/admin/` Next.js admin dashboard (Auth.js).
- `apps/api/` Fastify API + chat orchestration.
- `packages/db/` Prisma schema + client.
- `packages/shared/` Shared types and validation.

## MVP scope (initial)
- Tenant settings + FAQs + document upload (PDF/TXT)
- Chat endpoint with RAG over tenant content
- Lead capture + analytics basics
- Admin portal for tenant self-service
- Widget snippet for embed

## Local dev (outline)
1. Copy `.env.example` to `.env` and fill values.
1. Install dependencies (npm, pnpm, or yarn).
1. Generate Prisma client: `npx prisma generate --schema packages/db/prisma/schema.prisma`
1. Push schema: `npm run db:push -w packages/db`
1. Run `npm run dev:admin`, `npm run dev:api`, and `npm run dev:worker` in separate terminals.

## Auth bootstrap
1. Run Prisma migrations or `npm run db:push -w packages/db`.
1. Create an owner user and tenant key:
   `node packages/db/scripts/create-admin.mjs <email> <password> [tenantName]`
1. If you need a new key for an existing tenant:
   `node packages/db/scripts/create-tenant-key.mjs <ownerEmail> [label]`
1. To adjust billing plan/limits:
   `node packages/db/scripts/set-tenant-plan.mjs <ownerEmail> <STARTER|PRO|ENTERPRISE> [chatLimit] [tokenLimit] [hardLimit:true|false]`
1. If ingestion jobs get stuck after schema changes:
   `node packages/db/scripts/requeue-pending-docs.mjs [tenantId]`
1. Use the printed tenant key in the widget config.

## Admin/API auth
- Admin routes call API using the Auth.js session token (`x-authjs-session-token`).
- API decrypts/verifies the Auth.js JWT using `AUTH_SECRET`, then enforces user/tenant/role checks.

## Quality gates
- Run checks locally: `npm run ci`
- CI workflow: `.github/workflows/ci.yml`

## Deployment
- Render runbook (database + backend + admin): `docs/deployment-render.md`

## Widget install
Serve script from API:
- `http://localhost:4000/widget.js`

Embed snippet:
```html
<script>
  window.BynleConfig = {
    tenantKey: "bynle_your_tenant_key",
    apiBaseUrl: "http://localhost:4000",
    title: "Chat with Bynle",
    privacyUrl: "https://your-site.com/privacy",
    requireConsent: true
  };
</script>
<script src="http://localhost:4000/widget.js" defer></script>
```
