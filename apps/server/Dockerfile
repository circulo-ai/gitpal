FROM node:24-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
RUN cd apps/server && SKIP_ENV_VALIDATION=1 bun run build

WORKDIR /app/apps/server
EXPOSE 3000
CMD ["bun", "dist/index.mjs"]
