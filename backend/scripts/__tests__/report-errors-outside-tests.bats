#!/usr/bin/env bats
#
# #1446: an error raised outside any test (a timer firing after jsdom teardown,
# #1372) fails the frontend run under a fully passing count, and Vitest prints
# it far above the end of the log. The CI step that runs this script repeats
# that block as an annotation and in the job summary. The fixtures are real,
# colour-coded Vitest output: one run with an unhandled rejection, one clean.

REPORT="${BATS_TEST_DIRNAME}/../report-errors-outside-tests.sh"
FIXTURES="${BATS_TEST_DIRNAME}/fixtures"

setup() {
  export GITHUB_STEP_SUMMARY="$BATS_TEST_TMPDIR/summary.md"
}

@test "annotates the file an error outside any test originated in" {
  run "$REPORT" "$FIXTURES/vitest-error-outside-tests.txt"

  [ "$status" -eq 0 ]
  [[ "$output" == "::error title=Frontend tests failed on an error raised outside any test::"* ]]
  [[ "$output" == *'originated in "src/__planted__/outside.test.ts"'* ]]
}

@test "writes the error and its stack to the job summary" {
  run "$REPORT" "$FIXTURES/vitest-error-outside-tests.txt"

  [ "$status" -eq 0 ]
  grep -qF '### Errors raised outside any test' "$GITHUB_STEP_SUMMARY"
  grep -qF 'ReferenceError: window is not defined' "$GITHUB_STEP_SUMMARY"
  grep -qF 'src/__planted__/outside.test.ts:5:18' "$GITHUB_STEP_SUMMARY"
  run grep -q $'\x1b' "$GITHUB_STEP_SUMMARY"
  [ "$status" -eq 1 ]
}

@test "stays silent on a log with no error outside any test" {
  run "$REPORT" "$FIXTURES/vitest-clean.txt"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ ! -e "$GITHUB_STEP_SUMMARY" ]
}

@test "exits 0 when the suite never ran and left no log" {
  run "$REPORT" "$BATS_TEST_TMPDIR/absent.log"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
