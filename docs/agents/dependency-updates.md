# Dependency updates

1. Use a dedicated Git worktree for dependency updates, following
   [Worktrees](merge-and-branch-cleanup.md#worktrees). Inspect manifests and
   lockfiles in the affected directories, including the repository root. The root `package.json` owns release-tooling dependencies;
   inspect `release.config.cjs` and its helpers when updating them.
2. Choose targets within each installed major explicitly. For an exact pin,
   `npm outdated` reports `Wanted` equal to `Current`; `Latest` may cross majors.
   From the package directory, use `npm view '<package>@<major>' version --json`
   to list published versions in that major, choose the highest stable version,
   and preserve the manifest's pinning style. Review upstream release notes and
   engine/peer requirements before installing the selected version. When a GitHub
   release only links to a changelog, run `npm pack <package>@<version>` in a
   temporary directory and read `package/CHANGELOG.md` from the tarball.

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
   resolved versions, including transitive major bumps. Run
   `npm explain <installed-package-path>` from that directory for each relevant
   copy to identify its parent and whether an override forced the resolution.
   Account for every changed resolution and keep unrelated churn out of the
   update. Resolve unexpected changes before continuing. From the repository root,
   run `node scripts/report-lockfile-changes.cjs staged` immediately before each
   commit and check the staged resolutions again. The report lists
   semantic-version downgrades first as `DOWNGRADED` and does not fail on
   them. The process that rewrote the lockfiles
   around 01:10 (+0800) on 2026-11-20 remains unidentified.

   For a security fix that changes a dependency resolution, verify each affected
   version against the advisory range on the PR head. Dependabot alert status
   can lag the resolved tree. To corroborate what GitHub has indexed, check the
   repository's Dependency Graph or use the
   [asynchronous SBOM export](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/export-dependencies-as-sbom#exporting-a-software-bill-of-materials-for-your-repository-using-the-rest-api).
   Run the same regression assertion against the previous and patched
   resolutions. Record in the PR that it rejects the previous version on the
   expected affected path and accepts the patched version. Keep consumer
   compatibility tests for a major upgrade.

   For example, the [test-exclude compatibility spec](../../backend/test/unit/dependency-test-exclude.spec.ts)
   checks the installed minimatch version and exercises coverage file selection.

   When adding, changing, or removing an override, identify every direct
   consumer whose resolved dependency changes. Before recording an exception,
   identify the direct consumer whose declared range excludes the resolved
   version, even if the override is unchanged. Inspect each affected consumer's
   installed call sites. In the opening PR revision, cite an existing committed
   spec or include a new committed spec for each distinct relevant API use of
   each affected consumer. The spec must exercise the installed consumer against
   the resulting dependency tree. Consumers with identical usage can share a
   spec that exercises each of them. Put new cross-module compatibility specs in
   `backend/test/unit/dependency-*.spec.ts` by default.

   After CI completes, cite each spec and its CI result for the tested PR head
   SHA in the PR. Record one-off probe results in the PR as supporting evidence.
   See [acceptance-criterion evidence in reviews](../../CODING_STANDARDS.md#acceptance-criterion-evidence-in-reviews).

   When the resolved version of `@mui/material`, `jsdom` or `vitest` changes,
   the frontend coverage suite in CI provides the
   [Statement computed-style verification](../modules/accounting/STATEMENT_THEME_QA.md#automated-coverage-and-styling-invariants).
   Use the same guide to determine when to run the ST-1 through ST-13 browser
   checks. Record the applicable browser results in the PR.
5. Before changing ioredis, read the
   [Redis operator runbook](../deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md)
   and apply the E2E verification requirements in AGENTS.md.
6. Select verification and collect evidence using
   [AGENTS.md's Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr).
   When batching related bumps, run focused local checks for each bump and use
   one full-suite CI run on the final PR head where it satisfies the applicable
   checks in that table. When writing the PR description,
   run `node scripts/report-lockfile-changes.cjs branch` from the repository
   root and use the report to account for the complete set of resolution changes.
   The command defaults to the merge base with local `main` and compares it with
   `HEAD`. Pass the PR base and head refs explicitly when needed.
