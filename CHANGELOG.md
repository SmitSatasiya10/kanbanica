# Changelog

All notable changes to Kanbanica are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

Given a version `MAJOR.MINOR.PATCH`:

- **MAJOR** — incompatible changes: database migrations that require manual
  steps, removed/renamed environment variables, or breaking API changes.
- **MINOR** — new features and enhancements that are backward compatible.
- **PATCH** — backward-compatible bug fixes and small improvements.

Until `1.0.0`, the project is considered pre-release: `0.x` versions may include
breaking changes in a MINOR bump. From `1.0.0` onward, the rules above apply
strictly. Each release is tagged `vX.Y.Z` in git.

<!--
Maintainers: when cutting a release, move items from "Unreleased" into a new
dated section, e.g.:

## [1.0.0] - 2026-08-01
### Added
### Changed
### Fixed
-->

## [Unreleased]

### Changed
- Docker: one image now serves all three roles (`app`, `worker`, `migrate`),
  selected by `command:` — `Dockerfile.worker` is removed and
  `next.config.mjs` no longer uses `output: "standalone"`. The image ships the
  real source tree with a `--prod` `node_modules`, so `pnpm worker:start`,
  `pnpm db:migrate:prod` and the admin-recovery scripts all run inside any
  container. This also removes the hand-maintained copy of sharp's native
  libvips that the standalone file-tracer needed.
- `docker-compose.yml` now **pulls the published image** instead of building
  locally (`docker compose up -d`, no `--build`), with `IMAGE_TAG` to pin a
  version and `APP_PORT` to move the host port. Build-from-source moved to the
  new `docker-compose.build.yml`; `docker-compose.external-db.yml` still
  overlays either one. Volume names are unchanged, so existing deployments
  reattach to their data.

### Fixed
- Documented commands that could not work: `pnpm worker:start` /
  `pnpm db:migrate:prod` were listed for an image with no `pnpm` in it, and
  `curl localhost:3000` was documented while the compose file bound no host
  port.

## [0.1.0] - 2026-08-17

### Added
- Open-source release preparation: `LICENSE` (MIT), `README`, `CONTRIBUTING`,
  `SECURITY`, `CODE_OF_CONDUCT`, issue/PR templates, and CI (typecheck + build).
- Self-hosting support: application `Dockerfile`, `docker-compose.yml`,
  `/api/health` endpoint, container-safe migration runner, and `DEPLOYMENT.md`.
- Local-development guide (`SETUP.md`) and architecture overview
  (`ARCHITECTURE.md`).
- Configurable object storage via `STORAGE_DRIVER` (local / S3 / R2).
- Environment-overridable branding (support email, marketing domain).

### Changed
- Production startup now requires at least one authentication provider
  (SMTP or Google OAuth) so login cannot silently fail.

### Notes
- This is the pre-1.0 development line. The first public release will be tagged
  `v1.0.0` after the Release Candidate verification pass.
