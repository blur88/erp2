#!/usr/bin/env bats
# Exercise CI's real node:test guard with isolated release-tooling fixtures (#1834).

REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
GUARD="${REPO_DIR}/scripts/test-root-release-tooling.sh"

setup() {
  mkdir -p "$BATS_TEST_TMPDIR/scripts/__tests__"
  cd "$BATS_TEST_TMPDIR"
}

@test "root release-tooling rejects an unmatched test glob" {
  run bash -e "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Root release-tooling tests: no test cases ran"* ]]
}

@test "root release-tooling rejects a matched file with zero test cases" {
  touch scripts/__tests__/empty.test.cjs

  run bash -e "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Root release-tooling tests: no test cases ran"* ]]
}

@test "root release-tooling accepts a passing test case" {
  cat > scripts/__tests__/passing.test.cjs <<'JS'
const { test } = require('node:test');
test('passes', () => {});
JS

  run bash -e "$GUARD"
  [ "$status" -eq 0 ]
}

@test "root release-tooling preserves a failing test run's exit status" {
  cat > scripts/__tests__/failing.test.cjs <<'JS'
const { test } = require('node:test');
test('fails', () => { throw new Error('fixture failure'); });
JS

  run bash -e "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"fixture failure"* ]]
  [[ "$output" != *"no test cases ran"* ]]
}
