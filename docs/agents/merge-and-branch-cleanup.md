# Merge and branch cleanup

## Worktrees

Before creating or repurposing a worktree, state its path, branch and purpose. Reuse a suitable existing checkout from `git worktree list` when one is available. Name a long-lived integration checkout after its branch, such as `erp2-postgres-19` for `upgrade/postgres-19`, and a temporary implementation checkout after its ticket, such as `erp2-2071`.

## Merge a PR into `main`

1. From the PR's topic branch, confirm the checkout is clean with `git status --short --branch --untracked-files=normal --ignore-submodules=none`. Confirm the PR targets `main` in the repository on `origin`, and that the local branch and its tip match the PR's head branch and commit. If either check fails, stop and report what needs attention.
2. Set `pr` to the PR number, then merge and run cleanup from that checkout. Use a merge commit, the merge method enabled in this repository's GitHub settings.

   ```bash
   gh pr merge "$pr" --merge --match-head-commit "$(git rev-parse HEAD)" &&
     bash scripts/cleanup-merged-pr.sh "$pr"
   ```

   If the PR is queued, wait until GitHub reports it as merged and then run `bash scripts/cleanup-merged-pr.sh "$pr"` on its own. Use the cleanup command on its own for a PR that has already merged.
3. Cleanup confirms the merge is on `origin/main`, switches to local `main` and fast-forwards it, then removes the PR's topic branch locally and on `origin`. If the checkout has no local `main`, cleanup creates it from `origin/main`. A branch GitHub already removed from `origin` counts as cleaned up.

If cleanup reports a blocker, preserve the work and report the Git error or the branch state that prevented cleanup. Once resolved, rerun the cleanup command for the same PR. If it already switched to `main`, retry from there.

Once cleanup completes, report the worktree-to-branch mapping from `git worktree list`.

## Ticket PRs into an integration branch

`scripts/cleanup-merged-pr.sh` accepts only PRs merged into `main`. For a ticket PR into an [integration branch](../../AGENTS.md#commit--pull-request-guidelines), follow the cleanup procedure approved in its initiative or ticket, such as the manual topic-branch cleanup in [#2064](https://github.com/blur88/erp2/issues/2064). Keep each of its safety checks, and preserve dirty worktrees and uncommitted changes. Once cleanup completes, report the worktree-to-branch mapping.
