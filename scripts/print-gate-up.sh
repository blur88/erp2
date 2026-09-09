#!/usr/bin/env bash
# Bring up the accounting print/PDF gate stack (#1214).
#
# ONE definition of the startup sequence, shared by CI
# (.github/workflows/ci.yml, job "Accounting Reports - Print/PDF Gate") and by
# the local procedure in docs/modules/accounting/BALANCE_SHEET_QA.md. The doc
# previously listed build + up only, omitting the per-service data-directory
# ownership prep CI needs, so a fresh local run could leave the backend unable
# to write to its bind mounts (review finding 6).
#
# Covers: isolation check, data-dir prep, image build, up, readiness wait.
#
# Deliberately EXCLUDED, because they differ between CI and local use:
#   - npm ci / playwright install  (CI caches these; locally they are one-time)
#   - running the suite            (the caller chooses reporters and env)
#   - teardown                     (see below)
#
# The stack is PRESERVED on failure so the half-started state can be inspected
# (`docker compose ... logs`, `... ps`). CI keeps its own unconditional
# `if: always()` teardown step, so nothing leaks on the runner.
set -euo pipefail

# Resolve every path from this script's own location, so it runs from any
# directory (the QA doc's reader may well be inside frontend/).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The ONE compose argument set. Every command below uses this array verbatim:
# docker-compose.yml is named explicitly so the auto-loaded
# docker-compose.override.yml cannot leak dev-only settings in, and services
# are always selected explicitly so the top-level nginx (80/443) never starts.
COMPOSE=(docker compose -p erp_print_gate
  -f docker-compose.yml -f docker-compose.print-gate.yml)
SERVICES=(postgres redis backend frontend)

# Gate env values. Exported so the compose interpolation and the readiness
# probes below agree, and so a caller that sourced nothing still gets the
# ports the QA doc and CI both document.
export PRINT_GATE_FRONTEND_PORT="${PRINT_GATE_FRONTEND_PORT:-3100}"
export PRINT_GATE_API_PORT="${PRINT_GATE_API_PORT:-3101}"
export PRINT_GATE_PG_PORT="${PRINT_GATE_PG_PORT:-5442}"
export PRINT_GATE_REDIS_PORT="${PRINT_GATE_REDIS_PORT:-6399}"
# Base compose renders `redis-server --requirepass ${REDIS_PASSWORD}`; an empty
# value folds away and redis then parses --maxmemory as password args (FATAL).
export REDIS_PASSWORD="${REDIS_PASSWORD:-print_gate_redis_password}"
# Backend boot does not validate JWT_SECRET, but auth signs tokens at runtime
# (fixture seeding), so pin the test-backend convention.
export JWT_SECRET="${JWT_SECRET:-test-secret-key-minimum-32chars-long-for-testing-only}"

# CI log groups when running on Actions; plain headings otherwise. Either way
# build/start/readiness stay individually visible in the log.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  group() { echo "::group::$1"; }
  endgroup() { echo "::endgroup::"; }
else
  group() { echo; echo "==> $1"; }
  endgroup() { :; }
fi

group "Verify the gate stack is isolated"
./scripts/print-gate-isolation-check.sh
endgroup

group "Prepare gate data directories"
# Bind dirs are created root-owned by the daemon if they do not exist, and the
# backend runs as uid 1001, so pre-create each with the ownership its own
# service needs. A blanket 1001 would seize PGDATA — postgres:*-alpine runs as
# uid 70 and redis:*-alpine as 999.
mkdir -p \
  .print-gate-data/postgres \
  .print-gate-data/redis \
  .print-gate-data/uploads \
  .print-gate-data/logs \
  .print-gate-data/backups
#
# chown runs INSIDE a throwaway container rather than via host `sudo`. Anyone
# who can start this stack can already run a container, whereas host sudo is a
# separate privilege: a developer without passwordless sudo could not run the
# documented procedure at all, which is exactly the local/CI divergence this
# script exists to remove. --user 0:0 is explicit so the daemon's default user
# cannot make this a no-op.
chown_in_container() {
  local owner="$1"; shift
  docker run --rm --user 0:0 \
    -v "$REPO_ROOT/.print-gate-data:/gate" \
    alpine:3.23 chown -R "$owner" "$@"
}
chown_in_container 70:70 /gate/postgres
chown_in_container 999:999 /gate/redis
chown_in_container 1001:1001 /gate/uploads /gate/logs /gate/backups
endgroup

group "Build the frontend and backend images from this commit"
# A stale bundle makes every print assertion pass vacuously: there is no volume
# mount for live reload, so an un-rebuilt frontend serves the previous build.
"${COMPOSE[@]}" build frontend backend
endgroup

group "Start the stack (selected services only)"
# Explicitly NOT a bare `up -d`: that would start the top-level nginx on
# 80/443. The frontend service's own nginx already proxies /api/ to the
# backend and serves the bundle with production headers, which is the
# print-CSS serving path under test.
"${COMPOSE[@]}" up -d "${SERVICES[@]}"
endgroup

group "Wait for the stack to become ready"
# The backend healthcheck has start_period: 40s, hence the generous bound.
ready=0
for i in $(seq 1 120); do
  api=$(curl -s -o /dev/null -w '%{http_code}' \
    "http://localhost:${PRINT_GATE_API_PORT}/api/health" || true)
  fe=$(curl -s -o /dev/null -w '%{http_code}' \
    "http://localhost:${PRINT_GATE_FRONTEND_PORT}/" || true)
  if [ "$api" = "200" ] && [ "$fe" = "200" ]; then
    echo "stack ready after ${i}s (api=$api frontend=$fe)"
    ready=1
    break
  fi
  if [ -z "$("${COMPOSE[@]}" ps -q backend)" ]; then
    echo "::error::backend container is gone before readiness" >&2
    "${COMPOSE[@]}" logs --no-color --tail 80 backend >&2 || true
    endgroup
    exit 1
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "::error::stack did not become ready within 120s (api=$api frontend=$fe)" >&2
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs --no-color --tail 80 >&2 || true
  endgroup
  # Stack deliberately left running for diagnosis; CI tears down in its own
  # `if: always()` step.
  exit 1
fi
endgroup

cat <<EOF

print-gate stack is up.
  frontend: http://localhost:${PRINT_GATE_FRONTEND_PORT}
  api:      http://localhost:${PRINT_GATE_API_PORT}/api

Run the gate:
  cd frontend && PRINT_GATE_BASE_URL=http://localhost:${PRINT_GATE_FRONTEND_PORT} \\
    PRINT_GATE_API_URL=http://localhost:${PRINT_GATE_API_PORT}/api npm run test:print

Tear down:
  docker compose -p erp_print_gate -f docker-compose.yml \\
    -f docker-compose.print-gate.yml down -v --remove-orphans
  # .print-gate-data holds root/70/999-owned files, so remove it the same way
  # it was prepared rather than with host sudo:
  docker run --rm --user 0:0 -v "$REPO_ROOT:/repo" alpine:3.23 \\
    rm -rf /repo/.print-gate-data
EOF
