#!/usr/bin/env bats
#
# Specs for scripts/git-cleanup-merged.sh (#1811).
#
# Every test builds throwaway clones of a bare remote. A "peer" clone plays the
# part of GitHub: it merges a feature branch into origin/main and deletes the
# remote head branch. That is the state the script cleans up after.

REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
SCRIPT="$REPO_DIR/scripts/git-cleanup-merged.sh"

configure_identity() {
  git -C "$1" config user.name 'Cleanup Test'
  git -C "$1" config user.email 'cleanup@example.invalid'
  # Signing is off so commits do not depend on the developer's global config.
  git -C "$1" config commit.gpgsign false
}

setup() {
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  WORK="$BATS_TEST_TMPDIR/work"
  PEER="$BATS_TEST_TMPDIR/peer"

  git init -q --bare --initial-branch=main "$REMOTE"

  git init -q --initial-branch=main "$WORK"
  configure_identity "$WORK"
  printf 'base\n' > "$WORK/README.md"
  git -C "$WORK" add README.md
  git -C "$WORK" commit -q -m base
  git -C "$WORK" remote add origin "$REMOTE"
  git -C "$WORK" push -q -u origin main

  git clone -q "$REMOTE" "$PEER"
  configure_identity "$PEER"

  cd "$WORK" || return 1
}

# commit <repo> <file> <message>: appends a line to <file> and commits it.
commit() {
  printf '%s\n' "$3" >> "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" commit -q -m "$3"
}

# push_branch <name>: branches from the current WORK checkout, commits once,
# and pushes with upstream tracking. Leaves <name> checked out.
push_branch() {
  git -C "$WORK" switch -q -c "$1"
  commit "$WORK" "$1.txt" "$1 work"
  git -C "$WORK" push -q -u origin "$1"
}

# merge_on_remote <name>: what GitHub does on merge. Merges the branch into
# origin/main with a merge commit and deletes the remote head branch.
merge_on_remote() {
  git -C "$PEER" fetch -q origin
  git -C "$PEER" switch -q -C main origin/main
  git -C "$PEER" merge -q --no-ff -m "Merge $1" "origin/$1"
  git -C "$PEER" push -q origin main
  git -C "$PEER" push -q origin --delete "$1"
}

branch_exists() {
  git -C "$WORK" show-ref --verify -q "refs/heads/$1"
}

assert_branch() {
  branch_exists "$1" || { echo "expected local branch $1 to exist" >&2; return 1; }
}

refute_branch() {
  if branch_exists "$1"; then
    echo "expected local branch $1 to be deleted" >&2
    return 1
  fi
}

current_branch() {
  git -C "$WORK" symbolic-ref --short HEAD
}

@test "script is executable" {
  [ -x "$SCRIPT" ]
}

@test "merged feature branch is deleted and checkout moves off it to main" {
  push_branch feat-a
  merge_on_remote feat-a

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  refute_branch feat-a
  [ "$(current_branch)" = main ]
  [ "$(git -C "$WORK" rev-parse main)" = "$(git -C "$WORK" rev-parse origin/main)" ]
}

@test "branch with commits not in origin/main is kept" {
  push_branch feat-open
  git -C "$PEER" push -q origin --delete feat-open
  git -C "$WORK" switch -q main

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  assert_branch feat-open
  [[ "$output" == *"feat-open"* ]]
  [[ "$output" == *"not in origin/main"* ]]
}

@test "local branch with no upstream is kept" {
  git -C "$WORK" switch -q -c local-only

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  assert_branch local-only
  [[ "$output" == *"local-only"* ]]
  [[ "$output" == *"no upstream"* ]]
}

@test "dirty tree blocks the run when the checkout must switch off a merged branch" {
  push_branch feat-b
  merge_on_remote feat-b
  printf 'dirty\n' >> "$WORK/README.md"

  run "$SCRIPT"

  [ "$status" -eq 1 ]
  assert_branch feat-b
  [ "$(current_branch)" = feat-b ]
  grep -qx 'dirty' "$WORK/README.md"
}

@test "dirty tree on an unrelated checkout still sweeps merged branches" {
  push_branch feat-d
  git -C "$WORK" switch -q -c wip
  commit "$WORK" wip.txt 'wip work'
  git -C "$WORK" push -q -u origin wip
  merge_on_remote feat-d
  printf 'dirty\n' >> "$WORK/README.md"

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  refute_branch feat-d
  [ "$(current_branch)" = wip ]
  grep -qx 'dirty' "$WORK/README.md"
}

@test "main and master are never deleted" {
  git -C "$WORK" branch master main
  git -C "$WORK" push -q -u origin master
  git -C "$PEER" push -q origin --delete master
  git -C "$WORK" switch -q main

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  assert_branch master
  assert_branch main
}

@test "diverged local main stops the run before any deletion" {
  push_branch feat-e
  merge_on_remote feat-e
  git -C "$WORK" switch -q main
  commit "$WORK" local.txt 'local main commit'

  run "$SCRIPT"

  [ "$status" -eq 1 ]
  assert_branch feat-e
  [[ "$output" == *"commits that are not in origin/main"* ]]
}

@test "rerunning after a successful cleanup is a no-op" {
  push_branch feat-f
  merge_on_remote feat-f
  run "$SCRIPT"
  [ "$status" -eq 0 ]

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  [[ "$output" == *"No local branches deleted"* ]]
  [ "$(current_branch)" = main ]
}

@test "dry-run leaves branches, checkout and main unchanged" {
  push_branch feat-g
  merge_on_remote feat-g
  main_before="$(git -C "$WORK" rev-parse main)"

  run "$SCRIPT" --dry-run

  [ "$status" -eq 0 ]
  [[ "$output" == *"[dry-run]"* ]]
  assert_branch feat-g
  [ "$(current_branch)" = feat-g ]
  [ "$(git -C "$WORK" rev-parse main)" = "$main_before" ]
}

@test "merged branch missing from the current checkout is skipped with a rerun hint" {
  push_branch feat-h
  git -C "$WORK" switch -q main
  git -C "$WORK" switch -q -c wip
  commit "$WORK" wip.txt 'wip work'
  git -C "$WORK" push -q -u origin wip
  merge_on_remote feat-h

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  assert_branch feat-h
  [ "$(current_branch)" = wip ]
  [[ "$output" == *"not into the current checkout"* ]]
}

@test "fetch failure exits non-zero and changes nothing" {
  push_branch feat-i
  merge_on_remote feat-i
  git -C "$WORK" remote set-url origin "$BATS_TEST_TMPDIR/missing.git"

  run "$SCRIPT"

  [ "$status" -eq 1 ]
  assert_branch feat-i
  [ "$(current_branch)" = feat-i ]
}

@test "merged branch checked out in another worktree is kept" {
  push_branch feat-j
  merge_on_remote feat-j
  git -C "$WORK" switch -q main
  git -C "$WORK" worktree add -q "$BATS_TEST_TMPDIR/wt-feat" feat-j

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  assert_branch feat-j
  [[ "$output" == *"checked out in another worktree"* ]]
}

@test "merged current branch is not switched when main is checked out in another worktree" {
  push_branch feat-k
  merge_on_remote feat-k
  git -C "$WORK" worktree add -q "$BATS_TEST_TMPDIR/wt-main" main

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  assert_branch feat-k
  [ "$(current_branch)" = feat-k ]
  [[ "$output" == *"main is checked out in another worktree"* ]]
}

@test "missing local main is created from origin/main when the checkout switches to it" {
  push_branch feat-l
  merge_on_remote feat-l
  git -C "$WORK" branch -q -D main

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  refute_branch feat-l
  [ "$(current_branch)" = main ]
  [ "$(git -C "$WORK" rev-parse main)" = "$(git -C "$WORK" rev-parse origin/main)" ]
}

@test "unknown argument is a usage error" {
  run "$SCRIPT" --bogus

  [ "$status" -eq 2 ]
}

@test "main created while detached is tracking origin/main" {
  git -C "$WORK" switch -q --detach
  git -C "$WORK" branch -q -D main

  run "$SCRIPT"

  [ "$status" -eq 0 ]
  [ "$(git -C "$WORK" rev-parse --abbrev-ref 'main@{upstream}')" = origin/main ]
}

@test "dirty tree on main blocks the run before any deletion" {
  push_branch feat-n
  merge_on_remote feat-n
  git -C "$WORK" switch -q main
  printf 'dirty\n' >> "$WORK/README.md"

  run "$SCRIPT"

  [ "$status" -eq 1 ]
  assert_branch feat-n
  [ "$(current_branch)" = main ]
  grep -qx 'dirty' "$WORK/README.md"
}

@test "git branch -d refusal stops the run after earlier deletions and keeps the rest" {
  push_branch aa-first
  push_branch zz-last
  git -C "$WORK" switch -q -c wip
  commit "$WORK" wip.txt 'wip work'
  git -C "$WORK" push -q -u origin wip
  merge_on_remote aa-first
  merge_on_remote zz-last
  # A ref lock makes git branch -d refuse zz-last after the checks have passed.
  touch "$WORK/.git/refs/heads/zz-last.lock"

  run "$SCRIPT"

  [ "$status" -eq 1 ]
  refute_branch aa-first
  assert_branch zz-last
  [[ "$output" == *"git branch -d refused 'zz-last'"* ]]
}
