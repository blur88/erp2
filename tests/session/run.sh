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
sed -e 's/zone=login_limit:10m rate=5r\/m/zone=login_limit:10m rate=120r\/m/' \
  -e 's/access.log combined buffer=16k/access.log combined/' \
  nginx/nginx.conf > "$test_conf"
if ! grep -q 'rate=120r/m' "$test_conf"; then
  echo 'Could not apply the test-only NGINX 120 r/m rate override' >&2
  exit 2
fi
if ! grep -q 'access.log combined;' "$test_conf"; then
  echo 'Could not disable NGINX access-log buffering for debug capture' >&2
  exit 2
fi

docker compose -f docker-compose.yml -f tests/session/compose.yml up -d --build --force-recreate --wait nginx backend frontend
rc=0
docker run --rm --network host -v "$PWD:/work:ro" -w /work \
  -e SESSION_TEST_BASE_URL -e SESSION_TEST_USER_A -e SESSION_TEST_PASSWORD_A \
  -e SESSION_TEST_USER_B -e SESSION_TEST_PASSWORD_B \
  -e SESSION_TEST_DEBUG -e SESSION_TEST_ONLY -e SESSION_TEST_ITERATIONS \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  timeout "${SESSION_TEST_TIMEOUT_SECONDS:-600}" sh -c 'npm install --no-save --prefix /tmp/session-pw playwright@1.63.0 >/dev/null && node tests/session/cross-tab.mjs' || rc=$?

capture_rc=0
if [[ ${SESSION_TEST_DEBUG:-0} == 1 ]]; then
  docker compose -f docker-compose.yml -f tests/session/compose.yml logs --no-color nginx > "${SESSION_TEST_NGINX_LOG_PATH:-/tmp/session-nginx-access.log}" || capture_rc=$?
fi

# Restart NGINX with its unmodified default login_limit in a fresh zone.
cp nginx/nginx.conf "$test_conf"
docker compose -f docker-compose.yml -f tests/session/compose.yml up -d --force-recreate --wait nginx
rate_limit_rc=0
docker run --rm --network host -v "$PWD:/work:ro" -w /work \
  -e SESSION_TEST_BASE_URL -e SESSION_TEST_USER_A -e SESSION_TEST_PASSWORD_A \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  timeout 120 sh -c 'npm install --no-save --prefix /tmp/session-pw playwright@1.63.0 >/dev/null && node tests/session/rate-limit.mjs' || rate_limit_rc=$?

if (( rc != 0 )); then
  exit "$rc"
fi
if (( rate_limit_rc != 0 )); then
  exit "$rate_limit_rc"
fi
exit "$capture_rc"
