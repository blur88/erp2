#!/usr/bin/env bash
# Phase K of the rate-limit verification (#1360): five default-credentials
# hints at one instant, then logins, against a rig of its own.
#
# The rig is started fresh, so the limiter is empty, and every request is sent
# by one client container, so they share one address. Nothing here touches the
# running stack.
#
#   nginx/verify-hint-budget.sh                  the repository's nginx.conf:
#                                                every hint and four logins
#                                                reach the upstream, the fifth
#                                                login is refused
#   RIG_CONF=<old nginx.conf> \
#     nginx/verify-hint-budget.sh --expect-shared
#                                                the proof that the phase can
#                                                fail: exits 0 only when the
#                                                hints spent the credential
#                                                budget and the login was
#                                                refused, 1 on anything else
#
# Exit status: 0 passed, 1 a mismatch, 2 could not be judged.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RIG_DIR="${RIG_DIR:-$(mktemp -d)}"
RIG_CONF="${RIG_CONF:-${ROOT}/nginx/nginx.conf}"
NODE_IMAGE="node:24.16.0-alpine3.23"
RIG_NETWORK="erp_limiter_rig"

rig_down() {
  "${ROOT}/nginx/limiter-rig/rig.sh" down || true
}

echo "== Phase K: the hint's budget on the rig (configuration $(sha256sum "${RIG_CONF}" | cut -c1-12)) =="
trap rig_down EXIT
if ! RIG_DIR="${RIG_DIR}" RIG_CONF="${RIG_CONF}" "${ROOT}/nginx/limiter-rig/rig.sh" up >/dev/null; then
  echo "[INCONCLUSIVE] the rig did not start; phase K could not run" >&2
  exit 2
fi
set +e
docker run --rm \
  --network "${RIG_NETWORK}" \
  -e VERIFY_BASE_URL="http://rig-nginx" \
  -e RIG_DIR="/rig" \
  -v "${ROOT}/nginx:/work:ro" \
  -v "${RIG_DIR}:/rig" \
  "${NODE_IMAGE}" \
  node /work/verify-rate-limits.mjs --hint-budget "$@"
status=$?
set -e
exit "${status}"
