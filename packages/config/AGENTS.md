# AGENTS.md

## Scope
`packages/config` holds shared repository configuration such as TypeScript base
settings and tooling defaults.

## Guidance
- Keep this package minimal and declarative.
- Prefer changes that improve consistency across the monorepo, not app-specific
  behavior.
- If a change is needed for editor or formatter behavior, make sure it matches
  the root config and Biome.
- Avoid adding runtime code here unless the package purpose expands.

## Agent Notes
- Before editing this package, check the root `package.json`, `turbo.json`, and
  editor settings so config changes stay aligned.
- Treat files here as the source of truth for shared workspace defaults.
