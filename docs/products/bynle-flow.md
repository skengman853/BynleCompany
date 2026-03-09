# Bynle Flow

Status: planned  
Primary runtime services: `apps/flow-api/`, `apps/flow-worker/`  
Primary staff UI surface: `apps/admin-web/`

## Purpose

Bynle Flow is the internal workflow automation product.

Its job is to turn common business events into consistent multi-step operational workflows.

## Core job

Take a trigger such as a new enquiry, booking, or document completion and move it through a defined business process with assignment, reminders, and status transitions.

## Initial wedge

Start with service businesses that already have repetitive operational handoffs, for example:

- new lead follow-up
- enquiry to onboarding workflow
- document received to internal review task
- booking confirmed to pre-appointment checklist

## MVP scope

- workflow templates with ordered steps
- triggerable workflow runs
- staff assignment
- due dates and reminder rules
- status transitions and audit events
- simple admin views inside `admin-web`

## Explicitly out of scope for v1

- a broad drag-and-drop automation builder
- dozens of third-party integrations
- arbitrary scripting
- complex branching logic for every tenant

The first release should prove that a few high-value workflow patterns create operational savings.

## Service shape

### `apps/flow-api/`
- workflow template CRUD
- workflow run creation
- assignment and status endpoints
- overview and queue endpoints

### `apps/flow-worker/`
- scheduled reminders
- escalation jobs
- trigger fan-out from platform events
- retry handling for automation steps

### `apps/admin-web/`
- workflow template screens
- run list and run detail screens
- staff task queue views

## Example workflow

New enquiry arrives:

1. Create workflow run.
2. Assign follow-up owner.
3. Create due date for response.
4. If no response in time, send reminder.
5. Mark complete when follow-up is done.

## Proposed entities

- workflow templates
- workflow template steps
- workflow runs
- workflow run steps
- workflow events

## Build sequence

### Phase 1
- template model
- run model
- manual run creation
- assignment and status tracking

### Phase 2
- event-triggered runs from Assist and Docs
- reminders and escalations
- reporting for overdue work

### Phase 3
- light branching rules
- reusable trigger library
- optional external integrations

## Related docs

- `products/bynle_flow/README.md`
- `apps/flow-api/README.md`
- `apps/flow-worker/README.md`
- `docs/company/12-month-roadmap.md`
