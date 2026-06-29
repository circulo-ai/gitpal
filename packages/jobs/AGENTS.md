# AGENTS.md

## Scope

This package owns Inngest client setup, event schemas, and durable workflow definitions.

## Rules

- Keep step IDs static.
- Keep event IDs deterministic for idempotent work.
- Validate incoming payloads close to the function boundary.
- Put processing logic in `packages/services`.
- Keep concurrency, throttling, and retry semantics explicit in the function config.
- Keep local dev Inngest wiring env-driven so host-run development does not rely
  on the Compose image version.

## Notes

- This repo uses self-hosted Inngest. Do not add cloud-only workflow requirements.
