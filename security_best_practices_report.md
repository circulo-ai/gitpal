# GitPal Security Best Practices Report

Generated with the `security-best-practices` skill from `openai/skills`, using the JavaScript web server, Next.js, React, and general frontend guidance.

## Executive Summary

No critical vulnerabilities were found in this pass. The main risk was operational security: provider webhooks acknowledged work before durable background processing existed. This was fixed by adding BullMQ/Redis jobs and a dedicated worker app. Additional fixes added request body limits, security headers, explicit proxy header trust, safer Redis lock tokens, and Next.js response hardening.

## Fixed Findings

### S-001: Webhook Work Could Be Lost After 202 Response

Severity: Medium

Location: `packages/api/src/services/repository-webhooks.ts:1561`, `packages/jobs/src/index.ts:114`, `apps/worker/src/index.ts:12`

Evidence: Provider webhook receipts are now persisted and queued with `enqueueProviderWebhookReceiptJob`, then processed by the worker through `processProviderWebhookReceiptJob`.

Impact: Previously, in-process fire-and-forget work could disappear if the API process restarted after returning `202`.

Fix: Added `@gitpal/jobs`, `apps/worker`, BullMQ retry/backoff/retention configuration, and Docker Compose worker service.

Validation: `bun run check-types` and `bun run build`.

### S-002: Missing Request Body Limit And App Security Headers

Severity: Medium

Location: `apps/server/src/index.ts:39`, `apps/server/src/index.ts:54`, `packages/env/src/server.ts:16`

Evidence: Hono now uses `secureHeaders` and `bodyLimit` with `HTTP_MAX_REQUEST_BODY_BYTES`.

Impact: Unlimited request bodies can increase DoS risk; missing security headers weakens browser-side protections.

Fix: Added default secure headers and a 5 MiB default request body cap. HSTS is intentionally disabled in app code and should be handled only by a confirmed TLS deployment layer.

Validation: `bun run check-types` and `bun run build`.

### S-003: Spoofable Forwarded IP Headers For Public Rate Limits

Severity: Medium

Location: `packages/api/src/context.ts:60`, `packages/env/src/server.ts:21`

Evidence: Forwarded IP headers are now ignored unless `TRUST_PROXY_HEADERS=true`.

Impact: If the app is directly exposed, attackers could spoof `X-Forwarded-For` and bypass IP-scoped rate limits.

Fix: Added explicit proxy trust configuration. Deployments behind a trusted proxy can opt in after confirming the proxy strips client-supplied forwarded headers.

Validation: `bun run check-types` and `bun run build`.

### S-004: Next.js Fingerprinting And Missing Baseline Browser Headers

Severity: Low

Location: `apps/web/next.config.ts:6`, `apps/web/next.config.ts:27`

Evidence: Next.js now disables `X-Powered-By` and sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

Impact: Reduces fingerprinting and improves baseline browser protections.

Fix: Added documented `next.config` headers and `poweredByHeader: false`.

Validation: `bun run check-types` and `bun run build`.

### S-005: Redis Lock Token Used Non-Cryptographic Randomness

Severity: Low

Location: `packages/redis/src/utils.ts:45`

Evidence: Lock tokens now use `randomUUID()`.

Impact: The token is not user-facing, but stronger uniqueness avoids avoidable lock-release edge cases.

Fix: Replaced `Date.now() + Math.random()` with `randomUUID()`.

Validation: `bun run check-types` and `bun run build`.

## Residual Findings And Split-Out Tasks

### R-001: Strict CSP Should Be A Separate Next.js Migration

Severity: Low

Location: `apps/web/next.config.ts:4`

Evidence: No `Content-Security-Policy` header exists yet.

Reason to split: Next.js CSP nonces/hashes can affect scripts, styles, fonts, dev tooling, and third-party UI packages. This needs browser verification across auth, dashboard, and docs pages.

Recommended validation: Playwright smoke tests for login, dashboard, settings, and docs; check browser console CSP reports.

### R-002: Remaining In-Process Retry Sleeps Are Bounded But Still Synchronous

Severity: Low

Location: `packages/git/src/request.ts:6`, `packages/api/src/services/nowpayments.ts:114`

Evidence: GitLab provider requests and NOWPayments checkout creation still use short bounded retry backoff.

Current behavior: The webhook path no longer depends on these sleeps in the API request lifecycle. Manual repository sync and payment checkout still return immediate results to callers.

Recommended split: Add async job contracts for manual repository sync and payment/provider tasks, then update UI/API contracts to return job status rather than immediate counts.

Recommended validation: Contract tests comparing old immediate results with queued completion payloads.

### R-003: `dangerouslySetInnerHTML` Exists In Chart Styling

Severity: Low

Location: `packages/ui/src/components/chart.tsx:94`

Evidence: Chart styles are generated into a `<style>` tag.

False positive notes: Current usage is driven by internal chart palette values in `apps/web/src/components/dashboard-analytics-page.tsx:163`, not arbitrary user HTML.

Recommended split: Add a small CSS identifier/value sanitizer in the chart component during a UI package hardening pass.

### R-004: Local Storage Stores Non-Secret Auth Preferences

Severity: Low

Location: `apps/web/src/components/auth-page.tsx:222`, `apps/web/src/components/auth-page.tsx:237`, `apps/web/src/components/auth-page.tsx:241`

Evidence: Local storage is used for provider mode, enterprise host, and SSO email preference.

False positive notes: No session tokens or API secrets are stored there.

Recommended split: Treat values read from local storage as untrusted UI preferences; avoid adding tokens or secrets to these keys.

## Modernization And Refactor Plan

### Pass 1: Delete Dead Code And No-Op State

Current behavior: Several modules keep local helpers/counters that do not affect output, such as the removed webhook `ignored` counter.

Structural improvement: Remove unused branches, counters, stale helpers, and unreachable fallbacks in narrow PRs.

Validation check: `bunx biome check --write <touched files>`, `bun run check-types`.

### Pass 2: Extract Shared Primitives

Current behavior: `stableId`, development session shapes, date parsing, and record/string guards repeat across API/auth/web modules.

Structural improvement: Move stable ID, auth session DTOs, and safe parsing helpers into shared utility modules with explicit ownership.

Validation check: Typecheck plus focused characterization tests for generated IDs and session fallback behavior.

### Pass 3: Split Oversized Modules

Current behavior: `repository-webhooks.ts`, `repository-sync.ts`, `gitlab.ts`, `analytics.ts`, and large web components mix orchestration, persistence, provider mapping, and UI state.

Structural improvement: Split into route/service orchestration, provider adapters, persistence helpers, and pure mapping functions.

Validation check: Snapshot or fixture tests around webhook receipt processing, repository sync summaries, and analytics query outputs.

### Pass 4: Queue More Long-Running Work

Current behavior: Webhook review processing is now queued; manual repository sync and payment checkout still run synchronously to preserve API behavior.

Structural improvement: Add job contracts for repository sync, webhook subscription sync, and provider/payment operations that may hit rate limits.

Validation check: API parity tests proving queued completion payloads match old synchronous results before changing UI contracts.

### Pass 5: Security Hardening Migration

Current behavior: Baseline headers and body limits are in place; strict CSP is not.

Structural improvement: Add CSP with nonce/hash strategy, chart style hardening, proxy deployment documentation, and a security regression checklist.

Validation check: Browser smoke tests, CSP report-only rollout, webhook signature tests, and rate-limit tests with `TRUST_PROXY_HEADERS` on/off.

## Migration Tasks To Keep Separate

- Strict CSP/nonces for Next.js.
- Full async API/UI contract for manual repository sync and provider rate-limit recovery.
- Queue dashboard/observability UI for BullMQ jobs.
- `tsdown` config update from deprecated `noExternal` to `deps.alwaysBundle`.
- Any dependency major upgrades.

## Validation Run

- `bunx biome check --write` on touched files.
- `bun run check-types`.
- `bun run build`.

Build completed successfully. The only observed warning was an existing Fumadocs `metadataBase` warning during static generation.
