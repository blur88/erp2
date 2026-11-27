# Verification at implementation and review entry points

## Plan before editing

1. Identify the active skill and its owner from the loaded source path. See [Matt Pocock skill entry points](#matt-pocock-skill-entry-points) for that plugin. Read the issue or spec and the repository's [Testing Guidelines](../../AGENTS.md#testing-guidelines) and [Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr).
2. Search for existing regression tests and map them to each acceptance criterion.
   - Record the test path and behavior it covers, any new or updated test needed, and any behavior that needs a real component to verify. For criteria with no applicable automated test, record the planned manual verification.
   - When planning a runbook rehearsal, read [Runbook rehearsal evidence](../../CODING_STANDARDS.md#runbook-rehearsal-evidence).
   - For a destructive operation, plan tests from its actual risks. For example, fail the final step of a multi-step transaction to show that earlier changes roll back, as the [incoming-FK case](https://github.com/blur88/erp2/blob/72457d1f7b0e172d297ce456713e80d49ffc2b7e/backend/test/drop-application-backup-tables.e2e-spec.ts#L49-L71) in PR #2069 does. Or apply a repeatable cleanup and repeat it as a no-op, as its [Redis cleanup test](https://github.com/blur88/erp2/blob/72457d1f7b0e172d297ce456713e80d49ffc2b7e/scripts/__tests__/redis-cleanup-guards.test.js#L107-L116) does.
   - In a delegated implementation, give each implementer the relevant criteria and plan, then have them confirm the plan in their worktree before editing. Each implementer follows [Worktrees](merge-and-branch-cleanup.md#worktrees) when creating or repurposing one.
   - For Dockerfile package upgrades, see [Alpine package upgrade evidence](../deployment/DOCKER_SCOUT_BASE_IMAGE_RECOMMENDATIONS.md#alpine-package-upgrade-evidence).
3. Record the focused commands to use during implementation and the applicable final commands selected from the planned file changes. Follow [Verification waits](verification-waits.md) to choose local or CI execution for each applicable full suite. Use focused checks while editing and collect final verification on the review candidate. Revisit the plan when the changed files or criteria change.

## Resolve an issue-only review

Use this convention for `/code-review <issue-number>` and equivalent requests. An explicit starting commit or comparison range from the maintainer takes precedence.

1. Read the issue and its acceptance criteria. For a parent spec, resolve the child tickets (sub-issues) whose work is under review, usually the open ones with a PR, in its place.
2. Find the ticket's PR. Confirm each candidate by a head branch starting with the [issue-linked](../../AGENTS.md#commit--pull-request-guidelines) `<type>/<issue>-` prefix or a PR body reference that claims the work, such as `Closes #<issue>` or `Tracks #<issue>`. For a PR using `Refs #<issue>`, use the issue-linked branch prefix to confirm the claim. A number search or a passing mention alone also matches unrelated PRs. Without a PR, check the current branch, matching local and remote branches, `git worktree list`, and the target branch the ticket documents. Resolve refs in place and preserve the current checkout and uncommitted work.
3. Take the target from the PR's `baseRefName`, or without a PR from the ticket's documented target, such as an [integration branch](../../AGENTS.md#commit--pull-request-guidelines). Use `main` only when it is the intended target. Review the PR's `headRefOid` (or the branch head) and, after refreshing `origin/<target>`, record its merge base with that head as the fixed base SHA. For a merged PR, compute the merge base against the merge commit's first parent instead. Record both SHAs in the [shared review handoff](#hand-off-review-evidence).
4. Report any ambiguity that remains, such as no match, several plausible matches or an unclear target, instead of guessing.

## Hand off review evidence

1. Find the delegation step in the loaded review skill. Before dispatch, write one Markdown evidence snapshot to a temporary location both reviewers can access. Include the base and reviewed head SHAs, the issue or spec and its criteria, and the evidence required by [Acceptance-criterion evidence in reviews](../../CODING_STANDARDS.md#acceptance-criterion-evidence-in-reviews). Include each command's working directory and exit status or CI conclusion, plus any pending checks and gaps. Follow [Verification waits](verification-waits.md) to reuse the same completed runs.
2. Give each reviewer the same file path alongside their axis-specific brief and the linked evidence standards. Confirm both can read the file before assessment and keep it unchanged throughout the review round.
3. If required evidence is pending or missing, defer the affected assessment or mark both assignments **preliminary, code-only**. Preserve each reviewer's per-criterion verdicts when reporting.
4. Keep the initial independent Standards and Spec assessments. When the candidate SHA changes, inspect `git diff <previous> <new>` and map the changes to prior findings and affected criteria. Verify clearly non-substantive changes, such as wording or formatting, directly. Request focused independent re-review on the affected axes as needed. Changes to destructive commands, migrations, rollback behavior, security controls, or critical runbook steps require appropriate independent reassessment regardless of size. Repeat both full reviews if the changes invalidate substantial parts of the prior assessment or the risk cannot be bounded reliably.
   - When the candidate SHA or evidence changes, write a refreshed shared snapshot to a new file and use it for any reassessments. Record which earlier conclusions still apply, which were reassessed, and why. Attribute SHA-specific execution evidence to the revision it ran on and complete the required final-candidate verification.

## Matt Pocock skill entry points

The installed plugin's `implement`, `implement-spec`, and `code-review` skills rely on the agent's repository instructions to reach this handoff. [AGENTS.md](../../AGENTS.md#workflow-entry-points) provides the entry points, and [CLAUDE.md](../../CLAUDE.md) imports AGENTS.md so Claude Code loads them. The local copies of these skills under `.agents/skills/` are untracked and Git-ignored, and an agent can still load them. Apply the repository instructions with whichever copy loads. Maintain the handoff here and leave shared plugin and upstream installations untouched.
