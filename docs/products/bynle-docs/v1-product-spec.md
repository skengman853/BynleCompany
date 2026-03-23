# Bynle Docs v1 Product Spec

Status: planned  
Primary runtime services: `apps/docs-api/`, `apps/docs-worker/`  
Primary UI surface: `apps/admin-web/`

## Goal

Ship a narrow, reliable document-collection product that replaces manual client chasing for recurring document requests.

The first version should let staff:

- create a document checklist
- send a secure upload request
- see what is missing
- remind the client automatically
- close the request when all required documents are in

## Problem

Service businesses repeatedly lose time asking clients for the same supporting files. The work is repetitive, deadline-sensitive, and easy to lose in email threads.

The highest-value early use case in this repo is accounting and similar professional services, where staff chase:

- bank statements
- invoices
- receipts
- payroll records
- tax support files

## Product definition

Bynle Docs is a document request and completion-tracking system.

It is not v1 of:

- a full client portal
- a generic document vault
- a compliance review platform
- an AI document extraction engine

The v1 wedge is operational clarity, not broad file intelligence.

## Users

### Internal users
- owner
- admin
- operations staff

### External users
- one primary client contact per request link

The first version should not require client accounts. Public upload links are sufficient.

## Primary jobs to be done

1. Create a reusable request template.
2. Create a request for one client from that template.
3. Deliver a secure request link by email.
4. Allow the client to upload files directly against checklist items.
5. Show staff exactly what is complete, missing, rejected, or overdue.
6. Send reminders automatically.
7. Notify staff when the request is complete.

## MVP scope

### In scope
- reusable templates
- required and optional checklist items
- ad hoc request items at request creation time
- one request for one client contact
- secure public upload links
- private object storage
- basic file validation by size and MIME allow-list
- per-item staff review actions:
  - approve
  - reject
  - waive
- request status dashboard in `admin-web`
- automated reminders
- overdue status
- audit trail for request, item, and file actions

### Out of scope
- client login and account system
- two-way messaging
- OCR-heavy extraction
- AI-based document verification as a required step
- e-signatures
- payments
- cross-client shared vaults
- advanced external integrations

## Non-negotiable product rules

- The client flow must be simpler than email.
- Internal users must be able to tell what is missing in under 10 seconds.
- Files must be private by default.
- Reminder logic must be automatic once a request is sent.
- The product should degrade safely without AI features.

## Core objects

- template
- template item
- request
- request item
- uploaded file
- public request link
- request event

## Status model

### Request statuses
- `DRAFT`
- `SENT`
- `IN_PROGRESS`
- `COMPLETED`
- `OVERDUE`
- `CANCELED`

### Request item statuses
- `PENDING`
- `UPLOADED`
- `APPROVED`
- `REJECTED`
- `WAIVED`

### File statuses
- `RECEIVED`
- `PROCESSING`
- `READY`
- `REJECTED`
- `DELETED`

## Lifecycle rules

### Request
- New requests start as `DRAFT`.
- Sending the request moves it to `SENT`.
- A request becomes `IN_PROGRESS` once the link is delivered or the first upload arrives.
- A request becomes `COMPLETED` when every required item is `APPROVED` or `WAIVED`.
- A request becomes `OVERDUE` when the due date passes and required items remain incomplete.
- A request becomes `CANCELED` only through a staff action.

### Request items
- Items start as `PENDING`.
- Any upload moves the item to `UPLOADED`.
- Staff can mark an item `APPROVED`, `REJECTED`, or `WAIVED`.
- Rejected items remain visible to the client with the rejection reason.

## User flows

### 1. Staff creates a template
Staff creates a template like `2026 annual tax return pack` with ordered items such as:

- P60
- 12 months of bank statements
- receipts for deductible expenses
- payroll summary

Each item can define:

- label
- instructions
- required flag
- accepted file types
- max files

### 2. Staff creates a request
Required request fields:

- title
- client name
- client email
- due date

Optional fields:

- client phone
- custom intro message
- ad hoc extra items
- custom reminder policy

### 3. Request delivery
The worker sends an email with a secure request link.

The public page must show:

- request title
- due date
- checklist items
- item instructions
- current upload status

### 4. Client upload
The client uploads files directly to the checklist items.

The system should:

- record file metadata
- store files privately
- attach uploads to the correct item
- queue a lightweight processing job

### 5. Staff review
Staff sees uploads in `admin-web` and can:

- approve valid files
- reject incorrect files with a reason
- waive an item when not needed
- manually send a reminder

### 6. Completion
When all required items are approved or waived:

- the request moves to `COMPLETED`
- the worker sends an internal completion notification
- reminders stop

## Admin UI requirements

The first version should live inside `apps/admin-web`.

### Required screens
- templates list
- template create/edit
- requests list
- request create
- request detail
- uploaded file review view

### Request list columns
- client name
- request title
- status
- due date
- completion percentage
- last reminder sent
- updated at

### Request detail must show
- client info
- request status
- due date
- checklist with per-item status
- uploaded files per item
- audit/event history
- manual actions:
  - send
  - remind
  - cancel
  - approve
  - reject
  - waive

## Public upload page requirements

- no login required
- branded but minimal UI
- mobile-friendly
- clear file acceptance rules
- visible due date
- visible status per item
- clear error states

## Reminder rules

Default v1 schedule:

- send initial request immediately
- reminder 7 days after send if incomplete
- reminder 3 days before due date if incomplete
- reminder 1 day before due date if incomplete

Reminders must stop if the request is:

- completed
- canceled
- expired by future policy

## Notifications

### External
- initial request email
- reminder email
- rejection email when a file is rejected

### Internal
- request completed
- request overdue
- repeated delivery failures

## Security requirements

- store only hashed public link tokens
- files private by default
- use short-lived signed download URLs
- log all request and file actions
- enforce tenant scope on every admin query
- expose only one request per public token

## Success criteria for v1

- staff can send a request in under 2 minutes
- client can upload without support
- staff can identify missing items immediately
- reminder loop reduces manual chasing
- request completion is operationally reliable

## Definition of done

- template CRUD works
- request CRUD works
- request sending works
- public upload link works
- file uploads work
- staff approve/reject/waive actions work
- reminder jobs work
- overdue jobs work
- completion notifications work
- admin screens support day-to-day operation
