#!/usr/bin/env bats

setup() {
  REPO_DIR="$(CDPATH= cd -- "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

# Line-based policy intentionally excludes backticks, plain cd statements,
# multiline substitutions, and every line containing CDPATH= (even in a comment
# or alongside a separate unsafe substitution).
scan_substitutions() {
  local root="$1" file first
  local found=0
  while IFS= read -r -d '' file; do
    case "$file" in
      *.sh|*.bash|*.bats) ;;
      *)
        # Other files need a direct sh/bash or env [-S] sh/bash shebang.
        # Other interpreters and files without a shell shebang are excluded.
        IFS= read -r first < "$root/$file" || true
        [[ "$first" =~ ^\#![[:space:]]*(/[^[:space:]]*/(ba)?sh|/usr/bin/env[[:space:]]+(-S[[:space:]]+)?(ba)?sh)([[:space:]]|$) ]] || continue
        ;;
    esac
    while IFS= read -r match; do
      printf '%s:%s\n' "$file" "$match"
      found=1
    done < <(awk '/\$\([[:space:]]*cd[[:space:]]/ && !/CDPATH=/ { print NR ": " $0 }' "$root/$file")
  done < <(git -C "$root" ls-files -z)
  return "$found"
}

@test "tracked shell substitutions neutralize CDPATH" {
  run scan_substitutions "$REPO_DIR"
  printf '%s\n' "$output"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "scanner reports complete lines and ignores safe and untracked files" {
  # Split the substitution opener to avoid scanning our own fixture text.
  local open='$('
  local fixture="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$fixture"
  git -C "$fixture" init -q
  printf '%s\n' "x=${open}cd somewhere && pwd)" "x=${open} cd elsewhere && pwd)" 'x=$(CDPATH= cd -- somewhere && pwd)' 'cd somewhere' > "$fixture/check.sh"
  printf '%s\n' "x=${open}cd other && pwd)" > "$fixture/check.bash"
  printf '%s\n' "x=${open}cd last && pwd)" > "$fixture/check.bats"
  printf '%s\n' 'x=`cd somewhere && pwd`' "x=${open}" 'cd somewhere' ')' >> "$fixture/check.sh"
  printf '%s\n' "a=${open}CDPATH= cd -- x && pwd); b=${open}cd y && pwd)" "c=${open}cd z) # CDPATH= note" >> "$fixture/check.sh"
  printf '%s\n' '#!/bin/sh' "x=${open}cd somewhere && pwd)" > "$fixture/extensionless"
  cp "$fixture/check.sh" "$fixture/untracked.sh"
  git -C "$fixture" add check.sh check.bash check.bats extensionless
  run scan_substitutions "$fixture"
  [ "$status" -eq 1 ]
  [ "$output" = "check.bash:1: x=${open}cd other && pwd)
check.bats:1: x=${open}cd last && pwd)
check.sh:1: x=${open}cd somewhere && pwd)
check.sh:2: x=${open} cd elsewhere && pwd)
extensionless:2: x=${open}cd somewhere && pwd)" ]
}

@test "trigger guard resolves relative repository through exported CDPATH" {
  mkdir -p "$BATS_TEST_TMPDIR/search/project/backend/src"
  cd "$BATS_TEST_TMPDIR/search"
  export CDPATH=.
  run bash "$REPO_DIR/backend/scripts/verify-no-trigger-bypass.sh" project
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "scanner recognizes shell shebang forms and excludes other interpreters" {
  local fixture="$BATS_TEST_TMPDIR/repo" open='$(' shell
  mkdir -p "$fixture"
  git -C "$fixture" init -q
  for shell in '#!/bin/sh' '#!/bin/bash' '#!/usr/bin/env sh' '#!/usr/bin/env bash' '#!/usr/bin/env -S bash -eu'; do
    printf '%s\n' "$shell" "x=${open}cd somewhere)" > "$fixture/script"
    git -C "$fixture" add script
    run scan_substitutions "$fixture"
    [ "$status" -eq 1 ]
    [ "$output" = "script:2: x=${open}cd somewhere)" ]
  done
  for shell in '#!/usr/bin/python' '#!/bin/bashful' 'no shebang'; do
    printf '%s\n' "$shell" "x=${open}cd somewhere)" > "$fixture/script"
    run scan_substitutions "$fixture"
    [ "$status" -eq 0 ]
    [ "$output" = '' ]
  done
}
