# E2E fixture leak checks

**E2E fixture leaks are detected only by the nightly leak check** (#1204). The
normal `npm run test:e2e` drops and recreates `erp_db_test` on every run, so a
suite that leaves rows behind is indistinguishable from one that cleans up
perfectly — that is how four real leaks passed every gate in PR #1203.

```bash
cd backend && npm run test:e2e:leakcheck            # reuse the retained database
cd backend && npm run test:e2e:leakcheck -- --fresh # rebuild and re-baseline
```

It runs the suites twice against a persistent `erp_db_leakcheck_test` and
asserts they restore a captured baseline. **Pass 2 is the point**: a suite whose
cleanup depends on a clean slate passes pass 1 and fails pass 2.

**The baseline is seeded, not migrated.** `admin` and `RETAIL` come from
`OnModuleInit` seeders (`users-seeder.service.ts`,
`price-lists-seeder.service.ts`), not from InitialSchema. After
`migration:run` both `users` and `price_lists` are **empty**; they hold one row
each only after the app boots. So `test/e2e-leakcheck-boot.ts` boots AppModule
once between migrations and baseline capture. Remove that step and the two
tables the gate is supposed to protect become its first false positives.

That boot entry lives in `test/`, never under `src/database/cli/` — see the
[CLI compilation alias trap](cli-build.md).

**Reuse is rejected on two migration comparisons, not one.** Stored-vs-applied
compares the retained database to itself, so a newly pulled migration leaves it
green; only applied-vs-expected-by-checkout catches that. Both run before any
pass, and either mismatch requires `--fresh`.

**Findings are reported as baseline drift, never as suite ownership.** The
check compares database states and cannot know which suite wrote a row, so
every report lists the same three causes: a suite leaked, the runtime seeds
changed (re-run with `--fresh`), or the baseline was captured from an
already-drifted database.

**Every suite cleans its own request exhaust, not just its fixtures.**
`resetSuiteBusinessRows` covers business rows and `removeSuiteAdmin` covers
users (refresh tokens cascade), but every HTTP request also leaves
`audit_logs` rows (domain services log every mutation) and every global search
leaves a `search_queries` row. `test/utils/shared-e2e-traces-fixture.ts`
(`removeSuiteTraces`) deletes those scoped to the suite's own user/entity ids —
call it in `afterAll` before removing users. Scope to ids you own; never a bare
`username = 'admin'`, which is shared. A new suite that makes audited requests
and skips this turns the nightly gate red.

**Sampler tables are excluded, deliberately.** `redis_memory_samples` and
`redis_alert_state` are not captured or compared: the sampler writes a startup
sample in `onModuleInit` on every app boot under a per-boot instanceId (one row
per boot, +38/pass measured 2026-09-27), which no suite can prevent. That write
is not cron, so disabling cron through `createScheduleOptions()` does not remove it.

**Cron does not run in e2e-booted apps** (#1311). `createScheduleOptions()`
(`config/schedule-options.factory.ts`) passes `cronJobs: false` to
`ScheduleModule.forRoot()` when `NODE_ENV` is exactly `test`, which both e2e
entry points export. Before this, every suite app registered all five `@Cron`
handlers, and the hourly backup cleanup's `getBackupSettings()` lazily INSERTed
a `backup_retention_settings` row at hh:00 — the gate's verdict depended on the
wall clock. (That read no longer writes: since #1312, `getBackupSettings()`
returns unpersisted defaults with `id`/`createdAt`/`updatedAt` null when no row
exists, and `updateBackupSettings()` is the only writer.) `test/cron-isolation.e2e-spec.ts` asserts a booted test app's
`SchedulerRegistry` holds no cron jobs. A test that needs a handler's behaviour
must call the handler method directly; never rely on the schedule firing.
BullMQ repeatable jobs are **not** covered: they are created from persisted
`backup_schedules` rows at boot but then execute on a time schedule in any
booted app's worker, independent of `ScheduleModule`.

The excluded sampler tables are **counted and reported, never diffed**. Every report ends with an
`ignored (sampler, not suite-attributable)` section giving each table's
baseline count, current count and signed delta — e.g.
`redis_memory_samples: baseline 1, now 55 (+54)`. The counts live in the
baseline's `excluded_counts` column (format version 2), which is why a delta is
available at all. Nothing there can turn the gate red; the section exists so a
green report still says out loud which tables went unchecked.

Two blind spots, both deliberate: value changes on rows whose primary keys
survive are invisible, and a seeder-code change surfaces mid-run as pass-1
drift rather than at the reuse check.

The gate is nightly and on-demand, **not** a required check — it runs the full
e2e suite twice.
