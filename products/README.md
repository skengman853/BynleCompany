# Bynle Product Modules

This directory defines Bynle product modules at the business/product level.

## Modules
- `bynle_assist/` customer enquiry and booking automation.
- `bynle_flow/` internal workflow automation.
- `bynle_tasks/` task extraction from communication.
- `bynle_docs/` document request and tracking workflows.

## Rule
- Keep this folder focused on module definition, scope, packaging, and rollout.
- Runtime implementation stays in `apps/` and shared code in `packages/`.
