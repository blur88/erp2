#!/usr/bin/env bats
# Tests for the Backup lifecycle gate's helpers and entry guard (#2111). The
# full run needs Docker and runs in the production-image CI job; these tests
# cover the logic that decides pass or fail.

setup() {
  lib="$BATS_TEST_DIRNAME/../backup-lifecycle/lib.sh"
  helper="$BATS_TEST_DIRNAME/../backup-lifecycle/s3-helper.cjs"
  run_sh="$BATS_TEST_DIRNAME/../backup-lifecycle/run.sh"
  export PG_PASSWORD="pg-secret-value-0001"
  export S3_SECRET_ACCESS_KEY="s3-secret-value-0002"
  export JWT_SECRET="jwt-secret-value-0003"
}

write_manifest() {
  local file="$1" rp="$2" extra="${3:-}"
  cat > "$file" <<JSON
{
  "format_version": 1,
  "recovery_point": "${rp}",
  "release": "1.0.0",
  "postgres": { "server_major": 19, "client_major": 19 },
  "archive": { "name": "backup.tar.age", "size": 4096, "sha256": "$(printf 'a%.0s' {1..64})" },
  "age_recipient_fingerprint": "$(printf 'b%.0s' {1..64})",
  "checks": {
    "uploads_references": "passed",
    "dump_readable": "passed",
    "application_role_in_globals": "passed",
    "decryption": "not verified"
  }${extra}
}
JSON
}

@test "require_env names every missing variable and never prints values" {
  run bash -c "source '$lib'; unset ALPHA BETA; ALPHA=secret-alpha; require_env ALPHA BETA GAMMA"
  [ "$status" -eq 1 ]
  [[ "$output" == *"BETA GAMMA"* ]]
  [[ "$output" != *"secret-alpha"* ]]
}

@test "assert_manifest accepts the published shape" {
  write_manifest "$BATS_TEST_TMPDIR/m.json" "20261128T101500123Z"
  run bash -c "source '$lib'; assert_manifest '$BATS_TEST_TMPDIR/m.json' 20261128T101500123Z 1.0.0"
  [ "$status" -eq 0 ]
  [[ "$output" == *"manifest shape and values"* ]]
}

@test "assert_manifest rejects an unexpected extra field" {
  write_manifest "$BATS_TEST_TMPDIR/m.json" "20261128T101500123Z" ',"password_hash": "x"'
  run bash -c "source '$lib'; assert_manifest '$BATS_TEST_TMPDIR/m.json' 20261128T101500123Z 1.0.0"
  [ "$status" -eq 1 ]
  [[ "$output" == *"does not match the published shape"* ]]
}

@test "assert_manifest rejects a wrong recovery point" {
  write_manifest "$BATS_TEST_TMPDIR/m.json" "20261128T101500123Z"
  run bash -c "source '$lib'; assert_manifest '$BATS_TEST_TMPDIR/m.json' 20261129T000000000Z 1.0.0"
  [ "$status" -eq 1 ]
}

@test "assert_manifest rejects a claimed decryption result" {
  write_manifest "$BATS_TEST_TMPDIR/m.json" "20261128T101500123Z"
  sed -i 's/"not verified"/"verified"/' "$BATS_TEST_TMPDIR/m.json"
  run bash -c "source '$lib'; assert_manifest '$BATS_TEST_TMPDIR/m.json' 20261128T101500123Z 1.0.0"
  [ "$status" -eq 1 ]
}

@test "assert_no_secrets fails when a configured secret appears in a checked file" {
  printf 'the database password is %s\n' "$PG_PASSWORD" > "$BATS_TEST_TMPDIR/leak.txt"
  run bash -c "source '$lib'; assert_no_secrets '$BATS_TEST_TMPDIR/leak.txt'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"a secret value appeared"* ]]
}

@test "assert_no_secrets fails on an age private key and passes on clean output" {
  printf 'AGE-SECRET-KEY-1EXAMPLE\n' > "$BATS_TEST_TMPDIR/key.txt"
  run bash -c "source '$lib'; assert_no_secrets '$BATS_TEST_TMPDIR/key.txt'"
  [ "$status" -eq 1 ]

  printf '{"state":"ok"}\n' > "$BATS_TEST_TMPDIR/clean.json"
  run bash -c "source '$lib'; assert_no_secrets '$BATS_TEST_TMPDIR/clean.json'"
  [ "$status" -eq 0 ]
}

@test "expect_code fails and shows the response body" {
  run bash -c "source '$lib'; HTTP_CODE=409; HTTP_BODY='{\"message\":\"busy\"}'; expect_code 202 'start'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"expected HTTP 202, got 409"* ]]
  [[ "$output" == *"busy"* ]]
}

@test "wait_until_idle returns once status reports no running attempt" {
  run bash -c "source '$lib'; api() { HTTP_CODE=200; HTTP_BODY='{\"running\":null}'; }; wait_until_idle 3"
  [ "$status" -eq 0 ]
}

@test "wait_until_idle fails when an attempt never finishes" {
  run bash -c "source '$lib'; api() { HTTP_CODE=200; HTTP_BODY='{\"running\":{\"recoveryPoint\":\"x\"}}'; }; wait_until_idle 2"
  [ "$status" -eq 1 ]
  [[ "$output" == *"still running after 2s"* ]]
}

@test "run.sh refuses to start without its required environment" {
  run env -i PATH="$PATH" bash "$run_sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing required environment: IMAGE S3_IMAGE NET PG_HOST PG_PASSWORD REDIS_HOST S3_HOST HC_HOST"* ]]
}

@test "the storage helper rejects an unknown command with a usage status" {
  run node "$helper" not-a-command
  [ "$status" -eq 64 ]
}

@test "the storage helper rejects put without a key and a source file" {
  run node "$helper" put only-a-key
  [ "$status" -eq 64 ]
}

@test "the heartbeat stub refuses to start without a port and a log file" {
  stub="$BATS_TEST_DIRNAME/../backup-lifecycle/heartbeat-stub.cjs"
  run node "$stub"
  [ "$status" -eq 64 ]
}

@test "the heartbeat stub records only pings to the two checks and answers anything else with a refusal" {
  stub="$BATS_TEST_DIRNAME/../backup-lifecycle/heartbeat-stub.cjs"
  port=$(( 20000 + RANDOM % 20000 ))
  log="$BATS_TEST_TMPDIR/pings.log"
  node "$stub" "$port" "$log" >/dev/null 2>&1 &
  pid=$!
  run node -e "
    (async () => {
      for (let i = 0; i < 100; i++) {
        try { await fetch('http://127.0.0.1:${port}/readiness-probe'); break; }
        catch { await new Promise((r) => setTimeout(r, 50)); }
      }
      const codes = [];
      for (const path of ['/ping/primary', '/ping/secondary', '/ping/start', '/ping/fail']) {
        codes.push((await fetch('http://127.0.0.1:${port}' + path)).status);
      }
      console.log(codes.join(' '));
    })();"
  kill "$pid"
  wait "$pid" 2>/dev/null || true
  [ "$status" -eq 0 ]
  [ "$output" = "200 200 404 404" ]
  [ "$(wc -l < "$log")" -eq 2 ]
  [[ "$(cat "$log")" != *"start"* ]]
  [[ "$(cat "$log")" != *"fail"* ]]
}
