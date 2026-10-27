# Agent Brief

ERP monorepo: NestJS 11 backend and React 19 / TypeScript 6 / Material-UI v9 frontend, served through NGINX in Docker.

- **Data**: PostgreSQL 18.3 via TypeORM. Redis 8.6 is the BullMQ queue store only.
- **Tests**: Jest (backend, ESM mode) and Vitest (frontend).
- **Default admin**: `admin / Admin@123!` — change on first login.
- **Vocabulary**: domain terms are defined in [`GLOSSARY.md`](GLOSSARY.md). Use them as defined there.
- **Environments**: no production deployment exists yet; the local Compose stack is the only running environment. `docker-compose.prod.yml`, `NODE_ENV=production` and the built Docker image are real and testable today, but requirements marked **"Required when a production host is created"** have never been exercised on a production host. Never present development results as production evidence.

## Layout and architecture

- `backend/` — NestJS API, TypeORM entities and migrations, Jest unit (`*.spec.ts`) and e2e (`backend/test`) tests.
- `frontend/` — React + Vite app, Vitest + Testing Library tests in `__tests__/` or `*.test.ts(x)`, reusable UI in `frontend/src/components`.
- `docs/` — technical, module and operational docs. `docs/archive/` is historical only.
- Root infra: `docker-compose.yml`, `docker-compose.prod.yml`, `deploy.sh`, `.env.example`, `nginx/`.

Registered backend modules are whatever `backend/src/app.module.ts` imports — read it rather than relying on a list. `ErrorManagementModule` (`backend/src/common/error-management`) is registered ahead of the business modules. Reports are not a module: sales, purchasing and inventory reports are routes inside the respective `*-analytics` controllers and services, which also serve the dashboards.

Non-obvious decisions:

- TypeScript `strict: false`; use `as any` where TypeORM types resist.
- The database connection forces IPv4 (`family: 4`). Database SSL is opt-in via `DB_SSL=true` in **every** environment (#1158); `NODE_ENV` is deliberately not consulted, because the in-Compose Postgres serves no TLS. `ssl.config.spec.ts` asserts the result is identical across environments.
- Frontend environment variables are injected at runtime through `window.__ENV__`, so one image works in every environment.
- Path aliases: frontend `@/` → `src/`; backend `@/*`, `@modules/*`, `@common/*`, `@config/*`, `@database/*` → the matching `src/` directories (but see the path-alias trap below).
- Frontend API calls use RTK Query (`frontend/src/store/api/`) over the Axios `ApiService` transport.

## Commands

```bash
docker compose up -d                       # full stack
cd backend && npm run start:dev            # backend, hot reload, no Docker
cd frontend && npm run dev                 # frontend dev server, no Docker
cd backend && npm run migration:generate --name=DescriptiveName
cd backend && npm run migration:run        # / migration:revert
cd backend && npm run lint && npm run format
./deploy.sh [restart|logs|status]
./maintain.sh                              # maintenance menu
```

Single test files:

```bash
cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest src/path/to/file.spec.ts --no-coverage
cd frontend && npx vitest run src/path/to/file.test.tsx
cd backend && npx bats scripts/__tests__/file.bats
```

The full frontend suite takes tens of minutes; it is not hung.

## Pre-PR verification (authoritative)

Run the checks for every area your change touches. When scopes overlap, run each check once. PRs must list the exact commands run and whether each passed.

| Files touched | Required |
|---|---|
| Every PR | `cd backend && npm run verify:doc-links` |
| `backend/src/**` | `cd backend && npm run lint:check && npm run type-check && npm run test && npm run test:e2e` |
| `backend/test/**` | `cd backend && npm run type-check:spec && npm run test:e2e` |
| `backend/src/database/check-baseline.ts`, `backend/src/config/**`, `backend/test/*db*`, `backend/package.json`, build tsconfigs/`nest-cli.json`, or `backend/scripts/verify-dist-runtime.sh` | additionally `cd backend && npm run test:db` |
| Entities or migrations | additionally `cd backend && npm run migration:run`, before `test:e2e` |
| `frontend/src/**` | `cd frontend && npm run lint && npm run type-check && npm run test:coverage` |
| API DTOs/interfaces used by both apps | both the `backend/src/**` and `frontend/src/**` rows |

- `test:coverage` runs the full frontend suite, so it replaces `npm run test`; do not run both.
- A green CI job satisfies the suite commands it runs when its run's head commit is the PR's current head commit: **Frontend - Lint, Type Check, Tests** for `test:coverage`, and **Backend - Lint, Type Check, Unit Tests, E2E Tests** for `npm run test` and `npm run test:e2e` ([parity](docs/backend/testing.md#ci-substitution-for-backend-suites-1514)). Cite the run URL and that commit in the PR. Local lint and type checks stay required, as do `migration:run` and `test:db` where their rows apply. Changes not yet pushed need the local suite runs.
- A PR is complete only when `gh pr checks <PR>` exits 0 at the PR's current head commit; cite that result and the head SHA in the PR. Wait once in the background with `gh pr checks <PR> --watch --fail-fast` rather than polling. It also covers checks outside `ci.yml` and the ruleset: the **CodeQL** check fails on a new code-scanning alert even when every `Analyze` job passes ([PR #1500](https://github.com/blur88/erp2/pull/1500)).
- Run the documentation link check on every PR: heading changes and moved or deleted files can break links.
- `type-check` covers `src/**` (including specs there) under the build config; only `type-check:spec` sees `backend/test/**`. `npm run test` alone misses cross-file type errors.
- `test:e2e` is required for every backend change because unit tests mock the database; e2e is the only gate that exercises SQL, triggers and the full module graph.

CI (`ci.yml`) runs on `pull_request` and `workflow_dispatch` only — merging never produces a run on `main`; validate main with `gh workflow run ci.yml --ref main`. Ruleset 15609777 matches required checks by **job-name string**, so renaming or adding a CI job blocks every open PR until the ruleset is updated. Details: [Backend testing](docs/backend/testing.md).

## Critical rules and traps

**Backend**

- **Route order.** Fixed routes precede parameterized routes, e.g. `/products/deleted` before `/products/:id`. See [route-order guidance](CODING_STANDARDS.md#route-order).
- **Soft delete.** Use TypeORM `softDelete(id)`, not `isActive = false`, for soft-deletable entities; hard-delete reconciliation lines/setup marks, and headers only when discarding a never-completed draft. See [soft-delete guidance](CODING_STANDARDS.md#soft-delete).
- **API response shape.** Read `response.data`/`response.meta` for pages and category trees; chart-of-accounts trees return arrays on `response`. Wrong page access silently empties lists. See [API response-shape guidance](CODING_STANDARDS.md#api-response-shape).
- **Error details inside `message`.** Keep client-visible structured details in `message`; put machine-readable codes in top-level `code`. See [exception-payload guidance](CODING_STANDARDS.md#error-details-inside-message).
- **Lockout clock.** Expiry uses Node `new Date()`, not SQL `NOW()` (#710); do not change these comparisons. If a lockout looks wrong, suspect container clock drift; run `docker compose restart backend`. See [lockout-clock guidance](CODING_STANDARDS.md#lockout-clock).
- **Migrations only.** `DB_SYNCHRONIZE` is off everywhere and there is no `schema:sync` fallback; migration failure is fatal. The chain starts from one `InitialSchema` genesis migration (#950) and runs against an empty database. Verify schema changes with `backend/scripts/verify-baseline.sh` and `verify-seeds.sh`.
- **Path aliases.** Files reachable from `tsconfig.cli.json`'s `include` must use relative imports. The Docker build's second `tsc` pass writes them into `dist/` with aliases unresolved; this previously made a built image crash-loop. `tsconfig-paths/register` lets `ts-node` CLI scripts run aliased imports from source but does not fix the built image. Gate: `npm run build:all` (builds, then runs `verify:dist`). Details: [Build](docs/backend/build.md).
- **Docker rebuilds.** There is no live-reload mount: backend or frontend source changes need `docker compose build <service> && docker compose up -d <service>`.
- **Dead-code sweeps.** `maintain.sh`'s knip step always exits 0; run `npx knip` directly for pass/fail. Knip flags service methods called only by sibling services — grep `backend/src` before deleting.

**Redis and queues** — details: [Redis](docs/backend/redis.md), [BullMQ backup schedulers](docs/backend/bullmq-backup-schedulers.md)

- **`noeviction`, queue keys only.** Redis is BullMQ's store and runs `--maxmemory-policy noeviction`; eviction silently destroys queue state. Never add cache or session keys — a cache needs a separate Redis service.
- **RESP2 is pinned.** `createBullOptions()` pins BullMQ `protocol: 2`; direct clients do too. RESP3 silently changes reply shapes; adopting it is its own change. Checks: `redis-client-inventory.spec.ts`, `bull-options.factory.spec.ts`, direct-client specs, and ESLint's runtime BullMQ import ban.
- **Never write to this Redis from BullMQ v5**, and never remove a scheduler with `ZREM` — use the dry-run-by-default `backup:reconcile-schedulers` CLI. `test:redis` checks reconciler and schedule-deletion removal; no check detects a v5 writer or arbitrary `ZREM`.

**Tests**

- **Jest needs `NODE_OPTIONS=--experimental-vm-modules`.** Bare `npx jest` runs everything as CommonJS and fails with `Must use import to load ES Module`. Use the npm scripts.
- **Zero tests is a failure.** `Tests: 0 total` means a suite failed to load or the run used the wrong module mode. Never add `--passWithNoTests` (a bats test enforces this).
- **E2E suites clean their own exhaust**: `removeSuiteTraces` removes owned `audit_logs`/`search_queries`; the nightly `test:e2e:leakcheck` catches leaks. See [e2e request-trace cleanup guidance](CODING_STANDARDS.md#e2e-request-trace-cleanup).
- **Cron is off in test apps** (`NODE_ENV=test`); call handler methods directly. BullMQ repeatable jobs still run.
- **`test:redis` writes to Redis** and requires `REDIS_TEST_ALLOW_WRITES=1`; point it only at a disposable instance.

**Frontend** — details: [Testing limits and printing](docs/frontend/testing-and-print.md)

- **Printing is portal-only.** Document dialogs render through MUI portals outside `#root`, and `@media print { #root { display: none } }` isolates them. Nothing prints from inside `#root`; adding such a page means making that rule conditional and releasing every height/overflow constraint on its ancestor chain.
- **jsdom cannot test layout or print.** There is no browser-test infrastructure in the repo. Print and layout changes need a manual browser pass.

**Bank reconciliation** — details: [Bank Reconciliation](docs/modules/accounting/BANK_RECONCILIATION.md)

- **Only the working set reserves journal lines; Versions do not.** One unique index on working set rows is the whole reservation mechanism.
- **Versions are immutable.** In `backend/src/`: no trigger bypasses; index drops only in migrations. Enforced by `cd backend && npm run test:scripts`; only fixture `removeSuiteBankReconciliations` may disable `trg_bsr_*` triggers.
- **Lock order:** Bank account `FOR NO KEY UPDATE` → header → working set rows ascending by `journalEntryLineId`; never lock `accounting_settings` after account. See [reconciliation lock-order guidance](CODING_STANDARDS.md#reconciliation-lock-order).

**Documentation**

- **Docs that describe code are claims.** Claims match the code they name, each rule has one owner that you change first, and a stated reason cites a recorded source, never an untracked file. See [documentation rules](CODING_STANDARDS.md#documentation).

## Git and pull requests

- Commit on a branch. Run `git config core.hooksPath .githooks` once per clone; its pre-commit hook refuses commits on `main`, its pre-push hook refuses a branch that lacks the remote's current `main` (a releasing merge adds a `chore(release)` commit to `main`, so branch from a freshly pulled `main`), and each chains its `.git/hooks/` counterpart.
- Pull `main` with `git pull --ff-only`; a merge commit re-triggers the Release workflow.
- Commits follow Conventional Commits (`feat(accounting): …`, `fix(…): …`, `test(…): …`, `chore: …`).
- PRs include a summary of impacted modules, the linked issue, verification commands and results, UI screenshots for frontend changes, and notes for migrations or env changes.
- Merge with `gh pr merge <n> --merge --delete-branch`; the repo allows only merge commits. The ruleset requires an up-to-date branch, so when a merge is refused as behind: `gh pr update-branch <n> --rebase`, wait for `gh pr checks <n> --watch --fail-fast`, then merge. Never `--admin`.
- Issues live in GitHub Issues for `blur88/erp2` (`gh` CLI); see `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` and `docs/agents/domain.md`.
- For local skill edits or restoring links after a skills update, read [Shared agent skills](docs/agents/skills.md).

## Security and configuration

- Never commit secrets; start from `.env.example`.
- Rotate default credentials outside development.
- Change the schema only through migrations.
