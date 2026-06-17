FROM node:24-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN bun install

WORKDIR /app/packages/db
CMD ["bun", "x", "drizzle-kit", "migrate"]