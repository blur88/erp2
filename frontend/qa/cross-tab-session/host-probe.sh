#!/usr/bin/env bash
# Answers the one database question the browser cases cannot answer from inside
# the Playwright container: how many auth_sessions rows a user has (case 14
# needs it to show that a refused sign-in created no session, and no API route
# exposes the count).
#
# The cases write   <scratch>/probe/<id>.req   containing   session-count <username>
# and this loop answers with <scratch>/probe/<id>.res holding the number, or
# `error: ...`. It runs read-only SELECTs and nothing else. `run.sh` starts it
# before the cases and stops it in its cleanup; for a development run start it
# by hand:   host-probe.sh <scratch-dir>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRATCH="${1:-${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}}"
DIR="${SCRATCH}/probe"
mkdir -p "${DIR}"
chmod 777 "${DIR}" # the container user writes requests here
cd "${ROOT}"

answer() {
  local req="$1" kind username out
  read -r kind username < "${req}" || true
  if [ "${kind}" != "session-count" ] || ! [[ "${username}" =~ ^[a-zA-Z0-9._-]{3,50}$ ]]; then
    echo "error: unsupported request"
    return
  fi
  # shellcheck disable=SC2016 # expanded inside the container, not here
  if out="$(docker compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -v u="$1" -f -' sh "${username}" 2>&1 <<'SQL'
SELECT count(*) FROM auth_sessions s JOIN users u ON u.id = s."userId" WHERE u.username = :'u';
SQL
  )" && [[ "${out}" =~ ^[0-9]+$ ]]; then
    echo "${out}"
  else
    echo "error: ${out}"
  fi
}

echo "host-probe: watching ${DIR}"
while true; do
  for req in "${DIR}"/*.req; do
    [ -e "${req}" ] || continue
    res="${req%.req}.res"
    answer "${req}" > "${res}.tmp"
    mv "${res}.tmp" "${res}"
    rm -f "${req}"
  done
  sleep 0.3
done
