# Merge and branch cleanup

## Worktrees

Before creating or repurposing a worktree, state its path, branch and purpose. Reuse a suitable existing checkout from `git worktree list` when one is available. Name a long-lived integration checkout after its branch, such as `erp2-postgres-19` for `upgrade/postgres-19`, and a temporary implementation checkout after its ticket, such as `erp2-2071`.

Reserve the designated primary deployment checkout, the directory the running stack is deployed from, for `main`. Use separate worktrees for topic and integration branches. Before live operator commands, confirm the deployment directory, the intended branch, no tracked changes (`git status --porcelain --untracked-files=no` prints nothing), and that `git rev-parse HEAD` is the approved deployment revision. When the procedure needs the current `main`, run `git fetch origin main` and require `HEAD` to equal `origin/main`. Intentional pinned-release and rollback procedures keep their pinned revision; compare against that instead. Stop on unexpected divergence or local changes. Never reset, force-switch or overwrite deployment work automatically.

## Merge a PR into `main`

1. From the PR's topic branch, confirm the checkout is clean with `git status --short --branch --untracked-files=normal --ignore-submodules=none`. Confirm the PR targets `main` in the repository on `origin`, and that the local branch and its tip match the PR's head branch and commit. If either check fails, stop and report what needs attention.
2. Set `pr` to the PR number, then merge and run cleanup from that checkout. Use a merge commit, the merge method enabled in this repository's GitHub settings.

   ```bash
   gh pr merge "$pr" --merge --match-head-commit "$(git rev-parse HEAD)" &&
     bash scripts/cleanup-merged-pr.sh "$pr"
   ```

   When `main` is checked out in another worktree, such as the primary deployment checkout, cleanup cannot switch to it from the topic worktree. Run only the `gh pr merge` command there. Once the PR has merged and the topic worktree is clean, run `git switch --detach` in it, then run the cleanup command from the `main` checkout. Cleanup fast-forwards that checkout, so wait while a live procedure or pinned release is using it.

   If the PR is queued, wait until GitHub reports it as merged and then run `bash scripts/cleanup-merged-pr.sh "$pr"` on its own. Use the cleanup command on its own for a PR that has already merged.
3. Cleanup confirms the merge is on `origin/main`, switches to local `main` and fast-forwards it, then removes the PR's topic branch locally and on `origin`. If the checkout has no local `main`, cleanup creates it from `origin/main`. A branch GitHub already removed from `origin` counts as cleaned up.

If cleanup reports a blocker, preserve the work and report the Git error or the branch state that prevented cleanup. Once resolved, rerun the cleanup command for the same PR. If it already switched to `main`, retry from there.

Once cleanup completes, report the worktree-to-branch mapping from `git worktree list`.

## Ticket PRs into an integration branch

Use this procedure for a ticket PR merged into an [integration branch](../../AGENTS.md#commit--pull-request-guidelines). Run it from the ticket checkout after the merge. Set `pr` to the ticket PR number and `integ` to its integration base branch.

```bash
pr=2094
integ=upgrade/postgres-19
(
  stop() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

  # 1. The PR merged into the intended integration branch, from this repository.
  meta=$(gh pr view "$pr" --json state,baseRefName,headRefName,headRefOid,isCrossRepository,mergeCommit \
    --jq '[.state,.baseRefName,.headRefName,.headRefOid,.isCrossRepository,.mergeCommit.oid]|@tsv') \
    || stop "cannot read PR $pr"
  IFS=$'\t' read -r state base topic head cross merge <<<"$meta"
  [[ $state == MERGED ]] || stop "PR $pr is $state, not MERGED"
  [[ $base == "$integ" ]] || stop "PR $pr targets $base, not $integ"
  [[ $cross == false ]] || stop "PR $pr comes from a fork"
  [[ -n $merge ]] || stop "PR $pr has no merge commit"
  [[ -n $topic && $topic != main && $topic != "$integ" ]] || stop "unexpected topic branch '$topic'"

  # 2. This checkout is clean, on the topic branch, and the topic still matches the merged PR head.
  [[ -z $(git status --porcelain --untracked-files=normal --ignore-submodules=none) ]] \
    || stop "this checkout has uncommitted or untracked changes"
  current=$(git symbolic-ref --quiet --short HEAD) || stop "this checkout is detached; run from the topic checkout"
  [[ $current == "$topic" ]] || stop "this checkout is on $current, not $topic"
  [[ $(git rev-parse --verify --quiet "refs/heads/$topic") == "$head" ]] \
    || stop "local $topic does not match the merged PR head $head"
  remote_tip=$(git ls-remote --refs origin "refs/heads/$topic") || stop "cannot read origin"
  remote_tip=${remote_tip%%[[:space:]]*}
  [[ -z $remote_tip || $remote_tip == "$head" ]] || stop "origin/$topic is $remote_tip, not the merged PR head $head"
  [[ $(git worktree list --porcelain | grep -cx "branch refs/heads/$topic") == 1 ]] \
    || stop "$topic is checked out in another worktree"

  # 3. The merge commit is on the remote integration branch.
  git fetch --no-tags origin "+refs/heads/$integ:refs/remotes/origin/$integ" || stop "cannot fetch $integ"
  git merge-base --is-ancestor "$merge" "refs/remotes/origin/$integ" || stop "merge $merge is not on origin/$integ"
  target=$(git rev-parse "refs/remotes/origin/$integ")

  # 4. Bring the integration branch to the remote tip, fast-forward only.
  integ_wt=$(git worktree list --porcelain \
    | awk -v want="branch refs/heads/$integ" '/^worktree /{path=substr($0, 10)} $0 == want {print path}')
  if [[ -n $integ_wt ]]; then
    # It lives in its own worktree: update it in place, and detach this checkout at the same commit.
    [[ -z $(git -C "$integ_wt" status --porcelain --untracked-files=normal --ignore-submodules=none) ]] \
      || stop "$integ_wt has uncommitted or untracked changes"
    git -C "$integ_wt" merge --ff-only --no-autostash "refs/remotes/origin/$integ" \
      || stop "$integ in $integ_wt cannot fast-forward to origin/$integ"
    [[ $(git -C "$integ_wt" rev-parse HEAD) == "$target" ]] || stop "$integ_wt is not at $target"
    git switch --detach "$target" || stop "cannot detach this checkout at $target"
  elif git show-ref --verify --quiet "refs/heads/$integ"; then
    git switch --no-overwrite-ignore "$integ" || stop "cannot switch to $integ"
    git merge --ff-only --no-autostash "refs/remotes/origin/$integ" || stop "$integ cannot fast-forward to origin/$integ"
  else
    git switch --no-overwrite-ignore -c "$integ" "refs/remotes/origin/$integ" || stop "cannot create $integ"
  fi
  [[ $(git rev-parse HEAD) == "$target" ]] || stop "this checkout is not at $target"

  # 5. Delete only this ticket's topic branch, now that every check has passed.
  git merge-base --is-ancestor "$head" HEAD || stop "$head is not contained in HEAD"
  if [[ -n $remote_tip ]]; then
    git push --force-with-lease="refs/heads/$topic:$head" origin ":refs/heads/$topic" \
      || stop "cannot delete origin/$topic"
  fi
  git branch -d -- "$topic" || stop "git branch -d refused $topic"

  # 6. Report what actually happened.
  printf 'merge %s on origin/%s; integration tip %s; deleted %s (was %s)\n' "$merge" "$integ" "$target" "$topic" "$head"
  checkout=$(git rev-parse --show-toplevel) || stop "cannot determine this checkout's path"
  checkout_branch=$(git symbolic-ref --quiet --short HEAD) || checkout_branch='detached HEAD'
  printf 'Checkout %s (%s) at %s\n' "$checkout" "$checkout_branch" "$(git rev-parse HEAD)"
  main_wt=$(git worktree list --porcelain \
    | awk '/^worktree /{path=substr($0, 10)} $0 == "branch refs/heads/main" {print path}')
  if [[ -n $main_wt && $main_wt != "$checkout" ]]; then
    printf 'To return to main, use %s\n' "$main_wt"
  elif [[ $checkout_branch != main ]]; then
    printf 'To return to main, run git switch main\n'
  fi
  git worktree list
)
```

Inspect the worktree list for leftover ticket checkouts. For each one, report its path, branch or detached state, HEAD, and any uncommitted or untracked changes. Use `git -C <path> status --short --branch --untracked-files=normal --ignore-submodules=none` and `git -C <path> rev-parse HEAD`. Keep leftover worktrees in place during cleanup. Get explicit authorization before removing any worktree that contains user work.

When syncing `main` into `upgrade/postgres-19`, follow the [integration sync guidance in #2062](https://github.com/blur88/erp2/issues/2062#issuecomment-7191860249).
