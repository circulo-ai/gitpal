# AGENTS.md

## Scope

This package owns Better Auth configuration, plugins, enterprise Git host sign-in, and session/cookie behavior.

## Rules

- Keep cookie behavior env-driven.
- Do not hardcode deployment domains.
- Keep `trustedOrigins` and cookie settings aligned with the actual app topology.
- Keep the auth plugin composition small and explicit.
- Session-affecting changes need README and env-example updates.

## Important Defaults

- Host-only cookies are the safe default.
- Set `BETTER_AUTH_COOKIE_DOMAIN` only when web and API need shared cookies across sibling subdomains.
- Use the existing auth and enterprise Git host helpers instead of inventing new sign-in paths.

