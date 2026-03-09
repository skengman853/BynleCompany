# Bynle Docs

Status: planned  
Primary runtime services: `apps/docs-api/`, `apps/docs-worker/`  
Primary staff UI surface: `apps/admin-web/`  
Initial target vertical: accountants and other service firms that repeatedly chase client documents

## Product definition

Bynle Docs is a document collection and completion-tracking product.

It is not a general-purpose document management system. The first version should solve a narrower operational problem:

- request a defined set of client documents
- give the client a simple upload flow
- track what is still missing
- send reminders automatically
- notify staff when the request is complete or overdue

## Why this product exists

Service businesses lose time on repetitive document chasing. The highest-value early use case is accountants requesting recurring client records such as:

- bank statements
- invoices
- receipts
- payroll files
- tax support documents

The system should reduce manual follow-up, centralize upload status, and create a reliable checklist-driven workflow.

## Users

### Internal users
- owner or admin creating templates and requests
- staff reviewing uploads and request status

### External users
- client contact receiving a secure upload link

The MVP should avoid full external account creation. A secure request link is enough.

## MVP jobs to be done

1. Staff creates a reusable document request template.
2. Staff starts a request for one client with a due date.
3. Client receives a secure link showing exactly what is needed.
4. Client uploads files against checklist items.
5. System shows progress, missing items, and overdue state.
6. System sends reminder emails until the request is complete, canceled, or expired.
7. Staff gets notified when the request becomes complete.

## MVP scope

### In scope
- reusable request templates
- required and optional checklist items
- one request sent to one primary client contact
- secure public upload link without client login
- file uploads to private object storage
- basic file validation:
  - size limit
  - file type allow-list
  - duplicate upload detection by filename and size
- request dashboard for staff inside `admin-web`
- reminder schedule by fixed offsets or due-date-based cadence
- request/item/file audit trail
- completion and overdue notifications for staff

### Explicitly out of scope
- full client portal accounts
- AI-based file understanding as a hard dependency
- OCR-heavy extraction pipelines
- e-signature workflows
- payment collection
- two-way client messaging inbox
- cross-request reusable client vault
- industry-specific tax or compliance logic beyond configurable templates

The first release should remain checklist-driven and rule-based. AI validation can come later.

## Service shape

### `apps/admin-web/`

No separate `docs-web` app is required for MVP.

Staff-facing pages should be added inside the existing admin dashboard for:

- templates
- request list
- request detail
- manual reminder trigger
- uploaded file review

### `apps/docs-api/`

This service owns:

- admin CRUD for templates and requests
- public request-link resolution
- upload session handling
- signed upload and download URL orchestration
- request status calculation
- audit and event recording
- worker job enqueueing

### `apps/docs-worker/`

This service owns:

- sending initial request emails
- reminder scheduling and retries
- overdue marking
- lightweight post-upload processing
- completion notification fan-out

## Core workflow

### 1. Template setup
Staff creates a template such as `Annual tax return pack`.

Template items may include:

- P60
- last 12 months of bank statements
- receipts for expenses
- payroll summary

### 2. Request creation
Staff creates a request from a template or from ad hoc items.

Required fields:

- client name
- client email
- request title
- due date

### 3. Delivery
Worker sends the first email containing the request link.

The public page should show:

- request title
- due date
- checklist items
- per-item instructions
- upload state

### 4. Upload and validation
Client uploads one or more files against checklist items.

The API should store file metadata, write files to private storage, and queue post-upload processing.

The worker should verify storage integrity, normalize metadata, detect obvious duplicates, and update request status.

### 5. Completion tracking
Suggested request logic:

- `IN_PROGRESS` once sent
- `COMPLETED` when all required items are approved or waived
- `OVERDUE` when due date passes and required items remain incomplete

## API areas

Planned admin endpoints:

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

Planned public endpoints:

- `GET /public/docs/requests/{token}`
- `POST /public/docs/requests/{token}/uploads`
- `GET /public/docs/requests/{token}/files/{fileId}`

## Worker jobs

- `SEND_DOC_REQUEST`
- `SEND_DOC_REMINDER`
- `PROCESS_DOC_UPLOAD`
- `MARK_DOC_REQUEST_OVERDUE`
- `NOTIFY_DOC_REQUEST_COMPLETE`

The existing shared `jobs` pattern from `assist-worker` should be reused instead of inventing a separate job system.

## Proposed entities

- document templates
- template items
- document requests
- request items
- uploaded files
- public upload links
- request events

## Definition of done for MVP

- Staff can create a reusable template with required items.
- Staff can send a request and copy a public upload link.
- Client can upload files without creating an account.
- Staff can see per-item status and missing documents.
- Reminder emails send automatically and can be manually triggered.
- Files remain private and downloadable only through controlled access.

## Related docs

- `products/bynle_docs/README.md`
- `apps/docs-api/README.md`
- `apps/docs-worker/README.md`
- `docs/company/12-month-roadmap.md`
- `docs/company/accountant-ideas.txt`
