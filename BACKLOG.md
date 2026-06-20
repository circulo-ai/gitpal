# GitPal Backlog

This backlog is intentionally broad. It mixes immediate fixes, near-term product work, platform hardening, and far-future ideas so we have a single place to collect the next phases of the product.

## Product Foundation

- [ ] [Near-term] Add a true workspace home that highlights the most important repos, recent reviews, and recent failures.
- [ ] [Near-term] Add saved dashboard views for different roles such as maintainer, reviewer, and admin.
- [ ] [Near-term] Let users pin favorite repositories and notification channels.
- [ ] [Near-term] Add better empty states for new workspaces, new repositories, and new notification channels.
- [ ] [Near-term] Add per-repository onboarding cards that explain the next action in plain language.
- [ ] [Later] Add a workspace activity feed that mixes reviews, billing, notifications, and integration events.
- [ ] [Later] Add a role-aware homepage that changes based on whether the user is an admin, reviewer, or contributor.
- [ ] [Later] Add a product tour that can be replayed from the docs or the app.
- [ ] [Far future] Add a cross-workspace command palette that can jump to repos, users, notifications, and docs.

## AI Review Quality

- [ ] [Near-term] Improve review context ranking so the model sees the most relevant files, issues, and PRs first.
- [ ] [Near-term] Make review prompts versioned and visible so teams can compare changes between prompt revisions.
- [ ] [Near-term] Add stronger review templates for bug fixes, refactors, dependency updates, and security changes.
- [ ] [Near-term] Add a review-confidence summary that explains why a change was considered low-risk or high-risk.
- [ ] [Near-term] Add better anchor handling for long diffs and generated review comments.
- [ ] [Near-term] Add a review diff preview that shows the exact text GitPal plans to publish.
- [ ] [Later] Add multi-model evaluation so we can compare reviewer models against each other.
- [ ] [Later] Add prompt regression tests and golden outputs for the most important repository types.
- [ ] [Later] Add a prompt playground for product teams and admins.
- [ ] [Later] Add automatic follow-up review suggestions when a fix lands after a prior finding.
- [ ] [Far future] Add AI-assisted code change proposals, not just review comments.
- [ ] [Far future] Add policy-aware review routing that changes tone and depth based on repository rules.

## PR Sync and Repository State

- [ ] [P0] Make PR reconciliation sweep the full provider state instead of only the open subset.
- [ ] [P0] Add bounded concurrency to PR backfill so large repositories reconcile faster.
- [ ] [P0] Backfill review timestamps and approval state without relying on webhook timing alone.
- [ ] [P0] Heal stale merged, closed, reopened, and force-pushed PRs in a single reconciliation pass.
- [ ] [P0] Add a clear sync health view that shows the last successful sync per repository.
- [ ] [Near-term] Add incremental sync based on provider update timestamps to avoid unnecessary full scans.
- [ ] [Near-term] Add a repository-level "sync now" action with progress and retry feedback.
- [ ] [Near-term] Add webhook-gap detection so the app can schedule a reconcile when deliveries go missing.
- [ ] [Near-term] Add per-provider rate-limit backoff and user-visible retry hints.
- [ ] [Later] Add branch rename detection and a clearer story for rebases and force pushes.
- [ ] [Later] Add merge queue awareness for repositories that use queued merges.
- [ ] [Later] Add repository sync analytics so we can see how often a repo falls behind.
- [ ] [Far future] Add an event-sourced repo state timeline that can replay state changes from history.

## Integrations

- [ ] [Near-term] Add richer onboarding for GitHub, GitLab, and enterprise hosts.
- [ ] [Near-term] Add a connector health page with last validation, last use, and last error.
- [ ] [Near-term] Add a "reconnect" flow for expired OAuth credentials.
- [ ] [Near-term] Add knowledge-base linking that helps external connectors map to the right repository.
- [ ] [Near-term] Add better webhook setup guidance with provider-specific examples.
- [ ] [Near-term] Add repository access diagnostics when reviewer mapping fails.
- [ ] [Later] Add more connectors for issue trackers, docs, chat, and incident systems.
- [ ] [Later] Add connector-level usage analytics and cache hit reporting.
- [ ] [Later] Add organization-wide integration templates that can be reused across workspaces.
- [ ] [Far future] Add an integrations marketplace where new connectors can be enabled from the app.

## Notifications

- [ ] [Near-term] Add notification digests so low-priority events can be batched.
- [ ] [Near-term] Add quiet hours and snooze controls per channel.
- [ ] [Near-term] Add per-repository and per-workspace notification rules.
- [ ] [Near-term] Add fallback channels for critical alerts.
- [ ] [Near-term] Add better notification previews before a channel is enabled.
- [ ] [Near-term] Add notification delivery analytics and retries visible in the UI.
- [ ] [Later] Add mention routing so certain alert types go to specific people.
- [ ] [Later] Add escalation policies for security or billing failures.
- [ ] [Later] Add richer templates for Slack, Teams, email, and Linear.
- [ ] [Far future] Add notification acknowledgements and incident-style alert workflows.

## Observability

- [ ] [Near-term] Add a unified trace view that links webhook receipts, jobs, reviews, notifications, and billing events.
- [ ] [Near-term] Add better filters for repository, pull request, user, source ID, and severity.
- [ ] [Near-term] Add a details panel for the exact source event that produced each observability row.
- [ ] [Near-term] Add a user-friendly error timeline for failed webhook and workflow runs.
- [ ] [Near-term] Add more charts for review latency, approval latency, and cost over time.
- [ ] [Later] Add export for observability data.
- [ ] [Later] Add retention controls for high-volume event streams.
- [ ] [Later] Add drill-downs for repeated failures by repository or provider.
- [ ] [Far future] Add anomaly detection for unusual review latency, failure spikes, or cost spikes.
- [ ] [Far future] Add observability alerts that can trigger notifications automatically.

## Billing and Monetization

- [ ] [P0] Keep wallet top-ups cloud-only and hide them completely in self-hosted deployments.
- [ ] [Near-term] Add a clearer cloud-billing badge and messaging across the app.
- [ ] [Near-term] Add balance alerts when a wallet is low or close to negative tolerance.
- [ ] [Near-term] Add invoice and settlement history that is easier to scan.
- [ ] [Near-term] Add organization-level spend caps and budget alerts.
- [ ] [Near-term] Add admin credits for support and onboarding.
- [ ] [Later] Add refund and adjustment flows.
- [ ] [Later] Add monthly usage summaries by repository and team.
- [ ] [Later] Add billable usage exports for finance teams.
- [ ] [Far future] Add plan management with seat-based or repository-based pricing.
- [ ] [Far future] Add enterprise billing approvals and pre-commit spending controls.

## Self-Hosting and Deployment

- [ ] [P0] Document the new host-run dev flow with `docker-compose.dev.yml` and `bun run dev`.
- [ ] [P0] Document the Better Auth cookie domain fix for deployments that use sibling subdomains.
- [ ] [Near-term] Add a one-command local bootstrap script that runs compose, migrations, and app startup in the right order.
- [ ] [Near-term] Add a backup and restore guide for the database and Inngest state.
- [ ] [Near-term] Add a release-upgrade guide for self-hosted installs.
- [ ] [Near-term] Add a reverse proxy guide with path prefixes, cookie domains, and webhook URLs.
- [ ] [Near-term] Add a production readiness checklist for self-hosted operators.
- [ ] [Later] Add an environment-variable wizard or generator.
- [ ] [Later] Add seed/demo data for self-hosted evaluation installs.
- [ ] [Later] Add zero-downtime upgrade notes.
- [ ] [Far future] Add a fully interactive self-hosted setup assistant.

## Documentation and Onboarding

- [ ] [P0] Keep the docs home page concise and route users toward the right section quickly.
- [ ] [P0] Maintain the new tutorials, notifications, observability, and self-hosting pages.
- [ ] [Near-term] Add more screenshots and diagrams for the most important workflows.
- [ ] [Near-term] Add a changelog for user-visible product changes.
- [ ] [Near-term] Add a compact API reference for the most important endpoints.
- [ ] [Near-term] Add troubleshooting pages for auth, webhooks, billing, and sync issues.
- [ ] [Near-term] Add a repository settings guide with plain-language explanations of each toggle.
- [ ] [Later] Add versioned docs for breaking changes.
- [ ] [Later] Add release notes linked directly from the docs home page.
- [ ] [Far future] Add an in-app searchable docs experience that can answer common setup questions.

## Developer Experience

- [ ] [Near-term] Keep root `bun run check` and `bun run check-types` meaningful for every active app.
- [ ] [Near-term] Add or maintain `check-types` scripts in apps and packages that do not have them yet.
- [ ] [Near-term] Add browser smoke checks for visible UI changes.
- [ ] [Near-term] Add fixtures for common provider, notification, billing, and observability scenarios.
- [ ] [Near-term] Add a repo reset script for local development.
- [ ] [Near-term] Add better package-level AGENTS guidance as packages change.
- [ ] [Later] Add snapshot tests for critical docs and UI surfaces.
- [ ] [Later] Add a local demo dataset that covers GitHub, GitLab, notifications, and billing.
- [ ] [Later] Add CI jobs that validate the docs site and the web app separately.
- [ ] [Far future] Add a developer dashboard for feature flags, job queues, and integration health.

## Security and Governance

- [ ] [Near-term] Add clearer auth session diagnostics for deployment failures.
- [ ] [Near-term] Add sign-in troubleshooting docs that explain cookie domains and proxy settings.
- [ ] [Near-term] Add stronger audit log views for admin actions.
- [ ] [Near-term] Add role-based visibility controls for sensitive settings.
- [ ] [Near-term] Add webhook secret rotation helpers.
- [ ] [Near-term] Add session revocation and active session visibility.
- [ ] [Later] Add passkey or SSO support for the app itself.
- [ ] [Later] Add IP allowlists for admin or billing surfaces.
- [ ] [Later] Add policy enforcement for repositories and workspaces.
- [ ] [Far future] Add enterprise governance features such as approval workflows and delegated admins.

## Product Expansion

- [ ] [Later] Add support for richer PR suggestions beyond comments, such as patch hints or code snippets.
- [ ] [Later] Add repo-level policy presets for teams that want opinionated defaults.
- [ ] [Later] Add a merge readiness score that combines review, tests, and risk indicators.
- [ ] [Later] Add release note generation from merged PRs.
- [ ] [Later] Add changelog automation tied to labels and branches.
- [ ] [Later] Add cross-repository dependency tracking.
- [ ] [Far future] Add a lightweight CLI for maintenance tasks and repo sync actions.
- [ ] [Far future] Add a public API and webhook subscription model for external automation.
- [ ] [Far future] Add a plugin or extension ecosystem for custom workflows.

## Far-Future Bets

- [ ] [Far future] Add agentic code maintenance workflows beyond pull request review.
- [ ] [Far future] Add automated issue triage and root-cause clustering.
- [ ] [Far future] Add change-risk prediction and smarter review routing.
- [ ] [Far future] Add release engineering helpers for versioning and tagging.
- [ ] [Far future] Add a team knowledge graph built from repos, issues, PRs, and docs.
- [ ] [Far future] Add multilingual docs and localized product surfaces.
- [ ] [Far future] Add mobile-friendly incident alerts and review summaries.
- [ ] [Far future] Add organization-wide AI policy controls for privacy, model choice, and retention.

