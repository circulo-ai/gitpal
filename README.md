# GitPal

GitPal is your AI-powered co-pilot for frictionless development. Get instant, accurate feedback and smart code suggestions directly on your pull requests, while automated labeling keeps your repository issues perfectly organized. When a build breaks, GitPal diagnoses your CI/CD failures and delivers immediate, actionable solutions—so you can spend less time debugging and more time shipping.

The stack is Next.js, Hono, tRPC, Drizzle, PostgreSQL, Redis, Better Auth, Inngest self-hosted, Tailwind CSS, shadcn/ui, Bun, Biome, and Turborepo.

## Getting Started

Install dependencies:

```bash
bun install
```

Create app environment files from your deployment secrets, then run the database migration:

```bash
bun run db:push
```

Start the local infrastructure stack:

```bash
bun run docker:dev:up
```

Start the local development apps with hot reload:

```bash
bun run dev
```

The web app runs at [http://localhost:3001](http://localhost:3001), the API runs at [http://localhost:3000](http://localhost:3000), and the docs site runs at [http://localhost:4000](http://localhost:4000).

## Environment Variables

Core server variables:

| Variable                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string used by `@gitpal/db`.            |
| `BETTER_AUTH_SECRET`     | Better Auth secret, at least 32 characters.                   |
| `BETTER_AUTH_URL`        | Public auth/server URL.                                       |
| `BETTER_AUTH_COOKIE_DOMAIN` | Optional shared cookie domain for subdomain deployments. Leave it unset for single-origin or localhost setups. |
| `CORS_ORIGIN`            | Allowed web origin for the API.                               |
| `NEXT_PUBLIC_SERVER_URL` | Public API URL used by the web app and baked into web builds. |
| `REDIS_URL`              | GitPal Redis URL for queues and cache helpers.                |
| `LOG_LEVEL`              | `fatal`, `error`, `warn`, `info`, `debug`, or `trace`.        |
| `TRUST_PROXY_HEADERS`    | Enable when the server is behind a trusted reverse proxy.     |
| `GITPAL_CLOUD_BILLING_ENABLED` | Set to `true` only for the cloud edition when wallet top-ups should be available. |

Database pool variables:

| Variable                               | Default | Purpose                                          |
| -------------------------------------- | ------- | ------------------------------------------------ |
| `GITPAL_DB_POOL_MAX`                   | `10`    | Maximum connections in the shared Postgres pool. |
| `GITPAL_DB_POOL_IDLE_TIMEOUT_MS`       | `30000` | Idle connection timeout.                         |
| `GITPAL_DB_POOL_CONNECTION_TIMEOUT_MS` | `10000` | Connection acquisition timeout.                  |

Provider and webhook variables:

| Variable                                                 | Purpose                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`               | GitHub OAuth app credentials.                               |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`                | Optional GitHub App credentials for app-level access.       |
| `GITHUB_WEBHOOK_SECRET`                                  | GitHub webhook signature secret.                            |
| `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`               | GitLab OAuth app credentials.                               |
| `GITLAB_WEBHOOK_SECRET`, `GITLAB_WEBHOOK_SIGNING_SECRET` | GitLab webhook verification secrets.                        |
| `GITPAL_WEBHOOK_BASE_URL`                                | Optional public base URL for provider webhook registration. |

AI routing variables:

| Variable                                    | Purpose                                |
| ------------------------------------------- | -------------------------------------- |
| `AI_GATEWAY_API_KEY`                        | Vercel AI Gateway key.                 |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` | OpenRouter credentials and endpoint.   |
| `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`         | Ollama-compatible provider settings.   |
| `GITPAL_AI_MODEL`                           | Default model id used by AI workflows. |

Inngest self-hosted variables:

| Variable                                                          | Purpose                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `INNGEST_EVENT_KEY`                                               | Event key shared by the GitPal server and self-hosted Inngest.                |
| `INNGEST_SIGNING_KEY`                                             | Signing key used by the SDK route and Inngest.                                |
| `INNGEST_BASE_URL`                                                | Internal URL used by the GitPal server, `http://inngest:8288` in Compose.     |
| `INNGEST_POSTGRES_URI`, `INNGEST_REDIS_URI`                       | Storage backends for the self-hosted Inngest service.                         |
| `INNGEST_POLL_INTERVAL`                                           | SDK polling interval; defaults to `15` seconds in Compose.                    |
| `INNGEST_QUEUE_WORKERS`, `INNGEST_RETRY_INTERVAL`, `INNGEST_TICK` | Inngest runtime tuning.                                                       |
| `INNGEST_DASHBOARD_TRAEFIK_ENABLE`                                | Set to `true` only when intentionally exposing the dashboard through Traefik. |
| `INNGEST_DASHBOARD_HOST`                                          | Hostname for the optional protected dashboard route.                          |
| `INNGEST_DASHBOARD_BASIC_AUTH_USERS`                              | Traefik BasicAuth users, generated with `htpasswd`.                           |

Cloud edition variables:

| Variable                                  | Purpose                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED` | Mirrors the cloud billing flag for the web app so billing nav can hide. |

Background flow-control variables:

| Variable                                     | Default | Purpose                                       |
| -------------------------------------------- | ------- | --------------------------------------------- |
| `GITPAL_REPO_SYNC_ACCOUNT_CONCURRENCY`       | `4`     | Account-wide repo sync concurrency.           |
| `GITPAL_REPO_SYNC_USER_CONCURRENCY`          | `1`     | Per-user repo sync concurrency.               |
| `GITPAL_REPO_SYNC_THROTTLE_LIMIT`            | `20`    | Repo sync burst limit.                        |
| `GITPAL_REPO_SYNC_THROTTLE_PERIOD_SECONDS`   | `60`    | Repo sync throttle window.                    |
| `GITPAL_REPO_SYNC_RATE_LIMIT`                | `120`   | Repo sync hourly limit.                       |
| `GITPAL_REPO_SYNC_RATE_LIMIT_PERIOD_SECONDS` | `3600`  | Repo sync rate-limit window.                  |
| `GITPAL_AI_WORKFLOW_ACCOUNT_CONCURRENCY`     | `4`     | Account-wide durable AI workflow concurrency. |
| `GITPAL_AI_WORKFLOW_REPOSITORY_CONCURRENCY`  | `1`     | Per-repository AI workflow concurrency.       |
| `GITPAL_AI_WORKFLOW_THROTTLE_LIMIT`          | `30`    | AI workflow burst limit.                      |
| `GITPAL_AI_WORKFLOW_THROTTLE_PERIOD_SECONDS` | `60`    | AI workflow throttle window.                  |

## Production Deployment

Production uses `docker-compose.yml` under Dokploy. On git push, Dokploy pulls the project and runs Compose. GitPal does not use Inngest Cloud.

The Compose stack includes:

- `web` - Next.js frontend.
- `server` - Hono API, tRPC, Better Auth, provider webhooks, and the Inngest SDK route.
- `postgres` and `redis` - GitPal application data and queue/cache infrastructure.
- `inngest` - self-hosted Inngest runtime.
- `postgres-inngest` and `redis-inngest` - Inngest runtime state.
- `inngest-sync` - one-shot internal schema sync that calls `PUT http://server:3000/api/inngest` after `server` and `inngest` are healthy.

The Inngest SDK route does not need to be internet reachable in this deployment. It only needs to be reachable from the Inngest service through the Compose network. Keep `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` identical between `server` and `inngest`.

For local development, use `docker-compose.dev.yml` for the supporting services only. Run `bun run dev` for the hot-reloaded `server`, `web`, and `fumadocs` apps, then point your local env to `localhost` ports for Postgres and Redis.

Typical local overrides are:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gitpal
REDIS_URL=redis://localhost:6379
INNGEST_BASE_URL=http://localhost:8288
GITPAL_CLOUD_BILLING_ENABLED=false
NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED=false
```

Keep the same `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` values in both the host env and the Inngest container.

If sign-in starts failing after a deployment, check `BETTER_AUTH_COOKIE_DOMAIN` first. Set it only when the app and API need to share cookies across sibling subdomains. Leave it unset for host-only deployments.

The Inngest dashboard is internal by default. Do not publish its ports directly. If production dashboard access is required, enable the optional Traefik labels with `INNGEST_DASHBOARD_TRAEFIK_ENABLE=true`, set a dedicated `INNGEST_DASHBOARD_HOST`, and require `INNGEST_DASHBOARD_BASIC_AUTH_USERS`.

Wallet top-ups are cloud-only. Set `GITPAL_CLOUD_BILLING_ENABLED=true` and `NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED=true` only in the cloud edition that is allowed to expose NOWPayments checkout.

## Architecture

### Shared Database Pool

Database creation is centralized in `packages/db/src/index.ts`. The package owns a single `pg.Pool` and exports the shared Drizzle `db` instance.

Server code injects this shared instance into Hono context variables and tRPC context, so procedures access it through `ctx.db`. Service modules should import `db` from `@gitpal/db` or receive a database context from their caller. Do not create ad hoc database clients inside service modules.

### Background Jobs

Inngest functions live in `packages/jobs/src/inngest/functions`. Service implementations live in `packages/services/src`.

Key events:

- `provider.process` - resilient provider webhook processing with static step identifiers and non-retryable validation failures.
- `repo/sync.requested` - background repository sync with account/user concurrency, throttling, and rate limiting.
- `ai/review.requested` and `ai/labeler.requested` - durable AI workflows for long-running webhook review and labeler work.

Inngest step IDs must be static string literals. Payload validation that receives external data must use `NonRetriableError` for invalid payloads so bad data does not retry forever.

### Observability and Analytics

Business actions record observability events with duration metadata where available. Repository sync, AI generation, webhook reviews, and labeler runs all report elapsed time.

Pull request projection records historical metrics for:

- PR merge time: `merged_at - created_at`.
- Approval latency: `approved_at - opened_at` or review-ready timestamp when present.

These events feed dashboard and observability surfaces without coupling UI pages to provider webhook details.

### AI Providers

Provider/model routing belongs in `packages/utils/src/llm-routing.ts`. Credential resolution and account-level API key handling belongs in `packages/services/src/llm-credentials.ts`.

Keep provider definitions declarative and separate from workflow orchestration. Long-running or chained AI work should run in Inngest functions, not raw API handlers.

## Project Structure

```text
gitpal/
|-- apps/
|   |-- web/         # Next.js frontend
|   `-- server/      # Hono API, tRPC adapter, Inngest serve route
|-- packages/
|   |-- api/         # tRPC routers and API context
|   |-- auth/        # Better Auth configuration
|   |-- db/          # Drizzle schema, shared db pool, migrations
|   |-- git/         # GitHub/GitLab adapters and webhook utilities
|   |-- jobs/        # Inngest client, events, and function definitions
|   |-- services/    # Business services and workflow processors
|   |-- ui/          # Shared shadcn/ui primitives
|   `-- utils/       # Shared utilities, including LLM routing
```

## UI Customization

React web apps share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`.
- Update shared primitives in `packages/ui/src/components/*`.
- Adjust shadcn aliases in `packages/ui/components.json` and `apps/web/components.json`.

Add more shared components from the project root:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@gitpal/ui/components/button";
```

## Available Scripts

- `bun run dev` - start web, server, and docs development processes with hot reload.
- `bun run build` - build all applications.
- `bun run dev:web` - start only the web application.
- `bun run dev:server` - start only the server.
- `bun run dev:worker` - start only the worker.
- `bun run check-types` - check TypeScript types across apps and packages.
- `bun run check` - run Biome formatting and linting.
- `bun run db:push` - push schema changes to the database.
- `bun run db:generate` - generate database migrations.
- `bun run db:migrate` - run database migrations.
- `bun run db:studio` - open Drizzle Studio.
- `bun run docker:dev:up` - start the local infrastructure stack for host-run apps.
- `bun run docker:dev:down` - stop the local infrastructure stack.
- `bun run docker:dev:logs` - tail local infrastructure logs.
- `bun run docker:build` - build Compose images.
- `bun run docker:up` - build and start the Compose stack.
- `bun run docker:logs` - tail Compose logs.
- `bun run docker:down` - stop the Compose stack.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guardrails, architecture conventions, and review checks.
