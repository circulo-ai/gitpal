# AGENTS.md

## Scope
`packages/redis` contains Redis client helpers and queue/cache plumbing.

## Guidance
- Keep Redis usage behind small helper functions where possible.
- Prefer explicit key namespaces and TTLs so background data stays predictable.
- Be careful with serialization formats and backwards compatibility for queue
  payloads.
- When changing connection behavior, verify both local Compose and hosted
  deployment paths.

## Agent Notes
- Treat Redis-backed features as shared infrastructure, not app-local hacks.
- If a change touches queueing, confirm it still behaves with Inngest and any
  existing retry or dedupe expectations.
