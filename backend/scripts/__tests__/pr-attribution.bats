#!/usr/bin/env bats

REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"

setup() {
  git init -q --initial-branch=main "$BATS_TEST_TMPDIR/repo"
  cd "$BATS_TEST_TMPDIR/repo"
  git config user.name Test
  git config user.email test@example.invalid
  git config commit.gpgsign false
  git config core.hooksPath /dev/null
  mkdir .githooks
  cp "$REPO_DIR/.githooks/commit-msg" .githooks/
  git commit -q --allow-empty -m 'chore: base'
  base=$(git rev-parse HEAD)
  event="$BATS_TEST_TMPDIR/event.json"
}

write_event() {
  jq -n --arg base "$base" --arg head "$(git rev-parse HEAD)" --arg body "$1" \
    '{pull_request: {base: {sha: $base}, head: {sha: $head}, body: $body}}' > "$event"
}

@test "clean range and null description pass, including permitted coauthors" {
  git commit -q --allow-empty -m $'feat: clean\n\nCo-Authored-By: Example <example@example.invalid>'
  write_event ''
  jq '.pull_request.body = null' "$event" > "$event.tmp"
  mv "$event.tmp" "$event"
  run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
  [ "$status" -eq 0 ]
}

@test "all hook patterns reject descriptions and removing them passes at the same SHA" {
  git commit -q --allow-empty -m 'feat: clean'
  for body in 'cLaUdE-sEsSiOn: abc' 'https://claude.ai/code/session_abc' 'Generated with [Claude Code](https://example.invalid)'; do
    write_event "$body"
    run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
    [ "$status" -eq 1 ]
    [[ "$output" == *"PR description"* ]]
    write_event 'Clean description'
    run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
    [ "$status" -eq 0 ]
  done
}

@test "prohibited attribution in an earlier commit fails even when tip is clean" {
  git commit -q --allow-empty -m $'feat: earlier\n\nGenerated with Claude Code'
  bad_commit=$(git rev-parse HEAD)
  git commit -q --allow-empty -m 'feat: clean tip'
  write_event 'Clean'
  run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
  [ "$status" -eq 1 ]
  [[ "$output" == *"$bad_commit"* ]]
}

@test "base commits are excluded and shell syntax in descriptions stays inert" {
  git commit -q --allow-empty -m 'Claude-Session: historical'
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m 'feat: clean'
  write_event '$(touch injected) `touch injected` "${{ secrets.TOKEN }}"'
  run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
  [ "$status" -eq 0 ]
  [ ! -e injected ]
}

@test "missing revisions and malformed events fail closed" {
  write_event ''
  jq '.pull_request.base.sha = ("a" * 40)' "$event" > "$event.tmp"
  mv "$event.tmp" "$event"
  run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
  [ "$status" -ne 0 ]
  printf '{}' > "$event"
  run bash "$REPO_DIR/scripts/check-pr-attribution.sh" "$event"
  [ "$status" -ne 0 ]
}
