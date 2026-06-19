FROM node:24-slim AS builder
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN bun install --frozen-lockfile

ENV NODE_ENV=production

RUN cd apps/fumadocs && bun run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/fumadocs/.next/standalone ./
COPY --from=builder /app/apps/fumadocs/.next/static ./apps/fumadocs/.next/static

EXPOSE 4000
CMD ["node", "apps/fumadocs/server.js"]
