#!/usr/bin/env bats

setup() {
  REPO_DIR="$(CDPATH= cd -- "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

# Line-based policy intentionally excludes backticks and plain cd statements.
scan_substitutions() {
  local root="$1" file
  local found=0
  while IFS= read -r -d '' file; do
    while IFS= read -r match; do
      printf '%s:%s\n' "$file" "$match"
      found=1
    done < <(awk '/\$\([[:space:]]*cd[[:space:]]/ && !/CDPATH=/ { print NR ": " $0 }' "$root/$file")
  done < <(git -C "$root" ls-files -z -- '*.sh' '*.bash' '*.bats')
  return "$found"
}

@test "tracked shell substitutions neutralize CDPATH" {
  run scan_substitutions "$REPO_DIR"
  printf '%s\n' "$output"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "scanner reports complete lines and ignores safe and untracked files" {
  local fixture="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$fixture"
  git -C "$fixture" init -q
  printf '%s\n' 'x=$(cd somewhere && pwd)' 'x=$( cd elsewhere && pwd)' 'x=$(CDPATH= cd -- somewhere && pwd)' 'cd somewhere' > "$fixture/check.sh"
  printf '%s\n' 'x=$(cd other && pwd)' > "$fixture/check.bash"
  printf '%s\n' 'x=$(cd last && pwd)' > "$fixture/check.bats"
  cp "$fixture/check.sh" "$fixture/untracked.sh"
  git -C "$fixture" add check.sh check.bash check.bats
  run scan_substitutions "$fixture"
  [ "$status" -eq 1 ]
  [ "$output" = 'check.bash:1: x=$(cd other && pwd)
check.bats:1: x=$(cd last && pwd)
check.sh:1: x=$(cd somewhere && pwd)
check.sh:2: x=$( cd elsewhere && pwd)' ] # CDPATH= fixtures deliberately contain unsafe shapes
}

@test "trigger guard resolves relative repository through exported CDPATH" {
  mkdir -p "$BATS_TEST_TMPDIR/search/project/backend/src" "$BATS_TEST_TMPDIR/work"
  cd "$BATS_TEST_TMPDIR/work"
  export CDPATH="$BATS_TEST_TMPDIR/search"
  run bash "$REPO_DIR/backend/scripts/verify-no-trigger-bypass.sh" project
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}
