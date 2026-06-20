# AGENTS.md

## Scope

This package owns Inngest client setup, event schemas, and durable workflow definitions.

## Rules

- Keep step IDs static.
- Keep event IDs deterministic for idempotent work.
- Validate incoming payloads close to the function boundary.
- Put processing logic in `packages/services`.
- Keep concurrency, throttling, and retry semantics explicit in the function config.

## Notes

- This repo uses self-hosted Inngest. Do not add cloud-only workflow requirements.

