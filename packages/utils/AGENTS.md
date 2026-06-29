# AGENTS.md

## Scope
`packages/utils` contains shared pure utilities, routing helpers, and other
cross-cutting logic used across the repo.

## Guidance
- Keep helpers pure and reusable when possible.
- Prefer small focused modules over large catch-all utility files.
- Avoid coupling utilities to app-specific UI or server state.
- If a helper affects AI routing, feature gating, or provider selection, check
  the service layer for matching behavior before changing it.

## Agent Notes
- Reuse existing utilities instead of duplicating formatting, routing, or
  normalization logic.
- When adding new helpers, document expected inputs and edge cases in code.
- Keep repository policy presets as pure setting transforms so apps can apply
  them without introducing another persisted configuration layer.
