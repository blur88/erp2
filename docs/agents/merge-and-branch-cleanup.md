# Merge and branch cleanup

## Before marking ready or merging

Check the related ticket for a release boundary. Where one applies, verify the
PR’s recorded `Mergeable independently`, `Must ship together`, and
`Maintainer decision` fields against the ticket and resolve any missing or
conflicting details before proceeding. If a maintainer authorizes an exception,
record the decision and a link to it in the PR before proceeding. Honor any
integration-only release boundary even when CI passes.

## Merge and cleanup procedure

1. From the PR's topic branch, confirm the checkout is clean with `git status --short --branch --untracked-files=normal --ignore-submodules=none`. Confirm the PR targets `main` in the repository on `origin`, and that the local branch and its tip match the PR's head branch and commit. If either check fails, stop and report what needs attention.
2. Set `pr` to the PR number, then merge and run cleanup from that checkout. Use a merge commit, the merge method enabled in this repository's GitHub settings.

   ```bash
   gh pr merge "$pr" --merge --match-head-commit "$(git rev-parse HEAD)" &&
     bash scripts/cleanup-merged-pr.sh "$pr"
   ```

   If the PR is queued, wait until GitHub reports it as merged and then run `bash scripts/cleanup-merged-pr.sh "$pr"` on its own. Use the cleanup command on its own for a PR that has already merged.
3. Cleanup confirms the merge is on `origin/main`, switches to local `main` and fast-forwards it, then removes the PR's topic branch locally and on `origin`. If the checkout has no local `main`, cleanup creates it from `origin/main`. A branch GitHub already removed from `origin` counts as cleaned up.

If cleanup reports a blocker, preserve the work and report the Git error or the branch state that prevented cleanup. Once resolved, rerun the cleanup command for the same PR. If it already switched to `main`, retry from there.
