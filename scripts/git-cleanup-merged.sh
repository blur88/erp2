#!/usr/bin/env bash
# Cleans up local branches after their pull requests merge (#1811).
#
# Run from the clone that performed the merge, once GitHub has merged the PR.
# GitHub deletes the remote head branch on merge. This script deletes the local
# copy and moves the checkout to main when it was sitting on a merged branch.
# It never force-deletes, and it keeps any branch it cannot prove is merged.
#
# Usage: scripts/git-cleanup-merged.sh [--dry-run]
#
# --dry-run runs every check and prints the plan. It still fetches origin,
# which only updates remote-tracking refs. It changes no local branch and no
# working tree.
#
# Exit status:
#   0  cleanup finished. Skipped branches are reported, not failures.
#   1  fetch failed, a dirty tree blocks the run, local main cannot
#      fast-forward to origin/main, or git branch -d refused a branch.
#   2  usage error.

set -u

DRY_RUN=0

usage() {
  echo "usage: $(basename "$0") [--dry-run]" >&2
}

die() {
  echo "git-cleanup-merged: $*" >&2
  exit 1
}

if [ $# -gt 1 ]; then
  usage
  exit 2
fi
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=1 ;;
  *) usage; exit 2 ;;
esac

git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"

# CANDIDATES holds branches that passed every classification check so far.
# SKIPPED entries are "branch: reason" and are printed in the summary.
CANDIDATES=()
SKIPPED=()
DELETED=()

is_candidate() {
  local item
  for item in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
    [ "$item" = "$1" ] && return 0
  done
  return 1
}

drop_candidate() {
  local item kept=()
  for item in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
    [ "$item" = "$1" ] || kept+=("$item")
  done
  CANDIDATES=(${kept[@]+"${kept[@]}"})
}

skip() {
  SKIPPED+=("$1: $2")
}

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] No local branch or working tree will be changed."
fi

echo "Fetching origin with --prune..."
git fetch --prune origin || die "fetch from origin failed. No local branches were changed."

git rev-parse --verify -q refs/remotes/origin/main >/dev/null \
  || die "origin/main does not exist. No local branches were changed."

main_exists=0
if git show-ref --verify -q refs/heads/main; then
  main_exists=1
  git merge-base --is-ancestor refs/heads/main origin/main \
    || die "local main has commits that are not in origin/main. Resolve that first. No local branches were changed."
fi

current="$(git symbolic-ref --quiet --short HEAD || true)"
worktree_branches="$(git worktree list --porcelain | sed -n 's|^branch refs/heads/||p')"

# A branch checked out in another worktree cannot be deleted or switched to.
# The current checkout is not "another" worktree, so it is excluded here.
branch_in_other_worktree() {
  [ "$1" != "$current" ] && printf '%s\n' "$worktree_branches" | grep -Fxq -- "$1"
}

# Field 3 is "[gone]" when the configured upstream no longer exists on origin.
while IFS=$'\t' read -r branch upstream track; do
  case "$branch" in
    main|master) continue ;;
  esac
  if branch_in_other_worktree "$branch"; then
    skip "$branch" "checked out in another worktree"
  elif [ -z "$upstream" ]; then
    skip "$branch" "no upstream configured"
  elif [ "$track" != "[gone]" ]; then
    skip "$branch" "upstream $upstream still exists"
  elif ! git merge-base --is-ancestor "refs/heads/$branch" origin/main; then
    skip "$branch" "has commits not in origin/main"
  else
    CANDIDATES+=("$branch")
  fi
done < <(git for-each-ref --format='%(refname:lstrip=2)%09%(upstream)%09%(upstream:track)' refs/heads/)

# Decide what happens to the checkout. Deletion runs last, so a merged branch
# is never the checked-out one when git branch -d runs.
#   on-main: already on main; fast-forward it to origin/main.
#   switch:  on a merged branch; move to main, then fast-forward it.
#   stay:    on any other branch or a detached HEAD; leave it and update main
#            without a checkout.
mode="stay"
if [ "$current" = "main" ]; then
  mode="on-main"
elif is_candidate "$current"; then
  if branch_in_other_worktree main; then
    skip "$current" "main is checked out in another worktree; cannot switch to it"
    drop_candidate "$current"
  else
    mode="switch"
  fi
fi

# Stay mode keeps the current checkout, so each candidate must also be contained
# in it. git branch -d checks against HEAD when the upstream is gone.
if [ "$mode" = "stay" ]; then
  head_sha="$(git rev-parse HEAD)" || die "cannot resolve HEAD."
  for branch in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
    if ! git merge-base --is-ancestor "refs/heads/$branch" "$head_sha"; then
      skip "$branch" "merged into origin/main but not into the current checkout; rerun from main"
      drop_candidate "$branch"
    fi
  done
fi

# A dirty tree blocks only when the checkout itself must move.
if [ "$mode" != "stay" ] && [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  die "uncommitted or untracked changes on ${current:-HEAD}. Commit or stash them, then rerun. No local branches were changed."
fi

print_summary() {
  local branch entry
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Would delete local branches:"
  else
    echo "Deleted local branches:"
  fi
  if [ ${#DELETED[@]} -eq 0 ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  none (no local branches would be deleted)"
    else
      echo "  none. No local branches deleted."
    fi
  fi
  for branch in ${DELETED[@]+"${DELETED[@]}"}; do
    echo "  $branch"
  done
  if [ ${#SKIPPED[@]} -gt 0 ]; then
    echo "Skipped:"
    for entry in "${SKIPPED[@]}"; do
      echo "  $entry"
    done
  fi
}

case "$mode" in
  switch)
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] Would switch to main and fast-forward it to origin/main."
    else
      if [ "$main_exists" -eq 1 ]; then
        git switch -q main || die "could not switch to main."
      else
        git switch -q -c main origin/main || die "could not create main from origin/main."
      fi
      git merge -q --ff-only origin/main || die "local main cannot fast-forward to origin/main."
      echo "Switched to main and fast-forwarded it to origin/main."
    fi
    ;;
  on-main)
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] Would fast-forward main to origin/main."
    else
      git merge -q --ff-only origin/main || die "local main cannot fast-forward to origin/main."
    fi
    ;;
  stay)
    if branch_in_other_worktree main; then
      echo "main is checked out in another worktree; not updated to origin/main."
    elif [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] Would update local main to origin/main without switching."
    else
      git fetch -q origin main:main || die "could not update local main to origin/main."
    fi
    ;;
esac

for branch in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
  if [ "$DRY_RUN" -eq 1 ]; then
    DELETED+=("$branch")
  elif git branch -d "$branch" >/dev/null; then
    DELETED+=("$branch")
  else
    print_summary
    die "git branch -d refused '$branch' after every check passed. Stopped; later branches were not deleted."
  fi
done

print_summary
exit 0
