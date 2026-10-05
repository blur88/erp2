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
  served="$(curl -s "http://localhost/" 2>/dev/null | sed -n 's/.*name="erp-build" content="\([^"]*\)".*/\1/p' | head -1)"
  printf '{"accessTokenExpiry":"%s","refreshGraceSeconds":"%s","images":{"frontend":"%s","backend":"%s","nginx":"%s"},"servedBuild":"%s"}\n' \
    "${access}" "${grace}" "${frontend_id}" "${backend_id}" "${nginx_id}" "${served}"
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
  local served; served="$(curl -s "http://localhost/" | sed -n 's/.*name="erp-build" content="\([^"]*\)".*/\1/p' | head -1)"
  if [ "${served}" != "${sha}" ]; then
    echo "served erp-build '${served}' does not equal HEAD '${sha}'" >&2
    exit 1
  fi
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
  wait_healthy || { echo "restore: backend unhealthy; capture kept" >&2; exit 1; }
  local now_access now_grace
  now_access="$(backend_value JWT_ACCESS_TOKEN_EXPIRY)"
  now_grace="$(backend_value REFRESH_GRACE_SECONDS)"
  if [ "${now_access}" != "${access}" ] || [ "${now_grace}" != "${grace}" ]; then
    echo "restore did not take: access=${now_access} grace=${now_grace}, expected ${access}/${grace}" >&2
    exit 1
  fi
  rm -f "${CAPTURE}"
  echo "restore ok (access=${access}, grace=${grace})"
}

case "${1:-}" in
  show) cmd_show ;;
  qa-up) cmd_qa_up ;;
  restore) cmd_restore ;;
  *) echo "usage: stack.sh {show|qa-up|restore}" >&2; exit 2 ;;
esac
