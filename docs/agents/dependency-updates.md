# Dependency updates

1. Inspect manifests and lockfiles in the affected directories, including the
   repository root. The root `package.json` owns release-tooling dependencies;
   inspect `release.config.cjs` and its helpers when updating them.
2. Choose targets within each installed major explicitly. For an exact pin,
   `npm outdated` reports `Wanted` equal to `Current`; `Latest` may cross majors.
   From the package directory, use `npm view '<package>@<major>' version --json`
   to list published versions in that major, choose the highest stable version,
   and preserve the manifest's pinning style. Review upstream release notes and
   engine/peer requirements before installing the selected version.
   Before filing a deferred-upgrade issue, try each proposed fix against the
   target dependency version using the smallest reproduction that exercises it.
   Check repository-specific values, such as breakpoints, against the relevant
   source. Record the reproduction and its result in the issue. If a proposed
   fix could not be tried, label it **untested** and present it as a hypothesis.
   Keep acceptance criteria focused on the behaviour the upgrade must preserve.
3. Review [backend override reasons](dependency-overrides.md) before changing
   backend dependencies. Keep exact overrides aligned with direct pins to avoid
   `EOVERRIDE`; check whether an override prevents a desired security fix.
4. Regenerate the affected lockfile with npm, then inspect its diff for changed
   resolved versions, including transitive major bumps. Run `npm explain <package>`
   from that directory to identify each parent responsible for a surprising
   change and whether an override forced it. Account for every changed resolution
   and keep unrelated churn out of the update.
   If a resolved version of `@mui/material`, `jsdom` or `vitest` changes, follow
   [Statement Theme QA](../modules/accounting/STATEMENT_THEME_QA.md) and repeat
   the relevant probes under the new resolved versions, even when no Statement
   test changes. Keep earlier measurements as dated history, record the new
   versions and observed results in the PR, and add a dated note to the QA
   document when the findings change.
5. Before changing BullMQ or ioredis, read the
   [BullMQ scheduler runbook](../deployment/BULLMQ_SCHEDULER_RUNBOOK.md).
   The setup instructions printed by
   [`backend/scripts/preflight-redis-test.sh`](../../backend/scripts/preflight-redis-test.sh)
   describe a disposable Redis and the explicit write opt-in; consult them before
   preparing the integration-test environment.
6. Select verification and collect evidence using
   [AGENTS.md's Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr).
