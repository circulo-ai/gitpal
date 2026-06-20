# AGENTS.md

## Scope

This package owns the database schema, migrations, and shared connection pool.

## Rules

- Keep schema changes and migrations together.
- Use the shared `db` instance instead of creating new pools.
- Keep table and relation names consistent with the rest of the repo.
- Do not put business logic here.

## Notes

- When a schema change affects auth, billing, or docs, update the env example and the docs at the same time.

