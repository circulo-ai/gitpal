# AGENTS.md

## Scope

This app owns the Hono server, tRPC mounting, auth route, provider webhooks, the Inngest serve endpoint, and API-level integration points.

## Rules

- Keep request handlers thin.
- Route business logic into `packages/services`.
- Keep webhook handlers idempotent and failure-aware.
- Use the shared `db` from `@gitpal/db`.
- Keep auth, CORS, and cookie behavior driven by env.
- Do not move durable work out of Inngest processors and into raw HTTP handlers.

## Auth and Webhooks

- Update Better Auth cookie domain handling in `packages/auth` when deployment topology changes.
- Keep webhook verification fail-closed when secrets exist.
- Preserve the internal Inngest sync route behavior unless deployment requirements change.

## Validation

- `bun run check-types`
- `bun run check`

