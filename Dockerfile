# syntax=docker/dockerfile:1

# ---- base ----------------------------------------------------------------
# Debian-slim (not Alpine/musl) for Prisma engine binary compatibility.
# openssl is required by the Prisma query engine at runtime.
FROM node:20-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- builder -------------------------------------------------------------
# Installs all deps (incl. dev), generates the Prisma client, compiles TS.
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ---- runtime -------------------------------------------------------------
# Keeps dev deps so the single image can also run the tsx-based one-off
# scripts (crawl/seed/deploy-commands) and the Prisma CLI (migrate deploy).
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# tsx-run scripts (seed/crawl/deploy-commands) import from ../src/*.js,
# so the TS sources must be present for tsx to resolve them.
COPY --from=builder /app/src ./src
COPY package.json package-lock.json tsconfig.json ./
# SQLite DB lives here; a named volume is mounted on /app/data so the
# DB persists without hiding prisma/schema.prisma or prisma/migrations.
RUN mkdir -p /app/data
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
