# AGENTS.md

## Scope

This package owns business logic, workflow processors, notifications, observability, wallet behavior, integration orchestration, and PR reconciliation.

## Rules

- Keep HTTP and tRPC handlers thin; business logic lives here.
- Make provider operations idempotent and bounded.
- Record observability for durable actions.
- Keep cloud-only billing gated here and in the UI.
- Keep PR sync complete enough to heal missed webhook state, but do it efficiently.

## Notes

- If a change affects notifications, observability, wallet summaries, or provider routing, update the docs and UI text together.

