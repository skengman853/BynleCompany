# Bynle Docs

Status: planned  
Primary runtime services: `apps/docs-api/`, `apps/docs-worker/`  
Primary staff UI surface: `apps/admin-web/`

## Purpose

Bynle Docs is the product for document request, collection, and missing-item tracking.

Its v1 wedge is operational document chasing for accountants and similar service businesses.

## V1 build pack

- `docs/products/bynle-docs/v1-product-spec.md`
- `docs/products/bynle-docs/v1-api.md`
- `docs/products/bynle-docs/v1-data-model.md`
- `docs/products/bynle-docs/v1-delivery-plan.md`

## Summary

The first version should let staff:

- create reusable request templates
- send secure upload links to clients
- track missing required items
- review uploaded files
- automate reminders and completion notifications

## Service ownership

### `apps/docs-api/`
- template and request CRUD
- public request link resolution
- upload handling
- status calculation
- job enqueueing

### `apps/docs-worker/`
- send emails
- reminder jobs
- overdue jobs
- upload post-processing
- completion notifications

### `apps/admin-web/`
- templates UI
- requests UI
- request detail and review actions

## Related docs

- `products/bynle_docs/README.md`
- `apps/docs-api/README.md`
- `apps/docs-worker/README.md`
- `docs/company/12-month-roadmap.md`
