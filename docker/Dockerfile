# ── Build Stage ─────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/db/package.json packages/db/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build packages
RUN pnpm --filter @rockfoundry/core build
RUN pnpm --filter @rockfoundry/ai build

# Build web app
RUN pnpm --filter web build

# ── Production Stage ────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy packages
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/ai/dist ./packages/ai/dist
COPY --from=builder /app/packages/ai/package.json ./packages/ai/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

# Create data directory for local storage
RUN mkdir -p /app/data/exports && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "apps/web/server.js"]
