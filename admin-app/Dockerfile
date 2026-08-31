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

# adapter-node@5 bundles everything in devDependencies straight into the
# compiled output via Rollup, but deliberately leaves real `dependencies`
# external (unbundled) — and, unlike older adapter-node versions, it does
# NOT write a package.json into build/ to declare them. Without one, the
# runtime stage's install step below has no manifest to install from at
# all (an isolated COPY of build/ has nothing above it to fall back to).
# Generate a minimal one here, in the same stage that still has the real
# package.json, listing only the actual runtime deps.
RUN bun -e " \
  const pkg = require('./package.json'); \
  require('fs').writeFileSync('./build/package.json', JSON.stringify({ \
    name: 'admin-app', \
    version: '0.0.0', \
    private: true, \
    type: 'module', \
    dependencies: pkg.dependencies, \
  }, null, 2)); \
  "

FROM oven/bun:1.4.0-debian AS runtime

WORKDIR /app

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
