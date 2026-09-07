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

@test "orchestrator rejects an unknown flag" {
  run bash "$SCRIPTS_DIR/verify-e2e-cleanup.sh" --nope
  [ "$status" -eq 2 ]
  [[ "$output" == *"unknown option"* ]]
}

@test "orchestrator accepts --fresh" {
  run bash "$SCRIPTS_DIR/verify-e2e-cleanup.sh" --fresh --help
  [ "$status" -eq 0 ]
}

@test "orchestrator --help documents the exit codes" {
  run bash "$SCRIPTS_DIR/verify-e2e-cleanup.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--fresh"* ]]
}

# Failure paths. These use a FAKE helper on PATH-independent grounds: the
# orchestrator invokes "$HELPER" by absolute path, so the fake is installed by
# pointing the script at a scratch copy of scripts/ instead of stubbing node.
# Failure-path harness.
#
# TWO stubbing problems have to be solved together:
#
#  1. The orchestrator invokes `node "$HELPER"`, resolved through PATH. Under
#     setup_harness that is helpers/stub-bin/node, which logs and exits 0
#     WITHOUT running anything — so a fake helper placed on disk would never
#     execute and every assertion below would pass vacuously. We install a
#     `node` wrapper that delegates to the real binary captured in $REAL_NODE.
#
#  2. The orchestrator also shells out to `npm run migration:run` and
#     `npx ts-node ...`. Those must SUCCEED for a test that targets a later
#     phase (FAKE_INIT=2 stops at init only if migrations and the seed boot
#     got that far), so they are stubbed as no-ops that log their calls.
#
# Every stub appends to $CALL_LOG, so tests assert which phases actually ran
# rather than only the final exit code.
setup_fake_helper() {
  FAKE_DIR="$TEST_TMP/scripts"
  FAKE_BIN="$TEST_TMP/bin"
  CALL_LOG="$TEST_TMP/calls-orchestrator.log"
  mkdir -p "$FAKE_DIR" "$FAKE_BIN"
  : > "$CALL_LOG"
  export CALL_LOG

  # The copied script derives BACKEND_DIR from its own location, so under
  # $TEST_TMP/scripts/ it resolves to $TEST_TMP — no .env.test to source, and
  # the fake helper sits where it expects to find the real one.
  cp "$SCRIPTS_DIR/verify-e2e-cleanup.sh" "$FAKE_DIR/"

  # node wrapper: delegates to the REAL node so the fake helper below actually
  # runs. Without this the stub-bin node swallows every helper invocation.
  cat > "$FAKE_BIN/node" <<EOF
#!/usr/bin/env bash
printf 'node %s\n' "\$*" >> "$CALL_LOG"
exec "$REAL_NODE" "\$@"
EOF

  # npm: only `run migration:run` is expected; succeed and log it.
  cat > "$FAKE_BIN/npm" <<EOF
#!/usr/bin/env bash
printf 'npm %s\n' "\$*" >> "$CALL_LOG"
exit \${FAKE_NPM:-0}
EOF

  # npx: the seed boot (ts-node) and the jest passes both come through here.
  cat > "$FAKE_BIN/npx" <<EOF
#!/usr/bin/env bash
printf 'npx %s\n' "\$*" >> "$CALL_LOG"
case "\$*" in
  *e2e-leakcheck-boot*) exit \${FAKE_SEED_BOOT:-0} ;;
  *jest*)               exit \${FAKE_JEST:-0} ;;
esac
exit 0
EOF

  chmod +x "$FAKE_BIN"/node "$FAKE_BIN"/npm "$FAKE_BIN"/npx
  PATH="$FAKE_BIN:$PATH"
  export PATH

  # Fake helper: exits with the code named by FAKE_<subcommand> env vars.
  cat > "$FAKE_DIR/e2e-leakcheck.mjs" <<'EOF'
#!/usr/bin/env node
const cmd = process.argv[2];
const key = 'FAKE_' + cmd.replace(/-/g, '_').toUpperCase();
const code = parseInt(process.env[key] || '0', 10);
if (code !== 0) console.error(cmd + ': simulated failure');
process.exit(code);
EOF
  chmod +x "$FAKE_DIR/e2e-leakcheck.mjs"
}

# Asserts the fake helper really ran — the wrapper is load-bearing, and a
# regression here would silently make every failure-path test vacuous.
assert_helper_ran() {
  grep -q "e2e-leakcheck.mjs $1" "$CALL_LOG"
}

@test "the failure-path harness actually executes the fake helper" {
  setup_fake_helper
  run env FAKE_DB_EXISTS=1 FAKE_INIT=0 bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  # If the stub node were still in play, no helper line would be logged.
  assert_helper_ran "db-exists"
  assert_helper_ran "init"
}

@test "an indeterminate db-exists aborts instead of creating the database" {
  # A transient connection failure must NOT be read as "absent" and routed
  # into initialization against a database that may already exist.
  setup_fake_helper
  run env FAKE_DB_EXISTS=2 bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  [ "$status" -eq 2 ]
  [[ "$output" == *"could not determine"* ]]
  assert_helper_ran "db-exists"
  # The phases past the probe must never have been reached.
  ! grep -q "e2e-leakcheck.mjs db-create" "$CALL_LOG"
  ! grep -q "migration:run" "$CALL_LOG"
  ! grep -q "e2e-leakcheck.mjs init" "$CALL_LOG"
}

@test "a failed baseline capture stops at init, after migrations and seed boot" {
  # Migrations and the seed boot must SUCCEED here, or the run would stop
  # earlier and this would not be testing the init failure at all.
  setup_fake_helper
  run env FAKE_DB_EXISTS=1 FAKE_NPM=0 FAKE_SEED_BOOT=0 FAKE_INIT=2 \
    bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  [ "$status" -eq 2 ]
  [[ "$output" == *"baseline capture failed"* ]]
  [[ "$output" == *"No pass was run"* ]]
  # The earlier phases DID run...
  grep -q "migration:run" "$CALL_LOG"
  grep -q "e2e-leakcheck-boot" "$CALL_LOG"
  assert_helper_ran "init"
  # ...and no pass followed.
  ! grep -q "jest" "$CALL_LOG"
}

@test "a failed seed boot stops before the baseline is captured" {
  setup_fake_helper
  run env FAKE_DB_EXISTS=1 FAKE_SEED_BOOT=1 bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  [ "$status" -eq 2 ]
  [[ "$output" == *"seed boot failed"* ]]
  # init must never run: a baseline captured without seeds would report
  # users and price_lists as leaks on pass 1.
  ! grep -q "e2e-leakcheck.mjs init" "$CALL_LOG"
  ! grep -q "jest" "$CALL_LOG"
}

@test "a failed migration stops before the seed boot" {
  setup_fake_helper
  run env FAKE_DB_EXISTS=1 FAKE_NPM=1 bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  [ "$status" -eq 2 ]
  [[ "$output" == *"migrations failed"* ]]
  ! grep -q "e2e-leakcheck-boot" "$CALL_LOG"
  ! grep -q "e2e-leakcheck.mjs init" "$CALL_LOG"
}

@test "dirty-start drift exits 1, not 2, and runs no pass" {
  # The spec assigns exit 1 to every baseline difference. Collapsing this to 2
  # would misreport a real finding as "nothing was checked".
  setup_fake_helper
  run env FAKE_DB_EXISTS=0 FAKE_VERIFY_REUSABLE=1 \
    bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not reusable"* ]]
  assert_helper_ran "verify-reusable"
  ! grep -q "jest" "$CALL_LOG"
}

@test "an incomparable or missing baseline on reuse exits 2" {
  setup_fake_helper
  run env FAKE_DB_EXISTS=0 FAKE_VERIFY_REUSABLE=2 \
    bash "$FAKE_DIR/verify-e2e-cleanup.sh"
  [ "$status" -eq 2 ]
  assert_helper_ran "verify-reusable"
  ! grep -q "jest" "$CALL_LOG"
}
