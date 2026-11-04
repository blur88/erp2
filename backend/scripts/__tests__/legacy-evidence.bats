#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-legacy-evidence.sh"
SOURCE_REPO="$(CDPATH= cd -- "${BATS_TEST_DIRNAME}/../../.." && pwd)"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  git init -q "$REPO"
  # Seed from the independent, existing repository file set, not the guard list.
  git -C "$SOURCE_REPO" ls-files docs/testing docs/backend/measurements > "$BATS_TEST_TMPDIR/paths"
  while IFS= read -r path; do
    mkdir -p "$REPO/$(dirname "$path")"
    printf 'fixture\n' > "$REPO/$path"
  done < "$BATS_TEST_TMPDIR/paths"
  git -C "$REPO" add .
}

@test "accepts the current recursive legacy file set" {
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "reports recursive additions in both legacy directories" {
  for dir in docs/testing docs/backend/measurements; do
    mkdir -p "$REPO/$dir/nested"
    printf 'new\n' > "$REPO/$dir/nested/new record.txt"
  done
  git -C "$REPO" add .
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = $'legacy evidence added: docs/backend/measurements/nested/new record.txt\nlegacy evidence added: docs/testing/nested/new record.txt' ]
}

@test "reports removed paths in both legacy directories" {
  git -C "$REPO" rm -q -f docs/backend/measurements/1449/machine.txt docs/testing/msw-unhandled-request-rerun.json
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = $'legacy evidence removed: docs/backend/measurements/1449/machine.txt\nlegacy evidence removed: docs/testing/msw-unhandled-request-rerun.json' ]
}

@test "reports a rename as one removed and one added path" {
  git -C "$REPO" mv docs/testing/msw-unhandled-request-rerun.json docs/testing/renamed.json
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = $'legacy evidence removed: docs/testing/msw-unhandled-request-rerun.json\nlegacy evidence added: docs/testing/renamed.json' ]
}

@test "allows content edits, untracked paths, and tracked paths outside legacy directories" {
  printf 'edited\n' >> "$REPO/docs/testing/msw-unhandled-request-rerun.json"
  printf 'untracked\n' > "$REPO/docs/testing/untracked.txt"
  mkdir -p "$REPO/docs/evidence/1561" "$REPO/docs/testing-other"
  printf 'record\n' > "$REPO/docs/evidence/1561/README.md"
  printf 'outside\n' > "$REPO/docs/testing-other/example.txt"
  git -C "$REPO" add docs/evidence docs/testing-other docs/testing/msw-unhandled-request-rerun.json
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "unstaged deletions leave the tracked file set unchanged" {
  rm "$REPO/docs/testing/msw-unhandled-request-rerun.json"
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "fails closed when Git cannot list the tracked set" {
  mkdir "$BATS_TEST_TMPDIR/bin"
  cat > "$BATS_TEST_TMPDIR/bin/git" <<'GIT'
#!/usr/bin/env bash
if [[ "$*" == *rev-parse* ]]; then
  printf '%s\n' "$2"
else
  printf 'fixture: cannot read Git index\n' >&2
  exit 42
fi
GIT
  chmod +x "$BATS_TEST_TMPDIR/bin/git"
  run env PATH="$BATS_TEST_TMPDIR/bin:$PATH" bash "$CHECK" "$REPO"
  [ "$status" -eq 42 ]
  [ "$output" = 'fixture: cannot read Git index' ]
}

@test "test:scripts discovers these cases and they invoke the real guard" {
  run node -e 'const p=require(process.argv[1]); if(p.scripts["test:scripts"] !== "bats scripts/__tests__") process.exit(1)' "$SOURCE_REPO/backend/package.json"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
  [ -x "$CHECK" ]
}
