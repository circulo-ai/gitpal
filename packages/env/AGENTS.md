# AGENTS.md

## Scope

This package owns environment validation for server, client, and web-server contexts.

## Rules

- Add new variables in the correct env file.
- Keep defaults safe for self-hosted deployments.
- Expose public values through `NEXT_PUBLIC_` variables.
- Avoid duplicating deployment assumptions in code when an env var can express them.

## Important Flags

- `BETTER_AUTH_COOKIE_DOMAIN` controls shared cookies across sibling subdomains.
- `GITPAL_CLOUD_BILLING_ENABLED` and `NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED` keep billing cloud-only.

