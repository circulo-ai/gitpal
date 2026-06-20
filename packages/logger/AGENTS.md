# AGENTS.md

## Scope
`packages/logger` provides structured logging helpers used by services, jobs,
and app entrypoints.

## Guidance
- Keep logging structured, concise, and safe for production telemetry.
- Prefer stable log fields over interpolated strings when adding new logs.
- Avoid logging secrets, bearer tokens, webhook payload bodies, or other
  sensitive values.
- Preserve compatibility with existing call sites unless a broader logging
  migration is explicitly requested.

## Agent Notes
- When debugging, search for the logger name used by the failing area before
  adding new logging.
- Favor additive log context and avoid noisy repetitive logs.
