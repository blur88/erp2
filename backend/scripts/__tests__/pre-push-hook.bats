#!/usr/bin/env bats
#
# Guard for the tracked pre-push hook: a branch pushed without the remote's
# current main is refused. A releasing merge adds a chore(release) commit to
# main, so a branch cut from a local main pulled before it opens its PR already
# behind; the ruleset then demands a rebase and a second full CI run (#1487).
#
# Each case runs the REAL hook through `git push` from a clone of a throwaway
# bare remote, with core.hooksPath pointing at a copy of .githooks.

HOOK="$BATS_TEST_DIRNAME/../../../.githooks/pre-push"

setup() {
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  SEED="$BATS_TEST_TMPDIR/seed"
  REPO="$BATS_TEST_TMPDIR/repo"
  git init -q --bare -b main "$REMOTE"
  git init -q -b main "$SEED"
  identity "$SEED"
  git -C "$SEED" commit -q --allow-empty -m one
  git -C "$SEED" push -q "$REMOTE" main
  git clone -q "$REMOTE" "$REPO"
  identity "$REPO"
  mkdir -p "$REPO/.githooks"
  cp "$HOOK" "$REPO/.githooks/pre-push"
  git -C "$REPO" config core.hooksPath .githooks
  cd "$REPO"
}

identity() {
  git -C "$1" config user.email hook@test.invalid
  git -C "$1" config user.name hook-test
}

# A release commit lands on the remote's main after the clone pulled it.
advance_remote_main() {
  git -C "$SEED" commit -q --allow-empty -m "chore(release): next"
  git -C "$SEED" push -q "$REMOTE" main
}

remote_has() {
  git -C "$REMOTE" rev-parse -q --verify "refs/heads/$1" >/dev/null
}

@test "refuses a branch behind the remote's main and names the fix" {
  git switch -q -c docs/1-example
  git commit -q --allow-empty -m work
  advance_remote_main

  run git push -q origin docs/1-example

  [ "$status" -ne 0 ]
  [[ "$output" == *"docs/1-example does not contain origin's current main"* ]]
  [[ "$output" == *"git rebase origin/main"* ]]
  ! remote_has docs/1-example
}

@test "allows a branch once it is rebased onto the remote's main" {
  git switch -q -c docs/1-example
  git commit -q --allow-empty -m work
  advance_remote_main
  git fetch -q origin
  git rebase -q origin/main

  run git push -q origin docs/1-example

  [ "$status" -eq 0 ]
  remote_has docs/1-example
}

@test "allows a branch cut from the remote's current main" {
  git switch -q -c docs/1-example
  git commit -q --allow-empty -m work

  run git push -q origin docs/1-example

  [ "$status" -eq 0 ]
  remote_has docs/1-example
}

@test "allows deleting a remote branch" {
  git switch -q -c docs/1-example
  git commit -q --allow-empty -m work
  git push -q origin docs/1-example
  advance_remote_main

  run git push -q origin --delete docs/1-example

  [ "$status" -eq 0 ]
  ! remote_has docs/1-example
}

@test "allows pushing a tag" {
  git tag v0.0.1
  advance_remote_main

  run git push -q origin v0.0.1

  [ "$status" -eq 0 ]
  git -C "$REMOTE" rev-parse -q --verify refs/tags/v0.0.1
}

@test "chains a clone-local pre-push hook with the push lines and keeps its verdict" {
  git switch -q -c docs/1-example
  git commit -q --allow-empty -m work
  printf '#!/bin/sh\ncat > "%s/local-stdin"\necho local-hook-ran >&2\nexit 1\n' \
    "$BATS_TEST_TMPDIR" > .git/hooks/pre-push
  chmod +x .git/hooks/pre-push

  run git push -q origin docs/1-example

  [ "$status" -ne 0 ]
  [[ "$output" == *"local-hook-ran"* ]]
  grep -q "^refs/heads/docs/1-example $(git rev-parse HEAD) refs/heads/docs/1-example " \
    "$BATS_TEST_TMPDIR/local-stdin"
  ! remote_has docs/1-example
}

@test "allows the push and says so when the remote has no main to fetch" {
  EMPTY="$BATS_TEST_TMPDIR/empty.git"
  git init -q --bare -b main "$EMPTY"
  git remote add empty "$EMPTY"
  git switch -q -c docs/1-example

  run git push -q empty docs/1-example

  [ "$status" -eq 0 ]
  [[ "$output" == *"could not fetch main from empty"* ]]
  git -C "$EMPTY" rev-parse -q --verify refs/heads/docs/1-example
}
