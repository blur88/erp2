#!/usr/bin/env bats
#
# Guard for the local main-branch commit refusal (#1796).
#
# Runs the real .githooks/pre-commit inside a throwaway repository. Commits on
# main must be refused with a branch-first message; commits on any other branch
# must still succeed.

REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"

setup() {
  WORK="$BATS_TEST_TMPDIR/work"
  git init -q --initial-branch=main "$WORK"
  cd "$WORK" || return 1
  git config user.name 'Hook Test'
  git config user.email 'hooks@example.invalid'
  cp -R "$REPO_DIR/.githooks" .githooks
  git config core.hooksPath .githooks
}

@test "commit on main is refused with a branch-first message" {
  cd "$WORK"
  run git commit -q --allow-empty -m blocked
  [ "$status" -ne 0 ]
  [[ "$output" == *"git switch -c"* ]]
  [ -z "$(git rev-parse --verify -q HEAD)" ]
}

@test "commit on a feature branch is allowed" {
  cd "$WORK"
  git switch -q -c feature/1796-check
  run git commit -q --allow-empty -m allowed
  [ "$status" -eq 0 ]
  [ -n "$(git rev-parse --verify -q HEAD)" ]
}
