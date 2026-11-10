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

# Compare the hook report separately from Git's own failure summary.
assert_hook_report() {
  [ "$output" = "$1
error: failed to push some refs to '$REMOTE'" ]
}

# npm is the external suite boundary: no recursive test:scripts invocation.
prepare_script_change() {
  git switch -q -c scripts/test
  mkdir -p backend "$BATS_TEST_TMPDIR/bin"
  printf '#!/bin/sh\nexit 0\n' > check.sh
  git add check.sh
  git commit -q -m script
  printf '#!/bin/sh\nprintf "%%s|%%s\\n" "$PWD" "$*" >> "%s/npm-calls"\nexit "${SUITE_STATUS:-0}"\n' "$BATS_TEST_TMPDIR" > "$BATS_TEST_TMPDIR/bin/npm"
  chmod +x "$BATS_TEST_TMPDIR/bin/npm"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
}

@test "refuses script push when the script suite fails" {
  prepare_script_change
  export SUITE_STATUS=1
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  ! remote_has scripts/test
  assert_hook_report "pre-push: script suite failed; push refused"
  [ "$(cat "$BATS_TEST_TMPDIR/npm-calls")" = "$REPO/backend|run test:scripts" ]
}

@test "allows script push after successful suite" {
  prepare_script_change
  run git push -q origin scripts/test
  [ "$status" -eq 0 ]
  remote_has scripts/test
  [ "$(cat "$BATS_TEST_TMPDIR/npm-calls")" = "$REPO/backend|run test:scripts" ]
}

@test "checks script commits even when reverted in the pushed range" {
  prepare_script_change
  git revert --no-edit HEAD
  export SUITE_STATUS=1
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  assert_hook_report "pre-push: script suite failed; push refused"
  [ "$(cat "$BATS_TEST_TMPDIR/npm-calls")" = "$REPO/backend|run test:scripts" ]
}

@test "refuses testing a different checkout or dirty tracked files" {
  prepare_script_change
  git switch -q main
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  assert_hook_report "pre-push: check out the pushed script commit before pushing"
  git switch -q scripts/test
  echo dirty >> check.sh
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  assert_hook_report "pre-push: commit or stash tracked changes before testing pushed scripts"
  [ ! -f "$BATS_TEST_TMPDIR/npm-calls" ]
}

@test "skips suite for non-script changes and deleted refs" {
  prepare_script_change
  git push -q origin scripts/test
  rm "$BATS_TEST_TMPDIR/npm-calls"
  echo docs > README.md
  git add README.md
  git commit -q -m docs
  export SUITE_STATUS=1
  run git push -q origin scripts/test
  [ "$status" -eq 0 ]
  run git push -q origin --delete scripts/test
  [ "$status" -eq 0 ]
  [ ! -f "$BATS_TEST_TMPDIR/npm-calls" ]
}

@test "checks bash bats backend script paths and extensionless hooks" {
  prepare_script_change
  git push -q origin scripts/test
  for path in check.bash check.bats backend/scripts/config.json .githooks/pre-commit .githooks/pre-push; do
    mkdir -p "$(dirname "$path")"
    echo "# changed" >> "$path"
    git add "$path"
    git commit -q -m change
    export SUITE_STATUS=1
    run git push -q origin scripts/test
    [ "$status" -ne 0 ]
    assert_hook_report "pre-push: script suite failed; push refused"
    export SUITE_STATUS=0
    git push -q origin scripts/test
  done
}

@test "refuses a staged change even when working file matches HEAD" {
  prepare_script_change
  echo staged >> check.sh
  git add check.sh
  git show HEAD:check.sh > check.sh
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  assert_hook_report "pre-push: commit or stash tracked changes before testing pushed scripts"
  [ ! -f "$BATS_TEST_TMPDIR/npm-calls" ]
}

@test "checks script edits introduced by a merge commit" {
  prepare_script_change
  git push -q origin scripts/test
  rm "$BATS_TEST_TMPDIR/npm-calls"
  git switch -q -c docs/side
  echo side > side.md
  git add side.md
  git commit -q -m side
  git switch -q scripts/test
  echo topic > topic.md
  git add topic.md
  git commit -q -m topic
  git merge --no-commit --no-ff docs/side
  echo '# merge edit' >> check.sh
  git add check.sh
  git commit -q -m merge
  export SUITE_STATUS=1
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  assert_hook_report "pre-push: script suite failed; push refused"
  [ "$(cat "$BATS_TEST_TMPDIR/npm-calls")" = "$REPO/backend|run test:scripts" ]
}

@test "new docs branch excludes script commits already on fetched main" {
  prepare_script_change
  git push -q origin scripts/test:main
  rm "$BATS_TEST_TMPDIR/npm-calls"
  git switch -q -c docs/new
  echo docs > README.md
  git add README.md
  git commit -q -m docs
  export SUITE_STATUS=1
  run git push -q origin docs/new
  [ "$status" -eq 0 ]
  remote_has docs/new
  [ ! -f "$BATS_TEST_TMPDIR/npm-calls" ]
}

@test "script push to empty remote checks all reachable commits" {
  prepare_script_change
  EMPTY="$BATS_TEST_TMPDIR/empty.git"
  git init -q --bare -b main "$EMPTY"
  git remote add empty "$EMPTY"
  export SUITE_STATUS=1
  run git push -q empty scripts/test
  [ "$status" -ne 0 ]
  [ "$output" = "pre-push: could not fetch main from empty; skipping the up-to-date check
pre-push: script suite failed; push refused
error: failed to push some refs to '$EMPTY'" ]
  ! git -C "$EMPTY" rev-parse -q --verify refs/heads/scripts/test
  [ "$(cat "$BATS_TEST_TMPDIR/npm-calls")" = "$REPO/backend|run test:scripts" ]
}

@test "refuses staged tracked change when worktree matches index" {
  prepare_script_change
  echo staged >> check.sh
  git add check.sh
  git diff --quiet --
  run git push -q origin scripts/test
  [ "$status" -ne 0 ]
  assert_hook_report "pre-push: commit or stash tracked changes before testing pushed scripts"
  ! remote_has scripts/test
  [ ! -f "$BATS_TEST_TMPDIR/npm-calls" ]
}
