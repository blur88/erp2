#!/usr/bin/env bats

setup() {
  ENTRYPOINT="$BATS_TEST_DIRNAME/../../docker-entrypoint.sh"
  STUB_LOG="$BATS_TEST_TMPDIR/calls"
  export STUB_LOG
  : > "$STUB_LOG"
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  cat > "$BATS_TEST_TMPDIR/bin/node" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$STUB_LOG"
if [ "$1" = dist/database/check-baseline.js ]; then
  printf '%s' "$BASELINE_OUTPUT"
  exit "$BASELINE_EXIT"
fi
STUB
  chmod +x "$BATS_TEST_TMPDIR/bin/node"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
  export BASELINE_OUTPUT=UNTRACKED_SCHEMA BASELINE_EXIT=0
}

@test "entrypoint: untracked schema refuses startup and points to manual guidance" {
  run sh "$ENTRYPOINT"
  [ "$status" -ne 0 ]
  [ "$(cat "$STUB_LOG")" = 'dist/database/check-baseline.js' ]
  [ "$output" = '[entrypoint] Checking migration baseline...
[entrypoint] FATAL: this database has an existing schema but no migration history.
[entrypoint] Manual reconciliation is required before startup.
[entrypoint] See repository documentation: docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md, section "Existing database".' ]
  [[ "$output" != *--fake* ]]
}

@test "entrypoint: unknown baseline output refuses startup" {
  export BASELINE_OUTPUT=UNKNOWN
  run sh "$ENTRYPOINT"
  [ "$status" -ne 0 ]
  [ "$(cat "$STUB_LOG")" = 'dist/database/check-baseline.js' ]
  [ "$output" = "[entrypoint] Checking migration baseline...
[entrypoint] FATAL: unrecognised baseline state: 'UNKNOWN'." ]
}

@test "entrypoint: empty baseline output refuses startup" {
  export BASELINE_OUTPUT=''
  run sh "$ENTRYPOINT"
  [ "$status" -ne 0 ]
  [ "$(cat "$STUB_LOG")" = 'dist/database/check-baseline.js' ]
  [ "$output" = "[entrypoint] Checking migration baseline...
[entrypoint] FATAL: unrecognised baseline state: ''." ]
}

# With set -e, the assignment inherits the producer's exit status. Even a
# safe-looking token cannot allow startup when the producer fails.
@test "entrypoint: failed baseline producer stops startup through set -e" {
  export BASELINE_OUTPUT=FRESH BASELINE_EXIT=1
  run sh "$ENTRYPOINT"
  [ "$status" -eq 1 ]
  [ "$(cat "$STUB_LOG")" = 'dist/database/check-baseline.js' ]
  [ "$output" = '[entrypoint] Checking migration baseline...' ]
}

assert_safe_startup() {
  run sh "$ENTRYPOINT"
  [ "$status" -eq 0 ]
  [ "$(cat "$STUB_LOG")" = 'dist/database/check-baseline.js
node_modules/.bin/typeorm migration:run -d dist/config/database.config.js
dist/main' ]
  [ "$output" = '[entrypoint] Checking migration baseline...
[entrypoint] Running database migrations...
[entrypoint] Migrations applied.
[entrypoint] Starting application...' ]
}

@test "entrypoint: fresh database runs migrations before starting the app" {
  export BASELINE_OUTPUT=FRESH
  assert_safe_startup
}

@test "entrypoint: baselined database runs migrations before starting the app" {
  export BASELINE_OUTPUT=BASELINED
  assert_safe_startup
}
