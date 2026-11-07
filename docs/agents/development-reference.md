# Development reference

## Project Overview

ERP system — NestJS 11 backend + React 19 / TypeScript 6 / Material-UI v9 frontend, served via NGINX in Docker.

- **Databases**: PostgreSQL 18.3 (TypeORM, primary), Redis 8.6 (caching, queues, WebSocket state)
- **Queue**: BullMQ via `@nestjs/bullmq` (background jobs)
- **Testing**: Jest (backend) + Vitest (frontend)
- **Default admin**: `admin / Admin@123!` — change on first login

For backend Jest configuration and ESM failures, read [backend testing](../backend/testing.md).

## Key Commands

```bash
# Start everything (recommended)
docker compose up -d

# Backend dev server (hot reload, no Docker)
cd backend && npm run start:dev

# Frontend dev server (no Docker)
cd frontend && npm run dev

# Run all backend tests
cd backend && npm run test

# Run a single backend test file (path relative to backend/)
# NODE_OPTIONS is required — bare `npx jest` runs without vm-based ESM and
# every .ts file falls back to CommonJS (see docs/backend/testing.md).
cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest src/path/to/file.spec.ts --no-coverage

# Run backend e2e tests (required after entity/migration changes)
cd backend && npm run test:e2e

# Run all frontend tests (slow — ~12 minutes for ~167 files; do NOT assume hung)
cd frontend && npm run test

# Run a single frontend test file (path relative to frontend/)
cd frontend && npx vitest run src/path/to/file.test.tsx

# TypeScript check (frontend, no build)
cd frontend && npm run type-check

# Generate a DB migration (after changing entities)
cd backend && npm run migration:generate --name=DescriptiveName

# Run migrations
cd backend && npm run migration:run

# Revert last migration
cd backend && npm run migration:revert

# Lint & format
cd backend && npm run lint && npm run format

cd frontend && npm run lint

# Maintenance menu (outdated deps, audit, knip, jscpd, docker rebuild)
./maintain.sh

# Deploy
./deploy.sh          # start
./deploy.sh restart  # restart
./deploy.sh logs     # view logs
./deploy.sh status   # check status
```

## Architecture

**Module inventory**: run `ls backend/src/modules` for the current modules; see `backend/src/app.module.ts` for their registration.

`ErrorManagementModule` (`backend/src/common/error-management`) provides cross-cutting exception filters and is registered in `app.module.ts` ahead of the business modules.

Reports are not a module: Sales/Purchasing/Inventory "reports" are routes and methods **inside** the respective `*-analytics` controllers/services, which also serve the dashboards.

**Non-obvious decisions:**
- `TypeScript strict: false` — use `as any` when TypeORM types resist
- DB uses `family: 4` (IPv4 force). Database SSL is **opt-in via `DB_SSL` in every environment, including production** (#1158) — `NODE_ENV` is deliberately not consulted, because the in-compose Postgres is on a private Docker network and serves no TLS. `createSSLConfig` returns `false` unless `DB_SSL=true`, and `{ rejectUnauthorized: true }` (plus CA/cert/key when all three are set) when it is. `ssl.config.spec.ts` asserts the result is identical across environments; a production-only branch is what made the flag inert before.
- Frontend environment variables injected at runtime via `window.__ENV__` (not build-time) so one Docker image works across environments
- Backend source changes require `docker compose build backend && docker compose up -d backend` — there is no volume mount for live reload in Docker
- Frontend API calls use RTK Query (`frontend/src/store/api/`); `ApiService` (Axios) is the underlying transport layer


**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.


**Dead-code sweeps**: `maintain.sh do_knip()` wraps `npx knip` in `|| true`, so it always exits 0 and cannot be used as a gate — run `npx knip` directly per directory when you need pass/fail. Knip also reports false positives for backend service methods called by a *sibling service* rather than an HTTP route; grep the method name across `backend/src` before deleting anything.

**Migration baseline**: the chain starts from a single `InitialSchema` genesis migration (#950). `npm run migration:run` works against an empty database, so a new migration can be validated end-to-end locally. Migration failure is fatal — there is no `schema:sync` fallback in the entrypoint or E2E setup. Verify a schema change with `backend/scripts/verify-baseline.sh` and `backend/scripts/verify-seeds.sh`.


**Pulling main**: Always use `git pull --ff-only` on `main` (or set globally: `git config --global pull.ff only`). A regular `git pull` with `merge.ff = false` creates a merge commit that re-triggers the Release workflow unnecessarily.

## Pull requests

Follow the [Quick Start](../../README.md#quick-start) to enable the local commit and push guards. They block commits on `main` and pushes targeting `main`, including pushes from another branch. Push a feature branch and open a PR. These local hooks do not affect merges performed on GitHub by `gh pr merge`.

For stacked PRs, `gh pr merge --delete-branch` on the base PR closes the stacked PR; GitHub refuses to retarget or reopen it afterward. Retarget the stacked PR to `main` first, or merge the base PR without `--delete-branch`.

## Release versions and verification

Committed backend/frontend manifest versions are baseline values. Local builds use the manifest version; Vite embeds it as the displayed frontend version. Release Docker builds check out the release tag and stamp both app manifests and lockfiles with the semantic-release version in the build workspace. The backend image ships that package version. These changes are never committed or pushed to main. Semantic-release creates tags and GitHub Releases without a version commit; Docker publishes the matching versioned images and rolling tags.

For #1704, keep the issue open after the release-workflow PR merges. A patch release is expected if semantic-release includes its `fix(release)` commit; verify the live outcome rather than assuming it. Verify the release tag, GitHub Release, Docker publication, and displayed frontend version. If release authentication fails, fix it before closing. Then open a short documentation PR recording the evidence with `Closes #1704`.
