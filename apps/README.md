# App Services

Deployable runtime services live in this directory.

## Active Services
- `assist-api/` customer-facing API, widget endpoint, and tenant admin API.
- `assist-worker/` async ingestion and embedding worker for Assist.
- `admin-web/` authenticated admin dashboard.

## Planned Service Placeholders
- `flow-api/`
- `flow-worker/`
- `tasks-api/`
- `tasks-worker/`
- `docs-api/` planned API service for Bynle Docs, now with build spec in its README.
- `docs-worker/` planned background worker for Bynle Docs, now with build spec in its README.

Placeholders exist so module boundaries are explicit before implementation.
