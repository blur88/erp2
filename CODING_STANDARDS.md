# Coding standards

1. New shell scripts start with a short comment describing their purpose, plus the related issue reference where there is one. Scripts without a related issue do not need an issue number.
2. Extract nontrivial GitHub Actions `run:` logic (branching, failure handling, exit-status propagation) into testable scripts under `scripts/`, with tests under `scripts/__tests__/`.
3. Keep build-time-only code out of frontend runtime source directories unless there is a justified architectural reason.
4. Agent-facing documentation (AGENTS.md, CLAUDE.md, docs/agents/) must use tool-neutral instructions unless explicitly scoped to a specific agent or environment; link to the authoritative document instead of duplicating its requirements; keep session-specific validation evidence in PRs, with the [pre-PR integration ticket exception](#integration-ticket-evidence); and place guidance pointers where agents encounter the relevant workflow or decision.
5. When adding or changing a guard that protects work before a destructive script operation, give each independently blocking condition its own test and assert that the protected work or ref is preserved. See the [worktree tests](https://github.com/blur88/erp2/blob/8dc76fca44b47b23867744d10208ceb9e583f3b7/scripts/__tests__/cleanup-merged-pr.test.js#L172-L200) from [PR #1938](https://github.com/blur88/erp2/pull/1938).

## Integration ticket evidence

- When ticket implementation lands on an integration branch before a PR is open, record the implementation SHA, exact verification commands, exit statuses, results, and evidence links in a comment on the relevant ticket.
- Before CI evidence is available, quote the actual verification result summary in the ticket comment. Include the tested SHA, exact command, exit status, test counts, skips, and any relevant failing tests. A local `/tmp` path records where the output was saved and is inaccessible to other reviewers. Where possible, attach a sanitized log artifact or include reproduction steps with the command. Never publish secrets.
- Link the ticket evidence comments from the final integration PR. Treat those comments as historical evidence and follow [Change-Scoped Verification](AGENTS.md#change-scoped-verification-required-before-pr) for the final integration head.

## Acceptance-criterion evidence in reviews

- Before assessment begins, give each reviewer assignment the reviewed SHA, PR URL when available, exact verification commands, exit statuses, results, and accessible log paths or CI links. Include any remaining evidence gaps.
- Report an earlier successful run and a rerun blocked by insufficient disk space (`ENOSPC`) or another environmental failure as separate results. Identify the acceptance criteria supported by the earlier evidence wherever it still applies. Mark checks blocked before or during execution **Unverified**. Evidence of a product regression requires a run that reaches the behavior under test.
- Review every applicable acceptance criterion individually. For each criterion, distinguish **Implemented** (the relevant implementation exists), **Demonstrated** (the required behavior is supported by valid execution or test evidence), and **Unverified** (evidence is missing, incomplete, stale, or insufficient). An implemented criterion may still lack the evidence required to demonstrate it.
- Cite concrete evidence for each criterion, such as source locations, test results, CI links, or reproducible commands.
- A PR-body probe can demonstrate observed behavior, but required regression coverage stays **Unverified** until a committed spec passes on the reviewed head.
- A rejected dependency fixture demonstrates the intended failure when it exits with the expected status and names the incompatible dependency. A setup error or a run that executes zero tests leaves the intended failure unverified.
- Claims that motivate a behavioral change must cite the installed library implementation, directly relevant test evidence, or a focused reproducer. Mark unsupported claims as **Unverified**.
- Stub-based evidence covers only the behaviour exercised against the stub; a criterion about a real component (a server, proxy, database or deployed stack) requires evidence from that component.
- When a negative acceptance criterion depends on observing that an event did not happen, require a positive control that shows the same observation channel detects the event when it occurs. Validate the channel before treating an empty log, a missing header, or an absent file as evidence. In #1973, an accepted request had to appear in the stub backend request log, and a valid hostname had to produce a rendered file in the mounted output directory. Direct, deterministic assertions with an established observation mechanism are exempt. [Issue #1973](https://github.com/blur88/erp2/issues/1973)
- Synthetic process waits do not demonstrate real CI behavior. A documentation link alone does not prove that an agent encounters an instruction at the correct workflow stage.
- For agent-facing documentation, verify when and how the intended reader encounters the instruction.
- Before reporting, refresh pending checks and confirm that the evidence still applies to the reviewed SHA. If the PR head moved, identify the reviewed SHA and flag which conclusions need reassessment.
- Never report complete acceptance-criterion coverage when required evidence is missing.
- When behavior depends on omitted fields, defaults, or coercion, verify it through `createGlobalValidationPipe()` directly or through an HTTP test that uses it; see [the backup schedule HTTP test](backend/src/modules/backup/backup-schedule.http.spec.ts).
