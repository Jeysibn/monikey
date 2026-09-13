# syntax=docker/dockerfile:1
#
# Build context is ./frontend (see compose.yaml / publish.yaml) — every COPY
# below is relative to this package, not the repo root.

# ---- build: compile the existing Vite React SPA -----------------------
FROM node:24-alpine AS build
ARG VITE_FINANCE_BACKEND=false
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV VITE_FINANCE_BACKEND=${VITE_FINANCE_BACKEND}
RUN npm run build

# ---- runtime: Nginx serving the static build + /api proxy -------------
FROM nginx:1.27-alpine AS runtime
# Refresh packages from the pinned Alpine release so published security fixes
# are present even when the upstream nginx tag has not been rebuilt yet.
RUN apk upgrade --no-cache
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/resolve-nginx-dns.sh /docker-entrypoint.d/05-resolve-nginx-dns.sh
RUN chmod +x /docker-entrypoint.d/05-resolve-nginx-dns.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
