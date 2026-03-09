# Render Deployment Runbook

Last updated: 2026-03-09

This is the deployment flow for the BynleCompany monorepo after service renaming.

## Topology

Target service split:

1. Render PostgreSQL database
2. `bynle-assist-api` web service (`apps/assist-api`)
3. `bynle-assist-worker` web service (`apps/assist-worker`)
4. `bynle-admin-web` web service (`apps/admin-web`)

Important current constraint:

- KB uploads are currently saved as local file paths in API (`storageUrl`), and worker reads those paths from disk.
- Separate Render services do not share local filesystem.
- Until uploads are moved to shared object storage (for example S3/R2), run API + worker together in one service for document ingestion.

## 1. Create Render PostgreSQL

1. Create a new PostgreSQL instance in Render.
2. Copy the **Internal Database URL** from the DB service.

Use the internal URL for Render-to-Render traffic.  
Use external URL only from local machine/tools outside Render.

## 2. Create `bynle-assist-api` Service

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

Start command (current recommended mode, API + worker co-located):

```bash
API_PORT=$PORT sh -c 'node --import tsx apps/assist-worker/src/worker.ts & node --import tsx apps/assist-api/src/server.ts'
```

Start command (true split mode, only after shared upload storage migration):

```bash
npm run start -w apps/assist-api
```

Health check path:

```text
/health
```

If running co-located mode, add a Persistent Disk:

1. Mount path: `/var/data`
2. Set `UPLOAD_DIR=/var/data/uploads`

Required assist-api environment variables:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=<same value used by admin-web service>
AUTH_URL=https://<admin-web-service>.onrender.com
API_BASE_URL=https://<assist-api-service>.onrender.com
UPLOAD_DIR=/var/data/uploads
NODE_VERSION=20
```

Optional assist-api environment variables:

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
CALENDLY_API_KEY=
CALENDLY_EVENT_TYPE_URI=
CALENDLY_TIMEZONE=UTC
CALENDLY_WEBHOOK_TOKEN=
CALENDLY_WEBHOOK_SIGNING_KEY=
CALENDLY_WEBHOOK_TOLERANCE_SEC=300
```

## 3. Create `bynle-assist-worker` Service (Split Mode Only)

Use this only after upload storage is shared across services.

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
npm run start -w apps/assist-worker
```

Required assist-worker environment variables:

```env
DATABASE_URL=postgresql://...
UPLOAD_DIR=<shared location used by assist-api or object-storage adapter>
NODE_VERSION=20
```

Optional assist-worker environment variables:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDINGS_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
KB_EMBEDDING_BATCH_SIZE=32
```

## 4. Create `bynle-admin-web` Service

Service type: Web Service  
Root directory: repo root

Build command:

```bash
npm install --legacy-peer-deps --include=dev && npx prisma generate --schema packages/db/prisma/schema.prisma && npm run build -w apps/admin-web
```

Start command:

```bash
npm run start -w apps/admin-web
```

Required admin-web environment variables:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=<same exact value as assist-api>
AUTH_URL=https://<admin-web-service>.onrender.com
AUTH_TRUST_HOST=true
API_BASE_URL=https://<assist-api-service>.onrender.com
NODE_VERSION=20
```

## 5. Bootstrap Admin + Tenant

Run in assist-api Render shell:

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

## 6. Verify Deployment

1. `GET https://<assist-api-service>.onrender.com/health` returns `{ "ok": true }`
2. Login at `https://<admin-web-service>.onrender.com/login`
3. Add settings + FAQs
4. Upload a document and confirm it reaches `INDEXED`
5. Test widget/chat on a site

## 7. Widget Install

```html
<script>
  window.BynleConfig = {
    tenantKey: "bynle_your_full_tenant_key",
    apiBaseUrl: "https://<assist-api-service>.onrender.com",
    title: "Chat with us",
    privacyUrl: "https://your-site.com/privacy",
    requireConsent: true
  };
</script>
<script src="https://<assist-api-service>.onrender.com/widget.js" defer></script>
```

## Known Gotchas

1. `DATABASE_URL` must be a real `postgresql://` or `postgres://` URL.
2. `AUTH_SECRET` must match between assist-api and admin-web.
3. `AUTH_URL` must be the admin-web public URL.
4. Full API/worker service separation requires shared upload storage; local disk paths do not work across separate services.
5. Current dependency set requires `npm install --legacy-peer-deps` on Render.
