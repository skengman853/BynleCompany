# BynleCompany

Core Bynle platform repo: chatbot product code, internal operations docs, and runbooks.

## Repo Boundary
- This repo owns backend/product/internal documentation and deployment runbooks.
- `bynle-technologies` owns the public marketing website and customer-facing website content.

## Directory Map
- `products/` product module definitions, scope, and rollout notes.
- `apps/admin-web/` Next.js admin dashboard (Auth.js).
- `apps/assist-api/` Fastify API and chat orchestration.
- `apps/assist-worker/` background ingestion and processing worker.
- `apps/README.md` service map, including planned `flow/tasks/docs` placeholders.
- `packages/db/` Prisma schema, client, and DB scripts.
- `packages/shared/` shared types and validation.
- `tests/` API integration checks and regression tests.
- `docs/` product, architecture, company ops, deployment, and historical notes.
- `chat_errors/` local captured chat error samples for debugging.

Docs index: `docs/README.md`
Products index: `products/README.md`

## Local Dev
1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies.
3. Generate Prisma client: `npx prisma generate --schema packages/db/prisma/schema.prisma`
4. Push schema: `npm run db:push -w packages/db`
5. Run `npm run dev:admin-web`, `npm run dev:assist-api`, and `npm run dev:assist-worker` in separate terminals.
6. For Bynle Docs work, also run `npm run dev:docs-api` and `npm run dev:docs-worker`.

## Auth Bootstrap
1. Run Prisma migrations or `npm run db:push -w packages/db`.
2. Create an owner user and tenant key: `node packages/db/scripts/create-admin.mjs <email> <password> [tenantName]`
3. Create a new key for an existing tenant: `node packages/db/scripts/create-tenant-key.mjs <ownerEmail> [label]`
4. Adjust billing plan/limits: `node packages/db/scripts/set-tenant-plan.mjs <ownerEmail> <STARTER|PRO|ENTERPRISE> [chatLimit] [tokenLimit] [hardLimit:true|false]`
5. Requeue pending ingestion docs if needed: `node packages/db/scripts/requeue-pending-docs.mjs [tenantId]`

## Deployment
- Render runbook (database + backend + admin): `docs/deployment-render.md`

## Quality Gates
- Run local checks: `npm run ci`
- CI workflow: `.github/workflows/ci.yml`

## Widget Install
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
