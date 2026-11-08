#!/usr/bin/env bats
# Exercise the whole pointer spec with Git selectors inherited at process start (#1724).

@test "pointer specs pass with an unrelated Git repository and index exported" {
  local unrelated="$BATS_TEST_TMPDIR/unrelated"
  # Confine environment cleanup to fixture creation; leave the parent environment intact.
  (
    source "$BATS_TEST_DIRNAME/helpers/load.bash"
    reset_developer_env
    git init -q "$unrelated"
  )
  # Run the full file to cover process-start inheritance in every fixture setup (AC1).
  run env GIT_DIR="$unrelated/.git" GIT_WORK_TREE="$unrelated" \
    GIT_INDEX_FILE="$unrelated/exported-index" \
    bats \
    "$BATS_TEST_DIRNAME/check-agent-doc-paths.bats"
  [ "$status" -eq 0 ]
  [ ! -e "$unrelated/exported-index" ]
}
