#!/usr/bin/env bats
#
# Licence metadata regression guard (#1824, follow-up to #1809).
#
# #1809 fixed backend/package.json and the root entry of
# backend/package-lock.json declaring "MIT" against a proprietary repository,
# and first pointing at a LICENSE path that does not exist in backend/. Nothing
# stopped either mistake from returning. These specs run the checker against
# the real manifests and against fixture pairs that each break one rule.
#
# Scope is deliberately minimal: name and license agreement, the accepted
# license values, and SEE LICENSE IN file existence. Version equality between
# manifests and lockfiles is out of scope (see #1818).

BACKEND_DIR="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
CHECKER="${BATS_TEST_DIRNAME}/helpers/check-licence-metadata.cjs"

setup() {
  TEST_TMP="$(mktemp -d)"
}

teardown() {
  [ -n "${TEST_TMP:-}" ] && rm -rf "$TEST_TMP"
}

# write_pair <dir> <package.json object> <lockfile root object>
# Writes a package.json and a minimal package-lock.json whose packages[""]
# entry is the given object. Each argument is a complete JSON object.
write_pair() {
  mkdir -p "$1"
  printf '%s\n' "$2" > "$1/package.json"
  printf '{"name":"erp-backend","lockfileVersion":3,"packages":{"":%s}}\n' "$3" > "$1/package-lock.json"
}

check() {
  run node "$CHECKER" "$1"
}

@test "the real backend manifests agree and declare an accepted licence" {
  check "$BACKEND_DIR"
  [ "$status" -eq 0 ]
}

@test "name differing between package.json and lockfile root fails" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"UNLICENSED"}' \
    '{"name":"erp-backend-other","license":"UNLICENSED"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"name"* ]]
}

@test "license differing between package.json and lockfile root fails" {
  mkdir -p "$TEST_TMP/pkg"
  touch "$TEST_TMP/pkg/NOTICE"
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"UNLICENSED"}' \
    '{"name":"erp-backend","license":"SEE LICENSE IN NOTICE"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"license"* ]]
}

@test "field present in only one file fails" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"UNLICENSED"}' \
    '{"name":"erp-backend"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"license"* ]]
  [[ "$output" == *"only one"* ]]
}

@test "name present in only one file fails" {
  write_pair "$TEST_TMP/pkg" \
    '{"license":"UNLICENSED"}' \
    '{"name":"erp-backend","license":"UNLICENSED"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"name"* ]]
  [[ "$output" == *"only one"* ]]
}

@test "field absent from both files agrees" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend"}' \
    '{"name":"erp-backend"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 0 ]
}

@test "MIT in both files fails as an open-source licence" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"MIT"}' \
    '{"name":"erp-backend","license":"MIT"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"MIT"* ]]
}

@test "unrecognised licence value fails even when both files agree" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"Proprietary"}' \
    '{"name":"erp-backend","license":"Proprietary"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"Proprietary"* ]]
}

@test "UNLICENSED in both files passes" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"UNLICENSED"}' \
    '{"name":"erp-backend","license":"UNLICENSED"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 0 ]
}

@test "SEE LICENSE IN a file that exists beside the manifests passes" {
  mkdir -p "$TEST_TMP/pkg"
  touch "$TEST_TMP/pkg/LICENSE"
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"SEE LICENSE IN LICENSE"}' \
    '{"name":"erp-backend","license":"SEE LICENSE IN LICENSE"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 0 ]
}

@test "SEE LICENSE IN a file missing from the package directory fails" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"SEE LICENSE IN LICENSE"}' \
    '{"name":"erp-backend","license":"SEE LICENSE IN LICENSE"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"LICENSE"* ]]
}

@test "SEE LICENSE IN resolves against the package directory, not its parent" {
  # The #1809 failure: a LICENSE exists one level up (the repository root) but
  # not in backend/. The reference must fail, not resolve upward.
  touch "$TEST_TMP/LICENSE"
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"SEE LICENSE IN LICENSE"}' \
    '{"name":"erp-backend","license":"SEE LICENSE IN LICENSE"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"LICENSE"* ]]
}

@test "SEE LICENSE IN a file reached by climbing out of the package directory fails" {
  # Same #1809 pattern with an explicit ../ escape: the file exists, but outside
  # the declaring package directory, so it must not satisfy the reference.
  touch "$TEST_TMP/LICENSE"
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"SEE LICENSE IN ../LICENSE"}' \
    '{"name":"erp-backend","license":"SEE LICENSE IN ../LICENSE"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"outside"* ]]
}

@test "missing lockfile fails with a licence metadata line, not a stack trace" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","license":"UNLICENSED"}' \
    '{"name":"erp-backend","license":"UNLICENSED"}'
  rm "$TEST_TMP/pkg/package-lock.json"
  check "$TEST_TMP/pkg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"licence metadata:"* ]]
  [[ "$output" == *"package-lock.json"* ]]
}

@test "version differences are not compared" {
  write_pair "$TEST_TMP/pkg" \
    '{"name":"erp-backend","version":"1.0.0","license":"UNLICENSED"}' \
    '{"name":"erp-backend","version":"9.9.9","license":"UNLICENSED"}'
  check "$TEST_TMP/pkg"
  [ "$status" -eq 0 ]
}
