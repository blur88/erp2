# Coding standards

1. New shell scripts start with a short comment describing their purpose, plus the related issue reference where there is one. Scripts without a related issue do not need an issue number.
2. Extract nontrivial GitHub Actions `run:` logic (branching, failure handling, exit-status propagation) into testable scripts under `scripts/`, with tests under `scripts/__tests__/`.
3. Keep build-time-only code out of frontend runtime source directories unless there is a justified architectural reason.
4. Agent-facing documentation (AGENTS.md, CLAUDE.md, docs/agents/) must use tool-neutral instructions unless explicitly scoped to a specific agent or environment; link to the authoritative document instead of duplicating its requirements; keep session-specific validation evidence in PRs rather than reusable instructions; and place guidance pointers where agents encounter the relevant workflow or decision.
5. When adding or changing a guard that protects work before a destructive script operation, give each independently blocking condition its own test and assert that the protected work or ref is preserved. See the [worktree tests](https://github.com/blur88/erp2/blob/8dc76fca44b47b23867744d10208ceb9e583f3b7/scripts/__tests__/cleanup-merged-pr.test.js#L172-L200) from [PR #1938](https://github.com/blur88/erp2/pull/1938).

## Acceptance-criterion evidence in reviews

- Before assessment, collect the PR URL, reviewed head SHA, and applicable verification commands with their actual results and evidence links. For work without a PR, use the reviewed commit and available local results.
- Review every applicable acceptance criterion individually. For each criterion, distinguish **Implemented** (the relevant implementation exists), **Demonstrated** (the required behavior is supported by valid execution or test evidence), and **Unverified** (evidence is missing, incomplete, stale, or insufficient). An implemented criterion may still lack the evidence required to demonstrate it.
- Cite concrete evidence for each criterion, such as source locations, test results, CI links, or reproducible commands.
- A PR-body probe can demonstrate observed behavior, but required regression coverage stays **Unverified** until a committed spec passes on the reviewed head.
- A rejected dependency fixture demonstrates the intended failure when it exits with the expected status and names the incompatible dependency. A setup error or a run that executes zero tests leaves the intended failure unverified.
- Claims that motivate a behavioral change must cite the installed library implementation, directly relevant test evidence, or a focused reproducer. Mark unsupported claims as **Unverified**.
- For a removed HTTP route, name its original method and path, such as `GET /api/backup/list` for #2064. Establish that the route exists on the baseline and is absent on the candidate. An HTTP request against each demonstrates this. Describe source inspection as a route diff, not as HTTP execution.
- Synthetic process waits do not demonstrate real CI behavior. A documentation link alone does not prove that an agent encounters an instruction at the correct workflow stage.
- For agent-facing documentation, verify when and how the intended reader encounters the instruction.
- Before reporting, refresh pending checks and confirm that the evidence still applies to the reviewed SHA. If the PR head moved, identify the reviewed SHA and flag which conclusions need reassessment.
- Never report complete acceptance-criterion coverage when required evidence is missing.
- When behavior depends on omitted fields, defaults, or coercion, verify it through `createGlobalValidationPipe()` directly or through an HTTP test that uses it; see [the backup schedule HTTP test](backend/src/modules/backup/backup-schedule.http.spec.ts).

### Runbook rehearsal evidence

**During rehearsal**, extract and execute the applicable blocks directly from the runbook at the candidate commit, in documented order. When phases require continuity, use the same disposable stack for cutover, verification, and rollback. Distinguish mandatory steps from documented alternatives and identify which alternatives were exercised. You may use recorded setup and adapters around the blocks. Execute the documented blocks themselves to preserve their behavior. For heading-based extraction, see [`bashBlock()` in the PostgreSQL 19 runbook guard test](https://github.com/blur88/erp2/blob/895a9674cdcc612231a195092c22f5179d07b4ec/scripts/__tests__/postgres19-upgrade-runbook-guards.test.js#L25) from [PR #2087](https://github.com/blur88/erp2/pull/2087).

Record evidence as you run in one Markdown report in a temporary location both reviewers can access. Use the report as the source for the shared reviewer snapshot and PR evidence. Include the following details.

- For each verification command, record the command, working directory, revision, exit status, sanitized relevant output, and environment identity where applicable. Label follow-up probes separately from original execution results.
- Record the reviewed revision, the runbook checksum, the exact blocks executed and their checksums, and the disposable environment used for each phase.
- Record setup and adapters, including seed data, fixture databases, and how confirmations or root commands were supplied.

**During review**, inspect the actual rehearsal driver and execution transcript. Extract and compare the reviewed runbook blocks to establish block identity. Block identity alone is insufficient to demonstrate execution or required stack continuity. Verify documented order from the execution results and same-stack continuity from phase-specific environment evidence. Apply the **Unverified** definition above to gaps in required rehearsal evidence. Mark affected criteria **Unverified** when execution materially differs from the documented procedure, including when substitute scripts change its behavior.
