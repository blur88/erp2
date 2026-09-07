#!/usr/bin/env bats
#
# Guard boundaries for the leak-check helper. The drop guard is the single
# point where this tool can destroy data, so it is tested directly rather
# than only through the orchestrator.

load helpers/load

teardown() { teardown_harness; }

HELPER() { echo "$SCRIPTS_DIR/e2e-leakcheck.mjs"; }

# CRITICAL: setup_harness prepends helpers/stub-bin to PATH, and its `node`
# stub logs its arguments and exits 0 WITHOUT executing anything. Running these
# guard tests through that stub would pass vacuously while never invoking the
# guard — an inert test indistinguishable from a working one. Resolve the real
# Node binary BEFORE the stub directory is on PATH, and invoke it by absolute
# path everywhere below.
#
# Exactly ONE setup() may be defined in a bats file: a second definition
# silently replaces the first.
setup() {
  REAL_NODE="$(command -v node)"
  setup_harness
}

@test "the guard tests use the real node, not the stub" {
  # Guards the guards: if this ever resolves into stub-bin, every test below
  # silently stops testing anything.
  [[ "$REAL_NODE" != *"stub-bin"* ]]
  run "$REAL_NODE" --version
  [ "$status" -eq 0 ]
}

@test "db-drop refuses a database that is not the leak-check database" {
  run env DB_DATABASE=erp_db_test DB_HOST=localhost DB_PORT=5432 \
    DB_USERNAME=erp_user DB_PASSWORD=x \
    "$REAL_NODE" "$(HELPER)" db-drop
  [ "$status" -eq 2 ]
  [[ "$output" == *"refusing"* ]]
  [[ "$output" == *"erp_db_leakcheck_test"* ]]
}

@test "db-drop refuses the live database" {
  run env DB_DATABASE=erp_db DB_HOST=localhost DB_PORT=5432 \
    DB_USERNAME=erp_user DB_PASSWORD=x \
    "$REAL_NODE" "$(HELPER)" db-drop
  [ "$status" -eq 2 ]
  [[ "$output" == *"refusing"* ]]
}

@test "an unknown subcommand exits 2 rather than doing nothing" {
  run env DB_DATABASE=erp_db_leakcheck_test DB_HOST=localhost DB_PORT=5432 \
    DB_USERNAME=erp_user DB_PASSWORD=x \
    "$REAL_NODE" "$(HELPER)" not-a-command
  [ "$status" -eq 2 ]
}
