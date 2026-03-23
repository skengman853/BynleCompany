# Bynle Docs v1 Delivery Plan

Status: planned

## Objective

Implement Bynle Docs v1 in a sequence that produces usable milestones without requiring every later enhancement upfront.

## Service ownership

### `apps/admin-web`
- template management UI
- request list and detail UI
- review actions

### `apps/docs-api`
- auth-gated admin endpoints
- public upload-link endpoints
- upload handling
- job enqueueing

### `apps/docs-worker`
- email delivery
- reminders
- overdue jobs
- upload post-processing
- completion notifications

### `packages/db`
- Prisma enums and models
- any helper queries or scripts

### `packages/shared`
- Zod request and response contracts
- shared enums and DTO types

## Implementation phases

### Phase 1: contracts and schema

Deliverables:

- add `Docs*` enums and models to Prisma
- extend `JobType`
- add shared Zod schemas and TS types
- define docs-api route registration structure
- define docs-worker job dispatcher structure

Exit criteria:

- type-safe contracts exist
- Prisma schema expresses the v1 model cleanly
- no unresolved service-boundary questions remain

### Phase 2: docs-api admin foundation

Deliverables:

- `docs-api` Fastify service scaffold
- shared admin auth reused from Assist
- template CRUD endpoints
- request CRUD endpoints
- overview endpoint

Exit criteria:

- staff can create templates and requests through API
- all endpoints are tenant-scoped
- audit events are recorded

### Phase 3: public upload flow

Deliverables:

- public token generation and hashing
- public request resolve endpoint
- multipart upload endpoint
- file metadata persistence
- object-storage adapter abstraction

Exit criteria:

- a client can open a request link and upload against an item
- uploaded files are private
- upload validation errors are clear

### Phase 4: worker loop

Deliverables:

- `docs-worker` service scaffold
- job claiming and retry logic reused from Assist worker patterns
- initial send job
- reminder job
- overdue job
- completion notification job
- upload processing job

Exit criteria:

- send and reminder jobs are idempotent
- overdue state updates automatically
- completion notifications fire once

### Phase 5: admin-web operational UI

Deliverables:

- templates list and editor
- requests list
- request create screen
- request detail screen
- approve, reject, waive actions
- manual remind action

Exit criteria:

- a staff user can operate the product without DB access
- request state is visible and understandable

## Suggested implementation order inside the repo

1. `packages/db/prisma/schema.prisma`
2. `packages/shared/src/schemas.ts`
3. `packages/shared/src/types.ts`
4. `apps/docs-api/` scaffold
5. `apps/docs-worker/` scaffold
6. `apps/admin-web/` routes and pages
7. tests

## Testing priorities

### Unit tests
- status recalculation logic
- reminder schedule selection
- public token hashing and validation
- upload validation rules

### Integration tests
- template create and list
- request create and send
- public request resolve
- upload to item
- approve or reject item
- request completion transition

### End-to-end checks
- create template in admin
- create and send request
- open public link
- upload required files
- approve files
- confirm completion notification

## Risks

### File storage complexity
If object storage is not standardized first, uploads will become brittle.

Mitigation:

- define a storage adapter interface early
- keep private file access behind signed URL generation

### Reminder spam or duplicate sends
Retries can easily duplicate emails.

Mitigation:

- idempotency keys in request events
- dedupe on request plus event type plus schedule slot

### Status confusion
Too many states or implicit transitions will make support difficult.

Mitigation:

- keep the status model small
- centralize recalculation logic

## Recommended first build slice

If this is implemented incrementally, start with:

1. Prisma schema
2. template CRUD
3. request CRUD
4. send request job
5. public request page payload
6. upload endpoint

That slice proves the product’s core loop before reminders, overdue processing, and richer admin UX.
