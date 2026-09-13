# syntax=docker/dockerfile:1

# ---- deps: install all dependencies with the lockfile ----------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---- build: compile TypeScript + generate Prisma client --------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime: production-only deps + compiled output ------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Refresh Alpine packages before installing the app so the final image carries
# fixed OpenSSL and other OS packages even if the base tag has not been rebuilt.
RUN apk upgrade --no-cache \
  && addgroup -S monikey \
  && adduser -S monikey -G monikey

COPY package.json package-lock.json* ./
COPY prisma ./prisma
# Prisma is an optional peer of @prisma/client, so npm can install the Prisma
# CLI/config chain even with --omit=dev. Generate the client in the build stage,
# then remove build-only tooling and npm itself from the runtime image.
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf node_modules/prisma node_modules/@prisma/config node_modules/deepmerge-ts \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY scripts ./scripts

# Create /data directory with proper permissions for receipt storage.
# The filesystem object store adapter (src/integrations/adapters/filesystem-object-store)
# needs to create subdirectories at runtime; this directory will be mounted as a Docker
# volume in compose.yaml for persistence across container restarts.
RUN mkdir -p /data && chown -R monikey:monikey /data

USER monikey

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD ["node", "./scripts/healthcheck.mjs"]

CMD ["node", "dist/server.js"]
