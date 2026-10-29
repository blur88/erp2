# Backend Testing

How the backend test suites are configured, why, and the invariants that keep a broken run from reading as green. The required gates themselves are in `AGENTS.md` § Pre-PR verification.

## Baseline detector against PostgreSQL (#1484)

From `backend/`, run:

```bash
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=baseline_tester DB_PASSWORD='<password>' npm run test:db
```

Prerequisites: installed backend dependencies, Node matching `package.json`, and a disposable PostgreSQL 18.3 server accepting password connections without TLS. The supplied role needs `LOGIN` and `CREATEDB`, access to the `postgres` maintenance database, and permission to drop databases it creates. All four connection variables must be non-empty; the harness does not load `.env` files. Use a development test server. This is development/disposable-database evidence only; no production host exists.

`test:db` runs `build:all` (including the CLI TypeScript pass and `verify:dist`) and executes `dist/database/check-baseline.js`. Each state starts in a separate UUID-named `baseline_it_…` database created from `template0`; only databases successfully created by the current run are dropped, in `finally` even after assertions fail. `DB_DATABASE` and `DATABASE_URL` cannot select a fixture target. An abruptly killed test process can leave a database behind; inspect ownership before manually removing an abandoned `baseline_it_…` database.

The suite checks all four detector cases (three tokens), an empty migrations table alone, and a never-created database. Successful cases compare public catalog definitions, sequence state and fixture rows before and after the child runs with `DB_SYNCHRONIZE=true`. Each child has a temporary working directory with a planted `.env` containing a nonexistent database and invalid pool size; this catches working-directory `.env` loading, including non-overriding loading, but does not cover explicit-path loading. These cases and the compiled-artifact boundary are recorded in [issue #1484](https://github.com/blur88/erp2/issues/1484#issuecomment-6435135694). The existing backend CI job runs this suite; required local gates are owned by [AGENTS.md](../../AGENTS.md#pre-pr-verification-authoritative).

## Type-check gates

`npm run test` uses per-file ts-jest transpilation and does not catch cross-file declaration errors (e.g. TS4053, a public method whose inferred return type names a non-exported interface). Before #1039 those surfaced first at `docker compose build backend`, after every other gate had passed.

- **`npm run type-check`** compiles `tsconfig.build.json` — the config `nest build` uses — so the gate mirrors the image build. Its `include: ["src"]` covers the spec files under `src/`, so their type errors fail it too. Specs under `test/` are excluded.
- **`npm run type-check:spec`** (#1262) compiles `tsconfig.spec.json`, ts-jest's transform config. It is the only thing that checks `test/**`, and it re-checks `src/**` under the test TypeScript configuration (esnext module, bundler resolution, `isolatedModules`). Nine errors had accumulated in `test/**` invisibly before it existed. It is a step on the existing `Backend - Lint, Type Check, Unit Tests, E2E Tests` CI job, deliberately not a new job: ruleset 15609777 matches required checks by job-name string, so a new or renamed job blocks every open PR until the ruleset is updated.

## CI substitution for backend suites (#1514)

[AGENTS.md](../../AGENTS.md#pre-pr-verification-authoritative) owns the rule: a green **Backend - Lint, Type Check, Unit Tests, E2E Tests** job at the PR's current head commit replaces local `npm run test` and `npm run test:e2e`. The substitution rests on this parity, checked on 2026-10-28 at `c6c2f5ffa`:

- **Commands.** The job runs `npm run test -- --no-coverage` and `npm run test:e2e`. The backend Jest config sets no `collectCoverage` or `coverageThreshold`, so `--no-coverage` changes reporting, not pass or fail.
- **Database.** Both use `postgres:18.3-alpine3.23` and database `erp_db_test`, which the e2e global setup drops and recreates.
- **Environment (manual).** CI sets its variables in `ci.yml` and has no `.env.test`; a local run reads the untracked `backend/.env.test`, so this comparison cannot be reproduced from the repository and is rechecked by hand. On the checked machine, `.env.test` set seven keys that `ci.yml` does not. Four equalled their code defaults: `DB_SSL`, `DB_SYNCHRONIZE` and `DB_LOGGING` were `false`, and `JWT_ACCESS_TOKEN_EXPIRY` was `15m`. No file in `backend/src` reads the other three: `JWT_REFRESH_KEYS`, `JWT_REFRESH_ACTIVE_KID` and `REFRESH_GRACE_SECONDS`.
- **Known differences.** CI's Redis service is `redis:8.6.1-alpine3.23` against Compose's `8.6.2`, and CI's Node is the latest `24.x` from `node-version: "24"`.

Recheck the parity, and update this section, when any of these change: the job's commands, service images or environment; a backend test script or the `jest` block in `package.json`; `test/jest-e2e.json`; or the `postgres` or `redis` image in `docker-compose.yml`. Lint, the type checks, `migration:run` and `test:db` stay local gates wherever their AGENTS.md rows apply.

[`verify-ci-parity.sh`](../../backend/scripts/verify-ci-parity.sh) (run by `npm run test:scripts`) fails when the job's PostgreSQL image differs from `docker-compose.yml`'s, when the job has no `run:` step for `npm run test` or `npm run test:e2e`, or when the job or either of those steps carries an `if:` or `continue-on-error:` key with any value. It does not catch a step that still runs but is narrowed or masked (extra Jest arguments, `|| true`, a changed `working-directory`) or a job skipped through `needs:`, and it does not check Redis, Node, the Jest configs, the database name or the environment; recheck those by hand on the triggers above. A few valid forms fail safe as drift: an `if:` that always runs (such as `${{ !cancelled() }}`), a trailing comment on the image line, and a `run: |` block.

## Documentation links (#1429)

`npm run verify:doc-links` checks links and anchors in every tracked Markdown file using the tracked file list, so untracked and gitignored files cannot make a local run disagree with CI. It checks inline links and images, reference definitions and uses, and anchors in Markdown targets. External schemes and protocol-relative URLs are skipped without fetching. A target that exists on disk but is untracked or ignored is reported with a hint to stage it. The same run fails when the root `GLOSSARY.md` defines a `**Term**:` more than once, compared case-insensitively and ignoring fenced code. Exit 0 means no broken local links and no duplicate glossary terms, exit 1 reports either, and exit 2 means the checker could not run or found no tracked Markdown files. CI runs this as the final step of the existing backend job, including when an earlier step failed unless the job was cancelled. The repository root comes from the script's own location, not the working directory; to try it on a scratch repository, copy the script into that repository and run the copy.

Anchors follow GitHub heading slugs, including Unicode, formatting and duplicate headings; fragment comparison is case-sensitive and suggests lowercase when only casing differs. Fenced code and inline code are ignored, including inline spans crossing lines; an unmatched backtick is literal. Fences allow up to three leading spaces and close on the same marker with a run at least as long. A setext underline applies to the full preceding paragraph, while a thematic break is decided from block context (for example, a rule after a list item is not a heading). In a multi-line setext title, paragraph lines are concatenated without a separator before slugging (for example, GitHub uses `line-oneline-two` for the lines `Line one`, `line two`, and `---`). Four-space indented code is intentionally not recognised because it is commonly a list continuation in this repository. Raw HTML links and explicit HTML anchors are not parsed, and fragments on non-Markdown targets or directory links are not checked. Undefined full and collapsed link references fail; undefined shortcuts are treated as literal text, as GitHub renders them. GFM footnote references and definitions are treated as footnotes, not link references, while links inside a footnote definition are still checked.

## Jest runs in ESM mode

Every Jest config (unit in `package.json`, plus `test/jest-*.json`) runs under `NODE_OPTIONS=--experimental-vm-modules` with `extensionsToTreatAsEsm: [".ts"]` and ts-jest `useESM: true`. The transform config is `tsconfig.spec.json`, isolated from the build configs.

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

### Worker heap recycling (#1449)

Both `test/jest-e2e.json` and `test/jest-e2e-leakcheck.json` set `workerIdleMemoryLimit: "1GB"` and retain `maxWorkers: 1`. In Jest 30.5.2, setting this limit forces suites into a child worker; without it, `maxWorkers: 1` runs suites in the main Jest process. After each suite, Jest compares the worker's raw `process.memoryUsage().heapUsed` against the limit and recycles a worker above it; this is distinct from the post-GC measurements below. This is a **bound on accumulated worker heap**, not a fix for per-suite growth or a hard ceiling during a suite. Each fresh worker starts accumulating again; suite order and concurrency stay unchanged. `test/unit/jest-leakcheck-config.spec.ts` asserts the limit and `maxWorkers: 1` independently in each config, in addition to config parity. `--runInBand` and `--detectOpenHandles` force suites into the main process and bypass recycling.

The development investigation in [#1344](https://github.com/blur88/erp2/issues/1344), summarized in [#1449](https://github.com/blur88/erp2/issues/1449), measured post-GC growth with Jest 30.5.2: about 2.7 MB per trivial suite, 35 MB per suite importing `AppModule`, 44 MB per full boot followed by `app.close()`, and 22 MB for a side-effect-free 20 MB fixture. Loaded modules remain reachable for the lifetime of the process running the suites (now one child worker's lifetime), pointing to runner per-file module-registry retention rather than missing application teardown. These are historical **development** measurements, not production evidence. The exact retaining path was **not established** (no heap snapshot); whether retention is specific to vm-modules was **not established** (no CommonJS control); the extra 8–9 MB per boot was **not established**.

#### Development comparison, 2026-10-25

Two sequential full e2e measurements on commit `3c8f1ec3f` used the same machine, suites, reporter and Node options; the temporary configs differed only by `workerIdleMemoryLimit`. Both exited 0 with 45 suites and 612 tests passing. These dated counts describe these runs, not an expected count for future gates. All figures here are **development evidence**, not production evidence.

| Development run | Peak sampled post-GC heap | Suite process PIDs | Observed worker restarts | Jest elapsed time |
| --- | --- | --- | --- | --- |
| Without limit | 2,170.87 MiB (2,276,320,456 bytes) | Main Jest process `4124191`; no child workers | 0 | 537.016 s |
| With `"1GB"` | 983.21 MiB (1,030,967,232 bytes) | Child workers `4134910`, `4139214`, `4142865`; main coordinator `4134491` | 2 (3 distinct worker PIDs minus the initial worker) | 491.949 s |

MiB means bytes / 1,048,576. Jest parses `"1GB"` as **1,000,000,000 bytes**, or **953.67 MiB**. The table's peak is the maximum per-suite post-GC sample from `--logHeapUsage`, not a continuously sampled heap maximum, raw idle-memory check, or RSS. A suite can cross the threshold before recycling; the measured 983.21 MiB peak illustrates this. The timing is descriptive, not a performance claim.

Machine: hostname `ubuntu`, Linux x86_64, four exposed AMD Ryzen 3 3200G CPU cores, 10,428,289,024 bytes RAM (9.71 GiB), approximately 2 GiB swap and Node v24.16.0. The raw telemetry start rows record CPU, RAM, hostname and Node; the preserved [machine capture](measurements/1449/machine.txt) records `uname -a`, `uptime` and `free -h`. KVM status and package-version inventory were not preserved as run artifacts. The no-limit reporter interval was 06:04:37–06:13:34 UTC; with-limit was 06:14:05–06:22:17 UTC. The implementing session observed the local development Compose stack, editors and interactive agent sessions remaining present, and process checks showed no competing Jest, Vitest, typecheck or build workload. Those process-check outputs were not preserved; these observations cannot be independently verified from the committed artifacts. Load samples do not prove the absence of competing work. See the [execution records](measurements/1449/measurement-results.txt) for console-summary excerpts and the tool-based exit-status capture method.

The load/RSS timer requested a 1,000 ms interval, but it did **not** achieve continuous one-second sampling. Without the limit, main-process suite execution delayed the timer: **270 callbacks over 537.016 s**, about 50.3% of the nominal one-per-second count. With the limit, the main-process timer recorded **491 callbacks over 491.949 s**, about 99.8% of that nominal count. These percentages describe callback counts, not contiguous temporal coverage. Gaps leave unsampled load/RSS activity; those statistics describe only observed samples. Observed one-minute system load min/median/max was 1.07/2.60/3.65 without the limit and 1.80/2.32/3.31 with it. Background services were not stopped; this is a shared development machine comparison.

The [custom reporter](measurements/1449/heap-reporter.cjs) records `result.memoryUsage` in bytes after Jest invokes exposed GC. Without the limit, these samples come from the main Jest process. With the limit, they come from the child running the suite; the reporter observes Jest's `child_process.fork` calls and result IPC to associate each sample with its worker PID. Worker creation and exit events count distinct PIDs directly, rather than inferring restarts from heap drops. Separately, its opportunistic timer samples `/proc/<pid>/status` RSS and system load for the main process and observed workers; RSS is not used as heap, and the timer gaps do not remove per-suite heap results.

The unfiltered reporter output is preserved as [no-limit raw telemetry](measurements/1449/no-limit.raw.jsonl) and [with-limit raw telemetry](measurements/1449/with-limit.raw.jsonl), including `sample` and `worker-result` events. The [compact no-limit results](measurements/1449/no-limit.jsonl) and [compact with-limit results](measurements/1449/with-limit.jsonl) are **derived files**, not direct reporter output. The [derivation script](measurements/1449/derive-results.py) retains `start`, `worker`, `worker-exit`, `suite` and `complete` events, drops `sample` and duplicate `worker-result` rows, and computes the added `sample-summary` row (callback count, requested interval, load statistics and observed RSS peaks). From the repository root, these lightweight commands reproduce both derived files:

```bash
python3 docs/backend/measurements/1449/derive-results.py docs/backend/measurements/1449/no-limit.raw.jsonl > /tmp/1449-no-limit-derived.jsonl
python3 docs/backend/measurements/1449/derive-results.py docs/backend/measurements/1449/with-limit.raw.jsonl > /tmp/1449-with-limit-derived.jsonl
cmp /tmp/1449-no-limit-derived.jsonl docs/backend/measurements/1449/no-limit.jsonl
cmp /tmp/1449-with-limit-derived.jsonl docs/backend/measurements/1449/with-limit.jsonl
```

Setup and measurement commands that produce raw reporter output, from the repository root (the reporter was originally created at the temporary path; this copies the preserved identical source):

```bash
mkdir -p /tmp/erp2-1449-measurement
cp docs/backend/measurements/1449/heap-reporter.cjs /tmp/erp2-1449-measurement/heap-reporter.cjs
python3 - <<'PY'
import json
from pathlib import Path
source = Path('backend/test/jest-e2e.json').resolve()
config = json.loads(source.read_text())
config.pop('workerIdleMemoryLimit')
config['rootDir'] = str(source.parent)
output = Path('/tmp/erp2-1449-measurement')
(output / 'no-limit.json').write_text(json.dumps(config, indent=2) + '\n')
config['workerIdleMemoryLimit'] = '1GB'
(output / 'with-limit.json').write_text(json.dumps(config, indent=2) + '\n')
PY
cd backend
NODE_ENV=test NODE_OPTIONS='--max-old-space-size=4096 --experimental-vm-modules' HEAP_REPORT=/tmp/erp2-1449-measurement/no-limit.jsonl node --expose-gc node_modules/jest/bin/jest.js --config /tmp/erp2-1449-measurement/no-limit.json --logHeapUsage --testPathPatterns='\.e2e-spec\.ts$' --reporters=default /tmp/erp2-1449-measurement/heap-reporter.cjs > /tmp/erp2-1449-measurement/no-limit.log 2>&1
NODE_ENV=test NODE_OPTIONS='--max-old-space-size=4096 --experimental-vm-modules' HEAP_REPORT=/tmp/erp2-1449-measurement/with-limit.jsonl node --expose-gc node_modules/jest/bin/jest.js --config /tmp/erp2-1449-measurement/with-limit.json --logHeapUsage --testPathPatterns='\.e2e-spec\.ts$' --reporters=default /tmp/erp2-1449-measurement/heap-reporter.cjs > /tmp/erp2-1449-measurement/with-limit.log 2>&1
```

The [captured gate summary](measurements/1449/gate-result.txt) records the separate development gate on code revision `3c8f1ec3f3f7a956f7041d325d690cddae0fae8e`, with pending documentation-only changes later committed as `8832326f4`: 45 suites and 612 tests passed in 430.703 s. The implementing session captured exit 0 from the structured `exit_code` field returned by `write_stdin` when `exec_command` session 71544 completed; the redirected console log itself did not contain an exit-status marker. It ran sequentially after both measurements, without `--logHeapUsage`, `--expose-gc` or the custom reporter.

The pattern precedes the variadic `--reporters` option. These invoke the full `test:e2e` Jest configuration and lifecycle with added measurement instrumentation; a separate uninstrumented `npm run test:e2e` is the required gate. Use fresh output files for a repeat: the reporter appends JSONL.

### Every suite cleans its own request exhaust

`resetSuiteBusinessRows` covers business rows and `removeSuiteAdmin` covers users (refresh tokens cascade). But every HTTP request also leaves `audit_logs` rows, and every global search leaves a `search_queries` row. `test/utils/shared-e2e-traces-fixture.ts` (`removeSuiteTraces`) deletes those, scoped to the suite's own user/entity ids — call it in `afterAll` before removing users. Scope to ids you own; never a bare `username = 'admin'`, which is shared. A suite that makes audited requests and skips this turns the nightly leak check red.

### Deterministic concurrency tests (#1498)

A test that claims two transactions deadlock, lose an update or serialise must force the interleaving and prove each wait from PostgreSQL. `test/cost-batch-lock-order.concurrency.e2e-spec.ts` is the pattern to copy. Its helpers are still local to that file.

- **Barriers at the SQL boundary.** `beforeEach` wraps `DataSource.createQueryRunner`. A runner created inside an `AsyncLocalStorage` operation (`start()`) records its backend pid at `START TRANSACTION`, sets `SET LOCAL statement_timeout = '15s'`, and calls the operation's `afterQuery(sql)` hook after each query. A test holds a transaction with `barrier().hold()` immediately after a named statement (for example `UPDATE "purchase_cost_history"`), through the real services.
- **Prove the wait, not the time.** `blockedBy(waiter, holder)` returns only when `pg_stat_activity` shows the waiter with `wait_event_type = 'Lock'` and `pg_blocking_pids` includes the holder's pid. Elapsed time is never evidence; no `Promise.all` race or sleep stands in for a barrier.
- **Bound every wait.** `bounded()` races each barrier, wait and completion against a timeout. `afterEach` releases all barriers, settles the tasks, and terminates only backends still owned by an operation, never an idle pooled one.
- **Barriers that survive the fix.** Place each barrier after the holder's first conflicting write, so the waiter still blocks on the fixed code, on the product rather than the batch in #1498. A barrier that waits for a step the fix removes times out, and a timeout is not a pass.
- **Red first.** Run the final test against the unfixed base and keep its output (`40P01`, or the wrong final value) as evidence.
- **Own-rows cleanup.** Track every created root and dependent id, remove them in `afterAll` per [Every suite cleans its own request exhaust](#every-suite-cleans-its-own-request-exhaust). The #1498 suite then asserts that none of its products' cost batches remain.

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
