# Bynle Docs

## Purpose
Document request, collection, and missing-item tracking.

## Initial wedge
Start with accountants and other service teams that repeatedly chase clients for supporting documents.

The first release should solve:

- create a document checklist
- send a secure upload link
- track missing items
- send reminders automatically
- notify staff when the request is complete or overdue

## MVP scope
- reusable request templates
- client-facing upload links without account creation
- request dashboard inside `admin-web`
- checklist status per document item
- email reminders and completion notifications
- private file storage and audit trail

## Non-goals for v1
- full client portal accounts
- e-signature workflows
- AI-first classification as a required feature
- general-purpose document vault behavior

## Status
- Planned module with implementation spec drafted.
- Build after Assist traction is proven and the accountant-style document chasing workflow is validated.

## Canonical implementation docs
- `docs/products/bynle-docs.md`
- `apps/docs-api/README.md`
- `apps/docs-worker/README.md`
