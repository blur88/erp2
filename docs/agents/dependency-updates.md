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
3. Review [backend override reasons](dependency-overrides.md) before changing
   backend dependencies. Keep exact overrides aligned with direct pins to avoid
   `EOVERRIDE`; check whether an override prevents a desired security fix.
4. Regenerate the affected lockfile with npm, then inspect its diff for changed
   resolved versions, including transitive major bumps. Run `npm explain <package>`
   from that directory to identify each parent responsible for a surprising
   change and whether an override forced it. Account for every changed resolution
   and keep unrelated churn out of the update.
5. Before changing BullMQ or ioredis, read the
   [BullMQ scheduler runbook](../deployment/BULLMQ_SCHEDULER_RUNBOOK.md).
   The setup instructions printed by
   [`backend/scripts/preflight-redis-test.sh`](../../backend/scripts/preflight-redis-test.sh)
   describe a disposable Redis and the explicit write opt-in; consult them before
   preparing the integration-test environment.
6. Select verification and collect evidence using
   [AGENTS.md's Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr).
