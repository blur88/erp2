#!/usr/bin/env bash
# Check runtime configuration through both real Compose NGINX services.
set -euo pipefail
cd "$(dirname "$0")/../.."
name="erp-edge-runtime-$$"
override=$(mktemp)
headers=$(mktemp)
cleanup() {
  docker rm -f "$name-edge" "$name-frontend" >/dev/null 2>&1 || true
  rm -f "$override" "$headers"
}
trap cleanup EXIT
# No backend is needed for this HTTP resource; supply its startup DNS only.
printf '%s\n' '{"services":{"frontend":{"extra_hosts":["backend:127.0.0.1"]},"nginx":{"extra_hosts":["backend:127.0.0.1"]}}}' > "$override"
compose=(docker compose -f docker-compose.yml -f "$override")
"${compose[@]}" run -d --no-deps --name "$name-frontend" frontend >/dev/null
# Resolve only this test's frontend, independently of other Compose containers.
frontend_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name-frontend")
"${compose[@]}" run -d --no-deps --name "$name-edge" \
  --add-host "frontend:$frontend_ip" nginx >/dev/null
status=
for attempt in {1..30}; do
  # Fetch via the frontend's curl, but target the edge's public HTTP listener.
  edge_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name-edge")
  if status=$(docker exec "$name-frontend" curl -sS -D - -o /dev/null \
    -w '%{http_code}' "http://$edge_ip/env-config.js?v=2" > "$headers"); then
    status=$(tail -n 1 "$headers")
    if [[ $status == 2[0-9][0-9] ]]; then break; fi
  fi
  sleep 1
done
if [[ $status != 2[0-9][0-9] ]]; then
  cat "$headers"
  echo "Expected 2xx response through edge, got $status" >&2
  exit 1
fi
tr -d '\r' < "$headers" > "$headers.clean"
mv "$headers.clean" "$headers"
count=$(grep -ci '^Cache-Control:' "$headers" || true)
if [[ $count != 1 ]] || ! grep -Eqi '^Cache-Control:[[:blank:]]*no-store[[:blank:]]*$' "$headers"; then
  cat "$headers"
  echo 'Cache-Control assertion failed: expected exactly one header with value no-store' >&2
  exit 1
fi
if grep -qi '^Expires:' "$headers"; then
  cat "$headers"
  echo 'Expires assertion failed: runtime configuration must have no Expires header' >&2
  exit 1
fi
echo 'PASS edge /env-config.js?v=2: 2xx, exactly one Cache-Control: no-store, no Expires'
