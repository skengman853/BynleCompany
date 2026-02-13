# Architecture

## Components
- Widget script served via CDN
- Admin dashboard (tenant portal)
- API gateway for REST endpoints
- Chat orchestrator for LLM + tools
- Ingestion pipeline for docs to embeddings
- Async worker for jobs and retries
- Postgres for tenant data
- Vector store for RAG
- Object storage for documents

## Request flow
1. Widget sends `tenantKey` with each request.
2. API resolves `tenant_id` and enforces tenant scope.
3. Policy router applies safety rules and intent routing.
4. Retriever loads tenant settings, FAQs, and doc chunks.
5. LLM generates a structured response.
6. Post-processing logs analytics and triggers actions.

## Multi-tenancy
- Every request resolves to a `tenant_id`.
- All data queries must filter by `tenant_id`.
- Optional row-level security for defense in depth.

## Observability
- Structured logs with tenant context.
- Metrics for latency, token usage, and errors.
- Tracing across chat and ingestion.
