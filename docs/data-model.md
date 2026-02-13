# Data model

## Core tables
- `tenants`
- `users`
- `settings`
- `faqs`
- `conversations`
- `messages`
- `leads`
- `kb_documents`
- `kb_chunks`
- `jobs`
- `audit_log`
- `tenant_usage_daily`
- `chat_telemetry`

## Table sketches

### tenants
- `id` (pk)
- `name`
- `status`
- `plan` (`STARTER`, `PRO`, `ENTERPRISE`)
- `monthly_chat_limit`
- `monthly_token_limit`
- `hard_limit_enabled`
- `created_at`

### users
- `id` (pk)
- `tenant_id` (fk)
- `email`
- `role` (owner, staff)
- `password_hash`
- `created_at`

### settings
- `tenant_id` (pk)
- `business_name`
- `phone`
- `address`
- `hours`
- `accepting_new_clients`
- `holiday_message`
- `booking_url`
- `emergency_message`

### faqs
- `id` (pk)
- `tenant_id` (fk)
- `question`
- `answer`
- `is_active`

### conversations
- `id` (pk)
- `tenant_id` (fk)
- `session_id`
- `started_at`

### messages
- `id` (pk)
- `tenant_id` (fk)
- `conversation_id` (fk)
- `role` (user, assistant)
- `content`
- `created_at`

### leads
- `id` (pk)
- `tenant_id` (fk)
- `session_id`
- `name`
- `phone`
- `email`
- `message`
- `created_at`

### kb_documents
- `id` (pk)
- `tenant_id` (fk)
- `filename`
- `storage_url`
- `status` (pending, indexed, failed)
- `last_error`
- `version`
- `created_at`

### kb_chunks
- `id` (pk)
- `tenant_id` (fk)
- `document_id` (fk)
- `chunk_index`
- `chunk_text`
- `embedding` (json for now, pgvector later)
- `created_at`

### jobs
- `id` (pk)
- `tenant_id` (fk)
- `type` (`INGEST_DOCUMENT`)
- `status` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`)
- `payload` (json)
- `attempts`
- `max_attempts`
- `run_at`
- `locked_at`
- `completed_at`
- `failed_at`
- `last_error`
- `created_at`

### audit_log
- `id` (pk)
- `tenant_id` (fk)
- `user_id` (fk)
- `action`
- `created_at`

### tenant_usage_daily
- `id` (pk)
- `tenant_id` (fk)
- `date`
- `chat_count`
- `token_count`
- `error_count`
- `rate_limited_count`

### chat_telemetry
- `id` (pk)
- `tenant_id` (fk)
- `session_id`
- `conversation_id` (nullable)
- `status` (`SUCCESS`, `ERROR`, `RATE_LIMITED`, `EMERGENCY`, `BLOCKED`)
- `latency_ms`
- `context_items`
- `kb_context_items`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `model`
- `error_message`
- `created_at`
