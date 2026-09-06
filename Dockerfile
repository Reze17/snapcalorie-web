# Multi-stage build using Next's `output: "standalone"` (next.config.ts) —
# the runtime image ends up with only the pruned dependencies Next actually
# needs, not the full node_modules tree.
#
# This is portable config, not a verified live deployment: it builds and
# runs correctly against the env vars documented in README.md's
# "Environment variables" table, pointed at your own Postgres and
# S3-compatible storage, but no specific cloud target has been provisioned
# or tested for this project.

FROM node:22-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Real values aren't needed at build time (every one of these is only ever
# read at request time) — but each is read by a module-level
# `requiredEnv()`-style check (src/db/client.ts, src/server/storage/s3-client.ts)
# that throws as soon as the module loads, which Next's build-time route
# data collection does for every route. Real deploys must override these
# with real values at *runtime* (see README's env var table); Next.js
# does not bake ENV values from this build stage into the final image.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV S3_BUCKET="placeholder"
ENV S3_ACCESS_KEY_ID="placeholder"
ENV S3_SECRET_ACCESS_KEY="placeholder"
ENV AUTH_SECRET="placeholder-build-time-only-override-at-runtime"
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
