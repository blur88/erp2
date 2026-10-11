#!/usr/bin/env bash
# Answers the questions the browser cases cannot answer from inside the
# Playwright container:
#
#   session-count <username>      how many auth_sessions rows a user has (case 14
#                                 needs it to show that a refused sign-in created
#                                 no session, and no API route exposes the count)
#   capture-start <segment> [require]
#   capture-stop  <segment>       start and finalise one upstream capture segment
#   cpu-load-start <workers>      busy workers in a container of their own, for
#   cpu-load-stop                 the processor cell of the stall runs (#1370);
#   cpu-load-status               `running` or `stopped`
#
# The cases write   <scratch>/probe/<id>.req   containing the request and this
# loop answers with <scratch>/probe/<id>.res holding `ok` or `error: ...`. It runs
# read-only SELECTs, the capture script and that one container, and nothing
# else. The container is removed when this script ends, however it ends. `run.sh` starts it
# before the cases and stops it in its cleanup; for a development run start it by
# hand:   host-probe.sh <scratch-dir>
set -euo pipefail

# run.sh always starts this script from the repository, never from an override
# copy of the suite: `docker compose` below has to run where the compose file
# is, which is three directories up from here (frontend/qa/cross-tab-session).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
# For the test that pins the line above: print it and stop.
if [ "${1:-}" = "--print-root" ]; then echo "${ROOT}"; exit 0; fi
SCRATCH="${1:-${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}}"
DIR="${SCRATCH}/probe"
mkdir -p "${DIR}"
chmod 777 "${DIR}" # the container user writes requests here
cd "${ROOT}"

CPU_LOAD_NAME="erp_qa_cpu_load"
CPU_LOAD_IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
cpu_load_remove() { docker rm -f "${CPU_LOAD_NAME}" > /dev/null 2>&1 || true; }
trap cpu_load_remove EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# The segment name reaches a container name and a file name, so it is restricted
# to what those allow.
segment_name() {
  [[ "$1" =~ ^[a-z0-9-]{1,40}$ ]] || return 1
  printf '%s' "$1"
}

answer() {
  local req="$1" kind arg extra out segment
  read -r kind arg extra < "${req}" || true

  case "${kind}" in
    session-count)
      if ! [[ "${arg}" =~ ^[a-zA-Z0-9._-]{3,50}$ ]]; then
        echo "error: unsupported request"
        return
      fi
      # shellcheck disable=SC2016 # expanded inside the container, not here
      if out="$(docker compose exec -T postgres sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -v u="$1" -f -' sh "${arg}" 2>&1 <<'SQL'
SELECT count(*) FROM auth_sessions s JOIN users u ON u.id = s."userId" WHERE u.username = :'u';
SQL
      )" && [[ "${out}" =~ ^[0-9]+$ ]]; then
        echo "${out}"
      else
        echo "error: ${out}"
      fi
      ;;
    capture-start|capture-stop)
      if ! segment="$(segment_name "${arg}")"; then
        echo "error: '${arg}' is not a segment name"
        return
      fi
      local -a options=()
      if [ "${kind}" = "capture-start" ] && [ "${extra}" = "require" ]; then
        options=(--require-qa-id)
      fi
      if out="$("${HERE}/upstream-capture.sh" "${kind#capture-}" \
        "${SCRATCH}" "${segment}" "${options[@]+"${options[@]}"}" 2>&1)" && [ -z "${out}" ]; then
        echo "ok"
      else
        echo "error: ${out}"
      fi
      ;;
    cpu-load-start)
      if ! [[ "${arg}" =~ ^[0-9]{1,2}$ ]] || [ "${arg}" -lt 1 ] || [ "${arg}" -gt 64 ]; then
        echo "error: '${arg}' is not a worker count (1 to 64)"
        return
      fi
      cpu_load_remove
      if out="$(docker run -d --rm --name "${CPU_LOAD_NAME}" -v "${HERE}:/qa:ro" \
        "${CPU_LOAD_IMAGE}" node /qa/cpu-load.mjs "${arg}" 2>&1)"; then
        echo "ok"
      else
        echo "error: ${out}"
      fi
      ;;
    cpu-load-stop)
      cpu_load_remove
      echo "ok"
      ;;
    cpu-load-status)
      if [ -n "$(docker ps --filter "name=^${CPU_LOAD_NAME}$" --format '{{.Names}}' 2>/dev/null)" ]; then
        echo "running"
      else
        echo "stopped"
      fi
      ;;
    *)
      echo "error: unsupported request"
      ;;
  esac
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
