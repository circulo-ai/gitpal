# AGENTS.md

## Scope

This package owns GitHub/GitLab adapters, webhook parsing, pull request models, and provider utilities.

## Rules

- Keep provider behavior accurate and deterministic.
- Preserve pagination and state mapping.
- Keep webhook parsing secure and provider-specific.
- Support GitHub, GitLab, and enterprise host variants without leaking implementation details into higher layers.

## Notes

- If you change provider capabilities, expect follow-up changes in `packages/services`, `packages/api`, `apps/web`, and the docs.

