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

# Audit root tooling dependencies
npm audit

# Audit frontend dependencies
npm --prefix frontend audit

# Audit backend dependencies
npm --prefix backend audit

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

**Migration baseline**: the chain starts from a single `InitialSchema` genesis migration (#950). `npm run migration:run` works against an empty database, so the complete migration chain can be validated locally from an empty schema. For upgrade verification against existing data and migration history, use [disposable-clone migration verification](#disposable-clone-migration-verification). Migration failure is fatal — there is no `schema:sync` fallback in the entrypoint or E2E setup. Verify a schema change with `backend/scripts/verify-baseline.sh` and `backend/scripts/verify-seeds.sh`.


**Pulling main**: Always use `git pull --ff-only` on `main` (or set globally: `git config --global pull.ff only`). This prevents accidental local merge commits when synchronizing main.

## Disposable-clone migration verification

For entity or migration changes, create a disposable PostgreSQL database and restore a dump of the pre-change database into it, preserving migration history. Use a local development snapshot or an approved sanitized snapshot; keep the source database unchanged.

In a separate checkout of the candidate commit, run `npm ci` in `backend/`. For this host-run command, set the backend environment variables explicitly: `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`. These correspond respectively to `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, and `DATABASE_PASSWORD` in [the environment template](../../.env.example); Docker Compose normally performs this mapping, but host-run commands need the backend names. Use the disposable clone’s reachable host, port, database name and credentials rather than the source database values. Confirm the resolved host and database name identify the clone before running `npm run migration:run` from that same `backend/` directory. Record the candidate SHA, command, result and clone identity without credentials. Resolve failures before proceeding to e2e verification under [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-merge).

Delete the disposable database and checkout after capturing the result. CI migrations against an empty database supply different evidence from upgrading an existing schema and migration history.

## Pull requests

Main protection is tracked in [the ruleset snapshot](../../.github/rulesets/main-protection.json). To change protection, edit that export-format snapshot, apply it with an administrator token (`gh api --method PUT repos/blur88/erp2/rulesets/15609777 --input .github/rulesets/main-protection.json`), then run `node scripts/check-main-protection.cjs --drift` with a token allowed to read repository rulesets. The drift mode is read-only; it compares all editable export fields and excludes server-managed metadata. Review and commit the snapshot through a PR.

`node scripts/check-main-protection.cjs` runs without a token in the existing Root script tests CI job. It checks required contexts against exact job names in `ci.yml`, literal Git push commands in workflow `run` steps and release configuration, and the release Git plugin. Explicit tag pushes are allowed; implicit, dynamic and branch-wide destinations are rejected because their target cannot be proved safe. This is a static guard, not a shell interpreter: indirect commands, called scripts and third-party actions still need review. For offline comparisons use `--compare <ruleset-response.json>`; `--root <checkout>` supports regression fixtures.

Follow the [Quick Start](../../README.md#quick-start) to enable the local commit and push guards. They block commits on `main` and pushes targeting `main`, including pushes from another branch. Push a feature branch and open a PR. These local hooks do not affect merges performed on GitHub by `gh pr merge`.

Merge with `gh pr merge <n> --match-head-commit <reviewed head>`; the flag refuses a push that lands between review and merge. For the reviewed head and merge-readiness requirements, follow the [review convention](code-review.md).

For stacked PRs, `gh pr merge --delete-branch` on the base PR closes the stacked PR; GitHub refuses to retarget or reopen it afterward. Retarget the stacked PR to `main` first, or merge the base PR without `--delete-branch`.

## Release versions and verification

Committed backend/frontend manifest versions are baseline values. Local builds use the manifest version; Vite embeds it as the displayed frontend version. Release Docker builds check out the release tag and stamp both app manifests and lockfiles with the semantic-release version in the build workspace. The backend image ships that package version. These changes are never committed or pushed to main. Semantic-release creates tags and GitHub Releases without a version commit; Docker publishes the matching versioned images and rolling tags.
