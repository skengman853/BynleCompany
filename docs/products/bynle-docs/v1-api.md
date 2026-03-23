# Bynle Docs v1 API

Status: planned  
Primary service: `apps/docs-api/`

## Conventions

- All admin endpoints are tenant-scoped.
- Admin endpoints use the same Auth.js session verification model as `assist-api`.
- Public endpoints use a high-entropy request token.
- Public request tokens should be stored hashed, not in plaintext.
- File downloads should return short-lived signed URLs, not public object URLs.

## Endpoint groups

### Admin
- `GET /v1/docs/templates`
- `POST /v1/docs/templates`
- `GET /v1/docs/templates/{id}`
- `PUT /v1/docs/templates/{id}`
- `DELETE /v1/docs/templates/{id}`
- `GET /v1/docs/requests`
- `POST /v1/docs/requests`
- `GET /v1/docs/requests/{id}`
- `POST /v1/docs/requests/{id}/send`
- `POST /v1/docs/requests/{id}/remind`
- `POST /v1/docs/requests/{id}/cancel`
- `POST /v1/docs/requests/{id}/items/{itemId}/approve`
- `POST /v1/docs/requests/{id}/items/{itemId}/reject`
- `POST /v1/docs/requests/{id}/items/{itemId}/waive`
- `GET /v1/docs/overview`

### Public
- `GET /public/docs/requests/{token}`
- `POST /public/docs/requests/{token}/uploads`
- `GET /public/docs/requests/{token}/files/{fileId}`

## Admin DTOs

### Template item shape

```json
{
  "label": "P60",
  "instructions": "Upload your most recent P60.",
  "isRequired": true,
  "acceptedMimeTypes": [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ],
  "maxFiles": 2,
  "sortOrder": 1
}
```

### POST /v1/docs/templates

Request:

```json
{
  "name": "2026 annual tax return pack",
  "description": "Documents required to complete an annual tax filing.",
  "items": [
    {
      "label": "P60",
      "instructions": "Upload your most recent P60.",
      "isRequired": true,
      "acceptedMimeTypes": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "maxFiles": 2,
      "sortOrder": 1
    }
  ]
}
```

Response:

```json
{
  "id": "tmpl_123",
  "name": "2026 annual tax return pack",
  "description": "Documents required to complete an annual tax filing.",
  "isActive": true,
  "items": [
    {
      "id": "tmpl_item_1",
      "label": "P60",
      "instructions": "Upload your most recent P60.",
      "isRequired": true,
      "acceptedMimeTypes": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "maxFiles": 2,
      "sortOrder": 1
    }
  ],
  "createdAt": "2026-03-09T00:00:00.000Z",
  "updatedAt": "2026-03-09T00:00:00.000Z"
}
```

### GET /v1/docs/templates

Response:

```json
[
  {
    "id": "tmpl_123",
    "name": "2026 annual tax return pack",
    "description": "Documents required to complete an annual tax filing.",
    "isActive": true,
    "itemCount": 4,
    "createdAt": "2026-03-09T00:00:00.000Z",
    "updatedAt": "2026-03-09T00:00:00.000Z"
  }
]
```

### POST /v1/docs/requests

Request:

```json
{
  "templateId": "tmpl_123",
  "title": "Jane Doe 2026 tax return documents",
  "clientName": "Jane Doe",
  "clientEmail": "jane@example.com",
  "clientPhone": "+353851234567",
  "dueAt": "2026-10-15T17:00:00.000Z",
  "customMessage": "Please upload the missing records before the filing deadline.",
  "items": [
    {
      "label": "Additional foreign income summary",
      "instructions": "Upload if applicable.",
      "isRequired": false,
      "acceptedMimeTypes": ["application/pdf"],
      "maxFiles": 2,
      "sortOrder": 99
    }
  ]
}
```

Response:

```json
{
  "id": "req_123",
  "status": "DRAFT",
  "title": "Jane Doe 2026 tax return documents",
  "clientName": "Jane Doe",
  "clientEmail": "jane@example.com",
  "dueAt": "2026-10-15T17:00:00.000Z",
  "completionPercent": 0,
  "items": [
    {
      "id": "req_item_1",
      "label": "P60",
      "isRequired": true,
      "status": "PENDING",
      "fileCount": 0
    }
  ],
  "createdAt": "2026-03-09T00:00:00.000Z",
  "updatedAt": "2026-03-09T00:00:00.000Z"
}
```

### GET /v1/docs/requests

Query params:

- `status=DRAFT|SENT|IN_PROGRESS|COMPLETED|OVERDUE|CANCELED`
- `search=<client or title search>`
- `dueBefore=<iso date>`
- `limit=<1..200>` default `50`

Response:

```json
[
  {
    "id": "req_123",
    "title": "Jane Doe 2026 tax return documents",
    "clientName": "Jane Doe",
    "clientEmail": "jane@example.com",
    "status": "IN_PROGRESS",
    "dueAt": "2026-10-15T17:00:00.000Z",
    "completionPercent": 50,
    "lastReminderAt": "2026-10-10T09:00:00.000Z",
    "updatedAt": "2026-10-10T09:00:00.000Z"
  }
]
```

### GET /v1/docs/requests/{id}

Response:

```json
{
  "id": "req_123",
  "title": "Jane Doe 2026 tax return documents",
  "status": "IN_PROGRESS",
  "clientName": "Jane Doe",
  "clientEmail": "jane@example.com",
  "clientPhone": "+353851234567",
  "customMessage": "Please upload the missing records before the filing deadline.",
  "dueAt": "2026-10-15T17:00:00.000Z",
  "sentAt": "2026-10-01T09:00:00.000Z",
  "lastReminderAt": "2026-10-10T09:00:00.000Z",
  "completionPercent": 50,
  "items": [
    {
      "id": "req_item_1",
      "label": "P60",
      "instructions": "Upload your most recent P60.",
      "isRequired": true,
      "status": "UPLOADED",
      "acceptedMimeTypes": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "files": [
        {
          "id": "file_123",
          "originalFilename": "p60.pdf",
          "mimeType": "application/pdf",
          "sizeBytes": 82132,
          "status": "READY",
          "uploadedAt": "2026-10-03T09:15:00.000Z"
        }
      ]
    }
  ],
  "events": [
    {
      "id": "evt_1",
      "eventType": "REQUEST_SENT",
      "actorType": "SYSTEM",
      "createdAt": "2026-10-01T09:00:00.000Z"
    }
  ]
}
```

### POST /v1/docs/requests/{id}/send

Response:

```json
{
  "ok": true,
  "requestId": "req_123",
  "status": "SENT",
  "jobId": "job_123"
}
```

### POST /v1/docs/requests/{id}/remind

Response:

```json
{
  "ok": true,
  "requestId": "req_123",
  "jobId": "job_124"
}
```

### POST /v1/docs/requests/{id}/cancel

Request:

```json
{
  "reason": "Client no longer needs the filing."
}
```

Response:

```json
{
  "ok": true,
  "requestId": "req_123",
  "status": "CANCELED"
}
```

### POST /v1/docs/requests/{id}/items/{itemId}/approve

Request:

```json
{
  "note": "Looks complete."
}
```

Response:

```json
{
  "ok": true,
  "itemId": "req_item_1",
  "status": "APPROVED"
}
```

### POST /v1/docs/requests/{id}/items/{itemId}/reject

Request:

```json
{
  "reason": "This is the wrong tax year."
}
```

Response:

```json
{
  "ok": true,
  "itemId": "req_item_1",
  "status": "REJECTED"
}
```

### POST /v1/docs/requests/{id}/items/{itemId}/waive

Request:

```json
{
  "reason": "Not needed for this client."
}
```

Response:

```json
{
  "ok": true,
  "itemId": "req_item_1",
  "status": "WAIVED"
}
```

### GET /v1/docs/overview

Response:

```json
{
  "counts": {
    "draft": 3,
    "inProgress": 12,
    "overdue": 4,
    "completedThisWeek": 9
  },
  "overdueRequests": [
    {
      "id": "req_123",
      "title": "Jane Doe 2026 tax return documents",
      "clientName": "Jane Doe",
      "dueAt": "2026-10-15T17:00:00.000Z",
      "missingRequiredItems": 2
    }
  ]
}
```

## Public DTOs

### GET /public/docs/requests/{token}

Response:

```json
{
  "requestId": "req_123",
  "title": "Jane Doe 2026 tax return documents",
  "status": "IN_PROGRESS",
  "dueAt": "2026-10-15T17:00:00.000Z",
  "items": [
    {
      "id": "req_item_1",
      "label": "P60",
      "instructions": "Upload your most recent P60.",
      "isRequired": true,
      "status": "PENDING",
      "acceptedMimeTypes": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "maxFiles": 2
    }
  ]
}
```

### POST /public/docs/requests/{token}/uploads

This can be implemented as direct multipart upload through the API or as a signed-upload flow. For v1, multipart through the API is acceptable if file sizes stay modest.

Multipart fields:

- `itemId`
- `file`

Response:

```json
{
  "fileId": "file_123",
  "itemId": "req_item_1",
  "status": "RECEIVED"
}
```

### GET /public/docs/requests/{token}/files/{fileId}

Response:

```json
{
  "downloadUrl": "https://storage.example.com/signed/file_123",
  "expiresAt": "2026-03-09T12:05:00.000Z"
}
```

## Error model

Use a consistent error body:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

Suggested codes:

- `AUTH_MISSING_TOKEN`
- `AUTH_INVALID_TOKEN`
- `DOCS_TEMPLATE_NOT_FOUND`
- `DOCS_REQUEST_NOT_FOUND`
- `DOCS_ITEM_NOT_FOUND`
- `DOCS_PUBLIC_TOKEN_INVALID`
- `DOCS_PUBLIC_TOKEN_EXPIRED`
- `DOCS_UPLOAD_TYPE_NOT_ALLOWED`
- `DOCS_UPLOAD_TOO_LARGE`
- `DOCS_REQUEST_ALREADY_COMPLETED`
- `DOCS_REQUEST_CANCELED`

## Worker-triggering points

- Creating a request does not send it automatically unless explicitly requested.
- `POST /v1/docs/requests/{id}/send` enqueues `SEND_DOC_REQUEST`.
- `POST /v1/docs/requests/{id}/remind` enqueues `SEND_DOC_REMINDER`.
- Successful upload enqueues `PROCESS_DOC_UPLOAD`.
- Status transitions to completed enqueue `NOTIFY_DOC_REQUEST_COMPLETE`.

## Auth notes

- Admin endpoints require owner or staff role.
- Public endpoints must never expose tenant-wide data.
- Public token resolution should also validate request state and expiration rules.
