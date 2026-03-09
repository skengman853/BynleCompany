# Docs API

Status: planned, not implemented.

Canonical module spec: `docs/products/bynle-docs.md`

## Purpose

`docs-api` is the tenant-scoped API service for Bynle Docs.

It should power both:

- staff actions from `apps/admin-web`
- secure public upload-link flows for external clients

## Service responsibilities

- request template CRUD
- document request CRUD
- secure public token resolution
- upload session handling
- signed object-storage URL orchestration
- request/item/file status calculation
- audit event recording
- worker job enqueueing for sends, reminders, and upload processing

## Planned endpoint areas

### Admin
- `GET/POST /v1/docs/templates`
- `GET/PUT/DELETE /v1/docs/templates/{id}`
- `GET/POST /v1/docs/requests`
- `GET /v1/docs/requests/{id}`
- `POST /v1/docs/requests/{id}/send`
- `POST /v1/docs/requests/{id}/remind`
- `POST /v1/docs/requests/{id}/cancel`
- `POST /v1/docs/requests/{id}/items/{itemId}/approve`
- `POST /v1/docs/requests/{id}/items/{itemId}/reject`
- `POST /v1/docs/requests/{id}/items/{itemId}/waive`
- `GET /v1/docs/overview`

### Public
- `GET /public/docs/requests/{token}`
- `POST /public/docs/requests/{token}/uploads`
- `GET /public/docs/requests/{token}/files/{fileId}`

## Authentication model

- Admin endpoints follow the same Auth.js session verification pattern used by `assist-api`.
- Public endpoints do not require login, but must require a high-entropy request token.
- Public token lookup must expose only the single request bound to that token.

## Runtime dependencies

- `packages/db/` for persistence
- `packages/shared/` for request/response contracts
- private object storage for files
- shared job queue table for background work
- email provider integration through worker-triggered jobs

## Key design constraints

- Keep files private by default.
- Store only hashed public request tokens.
- Prefer signed URLs over direct file streaming for large downloads.
- Reuse the existing platform conventions for multi-tenancy, logging, and jobs.
- Do not turn this service into a general document management API in v1.

## First implementation milestone

1. Template CRUD.
2. Request creation and list/detail endpoints.
3. Public upload-link resolution.
4. File upload metadata + storage handoff.
5. Job enqueue hooks for send/remind/process flows.
