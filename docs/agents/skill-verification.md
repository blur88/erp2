# Verification at implementation and review entry points

## Plan before editing

1. Identify the active skill and its owner from the loaded source path. See [Matt Pocock skill entry points](#matt-pocock-skill-entry-points) for that plugin. Read the issue or spec and the repository's [Testing Guidelines](../../AGENTS.md#testing-guidelines) and [Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr).
2. Search for existing regression tests and map them to each acceptance criterion. Record the test path and behavior it covers, any new or updated test needed, and any behavior that needs a real component to verify. For criteria with no applicable automated test, record the planned manual verification. In a delegated implementation, give each implementer the relevant criteria and plan, then have them confirm the plan in their worktree before editing. For Dockerfile package upgrades, see [Alpine package upgrade evidence](../deployment/DOCKER_SCOUT_BASE_IMAGE_RECOMMENDATIONS.md#alpine-package-upgrade-evidence).
3. Record the focused commands to use during implementation and the applicable final commands selected from the planned file changes. Follow [Verification waits](verification-waits.md) to choose local or CI execution for each applicable full suite. Use focused checks while editing and collect final verification on the review candidate. Revisit the plan when the changed files or criteria change.

## Resolve an issue-only review

Use this convention for `/code-review <issue-number>` and equivalent requests. An explicit starting commit or comparison range from the maintainer takes precedence.

1. Read the issue and its acceptance criteria.
2. Prefer the current branch if its name matches `<type>/<issue>-<slug>`. Otherwise, look for a unique matching local or remote branch. Report the ambiguity if no branch matches or several remain plausible. Resolve refs in place and preserve the current checkout and uncommitted work.
3. Refresh `origin/main` and resolve it and the selected branch head to SHAs. Compute their merge base and record it as the fixed base SHA, together with the reviewed head SHA, in the [shared review handoff](#hand-off-review-evidence).

## Hand off review evidence

1. Find the delegation step in the loaded review skill. Before dispatch, prepare one fixed snapshot with the base and reviewed head SHAs, the issue or spec and its criteria, and the evidence required by [Acceptance-criterion evidence in reviews](../../CODING_STANDARDS.md#acceptance-criterion-evidence-in-reviews). Include each command's working directory and exit status or CI conclusion, plus any pending checks and gaps. Follow [Verification waits](verification-waits.md) to reuse the same completed runs.
2. If required evidence is pending or missing, defer the affected assessment or mark both assignments **preliminary, code-only**. Send both reviewers the same snapshot verbatim or by fixed reference, alongside their axis-specific briefs and the linked evidence standards. Preserve each reviewer's per-criterion verdicts when reporting.
3. If the reviewed SHA changes, discard verification claims tied to the previous SHA. After a SHA change or newly completed verification, give both reviewers a refreshed snapshot and refresh both assessments.

## Matt Pocock skill entry points

The installed plugin's `implement`, `implement-spec`, and `code-review` skills rely on the agent's repository instructions to reach this handoff. [AGENTS.md](../../AGENTS.md#workflow-entry-points) provides the entry points, and [CLAUDE.md](../../CLAUDE.md) points Claude Code to them. The local copies of these skills under `.agents/skills/` are untracked and Git-ignored, and an agent can still load them. Apply the repository instructions with whichever copy loads. Maintain the handoff here and leave shared plugin and upstream installations untouched.
