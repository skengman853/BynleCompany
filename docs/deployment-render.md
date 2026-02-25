# Render Deployment Runbook

Last updated: 2026-02-25

This is the deployment flow used for this repo on Render.

## Topology

Keep the monorepo as-is (no repo split required):

1. Render PostgreSQL database
2. `bynle-backend` web service (runs `apps/api` and `apps/worker` together)
3. `bynle-admin` web service (runs `apps/admin`)

Why backend + worker in one service:

- KB uploads are written to local disk by API and read by worker (`storageUrl` is a file path).
- Separate services do not share local filesystem.
- Running both processes in one service with a Persistent Disk keeps ingestion working.

## 1. Create Render PostgreSQL

1. Create a new PostgreSQL instance in Render.
2. Copy the **Internal Database URL** from the DB service.

Use the internal URL for Render-to-Render traffic.  
Use external URL only from local machine/tools outside Render.

## 2. Create `bynle-backend` Service

Service type: Web Service  
Root directory: repo root

Build command:

```bash
npm install --legacy-peer-deps --include=dev && npx prisma generate --schema packages/db/prisma/schema.prisma
```

Pre-deploy command:

```bash
npm run db:push -w packages/db
```

Start command:

```bash
API_PORT=$PORT sh -c 'node --import tsx apps/worker/src/worker.ts & node --import tsx apps/api/src/server.ts'
```

Health check path:

```text
/health
```

Add a Persistent Disk:

1. Mount path: `/var/data`
2. Set `UPLOAD_DIR=/var/data/uploads`

Required backend environment variables:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=<same value used by admin service>
AUTH_URL=https://<admin-service>.onrender.com
API_BASE_URL=https://<backend-service>.onrender.com
UPLOAD_DIR=/var/data/uploads
NODE_VERSION=20
```

Optional backend environment variables:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDINGS_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=notifications@bynle.com
```

## 3. Create `bynle-admin` Service

Service type: Web Service  
Root directory: repo root

Build command:

```bash
npm install --legacy-peer-deps --include=dev && npx prisma generate --schema packages/db/prisma/schema.prisma && npm run build -w apps/admin
```

Start command:

```bash
npm run start -w apps/admin
```

Required admin environment variables:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=<same exact value as backend>
AUTH_URL=https://<admin-service>.onrender.com
AUTH_TRUST_HOST=true
API_BASE_URL=https://<backend-service>.onrender.com
NODE_VERSION=20
```

## 4. Bootstrap Admin + Tenant

Run in backend Render shell:

```bash
node packages/db/scripts/create-admin.mjs you@example.com 'StrongPassword123!' 'Your Business Name'
```

This creates:

1. Tenant
2. Owner user
3. Tenant API key (store this safely)

Create extra keys later if needed:

```bash
node packages/db/scripts/create-tenant-key.mjs you@example.com widget
```

## 5. Verify Deployment

1. `GET https://<backend-service>.onrender.com/health` returns `{ "ok": true }`
2. Login at `https://<admin-service>.onrender.com/login`
3. Add settings + FAQs
4. Upload a document and confirm it reaches `INDEXED`
5. Test widget/chat on a site

## 6. Widget Install

```html
<script>
  window.BynleConfig = {
    tenantKey: "bynle_your_full_tenant_key",
    apiBaseUrl: "https://<backend-service>.onrender.com",
    title: "Chat with us",
    privacyUrl: "https://your-site.com/privacy",
    requireConsent: true
  };
</script>
<script src="https://<backend-service>.onrender.com/widget.js" defer></script>
```

## Known Gotchas

1. `DATABASE_URL` must be an actual `postgresql://` or `postgres://` URL.
2. `AUTH_SECRET` must match in backend and admin services.
3. `AUTH_URL` must be the admin public URL.
4. Without Persistent Disk + worker process, document ingestion stays `PENDING` or fails.
5. Current dependency set requires `npm install --legacy-peer-deps` on Render.
