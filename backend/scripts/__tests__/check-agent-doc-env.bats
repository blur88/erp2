#!/usr/bin/env bats
# Exercise the whole pointer spec with Git selectors inherited at process start.

@test "pointer specs pass with an unrelated Git repository and index exported" {
  local unrelated="$BATS_TEST_TMPDIR/unrelated"
  (
    source "$BATS_TEST_DIRNAME/helpers/load.bash"
    reset_developer_env
    git init -q "$unrelated"
  )
  run env GIT_DIR="$unrelated/.git" GIT_WORK_TREE="$unrelated" \
    GIT_INDEX_FILE="$unrelated/exported-index" \
    "$BATS_TEST_DIRNAME/../../node_modules/.bin/bats" \
    "$BATS_TEST_DIRNAME/check-agent-doc-paths.bats"
  [ "$status" -eq 0 ]
  [[ "$output" != *"not ok "* ]]
  [ ! -e "$unrelated/exported-index" ]
}
