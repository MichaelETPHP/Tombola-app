# Tombola API — Bun/Hono. Bun runs TypeScript directly, so there's no
# separate build stage; just install production deps and run the source.
#
# Pinned to the Debian-based image (not slim/alpine) — `sharp` ships native
# bindings that are far more reliable against glibc than musl.
#
# Build context is the repo root (see docker-compose.yml) so this can sit
# in a normal monorepo layout — every path below is root-relative.
FROM oven/bun:1.4.0-debian AS runtime

WORKDIR /app

# Install deps first so this layer stays cached across source-only changes.
COPY api/package.json api/bun.lock api/bunfig.toml ./
RUN bun install --production --frozen-lockfile

COPY api/tsconfig.json ./
COPY api/src ./src

# Pre-create the uploads mount point so it's owned by the app user before
# the named volume (docker-compose.yml) mounts over it — a volume mounted
# onto a path that doesn't exist yet in the image gets created as root,
# which the non-root user below couldn't then write into.
RUN mkdir -p uploads

# Run as a non-root user rather than trust the base image's default —
# created explicitly so this doesn't depend on oven/bun's own image
# happening to ship one.
RUN groupadd --system --gid 1001 tombola \
  && useradd --system --uid 1001 --gid tombola --home /app tombola \
  && chown -R tombola:tombola /app
USER tombola

ENV NODE_ENV=production
EXPOSE 3435

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3435/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
