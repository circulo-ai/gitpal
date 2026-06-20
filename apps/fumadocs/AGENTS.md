# AGENTS.md

## Scope

This app owns the docs site, MDX content, docs navigation, and the documentation screenshots.

## Rules

- Keep docs concise, user-friendly, and task oriented.
- Prefer direct examples, checklists, and short explanations over long prose.
- Keep the sitemap and `meta.json` files in sync when adding, removing, or renaming pages.
- Use screenshots in `apps/fumadocs/public/screenshots` when a page benefits from visual context.
- Keep cloud-only billing and self-hosting behavior documented clearly.
- Preserve the current visual system and icon choices unless the user explicitly asks to change them.

## Content Habits

- Add one page for the concept, then only add subpages if the section truly needs them.
- Link out from the home page to the most common workflows first.
- Keep examples aligned with the actual app behavior and env flags.

## Validation

- `bun run check`
- `bun run check-types`

