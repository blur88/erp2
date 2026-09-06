#!/usr/bin/env bats
#
# Guard for the ten-minute hang that absent test Redis used to produce:
# ioredis retries rather than failing, so `npm run test:redis` burned Jest's
# 60s testTimeout per test instead of reporting that nothing was listening.
#
# These tests bind a real ephemeral TCP listener (and pick a closed port) to
# exercise the probe's actual decision boundary, rather than stubbing node.

SCRIPT="$BATS_TEST_DIRNAME/../preflight-redis-test.sh"

setup() {
  # Keep the probe fast; these specs never wait on a real Redis handshake.
  export REDIS_TEST_PREFLIGHT_TIMEOUT_MS=1500
  # The reachability tests below all assume the opt-in gate (issue #1190) has
  # already been cleared; the gate's own boundary is exercised separately at
  # the bottom of this file. Without this export every test here would fail at
  # the gate instead of at the behaviour it is checking.
  export REDIS_TEST_ALLOW_WRITES=1
}

teardown() {
  if [ -n "${LISTENER_PID:-}" ]; then
    kill "$LISTENER_PID" 2>/dev/null || true
    wait "$LISTENER_PID" 2>/dev/null || true
    LISTENER_PID=""
  fi
}

# Starts a bare TCP listener and exports LISTEN_PORT. The probe only opens a
# connection, so it does not need to speak the Redis protocol.
start_listener() {
  local port_file="$BATS_TEST_TMPDIR/port"
  node -e '
    const net = require("net");
    const fs = require("fs");
    const server = net.createServer(() => {});
    server.listen(0, "127.0.0.1", () => {
      fs.writeFileSync(process.argv[1], String(server.address().port));
    });
  ' "$port_file" &
  LISTENER_PID=$!

  # Wait for the port file rather than sleeping a fixed interval.
  local waited=0
  while [ ! -s "$port_file" ] && [ "$waited" -lt 50 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  [ -s "$port_file" ] || return 1
  LISTEN_PORT="$(cat "$port_file")"
}

# Returns a port with nothing bound to it.
closed_port() {
  node -e '
    const net = require("net");
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => console.log(port));
    });
  '
}

@test "exits 0 and prints nothing when the port is reachable" {
  start_listener
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$LISTEN_PORT" run "$SCRIPT"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "exits non-zero when nothing is listening" {
  local port
  port="$(closed_port)"
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$port" run "$SCRIPT"
  [ "$status" -ne 0 ]
}

@test "failure names the resolved host and port" {
  local port
  port="$(closed_port)"
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$port" run "$SCRIPT"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF "127.0.0.1:${port}"
}

@test "failure names both environment variables" {
  local port
  port="$(closed_port)"
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$port" run "$SCRIPT"
  echo "$output" | grep -qF 'REDIS_TEST_HOST'
  echo "$output" | grep -qF 'REDIS_TEST_PORT'
}

@test "failure includes a copy-paste container command" {
  local port
  port="$(closed_port)"
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$port" run "$SCRIPT"
  echo "$output" | grep -qF 'docker run -d --name erp-redis-test-6399'
  echo "$output" | grep -qF '6399:6379'
  echo "$output" | grep -qF 'redis-server --maxmemory-policy noeviction'
}

@test "failure warns against pointing the suite at a shared Redis" {
  local port
  port="$(closed_port)"
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$port" run "$SCRIPT"
  echo "$output" | grep -qF 'WARNING'
  echo "$output" | grep -qiF "do not point this suite at the app's Redis"
}

@test "defaults to 127.0.0.1:6399 when the variables are unset" {
  # Unset rather than overridden: this asserts the defaults the spec itself uses.
  run env -u REDIS_TEST_HOST -u REDIS_TEST_PORT "$SCRIPT"
  # Nothing should be listening on 6399 during a bats run; if something is, the
  # probe succeeds silently and there is no output to inspect.
  if [ "$status" -ne 0 ]; then
    echo "$output" | grep -qF '127.0.0.1:6399'
  fi
}

@test "fails fast rather than retrying until a Jest timeout" {
  local port start elapsed
  port="$(closed_port)"
  start=$(date +%s)
  REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$port" run "$SCRIPT"
  elapsed=$(( $(date +%s) - start ))
  [ "$status" -ne 0 ]
  # The bug being guarded took ~600s. Ten seconds is a generous ceiling that
  # still fails loudly if the probe ever regains retry behaviour.
  [ "$elapsed" -lt 10 ]
}

# --- Opt-in gate (issue #1190) ----------------------------------------------
#
# The suite writes real BullMQ queue state, so the preflight refuses to run
# unless REDIS_TEST_ALLOW_WRITES=1. An address cannot express "disposable":
# the app's Redis can run on any port and CI deliberately uses 6379.

# Like start_listener, but records each accepted connection to a file so a test
# can assert the probe never dialled. Exports LISTEN_PORT and CONN_LOG.
start_counting_listener() {
  local port_file="$BATS_TEST_TMPDIR/counting_port"
  CONN_LOG="$BATS_TEST_TMPDIR/connections"
  : > "$CONN_LOG"
  node -e '
    const net = require("net");
    const fs = require("fs");
    const [portFile, connLog] = [process.argv[1], process.argv[2]];
    const server = net.createServer(() => {
      fs.appendFileSync(connLog, "connected\n");
    });
    server.listen(0, "127.0.0.1", () => {
      fs.writeFileSync(portFile, String(server.address().port));
    });
  ' "$port_file" "$CONN_LOG" &
  LISTENER_PID=$!

  local waited=0
  while [ ! -s "$port_file" ] && [ "$waited" -lt 50 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  [ -s "$port_file" ] || return 1
  LISTEN_PORT="$(cat "$port_file")"
}

@test "aborts when the opt-in is unset" {
  start_listener
  run env -u REDIS_TEST_ALLOW_WRITES \
    REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$LISTEN_PORT" "$SCRIPT"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF 'REDIS_TEST_ALLOW_WRITES'
}

@test "aborts when the opt-in is set to anything other than 1" {
  start_listener
  # Fail closed: only an exact "1" opts in. "0", "true" and "" must not.
  for value in 0 true yes ""; do
    REDIS_TEST_ALLOW_WRITES="$value" \
      REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$LISTEN_PORT" run "$SCRIPT"
    [ "$status" -ne 0 ]
  done
}

@test "aborts without opening a connection to the target" {
  # The point of the gate: an un-opted-in run must not touch whatever is
  # listening at REDIS_TEST_HOST:REDIS_TEST_PORT. A reachable listener that
  # records accepts proves the probe never dialled it.
  start_counting_listener
  run env -u REDIS_TEST_ALLOW_WRITES \
    REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$LISTEN_PORT" "$SCRIPT"
  [ "$status" -ne 0 ]
  # Give a stray connection time to land before asserting its absence.
  sleep 0.5
  [ ! -s "$CONN_LOG" ]
}

@test "the counting listener does record a connection when the probe runs" {
  # Control for the test above: without it, an inert listener would make the
  # "no connection" assertion pass for the wrong reason.
  start_counting_listener
  REDIS_TEST_ALLOW_WRITES=1 \
    REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT="$LISTEN_PORT" run "$SCRIPT"
  [ "$status" -eq 0 ]
  sleep 0.5
  [ -s "$CONN_LOG" ]
}

@test "opt-in failure explains how to opt in and keeps the container recipe" {
  run env -u REDIS_TEST_ALLOW_WRITES "$SCRIPT"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF 'REDIS_TEST_ALLOW_WRITES=1 npm run test:redis'
  echo "$output" | grep -qF 'docker run -d --name erp-redis-test-6399'
  echo "$output" | grep -qF 'redis-server --maxmemory-policy noeviction'
  echo "$output" | grep -qF 'WARNING'
}
