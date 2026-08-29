#!/bin/sh
#
# POSIX sh, to match the other gate scripts in this directory.
#
# Fail `npm run test:redis` fast when no Redis is reachable.
#
# Why this exists:
# test/orphaned-scheduler-reconciliation.redis-spec.ts connects to
# REDIS_TEST_HOST:REDIS_TEST_PORT (default 127.0.0.1:6399) — deliberately NOT
# the app's Redis, because the suite writes and flushes real BullMQ queue
# state. When nothing is listening there, BullMQ does not fail fast: ioredis
# retries the connection until Jest's 60s testTimeout fires, per test. The
# observed result is a run that hangs for ~10 minutes and then reports a
# timeout, which reads as a broken test suite rather than absent setup.
#
# This probe resolves the same host/port the spec will use, opens one TCP
# connection with a short timeout, and exits non-zero with setup instructions
# before Jest or BullMQ starts.
#
# It deliberately does NOT start, stop, or otherwise manage any container:
# running a test suite should not create Docker state as a side effect. In CI
# the Redis service is already up, so this probe succeeds silently.
#
# Usage: ./scripts/preflight-redis-test.sh

set -eu

HOST="${REDIS_TEST_HOST:-127.0.0.1}"
PORT="${REDIS_TEST_PORT:-6399}"

# Timeout in milliseconds for the single connection attempt. Short on purpose:
# this is a liveness probe, not a retry loop.
TIMEOUT_MS="${REDIS_TEST_PREFLIGHT_TIMEOUT_MS:-2000}"

# Node rather than nc/bash-/dev/tcp: node is already a hard dependency of this
# repo, whereas netcat is not installed everywhere and its flags differ between
# the BSD, GNU, and BusyBox builds.
if node -e '
  const net = require("net");
  const [host, port, timeout] = [process.argv[1], +process.argv[2], +process.argv[3]];
  const socket = new net.Socket();
  let settled = false;
  const done = (code) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    process.exit(code);
  };
  socket.setTimeout(timeout);
  socket.once("connect", () => done(0));
  socket.once("timeout", () => done(1));
  socket.once("error", () => done(1));
  socket.connect(port, host);
' "$HOST" "$PORT" "$TIMEOUT_MS" 2>/dev/null; then
  exit 0
fi

echo "FAIL: no Redis reachable at ${HOST}:${PORT} (waited ${TIMEOUT_MS}ms)." >&2
echo "" >&2
echo "The Redis integration suite (test:redis) needs a running Redis at" >&2
echo "REDIS_TEST_HOST:REDIS_TEST_PORT — currently:" >&2
echo "" >&2
echo "  REDIS_TEST_HOST=${HOST}   (default 127.0.0.1)" >&2
echo "  REDIS_TEST_PORT=${PORT}   (default 6399)" >&2
echo "" >&2
echo "Start a disposable Redis for it:" >&2
echo "" >&2
echo "  docker run -d --name erp-redis-test-6399 -p 6399:6379 \\" >&2
echo "    redis:8.6-alpine redis-server --maxmemory-policy noeviction" >&2
echo "" >&2
echo "Remove it when you are done:" >&2
echo "" >&2
echo "  docker rm -f erp-redis-test-6399" >&2
echo "" >&2
echo "WARNING: do not point this suite at the app's Redis (compose 'redis' on" >&2
echo "6379), a shared instance, or anything production-like. It writes and" >&2
echo "flushes real BullMQ queue state and would destroy live schedulers." >&2
echo "" >&2
echo "Without this check ioredis retries instead of failing, so the run hangs" >&2
echo "until Jest times out (~10 min) rather than reporting the missing Redis." >&2

exit 1
