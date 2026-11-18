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
   Verify values the fix relies on against the repository configuration or
   implementation that defines them. Record the reproduction and its result in
   the issue. If a proposed fix could not be tried, describe it as an untested
   hypothesis in the issue body.
   State acceptance criteria as invariants of the resolved dependency tree or
   application behaviour so they still apply if the fix removes a transitive
   dependency.
3. Review [backend override reasons](dependency-overrides.md) before changing
   backend dependencies. Keep exact overrides aligned with direct pins to avoid
   `EOVERRIDE`; check whether an override prevents a desired security fix.
4. Regenerate the affected lockfile with npm, then inspect its diff for changed
   resolved versions, including transitive major bumps. Run `npm explain <package>`
   from that directory to identify each parent responsible for a surprising
   change and whether an override forced it. Account for every changed resolution
   and keep unrelated churn out of the update.

   When adding, changing, or removing an override, identify every direct
   consumer whose resolved dependency changes and inspect its installed call
   sites. For each distinct relevant API use of each affected consumer, cite an
   existing committed spec or add a spec that exercises the installed consumer
   against the resulting dependency tree. Put new cross-module compatibility
   specs in `backend/test/unit/dependency-*.spec.ts` by default.

   When repeatable consumer compatibility coverage is required, include any
   new committed specs or reference the existing committed specs in the opening
   PR revision. After CI completes, cite each spec and its CI result for the
   tested head SHA in the PR. Record one-off investigation output in the PR as
   supporting evidence.

   If a resolved version of `@mui/material`, `jsdom` or `vitest` changes, follow
   [Statement QA's automated coverage and styling invariants](../modules/accounting/STATEMENT_THEME_QA.md#automated-coverage-and-styling-invariants)
   and repeat its computed-style probes under the new resolved versions, even
   when no Statement test changes. If the upgrade affects Statement's browser
   rendering, also run the applicable ST-1 through ST-13 browser checks in that
   document. Keep earlier measurements as dated history, record the new versions
   and observed results in the PR, and add a dated note to the QA document when
   the findings change.
5. Before changing BullMQ or ioredis, read the
   [BullMQ scheduler runbook](../deployment/BULLMQ_SCHEDULER_RUNBOOK.md).
   The setup instructions printed by
   [`backend/scripts/preflight-redis-test.sh`](../../backend/scripts/preflight-redis-test.sh)
   describe a disposable Redis and the explicit write opt-in; consult them before
   preparing the integration-test environment.
6. Select verification and collect evidence using
   [AGENTS.md's Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr).
