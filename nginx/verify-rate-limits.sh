#!/usr/bin/env bash
# On-demand check of the auth rate limits and CORS through the running ingress.
#
# The checks run from a one-off container attached to the stack's network, so
# the client address (and therefore the rate-limit key) is not shared with any
# browser tab on the host. Requests are sent to http://nginx/.
#
# CI has no NGINX; this script is manual coverage, recorded in the PR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${ROOT}/nginx/nginx.conf"
NGINX_IMAGE="$(sed -n 's/^FROM[[:space:]]\+\(.*\)/\1/p' "${ROOT}/nginx/Dockerfile" | head -1)"
NODE_IMAGE="node:24.16.0-alpine3.23"
NETWORK="erp2_erp_network"
if ! docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  NETWORK="$(docker inspect erp_nginx --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)"
fi

echo "== Phase 0: nginx -t =="
docker run --rm \
  --add-host backend:127.0.0.1 --add-host frontend:127.0.0.1 \
  -v "${CONF}:/etc/nginx/nginx.conf:ro" \
  "${NGINX_IMAGE}" nginx -t
echo "[PASS] phase 0"

echo "== Phases A-F: rate limits and CORS via http://nginx/ =="
docker run --rm \
  --network "${NETWORK}" \
  -e VERIFY_BASE_URL="http://nginx" \
  -v "${ROOT}/nginx:/work:ro" \
  "${NODE_IMAGE}" \
  node /work/verify-rate-limits.mjs "$@"

echo "all phases passed"
