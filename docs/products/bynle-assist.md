# Bynle Assist

Status: active foundation, already implemented  
Primary runtime services: `apps/admin-web/`, `apps/assist-api/`, `apps/assist-worker/`

## Purpose

Bynle Assist is the customer enquiry and booking automation product.

It is the current entry product and the part of the platform that is already closest to production use.

## Core job

Help service businesses answer repetitive questions, capture leads, and route qualified visitors into booking or follow-up actions without adding staff workload.

## Target users

- service business owners
- front-desk or admin staff
- website visitors asking questions or trying to book

## Current shipped scope

- website chat widget
- tenant-scoped FAQ and business settings retrieval
- document-backed RAG for chat answers
- lead capture
- booking integration handoff
- admin dashboard for settings, FAQs, documents, analytics, billing, and observability
- background document ingestion and indexing

## Product boundary

Bynle Assist is not meant to replace a full CRM, ticketing system, or call center stack in the current phase.

The focus is:

- answer questions reliably
- capture intent and contact details
- reduce repetitive admin
- make deployment repeatable across tenants

## Service shape

### `apps/admin-web/`
- tenant dashboard
- settings management
- FAQ CRUD
- document upload and status views
- analytics, billing, and observability pages

### `apps/assist-api/`
- widget delivery
- chat orchestration
- lead capture
- booking endpoints
- tenant admin endpoints
- billing and observability endpoints

### `apps/assist-worker/`
- document ingestion
- text extraction and chunking
- embedding generation
- indexing retries

## Key workflows

### Customer chat
1. Visitor opens widget.
2. Widget sends `tenantKey` and message.
3. API resolves tenant scope.
4. Retrieval combines settings, FAQs, and indexed docs.
5. LLM returns structured reply and action hints.

### Lead capture
1. Chat identifies booking or follow-up intent.
2. Lead details are collected.
3. Lead is stored per tenant for staff review.

### Knowledge base ingestion
1. Staff uploads a document.
2. API stores metadata and queues ingestion.
3. Worker extracts text, chunks content, creates embeddings, and marks document indexed.

## Current success criteria

- reliable tenant onboarding
- one-snippet widget install
- useful answers grounded in tenant data
- observable latency and usage
- repeatable deployment for early paying clients

## Next product priorities

- strengthen deployment reliability
- improve onboarding speed
- tighten booking reliability and fallback behavior
- keep analytics and billing operationally useful

## Related docs

- `products/bynle_assist/README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/implementation-summary.md`
