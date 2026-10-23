#!/usr/bin/env bats
#
# Guard for the tracked pre-commit hook: commits on main are refused, so work
# lands through a branch and a PR. A first implementation of #1429 was
# committed straight onto local main with nothing to stop it.
#
# Each case runs the REAL hook through `git commit` in a throwaway repo whose
# core.hooksPath points at a copy of .githooks, exactly as a configured clone.

HOOK="$BATS_TEST_DIRNAME/../../../.githooks/pre-commit"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/.githooks"
  cp "$HOOK" "$REPO/.githooks/pre-commit"
  cd "$REPO"
  git init -q -b main
  git config user.email hook@test.invalid
  git config user.name hook-test
  git config core.hooksPath .githooks
  echo one > file.txt
  git add file.txt
}

commit() {
  run git commit -q -m "$1"
}

@test "refuses a commit on main and names the fix" {
  commit "on main"

  [ "$status" -ne 0 ]
  [[ "$output" == *"commits on main are refused"* ]]
  [[ "$output" == *"git switch -c"* ]]
  run git rev-list --all --count
  [ "$output" -eq 0 ]
}

@test "allows a commit on a branch" {
  git switch -q -c feat/1-example
  commit "on branch"

  [ "$status" -eq 0 ]
  run git rev-list --count HEAD
  [ "$output" -eq 1 ]
}

@test "allows a commit on a detached HEAD, as during a rebase" {
  git switch -q -c seed
  commit "seed"
  [ "$status" -eq 0 ]
  git switch -q --detach
  echo two > file.txt
  git add file.txt
  commit "detached"

  [ "$status" -eq 0 ]
  run git rev-list --count HEAD
  [ "$output" -eq 2 ]
}

@test "chains a clone-local pre-commit hook and keeps its verdict" {
  git switch -q -c feat/1-example
  printf '#!/bin/sh\necho local-hook-ran >&2\nexit 1\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
  commit "blocked by local hook"

  [ "$status" -ne 0 ]
  [[ "$output" == *"local-hook-ran"* ]]
  run git rev-list --all --count
  [ "$output" -eq 0 ]
}
