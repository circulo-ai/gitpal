FROM node:24-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
RUN cd apps/worker && bun run build

WORKDIR /app/apps/worker
CMD ["bun", "dist/index.mjs"]