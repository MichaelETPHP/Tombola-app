# Tombola admin-app — SvelteKit + adapter-node, run directly with Bun.
#
# VITE_API_URL is a Vite *build-time* variable (baked into the client
# bundle) — pass it as a Docker build ARG (Coolify: "Build Variables"),
# not a runtime environment variable.
#
# Build context is the repo root (see docker-compose.yml).
FROM oven/bun:1.4.0-debian AS build

WORKDIR /app

COPY admin-app/package.json admin-app/bun.lock ./
RUN bun install --frozen-lockfile

COPY admin-app/ .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN bun run build

FROM oven/bun:1.4.0-debian AS runtime

WORKDIR /app

# adapter-node's output carries its own (usually near-empty) package.json —
# install whatever it declares rather than assuming it's fully self-bundled.
COPY --from=build /app/build ./
RUN bun install --production --no-save

# Run as a non-root user rather than trust the base image's default —
# created explicitly so this doesn't depend on oven/bun's own image
# happening to ship one.
RUN groupadd --system --gid 1001 tombola \
  && useradd --system --uid 1001 --gid tombola --home /app tombola \
  && chown -R tombola:tombola /app
USER tombola

ENV NODE_ENV=production
ENV PORT=5355
ENV HOST=0.0.0.0
# adapter-node needs ORIGIN to build correct absolute URLs behind Coolify's
# reverse proxy — set it in Coolify's runtime env vars to the public
# https://admin.yourdomain.com URL. Left unset here on purpose (no safe
# default), so misconfiguration is a startup env problem, not a silent bug.
EXPOSE 5355

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:5355/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "index.js"]
