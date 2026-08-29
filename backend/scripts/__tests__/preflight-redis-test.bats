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
