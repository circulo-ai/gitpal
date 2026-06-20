# AGENTS.md

## Scope

This package owns the tRPC routers and request-context contracts used by the web app and server.

## Rules

- Keep routers thin.
- Validate inputs with Zod.
- Keep business logic in `packages/services`.
- Use `ctx.session` and `ctx.db` instead of reaching into globals.
- Return errors that are useful to the UI.

## Notes

- When you add a new product surface in the UI, expect a matching router or procedure here.
- Billing, notifications, observability, and integrations should stay aligned with the service layer and docs.

