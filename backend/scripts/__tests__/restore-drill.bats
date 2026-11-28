#!/usr/bin/env bats
# Tests for the Restore drill's entry guard and for the runbook extraction it depends on (#2113).
# The full drill needs Docker and runs in the production-image CI job.

setup() {
  drill="$BATS_TEST_DIRNAME/../backup-lifecycle/restore-drill.sh"
  extract="$BATS_TEST_DIRNAME/../backup-lifecycle/runbook-blocks.cjs"
  runbook="$BATS_TEST_DIRNAME/../../../docs/deployment/BACKUP_RESTORE_RUNBOOK.md"
}

@test "the drill names every missing required variable and never prints values" {
  run env -i PATH="$PATH" HOME="$HOME" IMAGE=erp-backend:ci PG_PASSWORD=pg-secret-value-0001 \
    bash "$drill"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing required environment:"* ]]
  [[ "$output" == *"NET"* ]]
  [[ "$output" == *"RESTORE_PG_PORT"* ]]
  [[ "$output" != *"pg-secret-value-0001"* ]]
}

@test "the runbook's restore commands extract as one valid bash script" {
  run node "$extract" "$runbook" "## Restore commands"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" > "$BATS_TEST_TMPDIR/restore-commands.sh"
  run bash -n "$BATS_TEST_TMPDIR/restore-commands.sh"
  [ "$status" -eq 0 ]
}

@test "the extraction stops at the next top-level heading, so operator-only blocks never run in CI" {
  run node "$extract" "$runbook" "## Restore commands"
  [ "$status" -eq 0 ]
  [[ "$output" != *"docker run"* ]]
  [[ "$output" != *"docker compose"* ]]
}
