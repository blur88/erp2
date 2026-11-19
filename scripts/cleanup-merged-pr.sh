#!/usr/bin/env bash
# Update main and remove the matching topic branch after a PR merges (#1937).
set -euo pipefail

fail() {
  printf 'Cleanup blocked: %s\n' "$1" >&2
  exit 1
}

[[ $# == 1 && $1 =~ ^[1-9][0-9]*$ ]] || fail 'pass a PR number.'
working_tree=$(git status --porcelain --untracked-files=normal --ignore-submodules=none)
[[ -z $working_tree ]] || fail 'the checkout has uncommitted work.'
current_ref=$(git symbolic-ref --quiet HEAD) || fail 'HEAD is detached.'
current=${current_ref#refs/heads/}

metadata=$(gh pr view "$1" \
  --json state,baseRefName,headRefName,headRefOid,isCrossRepository,mergeCommit \
  --jq '[.state, .baseRefName, .headRefName, .headRefOid, .isCrossRepository, .mergeCommit.oid] | @tsv')
IFS=$'\t' read -r state base topic head cross_repo merge_commit <<< "$metadata"
[[ $state == MERGED && $base == main && $cross_repo == false && -n $merge_commit ]] ||
  fail 'the PR must be merged into main from a branch in this repository.'
[[ -n $topic && $topic != main && ( $current == "$topic" || $current == main ) ]] ||
  fail "check out the PR branch ($topic) before cleanup."

topic_ref="refs/heads/$topic"
check_topic_tip() {
  local local_tip
  local_tip=$(git rev-parse --verify --quiet "$topic_ref") || fail "local branch $topic is missing."
  [[ $local_tip == "$head" ]] || fail "local branch $topic differs from the merged PR head."
}
check_topic_tip

worktrees=$(git worktree list --porcelain)
topic_checkouts=$(awk -v ref="$topic_ref" '$0 == "branch " ref { count++ } END { print count+0 }' <<< "$worktrees")
if [[ ( $current == "$topic" && $topic_checkouts -gt 1 ) || ( $current == main && $topic_checkouts -gt 0 ) ]]; then
  fail "branch $topic is checked out in another worktree."
fi

remote_topic_tip() {
  local refs
  refs=$(git ls-remote --refs origin "$topic_ref") || return 1
  awk -v ref="$topic_ref" '$2 == ref { print $1 }' <<< "$refs"
}
tracking_ref="refs/remotes/origin/$topic"
# Observe the tracking ref before checking whether the branch exists on origin.
tracking_tip=$(git rev-parse --verify --quiet "$tracking_ref") || tracking_tip=
remote_tip=$(remote_topic_tip) || fail "could not check branch $topic on origin."
[[ -z $remote_tip || $remote_tip == "$head" ]] || fail "branch $topic on origin differs from the merged PR head."

git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
main_tip=$(git rev-parse --verify refs/remotes/origin/main)
git merge-base --is-ancestor "$merge_commit" "$main_tip" || fail 'origin/main does not include the PR merge.'
if git show-ref --verify --quiet refs/heads/main; then
  git merge-base --is-ancestor refs/heads/main "$main_tip" || fail 'local main cannot fast-forward to origin/main.'
  git switch --no-overwrite-ignore main || fail 'could not switch to main. Resolve the Git error above and retry.'
  git merge --ff-only --no-autostash --no-overwrite-ignore "$main_tip" || fail 'could not update main. Resolve the Git error above and retry.'
else
  git switch --no-overwrite-ignore -c main refs/remotes/origin/main || fail 'could not create local main. Resolve the Git error above and retry.'
fi
[[ $(git rev-parse HEAD) == "$main_tip" ]] || fail 'local main differs from the fetched origin/main.'

check_topic_tip
if [[ -n $remote_tip ]] && ! git push --force-with-lease="$topic_ref:$head" origin ":$topic_ref"; then
  remote_tip=$(remote_topic_tip) || fail "could not recheck branch $topic on origin."
  [[ -z $remote_tip ]] || fail "could not safely delete branch $topic on origin."
fi

check_topic_tip
if [[ -z $remote_tip && -n $tracking_tip ]]; then
  git update-ref --no-deref -d "$tracking_ref" "$tracking_tip" ||
    fail "could not delete local tracking ref $tracking_ref at its observed OID. Resolve the Git error above and retry."
fi
# Squash and rebase merges can leave the verified PR head outside main's history.
git branch -D -- "$topic"
