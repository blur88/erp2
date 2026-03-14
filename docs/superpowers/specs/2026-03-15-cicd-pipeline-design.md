# CI/CD Pipeline Design

**Date:** 2026-03-15
**Issue:** #65
**Status:** Approved

---

## Overview

Establish an automated CI/CD pipeline using GitHub Actions for the ERP system. The pipeline validates every push and PR, then on successful merges to `main` runs semantic versioning, creates GitHub Releases, updates `CHANGELOG.md`, and pushes Docker images to Docker Hub.

---

## Workflow Files

Two separate workflow files under `.github/workflows/`:

### `ci.yml` — Validation

**Triggers:**
- `push` to `main`
- `pull_request` targeting `main`

**Concurrency:** Cancel in-progress runs on the same `${{ github.ref }}`.

**Jobs (parallel):**

#### `test-backend`
- Runner: `ubuntu-latest`
- Working directory: `./backend`
- Steps:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node 24, npm cache)
  3. `npm ci`
  4. `npm run lint`
  5. `npm run test` (Jest unit tests)
  6. `npm run test:e2e` (Jest + Supertest — requires service containers)
- Service containers:
  - `postgres:18.3-alpine3.23` — exposed on port 5432
  - `redis:8.6.1-alpine3.23` — exposed on port 6379
- Job-level `env:` overrides (CI-safe throwaway values, supplementing `.env.test`):
  - `DB_HOST: localhost`
  - `DB_PORT: 5432`
  - `DB_USERNAME: erp_user`
  - `DB_PASSWORD: ci_test_password`
  - `DB_DATABASE: erp_db_test`
  - `REDIS_HOST: localhost`
  - `REDIS_PORT: 6379`
  - `REDIS_PASSWORD: ci_redis_password`
  - `NODE_ENV: test`
  - `JWT_SECRET: test-secret-key-minimum-32chars-long-for-testing-only`
  - `JWT_REFRESH_SECRET: test-refresh-secret-minimum-32chars-long-for-testing`

#### `test-frontend`
- Runner: `ubuntu-latest`
- Working directory: `./frontend`
- Steps:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node 24, npm cache)
  3. `npm ci`
  4. `npm run lint` (ESLint, `--max-warnings 0`)
  5. `npm run type-check` (tsc --noEmit)
  6. `npm run test` (Vitest)
- No service containers required.

---

### `release.yml` — Release & Deploy

**Trigger:** `workflow_run` on `ci.yml` completing with `conclusion == 'success'` on branch `main`.

**Concurrency:** Cancel in-progress runs on the same `${{ github.ref }}`.

**Jobs:**

#### `release`
- Runner: `ubuntu-latest`
- Steps:
  1. `actions/checkout@v4` with `fetch-depth: 0` (full git history required by semantic-release)
  2. `actions/setup-node@v4` (Node 24, npm cache)
  3. `npm ci` (at repo root — installs semantic-release and plugins)
  4. Run `npx semantic-release`
- Outputs: `new_release_published` (true/false), `new_release_version` (e.g., `1.2.3`)
- Auth: `GITHUB_TOKEN` (built-in secret)

#### `build-and-push`
- Runner: `ubuntu-latest`
- Condition: `needs.release.outputs.new_release_published == 'true'`
- Depends on: `release`
- Steps:
  1. `actions/checkout@v4`
  2. `docker/login-action@v3` with `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets
  3. `docker/setup-buildx-action@v3`
  4. `docker/build-push-action@v6` — backend image:
     - Tags: `blur88/all:erp-backend`, `blur88/all:erp-backend-v${{ needs.release.outputs.new_release_version }}`
     - Context: `./backend`
  5. `docker/build-push-action@v6` — frontend image:
     - Tags: `blur88/all:erp-frontend`, `blur88/all:erp-frontend-v${{ needs.release.outputs.new_release_version }}`
     - Context: `./frontend`

---

## semantic-release Configuration

File: `.releaserc.json` at repo root.

**Branch:** `main` only.

**Plugins (in order):**
1. `@semantic-release/commit-analyzer` — determines bump type from Conventional Commits
   - `feat:` → minor, `fix:` → patch, `feat!:` / `BREAKING CHANGE:` → major
   - `chore:`, `docs:`, `style:`, `refactor:` → no release
2. `@semantic-release/release-notes-generator` — generates release notes for GitHub Release
3. `@semantic-release/changelog` — writes/updates `CHANGELOG.md` at repo root
4. `@semantic-release/npm` — bumps `version` in `backend/package.json` and `frontend/package.json` (`npmPublish: false`)
5. `@semantic-release/git` — commits `CHANGELOG.md`, `backend/package.json`, `frontend/package.json` back to `main`
6. `@semantic-release/github` — creates GitHub Release with generated notes

**Root `package.json`:** Minimal file at repo root containing only `devDependencies` for semantic-release and its plugins. Not a publishable package.

---

## Required Secrets

| Secret | Used by | Purpose |
|--------|---------|---------|
| `GITHUB_TOKEN` | `release.yml` | Built-in — semantic-release commits + GitHub Release |
| `DOCKERHUB_USERNAME` | `release.yml` | Docker Hub authentication |
| `DOCKERHUB_TOKEN` | `release.yml` | Docker Hub authentication (Personal Access Token) |

---

## Edge Cases

- **No releasable commits:** semantic-release exits cleanly with no release. `build-and-push` skips via output condition. No failed run.
- **E2E failure:** `ci.yml` fails → `release.yml` never triggers → nothing ships.
- **Docker build failure:** GitHub Release already created; images not pushed. Re-run the failed job to recover. No automatic rollback.
- **Rapid merges:** Concurrency cancellation means semantic-release picks up all commits on the next run — it is idempotent.
- **`.env.test`:** Present in the repo (test-only credentials). CI workflow supplements with job-level `env:` overrides for infrastructure hostnames and passwords.

---

## Files to Create

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Validation pipeline |
| `.github/workflows/release.yml` | Release + Docker push pipeline |
| `.releaserc.json` | semantic-release configuration |
| `package.json` (root) | semantic-release dependencies |
| `CHANGELOG.md` (root) | Initial empty changelog (managed by semantic-release thereafter) |
