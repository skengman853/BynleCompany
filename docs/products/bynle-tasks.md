# Bynle Tasks

Status: planned  
Primary runtime services: `apps/tasks-api/`, `apps/tasks-worker/`  
Primary staff UI surface: `apps/admin-web/`

## Purpose

Bynle Tasks turns unstructured communication into structured, reviewable task items.

## Core job

Extract concrete actions from notes, emails, chat summaries, or CRM activity so staff do not need to manually rewrite everything into a task list.

## Initial wedge

Start with text sources already available inside the Bynle platform or easy to paste in manually:

- consultation notes
- internal handoff notes
- email bodies copied into the system
- enquiry summaries

## MVP scope

- submit free-text content for extraction
- return structured tasks with title, owner hint, due-date hint, and confidence
- require human review before task creation is finalized
- allow accepted tasks to be pushed into a simple task list or future Flow run
- keep extraction history for auditability

## Explicitly out of scope for v1

- full inbox synchronization
- autonomous task creation without human review
- broad project management features
- long-context knowledge graphs

The value of the first release is speed and consistency, not full autonomy.

## Service shape

### `apps/tasks-api/`
- text submission endpoints
- extraction result retrieval
- review and accept/reject endpoints
- task list overview endpoints

### `apps/tasks-worker/`
- async extraction jobs
- model retries and fallbacks
- low-confidence flagging
- optional downstream handoff into Flow

### `apps/admin-web/`
- extraction submission UI
- review queue
- accepted task views

## Example workflow

1. Staff pastes client call notes.
2. API stores the source text and queues extraction.
3. Worker produces structured task candidates.
4. Staff reviews, edits, and accepts the useful tasks.
5. Accepted tasks become assigned work items or flow triggers.

## Proposed entities

- task extraction requests
- task candidates
- accepted tasks
- task events

## Build sequence

### Phase 1
- paste-in text extraction
- review queue
- accept or reject actions

### Phase 2
- source-specific prompts for notes, email, and CRM text
- ownership and due-date suggestions
- export or handoff into Flow

### Phase 3
- direct integrations with inboxes or practice systems
- recurring task detection
- richer prioritization

## Related docs

- `products/bynle_tasks/README.md`
- `apps/tasks-api/README.md`
- `apps/tasks-worker/README.md`
- `docs/company/12-month-roadmap.md`
