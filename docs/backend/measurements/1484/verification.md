# Issue #1484 development verification

Captured on 2026-10-27 in the local development workspace. These results concern disposable databases only; no production host exists. No application schema or migration changes are included.

Commands below ran from `backend/` against the implementation in this commit. Database credentials were loaded from the ignored local `.env.test`; their values are intentionally omitted.

| Command | Result |
| --- | --- |
| `npm run lint:check` | Exit 0 |
| `npm run type-check:spec` | Exit 0 |
| `npm run verify:doc-links` | Exit 0 |
| `npm run test:db` with the environment-loading wrapper below | Exit 0; 1 suite and 6 tests passed |
| `npm run test:e2e` | Exit 0; 48 passed, 48 total suites; 638 passed, 638 total tests |

Exact command used for the successful database run:

```bash
node -e 'require("dotenv").config({path:".env.test",quiet:true}); const {spawnSync}=require("node:child_process"); const r=spawnSync("npm",["run","test:db"],{stdio:"inherit",env:process.env}); process.exit(r.status ?? 1)'
```

Captured database-suite summary:

```text
PASS: compiled output is runtime-loadable.
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
```

An initial final-gate invocation of `npm run test:db` without connection variables exited 1 with `test:db requires non-empty DB_HOST`; the successful run above supplied the required environment explicitly. This was a prerequisite failure, not detector behavior evidence.

A scratch-copy mutation changed the compiled detector's `synchronize: false` option to `synchronize: true`, retaining `migrationsRun: false`. Running the same Jest database config against that copy returned exit 1. The unmodified compiled detector passed as shown above. A subsequent read of `pg_database` for names matching `baseline_it_%` returned count 0, confirming no fixture databases remained after the successful and mutation runs. The temporary mutation runner and full logs were not preserved; these are captured result summaries.

Captured e2e summary:

```text
Test Suites: 48 passed, 48 total
Tests:       638 passed, 638 total
Snapshots:   0 total
```
