#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-no-claude-doc-references.sh"
CLAUDE_DOC_NAME='CLAUDE''.md'

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/docs/archive" "$REPO/backend" "$REPO/frontend"
  cd "$REPO"
  git init -q -b main
  git config user.email guardrail@test.invalid
  git config user.name guardrail-test
}

track_and_commit() {
  git add .
  git commit -q -m fixture
}

@test "rejects tracked references to the instruction importer as a documentation source" {
  printf 'See %s for the authoritative rules.\n' "$CLAUDE_DOC_NAME" > backend/example.ts
  track_and_commit

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"backend/example.ts"* ]]
}

@test "rejects new documentation-source references in ignore configuration" {
  printf '# See %s for the authoritative rules.\n' "$CLAUDE_DOC_NAME" > .gitignore
  printf '# Documentation source: %s\n' "$CLAUDE_DOC_NAME" > .dockerignore
  track_and_commit

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *".gitignore:1:"* ]]
  [[ "$output" == *".dockerignore:1:"* ]]
}

@test "the checked-out repository has no forbidden references" {
  local repo_dir
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
}

@test "allows the instruction importer, Docker exclusions, and archived documentation" {
  printf '%s\n' 'Instructions import AGENTS.md.' > "$CLAUDE_DOC_NAME"
  printf '# NOTE: %s is NOT ignored - it imports AGENTS.md, the authoritative project instructions\n' "$CLAUDE_DOC_NAME" > .gitignore
  printf '# - %s (project instructions)\n' "$CLAUDE_DOC_NAME" >> .gitignore
  printf '%s\n' "$CLAUDE_DOC_NAME" > .dockerignore
  printf '%s\n' "$CLAUDE_DOC_NAME" > backend/.dockerignore
  printf '%s\n' "$CLAUDE_DOC_NAME" > frontend/.dockerignore
  printf 'Historical note: %s was previously referenced.\n' "$CLAUDE_DOC_NAME" > docs/archive/old.md
  track_and_commit

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
}
