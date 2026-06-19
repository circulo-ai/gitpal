# Contributing

This guide captures the production guardrails for GitPal. Keep changes small, typed, and aligned with the package boundaries below.

## Local Workflow

Install dependencies once:

```bash
bun install
```

Useful checks:

```bash
bun run check-types
bun run check
```

Database workflow:

```bash
bun run db:generate
bun run db:migrate
```

Use `bun run db:push` only for local development when a generated migration is not required.

## Package Boundaries

- `apps/web` owns the Next.js UI and page-level composition.
- `apps/server` owns Hono setup, middleware, tRPC mounting, and the Inngest serve route.
- `packages/api` owns tRPC routers and request context.
- `packages/services` owns business logic, provider orchestration, analytics, and workflow processors.
- `packages/jobs` owns Inngest event names, schemas, client setup, and function definitions.
- `packages/db` owns Drizzle schema, migrations, and the shared database pool.
- `packages/git` owns GitHub/GitLab provider adapters and webhook utilities.
- `packages/utils` owns shared pure utilities, including LLM routing definitions.
- `packages/ui` owns shared shadcn/ui primitives.

Do not cross these boundaries to avoid a small local shortcut. Put code where future maintainers will look first.

## Database Rules

Use the shared `db` exported by `@gitpal/db`, or use the database instance provided by `ctx.db`.

Do not call `createDb()` in services, routers, job processors, or request handlers. The shared pool is created once in `packages/db/src/index.ts` and configured with:

- `GITPAL_DB_POOL_MAX`
- `GITPAL_DB_POOL_IDLE_TIMEOUT_MS`
- `GITPAL_DB_POOL_CONNECTION_TIMEOUT_MS`

API procedures should access database state through `ctx.db`. Hono middleware in `apps/server/src/index.ts` places the shared database instance on context variables before tRPC context is created.

## Inngest Rules

GitPal uses self-hosted Inngest in production. Do not add Inngest Cloud deployment requirements.

Function definitions belong in `packages/jobs/src/inngest/functions`. Function handlers should call processors from `packages/services`.

Required conventions:

- Event names are stable strings such as `repo/sync.requested`.
- Event schemas are declared beside the function.
- Step IDs are static string literals. Never use UUIDs, timestamps, provider ids, or dynamic variables in `step.run` identifiers.
- External payload validation failures must throw `NonRetriableError`.
- Use deterministic event IDs for idempotent enqueue operations.
- Configure concurrency, throttling, and rate limiting directly in the function config when a workflow touches provider APIs, AI providers, or high-volume database writes.

The Compose stack includes an `inngest-sync` one-shot service that calls the internal SDK route after deploy. Keep that path internal to the Docker network unless there is a deliberate production networking change.

## Durable AI Workflows

Long-running AI work must run through Inngest, not raw HTTP handlers. This includes:

- PR reviews.
- Pre-merge reviews.
- Labeler runs.
- File processing.
- Multi-agent or chained prompt flows.
- Provider webhook follow-up work that can exceed request lifetime.

Handlers may validate, persist, and enqueue durable work. The actual provider calls, LLM calls, retries, and observability writes belong in Inngest processors.

Keep provider routing in `packages/utils/src/llm-routing.ts` and credential resolution in `packages/services/src/llm-credentials.ts`.

## Observability and Analytics

When adding background work, record enough metadata to debug production behavior:

- Start and end timestamps or `durationMs`.
- Provider and repository identifiers when available.
- Stable idempotency keys for historical records.
- Clear success, failure, ignored, or queued status.

PR analytics should be persisted through projection/observability services, not computed only in UI components.

## UI Rules

Use shared shadcn/ui primitives from `@gitpal/ui`. Prefer layout primitives such as CSS Grid, `flex`, and responsive Tailwind utilities over fixed-width panels.

For dense dashboard pages:

- Keep controls reachable on mobile, tablet, and desktop.
- Use `ToggleGroup` for mutually exclusive filters.
- Use badges and semantic variants instead of raw ad hoc status colors.
- Avoid nested cards and avoid explanatory text that describes how to use obvious controls.

Run a browser smoke check when changing visible layout.

## Review Checklist

Before opening a PR or shipping through Dokploy:

- `bun run check-types` passes.
- `bun run check` passes or all intentional warnings are documented.
- New Inngest functions have static step IDs and non-retryable validation handling.
- New database work uses the shared pool.
- New long-running AI or provider workflows are durable.
- New dashboard metrics persist historical records instead of only calculating client-side.
- Production env var changes are documented in `README.md`.
