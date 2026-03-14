# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up two GitHub Actions workflows — `ci.yml` for validation on every push/PR, and `release.yml` for semantic versioning, GitHub Releases, and Docker Hub deployment on merged `main` commits.

**Architecture:** `ci.yml` runs backend (with Postgres + Redis service containers) and frontend validation jobs in parallel. `release.yml` triggers via `workflow_run` after `ci.yml` succeeds on `main`, runs semantic-release to bump versions and create a GitHub Release, then builds and pushes Docker images to `blur88/all` on Docker Hub. A root `package.json` holds semantic-release dependencies; `.releaserc.json` configures the plugin chain.

**Tech Stack:** GitHub Actions, semantic-release, cycjimmy/semantic-release-action@v4, docker/build-push-action@v5, Jest (backend), Vitest (frontend), PostgreSQL 18.3, Redis 8.6.1

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `.gitignore` | Modify | Remove `/package.json` and `/package-lock.json` exclusions |
| `package.json` (root) | Create | semantic-release devDependencies only |
| `.releaserc.json` | Create | semantic-release plugin configuration |
| `.github/workflows/ci.yml` | Create | Validation pipeline (lint, type-check, unit tests, E2E) |
| `.github/workflows/release.yml` | Create | Release pipeline (semantic-release + Docker push) |

---

## Chunk 1: Root package.json and .releaserc.json

### Task 1: Fix `.gitignore` and create root `package.json`

**Files:**
- Modify: `.gitignore`
- Create: `package.json` (repo root)

The root `.gitignore` currently excludes `/package.json` and `/package-lock.json`. Both entries must be removed before creating those files — otherwise `git add` silently ignores them and `npm ci` in CI will fail.

- [ ] **Step 1: Remove `/package.json` and `/package-lock.json` from `.gitignore`**

  Open `.gitignore` and delete the two lines:
  ```
  /package.json
  /package-lock.json
  ```

  Verify the lines are gone:
  ```bash
  grep -n "^/package" .gitignore
  ```
  Expected: no output.

- [ ] **Step 2: Create root `package.json`**

  Create `/home/blur/erp2/package.json`:

  ```json
  {
    "name": "erp2-release",
    "version": "1.0.0",
    "private": true,
    "devDependencies": {
      "semantic-release": "^24.0.0",
      "@semantic-release/changelog": "^6.0.0",
      "@semantic-release/git": "^10.0.0",
      "@semantic-release/github": "^10.0.0",
      "@semantic-release/npm": "^12.0.0",
      "@semantic-release/commit-analyzer": "^13.0.0",
      "@semantic-release/release-notes-generator": "^14.0.0"
    }
  }
  ```

  `"private": true` prevents accidental `npm publish`.

- [ ] **Step 3: Install dependencies**

  Run from repo root:
  ```bash
  npm install
  ```
  Expected: `package-lock.json` created at repo root, `node_modules/` populated with semantic-release packages.

- [ ] **Step 4: Verify semantic-release is available**

  ```bash
  npx semantic-release --version
  ```
  Expected: prints a version string like `24.x.x`.

- [ ] **Step 5: Commit**

  ```bash
  git add .gitignore package.json package-lock.json
  git commit -m "chore: add root package.json for semantic-release dependencies"
  ```

---

### Task 2: Create `.releaserc.json`

**Files:**
- Create: `.releaserc.json` (repo root)

- [ ] **Step 1: Create `.releaserc.json`**

  Create `/home/blur/erp2/.releaserc.json`:

  ```json
  {
    "branches": ["main"],
    "plugins": [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      [
        "@semantic-release/npm",
        {
          "pkgRoot": "backend",
          "npmPublish": false
        }
      ],
      [
        "@semantic-release/npm",
        {
          "pkgRoot": "frontend",
          "npmPublish": false
        }
      ],
      [
        "@semantic-release/git",
        {
          "assets": ["CHANGELOG.md", "backend/package.json", "frontend/package.json"],
          "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
        }
      ],
      "@semantic-release/github"
    ]
  }
  ```

  Key points:
  - `branches: ["main"]` — releases only from `main`
  - Two `@semantic-release/npm` entries: one per subdirectory, both with `npmPublish: false`
  - `@semantic-release/git` assets must list all three files explicitly — without this, the plugin silently commits only root `package.json` and misses the sub-packages and changelog
  - `[skip ci]` in the commit message tells GitHub Actions to skip workflow triggers on the version-bump commit, preventing an infinite loop

- [ ] **Step 2: Commit**

  ```bash
  git add .releaserc.json
  git commit -m "chore: add semantic-release configuration"
  ```

---

## Chunk 2: ci.yml

### Task 3: Create `.github/workflows/ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflows directory**

  ```bash
  mkdir -p .github/workflows
  ```

- [ ] **Step 2: Create `ci.yml`**

  Create `/home/blur/erp2/.github/workflows/ci.yml`:

  ```yaml
  name: CI

  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true

  jobs:
    test-backend:
      name: Backend — Lint, Unit Tests, E2E Tests
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: backend

      services:
        postgres:
          image: postgres:18.3-alpine3.23
          env:
            POSTGRES_USER: erp_user
            POSTGRES_PASSWORD: ci_test_password
            POSTGRES_DB: erp_db
          ports:
            - 5432:5432
          options: >-
            --health-cmd "pg_isready -U erp_user -d erp_db"
            --health-interval 10s
            --health-timeout 5s
            --health-retries 5

        redis:
          image: redis:8.6.1-alpine3.23
          ports:
            - 6379:6379
          options: >-
            --health-cmd "redis-cli -a ci_redis_password ping"
            --health-interval 10s
            --health-timeout 5s
            --health-retries 5
          command: redis-server --requirepass ci_redis_password

      env:
        DB_HOST: localhost
        DB_PORT: 5432
        DB_USERNAME: erp_user
        DB_PASSWORD: ci_test_password
        DB_DATABASE: erp_db_test
        REDIS_HOST: localhost
        REDIS_PORT: 6379
        REDIS_PASSWORD: ci_redis_password
        NODE_ENV: test
        JWT_SECRET: test-secret-key-minimum-32chars-long-for-testing-only
        JWT_REFRESH_SECRET: test-refresh-secret-minimum-32chars-long-for-testing
        JWT_EXPIRES_IN: 15m
        JWT_REFRESH_EXPIRES_IN: 7d
        JWT_AUDIENCE: erp-app
        JWT_ISSUER: erp-backend
        ALLOWED_ORIGINS: http://localhost:3000
        FRONTEND_URL: http://localhost:3000

      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: '24'
            cache: 'npm'
            cache-dependency-path: backend/package-lock.json

        - name: Install dependencies
          run: npm ci

        - name: Lint
          run: npx eslint "{src,apps,libs,test}/**/*.ts"

        - name: Unit tests
          run: npm run test -- --no-coverage

        - name: E2E tests
          run: npm run test:e2e

    test-frontend:
      name: Frontend — Lint, Type Check, Tests
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: frontend

      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: '24'
            cache: 'npm'
            cache-dependency-path: frontend/package-lock.json

        - name: Install dependencies
          run: npm ci

        - name: Lint
          run: npm run lint

        - name: Type check
          run: npm run type-check

        - name: Tests
          run: npm run test
  ```

  Key points:
  - **Lint step uses `npx eslint` directly without `--fix`** — the `npm run lint` script includes `--fix` which silently auto-corrects violations in CI instead of failing the build. Calling ESLint directly without `--fix` ensures lint errors actually fail the job.
  - **`POSTGRES_DB: erp_db`** on the service container (not `erp_db_test`) — `jest-e2e-global-setup.ts` hardcodes `database: 'erp_db'` as the maintenance DB to connect to; it then issues `CREATE DATABASE erp_db_test` itself.
  - **`command: redis-server --requirepass ci_redis_password`** sets the Redis password at container startup.
  - **Unit test step has no `--testPathPattern`** — the backend Jest config (`testRegex: ".*\\.spec\\.ts$"`) does NOT match `test/auth.e2e-spec.ts` (which ends in `.e2e-spec.ts`, not `.spec.ts`). Adding `--testPathPattern=src/` would incorrectly exclude `test/unit/*.spec.ts` files from the unit test run.
  - `REDIS_DB` and `REDIS_TTL` are not overridden here — they are present in `backend/.env.test` (committed to the repo) which the E2E global setup loads via `dotenv.config`. The CI job-level env vars take precedence for infrastructure keys; `REDIS_DB=0` and `REDIS_TTL=3600` from `.env.test` are safe fallbacks for CI.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: add CI validation workflow (lint, unit tests, E2E)"
  ```

---

## Chunk 3: release.yml

### Task 4: Create `.github/workflows/release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `release.yml`**

  Create `/home/blur/erp2/.github/workflows/release.yml`:

  ```yaml
  name: Release

  on:
    workflow_run:
      workflows: ["CI"]
      types: [completed]
      branches: [main]

  concurrency:
    group: release-${{ github.event.workflow_run.head_branch }}
    cancel-in-progress: true

  permissions:
    contents: read

  jobs:
    release:
      name: Semantic Release
      runs-on: ubuntu-latest
      if: github.event.workflow_run.conclusion == 'success'
      permissions:
        contents: write

      outputs:
        new_release_published: ${{ steps.semantic.outputs.new_release_published }}
        new_release_version: ${{ steps.semantic.outputs.new_release_version }}

      steps:
        - name: Checkout
          uses: actions/checkout@v4
          with:
            fetch-depth: 0

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: '24'
            cache: 'npm'

        - name: Install dependencies
          run: npm ci

        - name: Run semantic-release
          id: semantic
          uses: cycjimmy/semantic-release-action@v4
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    build-and-push:
      name: Build & Push Docker Images
      runs-on: ubuntu-latest
      needs: release
      if: needs.release.outputs.new_release_published == 'true'

      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Log in to Docker Hub
          uses: docker/login-action@v3
          with:
            username: ${{ secrets.DOCKERHUB_USERNAME }}
            password: ${{ secrets.DOCKERHUB_TOKEN }}

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Build and push backend image
          uses: docker/build-push-action@v5
          with:
            context: ./backend
            push: true
            tags: |
              blur88/all:erp-backend
              blur88/all:erp-backend-v${{ needs.release.outputs.new_release_version }}

        - name: Build and push frontend image
          uses: docker/build-push-action@v5
          with:
            context: ./frontend
            push: true
            tags: |
              blur88/all:erp-frontend
              blur88/all:erp-frontend-v${{ needs.release.outputs.new_release_version }}
  ```

  Key points:
  - `workflows: ["CI"]` — must match the `name:` field in `ci.yml` exactly (case-sensitive)
  - `if: github.event.workflow_run.conclusion == 'success'` on the `release` job — filters out failed CI runs; cannot be placed at the workflow level with `workflow_run` triggers
  - `permissions: contents: read` at workflow level; `contents: write` overridden on `release` job only — least-privilege approach
  - `fetch-depth: 0` — semantic-release scans all commits since the last tag to determine the version bump; shallow clones break this
  - `id: semantic` on the action step — required for `steps.semantic.outputs.*` references
  - `if: needs.release.outputs.new_release_published == 'true'` — string comparison (GitHub Actions outputs are always strings); skips gracefully when no releasable commits are present
  - Note: pushing Tasks 1–3 commits directly to `main` via `chore:` messages will each trigger `release.yml`. semantic-release will exit with "no release published" on each — this is expected and benign. You will see multiple `release.yml` runs in the Actions tab before the first real release.

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/release.yml
  git commit -m "ci: add release workflow (semantic-release + Docker Hub push)"
  ```

---

## Chunk 4: Verification

### Task 5: Verify the pipeline end-to-end

- [ ] **Step 1: Add required GitHub secrets**

  In the GitHub repo → Settings → Secrets and variables → Actions, add:
  - `DOCKERHUB_USERNAME` — your Docker Hub username (`blur88`)
  - `DOCKERHUB_TOKEN` — a Docker Hub Personal Access Token (generate at hub.docker.com → Account Settings → Security → New Access Token)

  `GITHUB_TOKEN` is built-in — no setup required.

- [ ] **Step 2: Push all commits and open a PR with a `feat:` commit**

  ```bash
  git checkout -b test/ci-pipeline-smoke
  # Make a trivial change (e.g., add a comment to README.md)
  git add README.md
  git commit -m "feat: add CI/CD pipeline"
  git push -u origin test/ci-pipeline-smoke
  gh pr create --title "feat: add CI/CD pipeline" --body "Smoke test for the new CI/CD pipeline (issue #65)"
  ```

  Expected: `ci.yml` triggers on the PR. Both `test-backend` and `test-frontend` jobs appear in PR checks.

- [ ] **Step 3: Verify backend E2E passes in CI**

  In the GitHub Actions run for `test-backend`, confirm:
  - Postgres and Redis service containers start and pass health checks
  - `npm run test:e2e` passes all suites
  - No "connection refused" or "erp_db does not exist" errors in the logs

- [ ] **Step 4: Merge the PR**

  ```bash
  gh pr merge --squash
  ```

  Expected sequence after merge:
  1. `ci.yml` triggers on the `main` push and passes
  2. `release.yml` triggers via `workflow_run` after `ci.yml` completes
  3. `release` job runs semantic-release: bumps `backend/package.json` and `frontend/package.json` from `1.0.0` to `1.1.0`, creates `CHANGELOG.md`, creates a GitHub Release tagged `v1.1.0`, commits the changes back to `main` with message `chore(release): 1.1.0 [skip ci]`
  4. The version-bump commit does NOT re-trigger `ci.yml` (because of `[skip ci]`)
  5. `build-and-push` job runs: pushes four images to Docker Hub

- [ ] **Step 5: Verify Docker Hub images exist**

  ```bash
  docker pull blur88/all:erp-backend
  docker pull blur88/all:erp-backend-v1.1.0
  docker pull blur88/all:erp-frontend
  docker pull blur88/all:erp-frontend-v1.1.0
  ```

  Expected: all four images pull successfully. Requires Docker daemon running locally.

- [ ] **Step 6: Verify GitHub Release exists**

  ```bash
  gh release list
  ```

  Expected: a release tagged `v1.1.0` with auto-generated changelog content grouped by `feat:` and `fix:` commits.

- [ ] **Step 7: Verify no-release path (follow-up PR)**

  In a subsequent PR, merge commits using only `chore:`, `docs:`, or `style:` prefixes.

  Expected: `release.yml` runs, `release` job logs "no release published", `build-and-push` job is **skipped** (not failed). No new GitHub Release or Docker images created.
