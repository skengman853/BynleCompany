# Docs Worker

Status: planned, not implemented.

Canonical module spec: `docs/products/bynle-docs.md`

## Purpose

`docs-worker` is the background execution service for Bynle Docs.

It should handle all asynchronous work that should not block request creation or client uploads.

## Service responsibilities

- send initial document-request emails
- send reminder emails
- process uploaded file metadata after storage
- mark requests overdue when due dates pass
- emit staff notifications when a request becomes complete
- retry transient failures with visibility into dead jobs

## Planned job types

- `SEND_DOC_REQUEST`
- `SEND_DOC_REMINDER`
- `PROCESS_DOC_UPLOAD`
- `MARK_DOC_REQUEST_OVERDUE`
- `NOTIFY_DOC_REQUEST_COMPLETE`

## Processing rules

- Jobs must be idempotent.
- Delivery jobs should use dedupe keys so retries do not spam clients.
- All logs should include `tenant_id` and `request_id` when available.
- Failed jobs need capped retry counts and a clear terminal error state.
- Upload processing should stay lightweight in v1: metadata normalization, duplicate detection, and status updates.

## Runtime dependencies

- shared `jobs` persistence pattern already used by `assist-worker`
- `packages/db/` for data access
- object storage access for file verification
- email provider for request and reminder delivery

## Non-goals for v1

- heavy OCR pipelines
- AI document classification as a required step
- long-running compliance workflows

The worker should stay operationally simple until real demand proves those additions are needed.
