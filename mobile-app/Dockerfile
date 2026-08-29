# Tombola mobile-app (PWA) — SvelteKit + adapter-static, served by nginx.
#
# VITE_API_URL is a Vite *build-time* variable (client.ts reads
# import.meta.env.VITE_API_URL) — it gets baked into the compiled JS, so it
# must be passed as a Docker build ARG, not a runtime environment variable.
# In Coolify: set it under this service's "Build Variables", not
# "Environment Variables", pointing at the API's public domain.
#
# Build context is the repo root (see docker-compose.yml) — this stage also
# reaches into ../deploy for the nginx config, which a mobile-app-only
# context couldn't do.
FROM oven/bun:1.4.0-debian AS build

WORKDIR /app

COPY mobile-app/package.json mobile-app/bun.lock ./
RUN bun install --frozen-lockfile

COPY mobile-app/ .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN bun run build

FROM nginx:1.31.4-alpine AS runtime

COPY --from=build /app/build /usr/share/nginx/html
COPY deploy/mobile-app.docker.nginx.conf /etc/nginx/conf.d/default.conf

# nginx:alpine's master process runs as root by design (needed to bind
# port 80 and manage worker processes) — the actual request-handling
# workers already drop to the unprivileged `nginx` user on their own,
# which is the image's standard, widely-accepted security model. Not
# overridden here.

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1
