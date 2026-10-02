# syntax=docker/dockerfile:1

# ── Kanbanica — one image, three roles ────────────────────────────────────────
# The same image runs the web app, the background worker, and the one-shot
# migration job; compose picks the role with `command:`
#
#   pnpm start            → the Next.js server
#   pnpm worker:start     → the pg-boss worker
#   pnpm db:migrate:prod  → apply migrations, then exit
#
# With NO command, scripts/docker-entrypoint.sh picks the role from
# KANBANICA_ROLE instead, defaulting to "all": migrate, then web server AND
# worker supervised in the one container. That is for platforms that deploy a
# registry image once and have no `command:` to set (Dokploy, Coolify, CapRover,
# a bare `docker run`) — without it such a deployment gets the web server alone
# and no worker, so no email is ever sent and magic-link sign-in never arrives.
#
# That is why this image ships the real source tree and a real node_modules
# instead of Next's `output: "standalone"` bundle. The worker runs TypeScript
# through tsx, scripts/migrate.ts reads db/migrations off disk at runtime, and
# the admin-recovery scripts (scripts/make-admin.ts, scripts/create-admin.ts)
# have to be callable inside a running container. A standalone build contains
# none of that, and needed a second image plus a hand-maintained copy of
# sharp's native libvips to work around its file-tracer. One image, no tracer.
#
# Runtime node_modules is a --prod install, so devDependencies stay out:
# no drizzle-kit, no typescript, no vitest, and in particular no
# embedded-postgres (which carries a Postgres server binary per platform).
# Migrations therefore run via scripts/migrate.ts (drizzle-orm's migrator),
# never `drizzle-kit migrate` — see `db:migrate:prod` in package.json.

FROM node:22-bookworm-slim AS base

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Corepack's shims resolve the pnpm version lazily and cache it under
# COREPACK_HOME, which defaults to the *calling user's* ~/.cache. Left alone,
# the first `pnpm` call in the runner would try to download pnpm as the
# unprivileged runtime user — a network dependency at container start, and an
# EACCES on a read-only home. Pinning COREPACK_HOME to a shared path and
# running `corepack install` here bakes the exact version from package.json's
# `packageManager` field into the image instead.
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install


# ── Full dependency tree (devDependencies included) — build only ──────────────
FROM base AS deps

# pnpm-workspace.yaml is required here, not optional: pnpm 11 reads its
# `allowBuilds` allowlist from that file. Without it in the build context no
# package may run a postinstall script — including sharp, which needs one to
# place its libvips binary.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


# ── Production-only dependency tree — shipped to the runner ───────────────────
FROM base AS prod-deps

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod


FROM base AS build

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Nothing deployment-specific is baked into this image — no domain, no secrets,
# no VAPID key. APP_URL is read on the server at runtime, and the client fetches
# the VAPID public key from /api/push/vapid-public-key. One published image
# therefore serves any domain, and changing your domain needs no rebuild.
#
# Placeholders so build-time env validation (lib/env.ts) passes. These are NOT
# used at runtime — real values are injected when the container starts.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV APP_SECRET="build-time-placeholder-value-000000000000"

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build


FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Stamped by CI on release builds and reported by GET /api/health, so an
# operator can tell which build a container is running. Defaults to "dev"
# for local `docker build`.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# uid/gid 1001 is deliberate and must not change: existing `uploads` volumes are
# owned by it, so a redeploy keeps write access. Only the account name changed.
RUN groupadd --system --gid 1001 kanbanica \
  && useradd --system --uid 1001 --gid kanbanica kanbanica

# --chown on the COPYs rather than a trailing `chown -R`: it avoids duplicating
# the whole tree in an extra layer, and the runtime user genuinely needs write
# access to .next (the image-optimization cache lives at .next/cache).
COPY --chown=kanbanica:kanbanica . .
COPY --from=prod-deps --chown=kanbanica:kanbanica /app/node_modules ./node_modules
COPY --from=build --chown=kanbanica:kanbanica /app/.next ./.next

# Corepack writes its "last known good" metadata back into COREPACK_HOME on use.
RUN chown -R kanbanica:kanbanica /opt/corepack

# The repo tracks shell scripts as mode 644 (no exec bit to inherit), so set it
# here rather than relying on the checkout.
RUN chmod +x /app/scripts/docker-entrypoint.sh

# Local-storage uploads live here; mount a volume to persist across redeploys.
# Created (and owned) in the image so a *fresh* named volume mounted over it
# inherits that ownership and the non-root user can write to it.
RUN mkdir -p /app/uploads && chown -R kanbanica:kanbanica /app/uploads

USER kanbanica
EXPOSE 3000

# /api/health is unauthenticated on purpose and checks DB reachability, so
# orchestrators can rely on this instead of declaring their own probe.
# node:22-bookworm-slim ships neither wget nor curl, so the probe uses Node's
# built-in fetch rather than pulling in an extra apt package.
#
# start-period covers the slowest legitimate boot: in the default "all" role the
# web server starts only AFTER migrations have been applied, and the migration
# step waits for the database with backoff.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Every explicit command (the `command:` of each docker-compose service, or
# `docker run <image> bash`) is exec'd verbatim by the entrypoint. "kanbanica" is
# a sentinel meaning "no command given — read KANBANICA_ROLE, default all". It
# must be a real value, not an empty CMD, or the base image's inherited
# `CMD ["node"]` would take its place.
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["kanbanica"]

# OCI metadata. This is what renders on the GitHub Packages page, and what
# links the package back to this repository.
LABEL org.opencontainers.image.title="Kanbanica" \
      org.opencontainers.image.description="Open-source, self-hosted project-management app (Workspaces → Projects/Spaces → Lists/Sprints → Tasks)." \
      org.opencontainers.image.url="https://github.com/stack256org/kanbanica" \
      org.opencontainers.image.source="https://github.com/stack256org/kanbanica" \
      org.opencontainers.image.documentation="https://github.com/stack256org/kanbanica#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stack256"
