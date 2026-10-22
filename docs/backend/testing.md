# Backend Testing

How the backend test suites are configured, why, and the invariants that keep a broken run from reading as green. The required gates themselves are in `AGENTS.md` § Pre-PR verification.

## Type-check gates

`npm run test` uses per-file ts-jest transpilation and does not catch cross-file declaration errors (e.g. TS4053, a public method whose inferred return type names a non-exported interface). Before #1039 those surfaced first at `docker compose build backend`, after every other gate had passed.

- **`npm run type-check`** compiles `tsconfig.build.json` — the config `nest build` uses — so the gate mirrors the image build. Its `include: ["src"]` covers the spec files under `src/`, so their type errors fail it too. Specs under `test/` are excluded.
- **`npm run type-check:spec`** (#1262) compiles `tsconfig.spec.json`, ts-jest's transform config. It is the only thing that checks `test/**`, and it re-checks `src/**` under the test TypeScript configuration (esnext module, bundler resolution, `isolatedModules`). Nine errors had accumulated in `test/**` invisibly before it existed. It is a step on the existing `Backend - Lint, Type Check, Unit Tests, E2E Tests` CI job, deliberately not a new job: ruleset 15609777 matches required checks by job-name string, so a new or renamed job blocks every open PR until the ruleset is updated.

## Jest runs in ESM mode

All three Jest configs (unit in `package.json`, `test/jest-e2e.json`, `test/jest-redis.json`) run under `NODE_OPTIONS=--experimental-vm-modules` with `extensionsToTreatAsEsm: [".ts"]` and ts-jest `useESM: true`. The transform config is `tsconfig.spec.json`, isolated from the build configs.

The old `transformIgnorePatterns` allowlist (thirteen packages led by the `sanitize-html` ESM cluster) was deleted as obsolete in ESM mode. It could not have been extended to NestJS 12 anyway: NestJS 12 uses `import.meta`, which is invalid in CommonJS.

Invariants:

- **Every Jest invocation carries `NODE_OPTIONS=--experimental-vm-modules`.** Running `npx jest` bare (or `--config ./test/jest-e2e.json` without the npm script) silently disables vm-based ESM: every `.ts` file is treated as CommonJS, and the first import of an ESM-only package (`@nestjs/testing`, `@nestjs/common`, …) throws `Must use import to load ES Module`. The symptom reads as a config or import bug. Always run through the npm scripts, or set the variable explicitly:

  ```bash
  cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest src/path/to/file.spec.ts --no-coverage
  ```

- **A run that discovers zero tests must fail.** Both ESM failure modes — a suite that fails to load, and a whole run under the wrong module mode — report `Tests: 0 total`. Jest exits non-zero in both cases, which is the only thing that makes CI fail on them. `--passWithNoTests` would convert that to exit 0; it appears nowhere in this repo, and `scripts/__tests__/no-pass-with-no-tests.bats` (run by `npm run test:scripts`) keeps it out of `package.json`, every `test/jest-*.json`, the leak-check orchestrator and `ci.yml`. Exact suite/test counts are deliberately not recorded in docs: stale counts train readers to wave mismatches through (#1164).
- **Jest main-process hooks are plain CJS `.js`.** `test/jest-e2e-global-setup.js` and `test/jest-e2e-global-teardown.js` are loaded via `require()` in Jest's main process, where a `.ts` hook would be compiled to CJS but loaded by Node as ESM (`exports is not defined in ES module scope`).
- **`uuid` is shimmed in the e2e config only.** `test/jest-e2e.json` maps `^uuid$` to `test/__mocks__/uuid.cjs` (a `node:crypto.randomUUID` wrapper). uuid@14 is ESM-only and `exceljs` (CJS) does `require('uuid')`; loading the full `AppModule` graph under Jest ESM trips `ERR_REQUIRE_CYCLE_MODULE`. The unit suite uses the real package.

## E2E suites

`npm run test:e2e` drops and recreates `erp_db_test` on every run.

### Every suite cleans its own request exhaust

`resetSuiteBusinessRows` covers business rows and `removeSuiteAdmin` covers users (refresh tokens cascade). But every HTTP request also leaves `audit_logs` rows, and every global search leaves a `search_queries` row. `test/utils/shared-e2e-traces-fixture.ts` (`removeSuiteTraces`) deletes those, scoped to the suite's own user/entity ids — call it in `afterAll` before removing users. Scope to ids you own; never a bare `username = 'admin'`, which is shared. A suite that makes audited requests and skips this turns the nightly leak check red.

### Cron does not run in e2e-booted apps (#1311)

`createScheduleOptions()` (`src/config/schedule-options.factory.ts`) passes `cronJobs: false` to `ScheduleModule.forRoot()` when `NODE_ENV` is exactly `test`, which both e2e entry points export. Before this, every suite app registered all five `@Cron` handlers and the hourly backup cleanup could write a row at hh:00, making results depend on the wall clock. `test/cron-isolation.e2e-spec.ts` asserts a booted test app's `SchedulerRegistry` holds no cron jobs.

A test that needs a handler's behaviour must call the handler method directly; never rely on the schedule firing. BullMQ repeatable jobs are **not** covered: they are created from persisted `backup_schedules` rows at boot and execute on a time schedule in any booted app's worker, independent of `ScheduleModule`.

`getBackupSettings()` no longer writes (#1312): with no row it returns unpersisted defaults with `id`/`createdAt`/`updatedAt` null. `updateBackupSettings()` is the only writer.

### Leak check (#1204)

Because `test:e2e` recreates its database, a suite that leaves rows behind is indistinguishable from one that cleans up perfectly — four real leaks passed every gate in PR #1203. The leak check catches them:

```bash
cd backend && npm run test:e2e:leakcheck            # reuse the retained database
cd backend && npm run test:e2e:leakcheck -- --fresh # rebuild and re-baseline
```

It runs the suites twice against a persistent `erp_db_leakcheck_test` and asserts they restore a captured baseline. **Pass 2 is the point**: a suite whose cleanup depends on a clean slate passes pass 1 and fails pass 2. It is nightly and on demand, not a required check.

- **The baseline is seeded, not migrated.** `admin` and `RETAIL` come from `OnModuleInit` seeders (`users-seeder.service.ts`, `price-lists-seeder.service.ts`). After `migration:run`, `users` and `price_lists` are empty, so `test/e2e-leakcheck-boot.ts` boots `AppModule` once between migrations and baseline capture. Without that step the two tables the gate protects become its first false positives.
- **Reuse is rejected on two migration comparisons.** Stored-vs-applied compares the retained database to itself, so a newly pulled migration leaves it green; only applied-vs-expected-by-checkout catches that. Either mismatch requires `--fresh`.
- **Findings are reported as baseline drift, never as suite ownership.** The check compares database states and cannot know which suite wrote a row, so every report lists three causes: a suite leaked, the runtime seeds changed (re-run with `--fresh`), or the baseline was captured from an already-drifted database.
- **Sampler tables are counted, never diffed.** `redis_memory_samples` and `redis_alert_state` are written on every app boot under a per-boot instance id (+38 rows per pass, measured 2026-09-27), which no suite can prevent and which turning cron off does not remove. Every report ends with an `ignored (sampler, not suite-attributable)` section giving each table's baseline count, current count and signed delta, from the baseline's `excluded_counts` column (format version 2). Nothing there can turn the gate red.
- **Two deliberate blind spots:** value changes on rows whose primary keys survive are invisible, and a seeder-code change surfaces mid-run as pass-1 drift rather than at the reuse check.

## Real-Redis suite (`test:redis`)

`npm run test:redis` is the only test that exercises BullMQ against a real Redis (for example, it is the only thing that catches an inverted `ic` check in the scheduler reconciler — unit tests mock `hexists`). It is on CI's critical path, and `Tests: 0 total` there is a failure.

It requires an explicit opt-in (#1190). `scripts/preflight-redis-test.sh` aborts unless `REDIS_TEST_ALLOW_WRITES=1`, before opening any connection:

```bash
cd backend && REDIS_TEST_ALLOW_WRITES=1 npm run test:redis
```

The address cannot express safety: `REDIS_TEST_PORT` defaulting to 6399 is a convention, and CI deliberately points the suite at 6379 (its own ephemeral service container, where `ci.yml` sets the opt-in). The suite writes under a unique `test-bullmq-<ts>-<rand>` prefix and deletes `${prefix}:*` in teardown; it does not flush. An interrupted run leaves keys behind, and the Redis is `noeviction`, so nothing reclaims them. Point it only at a Redis you are willing to lose.

## Related

- [Build](build.md) · [Redis](redis.md) · [BullMQ backup schedulers](bullmq-backup-schedulers.md)
- `docs/modules/accounting/BANK_RECONCILIATION.md` — removing reconciliation fixtures in tests.
