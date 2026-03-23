# Bynle Docs v1 Data Model

Status: planned  
Primary owner: `packages/db/prisma/schema.prisma`

## Design goals

- keep the schema narrow
- support reliable request tracking
- support private file storage
- preserve auditability
- reuse the existing shared `jobs` table

## New enums

### `DocsRequestStatus`
- `DRAFT`
- `SENT`
- `IN_PROGRESS`
- `COMPLETED`
- `OVERDUE`
- `CANCELED`

### `DocsRequestItemStatus`
- `PENDING`
- `UPLOADED`
- `APPROVED`
- `REJECTED`
- `WAIVED`

### `DocsFileStatus`
- `RECEIVED`
- `PROCESSING`
- `READY`
- `REJECTED`
- `DELETED`

### `DocsActorType`
- `SYSTEM`
- `STAFF`
- `CLIENT`

## Extend existing enums

### `JobType`
Add:

- `SEND_DOC_REQUEST`
- `SEND_DOC_REMINDER`
- `PROCESS_DOC_UPLOAD`
- `MARK_DOC_REQUEST_OVERDUE`
- `NOTIFY_DOC_REQUEST_COMPLETE`

## New models

### `DocsTemplate`
- `id` string pk
- `tenantId` string fk
- `name` string
- `description` string nullable
- `isActive` boolean default true
- `createdByUserId` string fk
- `createdAt` datetime
- `updatedAt` datetime

Relations:

- belongs to `Tenant`
- belongs to `User` as creator
- has many `DocsTemplateItem`
- has many `DocsRequest`

Indexes:

- unique on `tenantId, name`
- index on `tenantId, createdAt`

### `DocsTemplateItem`
- `id` string pk
- `templateId` string fk
- `label` string
- `instructions` string nullable
- `isRequired` boolean default true
- `acceptedMimeTypes` json
- `maxFiles` int default 1
- `sortOrder` int
- `createdAt` datetime
- `updatedAt` datetime

Indexes:

- index on `templateId, sortOrder`

### `DocsRequest`
- `id` string pk
- `tenantId` string fk
- `templateId` string nullable fk
- `title` string
- `clientName` string
- `clientEmail` string
- `clientPhone` string nullable
- `customMessage` string nullable
- `status` enum `DocsRequestStatus`
- `dueAt` datetime
- `sentAt` datetime nullable
- `lastReminderAt` datetime nullable
- `completedAt` datetime nullable
- `canceledAt` datetime nullable
- `createdByUserId` string fk
- `createdAt` datetime
- `updatedAt` datetime

Relations:

- belongs to `Tenant`
- belongs to `DocsTemplate` optionally
- belongs to `User` as creator
- has many `DocsRequestItem`
- has many `DocsFile`
- has many `DocsUploadLink`
- has many `DocsEvent`

Indexes:

- index on `tenantId, status, dueAt`
- index on `tenantId, clientEmail`
- index on `tenantId, createdAt`

### `DocsRequestItem`
- `id` string pk
- `requestId` string fk
- `templateItemId` string nullable fk
- `label` string
- `instructions` string nullable
- `isRequired` boolean default true
- `status` enum `DocsRequestItemStatus`
- `acceptedMimeTypes` json
- `maxFiles` int default 1
- `sortOrder` int
- `approvedAt` datetime nullable
- `approvedByUserId` string nullable fk
- `rejectionReason` string nullable
- `createdAt` datetime
- `updatedAt` datetime

Indexes:

- index on `requestId, sortOrder`
- index on `requestId, status`

### `DocsFile`
- `id` string pk
- `tenantId` string fk
- `requestId` string fk
- `requestItemId` string fk
- `storageKey` string
- `originalFilename` string
- `mimeType` string
- `sizeBytes` int
- `checksum` string nullable
- `status` enum `DocsFileStatus`
- `uploadedByActorType` enum `DocsActorType`
- `uploadedByActorId` string nullable
- `uploadedAt` datetime
- `deletedAt` datetime nullable

Indexes:

- unique on `storageKey`
- index on `tenantId, requestId, uploadedAt`
- index on `requestItemId, status`

### `DocsUploadLink`
- `id` string pk
- `requestId` string fk
- `tokenHash` string unique
- `expiresAt` datetime nullable
- `revokedAt` datetime nullable
- `lastAccessedAt` datetime nullable
- `createdAt` datetime

Indexes:

- unique on `tokenHash`
- index on `requestId, createdAt`

### `DocsEvent`
- `id` string pk
- `tenantId` string fk
- `requestId` string fk
- `requestItemId` string nullable fk
- `fileId` string nullable fk
- `eventType` string
- `actorType` enum `DocsActorType`
- `actorId` string nullable
- `payload` json nullable
- `createdAt` datetime

Indexes:

- index on `tenantId, requestId, createdAt`
- index on `requestId, eventType, createdAt`

## Tenant relation additions

Add to `Tenant`:

- `docsTemplates`
- `docsRequests`
- `docsFiles`
- `docsEvents`

Add to `User`:

- `docsTemplatesCreated`
- `docsRequestsCreated`
- `docsRequestItemsApproved`

## Status derivation rules

### Request completion percent

Suggested formula:

- denominator: total required items
- numerator: required items in `APPROVED` or `WAIVED`

If there are zero required items, completion is `100`.

### Request status recalculation

On item approval, rejection, waiver, upload, cancel, and due-date jobs:

1. Count required items.
2. Count approved or waived required items.
3. If canceled, keep `CANCELED`.
4. If all required items are approved or waived, set `COMPLETED`.
5. Else if due date is past, set `OVERDUE`.
6. Else if sent at exists, set `IN_PROGRESS`.
7. Else keep `DRAFT` or `SENT` according to send state.

## Storage notes

- `storageKey` should point to a private object-storage object, not a public URL.
- If local disk is used in development, the schema should still store a storage key abstraction rather than a raw local path.
- `checksum` can be optional for v1 but should be populated when practical for duplicate detection.

## Retention notes

Retention policy is not fully defined in the repo yet, but schema should allow:

- soft-delete for files
- revocable public links
- future archival jobs

## Shared type expectations

`packages/shared/` should eventually expose:

- request status enums
- template create/update schemas
- request create/update schemas
- item review schemas
- overview response types
- public request response types
