# Security Best-Practices Report

Date: 2026-06-20

Scope: `apps/server`, `apps/web`, `packages/auth`, `packages/api`, `packages/db`, `packages/git`, `packages/logger`, and `packages/services`.

## Summary

The audit found and remediated the high-impact authorization, webhook verification, credential-forwarding, CSRF, secret-retention, payment-integrity, and dependency issues listed below. `bun audit` now reports no known dependency vulnerabilities. No unresolved critical or high-severity application finding remains in the reviewed scope.

## Remediated Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Production webhook requests could be accepted without a configured signing secret. | Production now fails closed with `503 webhook_secret_not_configured`; configured but invalid signatures return `401` (`packages/services/src/repository-webhooks.ts:3182`). |
| High | Connector and chat credentials could be forwarded to an attacker-controlled HTTPS host. | Credential-bearing URLs are normalized and restricted to the catalog host or an explicit trusted suffix (`packages/services/src/trusted-service-url.ts:3`, `packages/services/src/integrations.ts:476`, `packages/services/src/notification-chat.ts:59`). |
| High | Authenticated tRPC mutations lacked an explicit same-origin check while production cookies used `SameSite=None`. | POST requests require the exact configured web origin and auth cookies use `SameSite=Lax` (`apps/server/src/index.ts:131`, `packages/auth/src/index.ts:100`). |
| High | A signed payment callback could identify one top-up while supplying mismatched provider order, invoice, or payment IDs. | Every supplied identifier must match the stored top-up before status or balance changes are applied (`packages/services/src/wallet.ts`). |
| High | Dependency tree contained vulnerable `undici` request-routing/TLS versions. | Root overrides pin patched `undici`, `uuid`, `postcss`, and `esbuild` releases; the regenerated lockfile passes `bun audit` (`package.json`). |
| Medium | Resource IDs were trusted without consistently binding them to the current user or organization. | API-key updates, repository settings writes, and manual reconciliation now verify ownership/access before mutation (`packages/services/src/app-api-keys.ts:188`, `packages/services/src/workspace-settings.ts:178`, `packages/services/src/pr-reconcile.ts:294`). |
| Medium | OAuth connection state was read and deleted in separate operations, allowing replay races. | State is consumed atomically with `DELETE ... RETURNING` before token exchange (`packages/services/src/integrations.ts`). |
| Medium | Provider errors and metadata could persist secrets in notifications, observability rows, generation rows, or logs. | Shared diagnostic sanitization and logger redaction now remove credential keys and common token formats (`packages/services/src/observability.ts:72`, `packages/services/src/notifications.ts:1011`, `packages/logger/src/index.ts:129`). |

## Defense-in-Depth Improvements

- GitHub duplicate-hook 422 responses are treated as an idempotent race and recovered with bounded re-list retries (`packages/services/src/webhook-reconciliation.ts:43`).
- Wallet-backed AI calls stop before provider execution when depleted; completed calls always settle and low balances create a deduplicated alert (`packages/services/src/ai-billing.ts:760`).
- GitLab list operations paginate to completion with a hard page limit (`packages/git/src/request.ts:100`).
- Repository reconciliation is access-checked, bounded, records health, and prevents an older provider snapshot from overwriting newer webhook state (`packages/services/src/pr-reconcile.ts`, `packages/services/src/pr-projection.ts:196`).

## Residual Risks

| Severity | Risk | Recommendation |
| --- | --- | --- |
| Medium | User-configured custom LLM base URLs reject literal private hosts but do not pin DNS resolution, leaving a possible DNS-rebinding path in deployments with sensitive internal network access. | Route custom-provider traffic through an egress proxy that resolves and pins public IPs, or disable custom base URLs in hardened deployments. |
| Medium | The web app sends frame, MIME, referrer, and permissions headers but does not yet enforce a Content Security Policy. | Add a nonce-based CSP compatible with Next.js scripts, then verify OAuth callbacks, docs, and analytics integrations before enforcing it. |
| Low | Active-session visibility and user-driven revocation remain backlog work. | Expose Better Auth session listing/revocation in Account settings and record revocation audit events. |

## Verification

- `bun audit`: no vulnerabilities found.
- `bun run check-types`: 15/15 active tasks passed.
- `bun run test`: 16/16 tests passed.
- `bun run build`: server, web, and documentation production builds passed.
- Clean-database migration smoke test: migrations `0000` through `0010` applied successfully.
