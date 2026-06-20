# AGENTS.md

## Scope

This package owns connector catalogs, MCP tool definitions, connector auth helpers, and request/preview redaction.

## Rules

- Keep secrets redacted in previews.
- Keep connector rate limits and knowledge-base filtering correct.
- Make provider metadata explicit rather than inferred from UI strings.
- Do not leak connector-specific logic into the app layer unless the UI needs it.

## Notes

- When a connector changes, expect matching updates in `packages/services`, `apps/web`, and the docs.

