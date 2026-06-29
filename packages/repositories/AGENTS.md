# AGENTS.md

## Scope

This package owns the database-backed repository layer, including query
composition, record lookups, and cross-package data access helpers.

## Rules

- Keep repositories thin and predictable.
- Prefer adding narrowly-scoped read helpers over broad generic query wrappers.
- Preserve transaction support by accepting the shared executor.
- Keep new lookup helpers aligned with the schema layer and service callers.

## Notes

- When a service needs a new drill-down view or audit lookup, add the smallest
  repository method that makes the service logic stay readable.
- Avoid moving business rules here; the package should stay data-access only.
