#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ ! ${SESSION_TEST_BASE_URL:-} =~ ^http://([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]+)?$ ]]; then
  echo 'Set SESSION_TEST_BASE_URL to plain HTTP at the host LAN IPv4 address, for example http://10.1.1.34' >&2
  exit 2
fi
: "${SESSION_TEST_USER_A:?Set SESSION_TEST_USER_A}"
: "${SESSION_TEST_PASSWORD_A:?Set SESSION_TEST_PASSWORD_A}"
: "${SESSION_TEST_USER_B:?Set SESSION_TEST_USER_B to a second existing user}"
: "${SESSION_TEST_PASSWORD_B:?Set SESSION_TEST_PASSWORD_B}"

test_conf=tests/session/nginx.test.conf
trap 'rm -f "$test_conf"' EXIT
sed -e 's/zone=login_limit:10m rate=5r\/m/zone=login_limit:10m rate=600r\/m/' \
  -e 's/limit_req zone=login_limit burst=3 nodelay/limit_req zone=login_limit burst=50 nodelay/' \
  nginx/nginx.conf > "$test_conf"
if cmp -s nginx/nginx.conf "$test_conf"; then
  echo 'Could not apply the test-only NGINX rate override' >&2
  exit 2
fi

docker compose -f docker-compose.yml -f tests/session/compose.yml up -d --build --force-recreate nginx backend frontend
docker run --rm --network host -v "$PWD:/work:ro" -w /work \
  -e SESSION_TEST_BASE_URL -e SESSION_TEST_USER_A -e SESSION_TEST_PASSWORD_A \
  -e SESSION_TEST_USER_B -e SESSION_TEST_PASSWORD_B \
  -e SESSION_TEST_DEBUG \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  timeout 600 sh -c 'npm install --no-save --prefix /tmp/session-pw playwright@1.63.0 >/dev/null && node tests/session/cross-tab.mjs'

if [[ ${SESSION_TEST_DEBUG:-0} == 1 ]]; then
  docker compose -f docker-compose.yml -f tests/session/compose.yml exec -T nginx nginx -s reopen
  docker compose -f docker-compose.yml -f tests/session/compose.yml exec -T nginx cat /var/log/nginx/access.log > "${SESSION_TEST_NGINX_LOG_PATH:-/tmp/session-nginx-access.log}"
fi

# Restart NGINX with its unmodified default login_limit in a fresh zone.
cp nginx/nginx.conf "$test_conf"
docker compose -f docker-compose.yml -f tests/session/compose.yml up -d --force-recreate nginx
docker run --rm --network host -v "$PWD:/work:ro" -w /work \
  -e SESSION_TEST_BASE_URL -e SESSION_TEST_USER_A -e SESSION_TEST_PASSWORD_A \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  timeout 120 sh -c 'npm install --no-save --prefix /tmp/session-pw playwright@1.63.0 >/dev/null && node tests/session/rate-limit.mjs'
