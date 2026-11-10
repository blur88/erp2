#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-coding-standards.sh"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO"
}

write_rule() {
  local heading="$1" fields="$2"
  printf '### %s\n\n' "$heading"
  for field in $fields; do
    printf -- '- **%s:** text\n' "${field//_/ }"
  done
  printf '\n'
}

@test "accepts rules that state Rule, Why, Diff failure and Trace" {
  {
    printf '# Coding Standards\n\n## Area\n\n'
    write_rule "First rule" "Rule Why Diff_failure Trace"
    write_rule "Second rule" "Rule Why Diff_failure Trace"
  } > "$REPO/CODING_STANDARDS.md"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
}

@test "names the rule and the missing field" {
  {
    printf '# Coding Standards\n\n## Area\n\n'
    write_rule "Complete rule" "Rule Why Diff_failure Trace"
    write_rule "Untraced rule" "Rule Why Diff_failure"
  } > "$REPO/CODING_STANDARDS.md"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Untraced rule: missing Trace"* ]]
  [[ "$output" != *"Complete rule"* ]]
}

@test "rejects a field written outside its rule" {
  {
    printf '# Coding Standards\n\n## Area\n\n'
    write_rule "Rule without why" "Rule Diff_failure Trace"
    printf '## Next area\n\n- **Why:** stray\n'
  } > "$REPO/CODING_STANDARDS.md"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Rule without why: missing Why"* ]]
}

@test "rejects a field with no text" {
  {
    printf '# Coding Standards\n\n## Area\n\n'
    write_rule "Placeholder rule" "Rule Why Diff_failure"
    printf -- '- **Trace:**\n\n'
  } > "$REPO/CODING_STANDARDS.md"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Placeholder rule: missing Trace"* ]]
}

@test "rejects a file with no rules" {
  printf '# Coding Standards\n\nNothing yet.\n' > "$REPO/CODING_STANDARDS.md"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"no rules"* ]]
}

@test "the checked-out repository's CODING_STANDARDS.md is well-formed" {
  local repo_dir
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
}
