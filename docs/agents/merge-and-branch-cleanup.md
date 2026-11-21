# Merge and branch cleanup

## Before marking ready or merging

Complete both release sections in the [PR template](../../.github/pull_request_template.md) before marking a PR ready or merging it. Follow the [PR guidance](../../AGENTS.md#commit--pull-request-guidelines) for which fields to fill in.

- In **Breaking release**, set `Breaking change` to `yes` or `no` based on the change relative to the immediately preceding Release. For `yes`, confirm that the PR’s own commits call for a major Release and set `Upgrade documentation` to a repo-relative file path that exists in the merge result. For `no`, supply an existing repo-relative file path or `N/A: <reason>`. Review the full Release preview for what the merge will publish.
- In **Release boundary**, check `Mergeable independently` and `Must ship together` against the ticket. Honor integration-only constraints even when CI passes.
- For an approved Maintainer exception, record the decision on the parent issue. Set `Applicable ADR` to an existing `docs/adr/NNNN-*.md` file in the merge result, or use `None: <reason>` for a non-breaking exception without an ADR. Use a permalink to the decision comment or review in this repository for `Release-impact decision`. Update affected open tickets with links to the components that merged and preserve their remaining integration-only constraints.

A Maintainer exception authorizes crossing the Release boundary only. An incorrectly classified Release still blocks the merge. Required checks and any required upgrade documentation still apply.

### Before deleting a branch after an exception merge

Add a carry-forward entry on the parent issue before deleting the topic or integration branch. Record the next base branch, the remaining open tickets, and outstanding combined verification. Link the merged PR and the recorded exception. Confirm that pending integration tests target a future branch based on updated `main`, then proceed with cleanup.

## Merge and cleanup procedure

1. From the PR's topic branch, confirm the checkout is clean with `git status --short --branch --untracked-files=normal --ignore-submodules=none`. Confirm the PR targets `main` in the repository on `origin`, and that the local branch and its tip match the PR's head branch and commit. If either check fails, stop and report what needs attention.
2. Set `pr` to the PR number and merge from that checkout. Use a merge commit, the merge method enabled in this repository's GitHub settings.

   ```bash
   gh pr merge "$pr" --merge --match-head-commit "$(git rev-parse HEAD)"
   ```

   If the PR is queued, wait until GitHub reports it as merged. If it has already merged, start at step 3.

3. For an exception merge, complete the [carry-forward entry](#before-deleting-a-branch-after-an-exception-merge). Run cleanup from the topic checkout once the PR is merged and any carry-forward entry is recorded.

   ```bash
   bash scripts/cleanup-merged-pr.sh "$pr"
   ```

   Cleanup confirms the merge is on `origin/main`, switches to local `main` and fast-forwards it, then removes the PR's topic branch locally and on `origin`. If the checkout has no local `main`, cleanup creates it from `origin/main`. A branch GitHub already removed from `origin` counts as cleaned up.

If cleanup reports a blocker, preserve the work and report the Git error or the branch state that prevented cleanup. Once resolved, rerun the cleanup command for the same PR. If it already switched to `main`, retry from there.
