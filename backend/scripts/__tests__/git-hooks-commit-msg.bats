#!/usr/bin/env bats
#
# Guard for the local commit-message attribution refusal (#1813).
#
# Runs the real .githooks/commit-msg inside a throwaway repository. A message
# that carries a prohibited Claude attribution string must be refused and must
# create no commit; a clean message must still succeed. The hook is local only:
# it does not cover --no-verify commits, PR bodies, or other clones.
#
# The repository sits on a feature branch so the pre-commit main-branch refusal
# does not run first and mask the commit-msg result.

REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"

setup() {
  WORK="$BATS_TEST_TMPDIR/work"
  git init -q --initial-branch=main "$WORK"
  cd "$WORK" || return 1
  git config user.name 'Hook Test'
  git config user.email 'hooks@example.invalid'
  # Signing is off so commits do not depend on the developer's global config.
  git config commit.gpgsign false
  cp -R "$REPO_DIR/.githooks" .githooks
  git config core.hooksPath .githooks
  git switch -q -c feature/1813-check
}

@test "commit-msg hook is shipped with the executable bit" {
  [ -x "$REPO_DIR/.githooks/commit-msg" ]
}

@test "message with a Claude-Session trailer is refused and names the rule" {
  cd "$WORK"
  printf 'feat: example\n\nClaude-Session: abc123\n' > "$BATS_TEST_TMPDIR/msg"
  run git commit -q --allow-empty -F "$BATS_TEST_TMPDIR/msg"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Claude-Session"* ]]
  [ -z "$(git rev-parse --verify -q HEAD)" ]
}

@test "message with a claude.ai/code/session_ link is refused and names the rule" {
  cd "$WORK"
  printf 'feat: example\n\nhttps://claude.ai/code/session_abc123\n' > "$BATS_TEST_TMPDIR/msg"
  run git commit -q --allow-empty -F "$BATS_TEST_TMPDIR/msg"
  [ "$status" -ne 0 ]
  [[ "$output" == *"claude.ai/code/session_"* ]]
  [ -z "$(git rev-parse --verify -q HEAD)" ]
}

@test "verbose diff below the scissors line is not read as the message" {
  cd "$WORK"
  # git commit -v appends the staged diff under a scissors line. Staged content
  # that mentions the prohibited string must not refuse a clean message.
  printf 'Claude-Session mentioned in staged content\n' > staged.txt
  git add staged.txt
  printf '#!/bin/sh\nprintf "feat: example\\n\\n" | cat - "$1" > "$1.new" && mv "$1.new" "$1"\n' > "$BATS_TEST_TMPDIR/editor.sh"
  chmod +x "$BATS_TEST_TMPDIR/editor.sh"
  run env GIT_EDITOR="$BATS_TEST_TMPDIR/editor.sh" git commit -q -v
  [ "$status" -eq 0 ]
  [ -n "$(git rev-parse --verify -q HEAD)" ]
}

@test "clean message is accepted" {
  cd "$WORK"
  printf 'feat: example\n\nCo-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>\n' > "$BATS_TEST_TMPDIR/msg"
  run git commit -q --allow-empty -F "$BATS_TEST_TMPDIR/msg"
  [ "$status" -eq 0 ]
  [ -n "$(git rev-parse --verify -q HEAD)" ]
}
