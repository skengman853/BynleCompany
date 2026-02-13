# API

## Conventions
- All endpoints are tenant-scoped.
- Widget requests use `tenantKey`.
- Admin requests require `x-authjs-session-token: <session_token>` (or `Authorization: Bearer <session_token>`).
- API verifies Auth.js session token using `AUTH_SECRET` and enforces user/tenant/role checks.

## Endpoints
- `GET /widget.js`
- `POST /v1/chat`
- `POST /v1/leads`
- `GET /v1/settings`
- `PUT /v1/settings`
- `GET /v1/faqs`
- `POST /v1/faqs`
- `PUT /v1/faqs/{id}`
- `DELETE /v1/faqs/{id}`
- `POST /v1/kb/upload`
- `GET /v1/kb/documents`
- `DELETE /v1/kb/documents/{id}`
- `GET /v1/analytics`
- `GET /v1/billing/usage`
- `GET /v1/observability`
- `GET /metrics`

## GET /widget.js
Static client script for embedding the chatbot widget.

## POST /v1/chat
Request
```json
{
  "tenantKey": "abc123",
  "sessionId": "sess_123",
  "message": "What are your hours on Friday?",
  "context": {
    "pageUrl": "https://example.com/",
    "userAgent": "..."
  }
}
```

Response
```json
{
  "replyText": "We are open 9am to 5pm on Fridays.",
  "action": "NONE",
  "leadFieldsNeeded": [],
  "sources": [
    {"type": "settings", "id": "hours"}
  ]
}
```

## POST /v1/leads
Request
```json
{
  "tenantKey": "abc123",
  "sessionId": "sess_123",
  "name": "Jane Doe",
  "phone": "+1-555-555-5555",
  "email": "jane@example.com",
  "message": "I'd like to book a consult"
}
```

Response
```json
{
  "leadId": "lead_123"
}
```

## PUT /v1/settings
Request
```json
{
  "businessName": "Acme Clinic",
  "phone": "+1-555-555-5555",
  "address": "123 Main St",
  "hours": "Mon-Fri 9-5",
  "acceptingNewClients": true,
  "holidayMessage": "Closed on July 4th",
  "bookingUrl": "https://example.com/book"
}
```

Response
```json
{
  "ok": true
}
```

## POST /v1/kb/upload
Multipart form with `file` field. Accepts PDF, DOCX, or TXT.
Ingestion is queued as a background job and updates the document status.

Response
```json
{
  "documentId": "doc_123",
  "filename": "pricing.pdf",
  "status": "PENDING",
  "jobId": "job_123"
}
```

## GET /v1/kb/documents
Response
```json
[
  {
    "id": "doc_123",
    "filename": "pricing.pdf",
    "status": "PENDING",
    "lastError": null,
    "version": 1,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

## DELETE /v1/kb/documents/{id}
Deletes the tenant document, its chunks, and pending/running ingestion jobs for that document.

Response
```json
{
  "ok": true
}
```

## GET /v1/analytics
Response
```json
{
  "leadCount": 12,
  "conversationCount": 48,
  "topQuestions": [
    { "question": "what is your whitening price?", "count": 9 }
  ],
  "recentLeads": [
    {
      "id": "lead_123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1-555-555-5555",
      "status": "NEW",
      "createdAt": "2026-02-12T00:00:00.000Z"
    }
  ]
}
```

## GET /v1/billing/usage
Response
```json
{
  "snapshot": {
    "plan": "STARTER",
    "hardLimitEnabled": true,
    "monthlyChatLimit": 1000,
    "monthlyTokenLimit": 400000,
    "usedChats": 120,
    "usedTokens": 43210,
    "remainingChats": 880,
    "remainingTokens": 356790
  },
  "daily": [
    {
      "date": "2026-02-12T00:00:00.000Z",
      "chatCount": 22,
      "tokenCount": 8123,
      "errorCount": 1,
      "rateLimitedCount": 0
    }
  ]
}
```

## GET /v1/observability
Response
```json
{
  "p50LatencyMs": 1020,
  "p95LatencyMs": 2680,
  "last24h": {
    "totalRequests": 88,
    "errorRate": 1.14,
    "avgTokensPerChat": 932
  },
  "last30d": {
    "totalRequests": 712,
    "errorRate": 0.84,
    "sloTarget": 99,
    "errorBudgetRemaining": 0,
    "errorBudgetConsumed": 84
  },
  "alerts": [],
  "recentErrors": []
}
```

## GET /metrics
Prometheus-style text metrics for quick scraping:
- `bynle_chat_requests_5m`
- `bynle_chat_errors_5m`
