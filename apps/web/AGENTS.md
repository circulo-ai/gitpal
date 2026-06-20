# AGENTS.md

## Scope

This app owns the product UI, including workspace navigation, billing, integrations, observability, notifications, repository settings, and landing/login flows.

## Rules

- Keep App Router boundaries clean.
- Push client components as low as possible.
- Use shared UI from `@gitpal/ui` before introducing app-only primitives.
- Keep the existing icon set unless the user explicitly asks for a change.
- Billing is cloud-only. Hide or disable the billing surface when the cloud billing flag is off.
- Keep auth/session reads aligned with the shared server API and the configured cookie domain.
- Use `@gitpal/env/web` and `@gitpal/env/web-server` instead of direct `process.env` access in components.

## Good Edits

- Update `workspace-nav.ts` when adding or removing routes from the sidebar.
- Update `workspace-shell.tsx` when route-level chrome changes.
- Update `billing-page.tsx` together with wallet or checkout changes.
- Update visible pages with browser verification when the layout changes.

## Validation

- `bun run check`
- `bun run check-types` if the change touches app types or route contracts

