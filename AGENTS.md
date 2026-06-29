# AGENTS.md

## Repo Intent

GitPal is a monorepo for a self-host-friendly review product with a cloud-only billing path. Treat the repo as one system, but keep app and package boundaries sharp.

## Working Rules

- Prefer small, targeted edits over broad refactors.
- Use `apply_patch` for file changes.
- Keep the current icon libraries and visual language unless the user explicitly asks to change them.
- Preserve self-hosted defaults. Billing must stay cloud-only.
- Never hardcode deployment domains, cookie domains, or provider URLs when an env var can express the choice.
- When auth or cookie behavior changes, update the env example and the docs together.
- When docs gain new user-visible workflows, add or update screenshots in `apps/fumadocs/public/screenshots`.

## Monorepo Boundaries

- `apps/web` owns the product UI.
- `apps/server` owns the Hono API, auth route, webhook route, and Inngest endpoint.
- `apps/fumadocs` owns the documentation site and its content.
- `packages/api` owns tRPC routers.
- `packages/auth` owns Better Auth configuration.
- `packages/db` owns schema, migrations, and the shared database pool.
- `packages/config` owns shared TypeScript and toolchain defaults.
- `packages/logger` owns structured logging helpers.
- `packages/redis` owns Redis client helpers and queue/cache plumbing.
- `packages/services` owns business logic, workflows, and provider orchestration.
- `packages/jobs` owns Inngest events and functions.
- `packages/repositories` owns repository data-access helpers and query wiring.
- `packages/env` owns environment validation.
- `packages/git` owns GitHub/GitLab adapters and webhook parsing.
- `packages/mcp` owns connector catalogs and MCP toolsets.
- `packages/ui` owns shared UI primitives.

## Local Dev

- Use `bun run docker:dev:up` for the supporting services.
- Use `bun run dev` for the hot-reloaded `server`, `web`, and `fumadocs` apps.
- Use `bun run dev:inngest` for the local Inngest dev server.
- Keep `docker-compose.yml` for the production stack and `docker-compose.dev.yml` for host-run development support services.

## Validation

- Run `bun run check` after edits that touch formatting or MDX content.
- Run `bun run check-types` after edits that touch app, package, or env contracts.
- If a change touches a visible UI, verify it in the browser.
