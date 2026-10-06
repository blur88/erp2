#!/usr/bin/env bash
# Scoped stack configuration for the cross-tab session browser run.
#
# The stack's behaviour depends on values that live outside the image, so this
# is the only supported way to start or recreate containers for the QA run:
# `docker compose up -d` alone silently replaces them with .env and compose
# defaults (grace 60, access lifetime 15m).
#
#   show      Print (as JSON) the token lifetime, grace, image IDs and the
#             served erp-build value of the running stack.
#   qa-up     Refuse unless a capture file exists, then build and start with the
#             QA configuration (access 20s, grace 5s) and verify by observation.
#   restore   Start the stack with the values captured from the running backend,
#             verify, and delete the capture file on success.
#   verify    Check by observed behaviour that the running backend issues access
#             tokens with the lifetime `show` reports: sign in through the
#             ingress, and compare accessTokenExpiresAt minus the response's
#             Date header with it (+/- 3 s). Needs QA_USERNAME and QA_PASSWORD;
#             QA_INGRESS (default http://localhost) says where the ingress is.
#             `qa-up` runs it; it changes nothing but one sign-in and its logout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRATCH="${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}"
CAPTURE="${SCRATCH}/stack-before.json"
mkdir -p "${SCRATCH}"
cd "${ROOT}"

QA_ACCESS="20s"
QA_GRACE="5"

compose() { docker compose "$@"; }

backend_value() {
  compose exec -T backend printenv "$1" 2>/dev/null | tr -d '\r\n'
}

cmd_show() {
  if ! docker compose ps backend 2>/dev/null | grep -q "Up"; then
    echo "backend is not running" >&2
    exit 1
  fi
  local access grace
  access="$(backend_value JWT_ACCESS_TOKEN_EXPIRY)"
  grace="$(backend_value REFRESH_GRACE_SECONDS)"
  if [ -z "${access}" ] || [ -z "${grace}" ]; then
    echo "could not read JWT_ACCESS_TOKEN_EXPIRY / REFRESH_GRACE_SECONDS from the backend" >&2
    exit 1
  fi
  local frontend_id backend_id nginx_id served
  frontend_id="$(docker inspect erp_frontend --format '{{.Image}}' 2>/dev/null || echo unknown)"
  backend_id="$(docker inspect erp_backend --format '{{.Image}}' 2>/dev/null || echo unknown)"
  nginx_id="$(docker inspect erp_nginx --format '{{.Image}}' 2>/dev/null || echo unknown)"
  served="$(served_build)"
  printf '{"accessTokenExpiry":"%s","refreshGraceSeconds":"%s","images":{"frontend":"%s","backend":"%s","nginx":"%s"},"servedBuild":"%s"}\n' \
    "${access}" "${grace}" "${frontend_id}" "${backend_id}" "${nginx_id}" "${served}"
}

# `20s`, `15m`, `2h`, `1d` or a bare number of seconds.
to_seconds() {
  local text="$1" n unit
  if ! [[ "${text}" =~ ^([0-9]+)([smhd]?)$ ]]; then
    echo "cannot read a duration from '${text}'" >&2
    return 1
  fi
  n="${BASH_REMATCH[1]}"; unit="${BASH_REMATCH[2]}"
  case "${unit}" in
    m) echo $((n * 60)) ;;
    h) echo $((n * 3600)) ;;
    d) echo $((n * 86400)) ;;
    *) echo "${n}" ;;
  esac
}

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# A variable can be set and not read, so the lifetime is also observed: the
# expiry the server states for a fresh access token (epoch seconds), minus the
# Date header of the same response, must be the configured lifetime +/- 3 s.
cmd_verify() {
  local headers body rc=0
  headers="$(mktemp)"; body="$(mktemp)"
  verify_lifetime "${headers}" "${body}" || rc=$?
  rm -f "${headers}" "${body}"
  return "${rc}"
}

verify_lifetime() {
  local headers="$1" body="$2" status
  local ingress="${QA_INGRESS:-http://localhost}"
  if [ -z "${QA_USERNAME:-}" ] || [ -z "${QA_PASSWORD:-}" ]; then
    echo "verify: QA_USERNAME and QA_PASSWORD must be set" >&2
    return 1
  fi
  local configured expected
  configured="$(backend_value JWT_ACCESS_TOKEN_EXPIRY)"
  expected="$(to_seconds "${configured}")"
  local payload
  payload="$(printf '{"usernameOrEmail":"%s","password":"%s"}' "$(json_escape "${QA_USERNAME}")" "$(json_escape "${QA_PASSWORD}")")"
  # Sign-ins are rate limited (login_limit); a 429 is waited out, for up to 90 s.
  local waited=0
  while true; do
    status="$(printf '%s' "${payload}" | curl -s -o "${body}" -D "${headers}" -w '%{http_code}' \
      -X POST "${ingress}/api/auth/login" \
      -H 'Content-Type: application/json' -H 'X-ERP-Session-Protocol: 2' --data-binary @-)"
    if [ "${status}" != "429" ]; then break; fi
    if [ "${waited}" -ge 90 ]; then
      echo "verify: sign-in was rate limited for more than 90 s" >&2
      return 1
    fi
    sleep 13; waited=$((waited + 13))
  done
  if [ "${status}" != "200" ]; then
    echo "verify: sign-in through ${ingress} answered ${status}" >&2
    return 1
  fi
  local expires date_header date_epoch refresh observed
  expires="$(sed -n 's/.*"accessTokenExpiresAt":\([0-9][0-9]*\).*/\1/p' "${body}")"
  date_header="$(sed -n 's/^[Dd]ate: *//p' "${headers}" | tr -d '\r' | tail -1)"
  refresh="$(sed -n 's/.*"refreshToken":"\([^"]*\)".*/\1/p' "${body}")"
  # End the session this check created, whatever the comparison says.
  if [ -n "${refresh}" ]; then
    printf '{"refreshToken":"%s"}' "${refresh}" | curl -s -o /dev/null -X POST "${ingress}/api/auth/logout" \
      -H 'Content-Type: application/json' -H 'X-ERP-Session-Protocol: 2' --data-binary @- || true
  fi
  if [ -z "${expires}" ] || [ -z "${date_header}" ]; then
    echo "verify: the sign-in response carried no accessTokenExpiresAt or no Date header" >&2
    return 1
  fi
  date_epoch="$(date -u -d "${date_header}" +%s)"
  observed=$((expires - date_epoch))
  if [ "${observed}" -lt $((expected - 3)) ] || [ "${observed}" -gt $((expected + 3)) ]; then
    echo "verify: observed access lifetime ${observed} s, configured ${configured} (${expected} s +/- 3)" >&2
    return 1
  fi
  echo "verify ok: observed access lifetime ${observed} s, configured ${configured}"
}

served_build() {
  curl -s "http://localhost/" 2>/dev/null | sed -n 's/.*name="erp-build" content="\([^"]*\)".*/\1/p' | head -1
}

# The ingress may have been recreated too; give it time to answer.
wait_ingress() {
  for _ in $(seq 1 30); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost/" 2>/dev/null)" = "200" ]; then return 0; fi
    sleep 2
  done
  echo "the ingress did not answer on http://localhost/" >&2
  return 1
}

wait_healthy() {
  for _ in $(seq 1 60); do
    if compose ps backend 2>/dev/null | grep -q "healthy"; then return 0; fi
    sleep 2
  done
  echo "backend did not become healthy" >&2
  return 1
}

cmd_qa_up() {
  if [ ! -f "${CAPTURE}" ]; then
    echo "no capture file at ${CAPTURE}; run 'stack.sh show > ${CAPTURE}' first" >&2
    exit 1
  fi
  local sha; sha="$(git rev-parse HEAD)"
  VITE_BUILD_SHA="${sha}" JWT_ACCESS_TOKEN_EXPIRY="${QA_ACCESS}" REFRESH_GRACE_SECONDS="${QA_GRACE}" \
    compose build frontend backend nginx
  VITE_BUILD_SHA="${sha}" JWT_ACCESS_TOKEN_EXPIRY="${QA_ACCESS}" REFRESH_GRACE_SECONDS="${QA_GRACE}" \
    compose up -d
  wait_healthy
  wait_ingress
  local served; served="$(served_build)"
  if [ "${served}" != "${sha}" ]; then
    echo "served erp-build '${served}' does not equal HEAD '${sha}'" >&2
    exit 1
  fi
  local now_access now_grace
  now_access="$(backend_value JWT_ACCESS_TOKEN_EXPIRY)"
  now_grace="$(backend_value REFRESH_GRACE_SECONDS)"
  if [ "${now_access}" != "${QA_ACCESS}" ] || [ "${now_grace}" != "${QA_GRACE}" ]; then
    echo "qa-up did not take: access=${now_access} grace=${now_grace}, expected ${QA_ACCESS}/${QA_GRACE}" >&2
    exit 1
  fi
  # The grace has no cheap observation of its own: cases 9 and 10 prove it by
  # outcome (resumed after 3 s continues, after 8 s is revoked).
  cmd_verify
  echo "qa-up ok (access=${QA_ACCESS}, grace=${QA_GRACE}, sha=${sha})"
}

cmd_restore() {
  if [ ! -f "${CAPTURE}" ]; then
    echo "no capture file at ${CAPTURE}; nothing to restore" >&2
    exit 1
  fi
  local access grace sha
  access="$(sed -n 's/.*"accessTokenExpiry":"\([^"]*\)".*/\1/p' "${CAPTURE}")"
  grace="$(sed -n 's/.*"refreshGraceSeconds":"\([^"]*\)".*/\1/p' "${CAPTURE}")"
  sha="$(git rev-parse HEAD)"
  if [ -z "${access}" ] || [ -z "${grace}" ]; then
    echo "capture file is missing the two values:" >&2
    cat "${CAPTURE}" >&2
    echo "run by hand: JWT_ACCESS_TOKEN_EXPIRY=<x> REFRESH_GRACE_SECONDS=<y> docker compose up -d" >&2
    exit 1
  fi
  if ! VITE_BUILD_SHA="${sha}" JWT_ACCESS_TOKEN_EXPIRY="${access}" REFRESH_GRACE_SECONDS="${grace}" compose up -d; then
    echo "restore failed; capture kept. run by hand:" >&2
    echo "JWT_ACCESS_TOKEN_EXPIRY=${access} REFRESH_GRACE_SECONDS=${grace} docker compose up -d" >&2
    exit 1
  fi
  local by_hand="JWT_ACCESS_TOKEN_EXPIRY=${access} REFRESH_GRACE_SECONDS=${grace} docker compose up -d"
  wait_healthy || { echo "restore: backend unhealthy; capture kept. run by hand: ${by_hand}" >&2; exit 1; }
  local now_access now_grace
  now_access="$(backend_value JWT_ACCESS_TOKEN_EXPIRY)"
  now_grace="$(backend_value REFRESH_GRACE_SECONDS)"
  if [ "${now_access}" != "${access}" ] || [ "${now_grace}" != "${grace}" ]; then
    echo "restore did not take: access=${now_access} grace=${now_grace}, expected ${access}/${grace}" >&2
    echo "capture kept. run by hand: ${by_hand}" >&2
    exit 1
  fi
  rm -f "${CAPTURE}"
  echo "restore ok (access=${access}, grace=${grace})"
}

case "${1:-}" in
  show) cmd_show ;;
  qa-up) cmd_qa_up ;;
  restore) cmd_restore ;;
  verify) cmd_verify ;;
  *) echo "usage: stack.sh {show|qa-up|restore|verify}" >&2; exit 2 ;;
esac
