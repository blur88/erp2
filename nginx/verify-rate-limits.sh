#!/usr/bin/env bash
# On-demand check of the auth rate limits and CORS through the running ingress,
# and of api_limit's admission, delay and rejection on an isolated rig.
#
# The checks run from a one-off container attached to the stack's network, so
# the client address (and therefore the rate-limit key) is not shared with any
# browser tab on the host. Requests are sent to http://nginx/.
#
# The api_limit phases run against the rig (nginx/limiter-rig/rig.sh) and never
# against the running stack: they empty a bucket by design, and a recorded run
# must not see that. They are planned from nginx/limiter-probe-result.json, so a
# result that is missing or recorded against another configuration stops the run
# before it sends anything.
#
# PROBE_RESULT names a probe result other than the repository's, inside the rig
# directory. Only the stale-evidence runs set it, to show that a result recorded
# against another configuration, or one that could not establish a state, stops
# the run instead of passing it.
#
# CI has no NGINX; this script is manual coverage, recorded in the PR.
#
# Exit status: 0 everything passed and verification is complete, 1 a mismatch,
# 2 something too slow to judge, 3 verification incomplete.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${ROOT}/nginx/nginx.conf"
RIG_DIR="${RIG_DIR:-$(mktemp -d)}"
RIG_CONF="${RIG_CONF:-${CONF}}"
NGINX_IMAGE="$(sed -n 's/^FROM[[:space:]]\+\(.*\)/\1/p' "${ROOT}/nginx/Dockerfile" | head -1)"
NODE_IMAGE="node:24.16.0-alpine3.23"
RIG_NETWORK="erp_limiter_rig"
NETWORK="erp2_erp_network"
if ! docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  NETWORK="$(docker inspect erp_nginx --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)"
fi

MISMATCH=0
INCONCLUSIVE=0
INCOMPLETE=0

rig_down() {
  "${ROOT}/nginx/limiter-rig/rig.sh" down || true
}

echo "== Phase 0: nginx -t =="
docker run --rm \
  --add-host backend:127.0.0.1 --add-host frontend:127.0.0.1 \
  -v "${CONF}:/etc/nginx/nginx.conf:ro" \
  "${NGINX_IMAGE}" nginx -t
echo "[PASS] phase 0"

echo "== Phases A-F: rate limits and CORS via http://nginx/ =="
set +e
docker run --rm \
  --network "${NETWORK}" \
  -e VERIFY_BASE_URL="http://nginx" \
  -v "${ROOT}/nginx:/work:ro" \
  "${NODE_IMAGE}" \
  node /work/verify-rate-limits.mjs "$@"
auth_status=$?
set -e
case "${auth_status}" in
  0) ;;
  1) MISMATCH=1 ;;
  2) INCONCLUSIVE=1 ;;
  *) MISMATCH=1 ;;
esac

echo "== Phases G-J: api_limit on the rig =="
if [ "$#" -gt 0 ]; then
  echo "skipping: phases G-J take no arguments"
else
  trap rig_down EXIT
  if RIG_DIR="${RIG_DIR}" RIG_CONF="${RIG_CONF}" "${ROOT}/nginx/limiter-rig/rig.sh" up >/dev/null; then
    set +e
    docker run --rm \
      --network "${RIG_NETWORK}" \
      -e VERIFY_BASE_URL="http://rig-nginx" \
      -e RIG_BASE="http://rig-nginx" \
      -e RIG_DIR="/rig" \
      -e PROBE_RESULT \
      -v "${ROOT}/nginx:/work:ro" \
      -v "${RIG_DIR}:/rig" \
      "${NODE_IMAGE}" \
      node /work/verify-rate-limits.mjs --api-limit
    api_status=$?
    set -e
    case "${api_status}" in
      0) ;;
      1) MISMATCH=1 ;;
      2) INCONCLUSIVE=1 ;;
      3) INCOMPLETE=1 ;;
      *) MISMATCH=1 ;;
    esac
  else
    echo "[INCONCLUSIVE] the rig did not start; phases G-J could not run" >&2
    INCONCLUSIVE=1
  fi
  rig_down
  trap - EXIT
fi

# 1 outranks 3 outranks 2.
STATUS=0
if [ "${MISMATCH}" -ne 0 ]; then
  STATUS=1
elif [ "${INCOMPLETE}" -ne 0 ]; then
  STATUS=3
elif [ "${INCONCLUSIVE}" -ne 0 ]; then
  STATUS=2
fi

if [ "${STATUS}" -eq 0 ]; then
  echo "all phases passed"
fi
exit "${STATUS}"
