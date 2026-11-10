# CLAUDE.md

Read [AGENTS.md](AGENTS.md) before working in this repository. It is the shared source of truth for project structure, development commands, coding and theme standards, testing, security, and PR requirements.

## Project and architecture

ERP system: NestJS backend, React / TypeScript / Material UI frontend, PostgreSQL via TypeORM, and NGINX in Docker. Redis backs BullMQ queues only; it is not a cache or session store. See each app's `package.json` and the compose files for current versions.

`backend/src/modules/` has 17 modules: accounting, audit-logs, auth, backup, bank-reconciliations, dashboard, inventory, monitoring, owner-equity, price-lists, print-settings, provider-settlements, purchasing, sales, search, settings, and users. Accounting is active, including journal entries and chart of accounts.

`ErrorManagementModule` (`backend/src/common/error-management`) supplies cross-cutting exception filters/interceptors and is registered before the business modules in `app.module.ts`. Sales/Purchasing/Inventory reports live inside their respective `*-analytics` controllers/services rather than a separate reports module.

- Backend TypeScript has `strict: false`; use `as any` when TypeORM types resist.
- Database connections force IPv4 (`family: 4`). SSL is opt-in through `DB_SSL=true` in every environment, including production; in-compose Postgres serves no TLS. Keep `createSSLConfig` independent of `NODE_ENV`: disabled returns `false`, enabled verifies certificates, with CA/cert/key when all three are set.
- Frontend environment variables are injected at runtime via `window.__ENV__` so one image works across environments.
- Frontend API calls use RTK Query (`frontend/src/store/api/`) with the Axios-backed `ApiService` transport.
- Docker source changes require rebuilding the affected service: `docker compose build backend && docker compose up -d backend` (use `frontend` for frontend changes). There is no source volume for live reload; local dev servers are separate.

## Verification and focused commands

Before a PR, follow [AGENTS.md's change-scoped verification gates](AGENTS.md#change-scoped-verification-required-before-pr), including its single frontend gate for frontend or cross-app changes. Record exact commands and results in the PR.

Full frontend runs can take tens of minutes; elapsed time alone does not mean a run is hung. Use focused files during iteration, then the required full gate:

```bash
cd backend && npm run test -- src/path/to/file.spec.ts --no-coverage
cd frontend && npx vitest run src/path/to/file.test.tsx
```

The backend npm test scripts supply the required ESM flag; bare `npx jest` does not. See the testing constraints below.

For maintenance, `./maintain.sh` offers dependency, audit, Knip, duplication, and rebuild tools. Its `do_knip()` wraps failures in `|| true`, so run `npx knip` directly in the app directory when pass/fail matters. Search `backend/src` for sibling-service callers before removing a method Knip reports unused.

## Application gotchas

- **Route order:** declare specific NestJS routes (e.g. `/products/deleted`) before parameterized routes (`/products/:id`) or the literal segment is treated as an id.
- **Soft delete:** use TypeORM `softDelete(id)` to set `deletedAt`; setting `isActive = false` breaks deleted queries and restore.
- **API responses:** `ApiService` returns the backend body without the Axios wrapper. Paginated lists use `response.data` for items and `response.meta` for pagination. Tree endpoints (categories, chart of accounts) return a plain array; use `response` directly.
- **Account lockout:** `User.isLocked`, the login check, and user filters/counts all use the Node container clock (`new Date()`), never SQL `NOW()`. For clock drift after sleep/resume, restart the backend or resync the host clock; preserve the common clock.
- **Pulling main:** use `git pull --ff-only`. With `merge.ff = false`, a normal pull creates a merge commit that unnecessarily retriggers Release.

## Printing and statement UI

Transactional document dialogs (SO/PO/invoices) print through MUI portals outside `#root`. The unconditional `@media print { #root { display: none } }` in `styles/global.css` isolates them. Accounting reports (P&L, Balance Sheet, Form B) have no print/export route since #1223.

Before adding a printable page inside `#root`, make root hiding conditional and release every ancestor height/overflow constraint: `#root`, its children, `main`, `.app-shell-root`, and EntityTable's `.entity-table-card`, `-frame`, and `-scroller`. Otherwise output silently truncates to one viewport. Restore a browser-based gate for such a path; #1223 records the removed machinery.

jsdom cannot validate layout or `@media print`. There is no Playwright config, frontend e2e directory, or `test:print` script. SO/PO printing needs a manual browser pass alongside jsdom tests. For Statement styling changes, follow [STATEMENT_THEME_QA.md](docs/modules/accounting/STATEMENT_THEME_QA.md) and record results in the PR.

- Imported `statement.css` rules are not injected by Vitest. Decimal alignment, sticky scrolling, clipping, elevation, and font loading need browser QA.
- Emotion `sx` (including descendant selectors) and theme `styleOverrides` are observable through `toHaveStyle` when rendered inside `ThemeProvider`. Read computed values; a wrong-value assertion failing alone does not prove a rule applied.
- Keep `.stmt-paren-spacer::after { content: ')' }` as CSS generated content. A real text node looks the same but leaks a closing parenthesis into text. Exact `textContent` and no-stray-parenthesis assertions catch this; substring assertions do not.
- Keep all figure font sizes equal for decimal alignment. Distinguish the bottom line by weight and double rule.

CI runs on PRs and manual dispatch, not pushes to main. To validate main explicitly: `gh workflow run ci.yml --ref main`.

## Backend build and test constraints

### Path aliases and compiled output

Aliases are configured in each app's TypeScript config. CLI scripts importing backend aliases directly or transitively must preload `tsconfig-paths/register` (e.g. `ts-node -r tsconfig-paths/register ...`). Type-checking resolves aliases; Node runtime loading does not.

**Files reachable from `tsconfig.cli.json` must use relative imports.** The Docker build runs `nest build` (rewrites aliases), then plain `tsc -p tsconfig.cli.json` (does not). Both write `dist/`, so a transitive CLI dependency can overwrite correct application output with unresolved aliases and crash the whole backend. Inspect reach with `npx tsc -p tsconfig.cli.json --noEmit --listFiles`.

`backend/scripts/verify-dist-runtime.sh` (`npm run verify:dist`) scans compiled aliases and loads `dist/main.js`; it runs after CLI compilation in the Dockerfile. Source tests and type-checks cannot catch this artifact failure. Keep test-only boot entrypoints under `test/`, outside the CLI include.

### Type checks and Jest ESM

The reason for the separate type-check gates in AGENTS.md: ts-jest transpiles per file and misses cross-file declaration errors. `type-check` uses `tsconfig.build.json` (`src/**`, including source specs); `type-check:spec` uses `tsconfig.spec.json` and additionally covers `test/**` under the test compiler settings.

- All Jest scripts require `NODE_OPTIONS=--experimental-vm-modules`, `extensionsToTreatAsEsm: [".ts"]`, and ts-jest `useESM: true`. The old `transformIgnorePatterns` allowlist is obsolete; it cannot handle NestJS 12's `import.meta` in CommonJS mode.
- A run with `Tests: 0 total` is a failure. Preserve Jest's nonzero exit status; never add `--passWithNoTests`. `npm run test:scripts` includes the Bats guard covering scripts/configs/CI.
- Jest main-process `globalSetup`/`globalTeardown` hooks stay plain CJS `.js`. A `.ts` hook is compiled to CJS but loaded as ESM, causing `exports is not defined`.
- Only the e2e config shims `uuid` with `test/__mocks__/uuid.cjs` (`crypto.randomUUID`): ExcelJS's CommonJS require of ESM uuid trips Jest's require-cycle error when AppModule loads. Unit tests use the real package.
- NestJS 12 is ESM-only; the application remains CommonJS using Node 24 `require(esm)`. Keep `@nestjs/typeorm` on a release whose exports include `default`/`require`, and retain the Dockerfile's Node compatibility floor. Older Node 24 releases lack the export-condition fallback. `verify:dist` catches `MODULE_NOT_FOUND` and `ERR_PACKAGE_PATH_NOT_EXPORTED`; a built `node dist/main.js` boot is the definitive check.
- Keep required CI job names stable: branch rules match job-name strings.

### Migrations and e2e cleanup

The migration chain starts at `InitialSchema` and supports an empty database. Migration failure is fatal; neither entrypoint nor e2e setup falls back to schema sync. For schema changes, also use `backend/scripts/verify-baseline.sh` and `backend/scripts/verify-seeds.sh`.

Normal e2e runs recreate `erp_db_test`, hiding fixture leaks. The nightly/on-demand `npm run test:e2e:leakcheck` runs twice against retained `erp_db_leakcheck_test`; pass 2 catches cleanup that only works on a clean slate. It is not a required CI check. Use `-- --fresh` to rebuild/re-baseline.

- Baseline capture must boot AppModule after migrations: `admin` and `RETAIL` are runtime seeds, not migration rows.
- Reuse checks both stored-vs-applied and applied-vs-checkout migrations; either mismatch requires `--fresh`.
- Drift cannot identify suite ownership: investigate leaked rows, changed runtime seeds, or an already-drifted baseline. Changes to values on surviving primary keys are invisible; changed seeder code can first surface as pass-1 drift.
- Every suite cleans its request traces as well as fixtures: call `removeSuiteTraces` (`test/utils/shared-e2e-traces-fixture.ts`) before removing users, alongside `resetSuiteBusinessRows` / `removeSuiteAdmin`. Scope audit/search cleanup to owned user/entity ids, never shared `admin`.
- Sampler tables (`redis_memory_samples`, `redis_alert_state`) are counted/reported but excluded from diffs; startup sampling continues with cron disabled. Their deltas cannot fail the gate.
- `createScheduleOptions()` disables cron only for `NODE_ENV=test`. Call handlers directly in tests. BullMQ repeatable jobs are independent of Nest scheduling and still run. `getBackupSettings()` returns unpersisted defaults with null id/timestamps when absent; `updateBackupSettings()` is the only writer.

## Redis and backup queues

### Memory and monitoring

Keep Redis `noeviction`: evicted BullMQ keys silently destroy queue state. Cache/session workloads require a separate Redis service; the commented `CacheModule.register()` in `users.module.ts` must remain dormant on this instance.

The compose files own the start-time memory policy. Recreate Redis to change it; restart alone does not apply command changes, and `CONFIG SET` does not survive recreation. Before a policy rollout, capture policy, memory, `evicted_keys`, and keyspace per environment; investigate any prior evictions. After rollout require both `Initialized N backup schedules` present and `Eviction policy` absent in a restart-bounded backend log window.

For Redis rollout, sizing, or memory incidents, read [REDIS_MEMORY_PRESSURE_RUNBOOK.md](docs/deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md). The 256 MiB cap is retained; local measurements establish neither production sizing nor survival across a confirmed deploy. Re-evaluating against captured production values remains a rollout gate. Zero eviction/OOM counters do not rule out process/container restarts. Retrieve the password from the running backend container and use `REDISCLI_AUTH`; the host shell may not export it, and `-a` exposes it in process arguments.

Monitoring persists samples/alerts to Postgres and only reads Redis INFO. Alert watermarks are keyed by Redis `run_id`; retain previous rows for diagnostics. `MONITORING_INSTANCE_ID` must stay stable across restarts and unique per running sampler. Use `SafeIntegerTransformer` for bigint monitoring columns to reject unsafe numeric truncation.

Read full-window peaks from SQL `windowStats`, not newest-anchored, capped `samples`. Counter deltas sum positive consecutive increases (not max-minus-min across resets); `null` means insufficient comparable readings, distinct from measured zero.

### Protocol and scheduler safety

- Keep ioredis `protocol: 2` on `createBullOptions()` and standalone clients. BullMQ duplicates those options for blocking/QueueEvents connections. ioredis 6 defaults to RESP3, changing raw reply shapes (notably flat vs paired `zrange` output); a protocol switch needs separate verification of INFO, zrange, and hgetall readers.
- Retain `overrides.typeorm.ioredis: "$ioredis"` for production npm pruning compatibility. ioredis 6 types zrange's stop argument as string/Buffer: use `'-1'`.
- The v5-to-v6 migration is complete; no v5 process may write to this Redis. `bullmq-v5` and automatic legacy cleanup were retired. Real-Redis tests seed scheduler orphans with v6 and legacy non-`ic` fixtures with raw commands; preserve the captured shape in `seedLegacyRepeatable()`'s docblock (metadata has only name/pattern; scheduleId is on the delayed job).
- `npm run test:redis` checks the `ic` discriminator against real Redis; unit mocks cannot. It requires `REDIS_TEST_ALLOW_WRITES=1` and a disposable Redis. Port 6399 is a convention, not protection. Unique test prefixes are cleaned in teardown without flushing, but interrupted runs leave keys under noeviction. Zero loaded tests is a failure.

`reportOrphanedSchedulers()` is diagnostic only and must never fail boot or mutate Redis. Missing/unparseable data or invalid scheduleId means unclassifiable, not orphaned. A DB read failure must not destroy live schedulers.

For orphan remediation, use the dry-run CLI first:

```bash
docker compose exec -T backend npm run backup:reconcile-schedulers
docker compose exec -T backend npm run backup:reconcile-schedulers -- --execute
```

It removes only confirmed `ic` scheduler orphans with `removeJobScheduler(<bare member>)`, never `ZREM` (which leaves delayed occurrences alive). DB read failure aborts; zero confirmed live rows aborts unless `--execute --allow-empty` explicitly intends to clear remaining schedulers. Legacy non-`ic` entries require BullMQ 5's `removeRepeatableByKey`. Run outside deploy windows. A mid-run failure stops and reports completed removals; rerun to finish, with no rollback.

`removeJobScheduler` returns a boolean (`true` removed, `false` absent), not Lua's numeric convention. Verify both the repeat member and delayed occurrence are gone; close any manually constructed queue connection so the process exits.

## Bank reconciliation invariants

- Tables use `bank_statement_reconciliation`; legacy `bank_reconciliations` / `reconciled_transactions` must not be created.
- `UQ_bsr_line_journal_line` on working lines' `journalEntryLineId` is the only reservation. Version lines are snapshots and reserve nothing. Working lines and setup marks are hard-deleted.
- Migration `1791044381374-AddBankStatementReconciliations.ts` owns six `bsr_*` functions, eight `trg_bsr_*` triggers, and composite `FK_bsr_current_version` with `ON DELETE RESTRICT`. `ALLOWLIST=migration-indexes npm run verify:baseline` allows those fifteen objects and checks their catalog definitions. Extend both allowlist and catalog checks for any new migration-only object.
- Version rows cannot be updated/deleted after sealing; deferred constraints reject unsealed commits, with no session/role bypass. Tests alone use `removeSuiteBankReconciliations` (`backend/test/utils/bank-reconciliation-fixture.ts`) to disable/re-enable the eight triggers inside one transaction. Nothing in `src/` may do that. Clean reconciliations before journal rows (RESTRICT FKs).
- Every write locks the bank account's chart-of-account row with `FOR NO KEY UPDATE`, then header, then working lines in ascending `journalEntryLineId`. Preserve the weaker lock so journal inserts' key-share locks do not block. Never take `accounting_settings` / `withBalanceSheetConfigLock` after the account lock: the account update path orders them oppositely.
- Structured conflicts use `ConflictException({ message: { text, ...details } })`. The global filter forwards only message; keep it that way. Frontend uses `reconciliationErrorMessage` for the nested text, not `rtkErrorMessage`.
- Form drafts live in sessionStorage keyed by user/reconciliation. `applyPreview` must return the same state object for unchanged data to prevent request loops. Sign-out cleanup reaches only that tab; other tabs may stay signed in with drafts. For draft storage/auth changes, read [BANK_RECONCILIATION_DRAFT_STORAGE_ASSESSMENT.md](docs/modules/accounting/BANK_RECONCILIATION_DRAFT_STORAGE_ASSESSMENT.md), including the open CodeQL alert.

## Agent skills

- **Issues:** GitHub Issues in `blur88/erp2`; read [issue-tracker.md](docs/agents/issue-tracker.md) when using the tracker.
- **Triage:** read [triage-labels.md](docs/agents/triage-labels.md) before choosing readiness labels.
- **Domain exploration:** read [domain.md](docs/agents/domain.md) for glossary/ADR discovery and terminology rules.
