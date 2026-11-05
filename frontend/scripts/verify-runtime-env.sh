#!/usr/bin/env bash
# Exercise the actual Compose mounts and read-only root through NGINX HTTP.
set -euo pipefail
cd "$(dirname "$0")/../.."
compose_file=${1:-docker-compose.yml}
name="erp-runtime-env-$$"
# Static-resource checks do not need a backend, but NGINX resolves its upstream
# at startup. Supply only DNS plumbing; retain the real service mounts/security.
override=$(mktemp)
printf '%s\n' '{"services":{"frontend":{"extra_hosts":["backend:127.0.0.1"]}}}' > "$override"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap 'cleanup; rm -f "$override"' EXIT
for api in unset '' /explicit-api; do
  args=()
  if [[ $api != unset ]]; then args=(-e "VITE_API_BASE_URL=$api"); fi
  docker compose -f "$compose_file" -f "$override" run -d --no-deps --name "$name" \
    -e SESSION_IDLE_TIMEOUT_MS=120000 "${args[@]}" frontend >/dev/null
  [[ $(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$name") == true ]]
  for attempt in {1..30}; do
    if docker exec "$name" curl -fsS http://localhost/health >/dev/null 2>&1; then break; fi
    sleep 1
  done
  response=$(docker exec "$name" curl -fsSi 'http://localhost/env-config.js?v=2')
  grep -q 'SESSION_IDLE_TIMEOUT_MS: 120000' <<< "$response"
  docker exec "$name" curl -fsS 'http://localhost/env-config.js?v=2' | node -e '
    const vm = require("node:vm");
    let source = "";
    process.stdin.on("data", chunk => source += chunk);
    process.stdin.on("end", () => {
      const context = { window: {} };
      vm.runInNewContext(source, context);
      if (context.window.__ENV__.SESSION_IDLE_TIMEOUT_MS !== 120000) process.exit(1);
    });'
  expected=${api:-/api}; [[ $api != unset ]] || expected=/api
  grep -Fq "VITE_API_BASE_URL: \"$expected\"" <<< "$response"
  grep -qi '^Cache-Control: no-store' <<< "$response"
  ! grep -Eqi 'max-age|^Expires:|public, no-transform' <<< "$response"
  docker exec "$name" curl -fsS http://localhost/ | grep -Fq '/env-config.js?v=2'
  ! docker logs "$name" 2>&1 | grep -q 'Read-only file system'
  cleanup
  echo "PASS $compose_file runtime override, API '$api', read-only root and HTTP cache headers"
done
# Remove the writable mount to force the generation failure before the command.
image=$(docker compose -f "$compose_file" config --images | grep 'frontend' | head -1)
if docker run --rm --read-only --entrypoint /docker-entrypoint.sh "$image" \
  sh -c 'echo STALE_COMMAND_STARTED' > /tmp/"$name".log 2>&1; then
  echo 'Expected runtime generation failure' >&2; exit 1
fi
grep -q 'Failed to generate runtime configuration' /tmp/"$name".log
! grep -q STALE_COMMAND_STARTED /tmp/"$name".log
rm /tmp/"$name".log
echo 'PASS failed write prevents command startup'
