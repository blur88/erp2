#!/usr/bin/env bash
# One command for a whole recorded cross-tab session run.
#
# Every recorded run happens after its code is committed: the script refuses a
# dirty tree and a bundle whose erp-build SHA is not HEAD. Results are written
# to the scratch directory, which is outside the repository.
#
# Credentials come from the environment and are never written anywhere:
#   QA_USERNAME / QA_PASSWORD       the user the cases sign in as
#   QA_USERNAME_2 / QA_PASSWORD_2   a second user, for the user-switch case
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QA_DIR="${ROOT}/frontend/qa/cross-tab-session"
SCRATCH="${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
PLAYWRIGHT_PACKAGE="playwright@1.63.0"
LAN_IP="${1:-}"

mkdir -p "${SCRATCH}"
cd "${ROOT}"

# The status is only ever set from zero to non-zero: the first failure decides
# it and nothing later can clear it. 3 is reserved for "stack not restored".
STATUS=0
RESTORED=0
RESTORE_FAILED=0
HAS_CAPTURE=0
FINALIZED=0
PROBE_PID=""
fail() { if [ "${STATUS}" -eq 0 ]; then STATUS="$1"; fi; }

restore_stack() {
  if ! "${QA_DIR}/stack.sh" restore; then
    RESTORE_FAILED=1
    echo "STACK NOT RESTORED: see the capture file ${SCRATCH}/stack-before.json" >&2
    fail 3
  fi
  RESTORED=1
}

# results.json is written on every exit that got as far as a capture, so a
# failed run still leaves its evidence, the configuration included.
finalize() {
  if [ "${FINALIZED}" -eq 1 ] || [ "${HAS_CAPTURE}" -eq 0 ]; then return 0; fi
  FINALIZED=1
  docker run --rm \
    -v "${ROOT}:/repo:ro" -v "${SCRATCH}:/scratch" -w /scratch \
    -e QA_SCRATCH=/scratch -e QA_RUN_STATUS="${STATUS}" -e QA_RESTORE_FAILED="${RESTORE_FAILED}" \
    -e QA_COMMIT="$(git rev-parse HEAD)" \
    "${PLAYWRIGHT_IMAGE}" node /repo/frontend/qa/cross-tab-session/finalize.mjs \
    || echo "could not assemble results.json; the parts are in ${SCRATCH}" >&2
}

cleanup() {
  if [ -n "${PROBE_PID}" ]; then kill "${PROBE_PID}" 2>/dev/null || true; PROBE_PID=""; fi
  if [ "${RESTORED}" -eq 0 ] && [ "${HAS_CAPTURE}" -eq 1 ]; then
    restore_stack
  fi
  finalize
  exit "${STATUS}"
}
trap cleanup EXIT INT TERM

refuse() { echo "refusing: $1" >&2; fail 1; exit 1; }

# Runs one of the suite's scripts in the Playwright container. A failed
# Playwright install fails the run: it is never mistaken for a script result,
# and never hidden.
in_playwright() {
  local script="$1" show="$2"
  docker run --rm --network host \
    -v "${ROOT}:/repo:ro" \
    -v "${SCRATCH}:/scratch" \
    -w /scratch \
    -e QA_BASE_URL="http://${LAN_IP}" \
    -e QA_SCRATCH=/scratch \
    -e QA_STACK_SHOW="/scratch/${show}" \
    -e QA_COMMIT="$(git rev-parse HEAD)" \
    -e QA_SCRIPT="${script}" \
    -e QA_PLAYWRIGHT_PACKAGE="${PLAYWRIGHT_PACKAGE}" \
    -e QA_USERNAME -e QA_PASSWORD -e QA_USERNAME_2 -e QA_PASSWORD_2 \
    "${PLAYWRIGHT_IMAGE}" \
    bash -c '
      set -uo pipefail
      if ! npm i --no-save --no-package-lock "${QA_PLAYWRIGHT_PACKAGE}" > /scratch/playwright-install.log 2>&1; then
        echo "installing ${QA_PLAYWRIGHT_PACKAGE} failed:" >&2
        tail -n 30 /scratch/playwright-install.log >&2
        exit 90
      fi
      exec node "/repo/frontend/qa/cross-tab-session/${QA_SCRIPT}"
    '
}

# 1. Refusals (nothing changed yet).
if [ -z "${LAN_IP}" ]; then refuse "usage: run.sh <lan-ip>"; fi
case "${LAN_IP}" in
  localhost|127.0.0.1|*:*/*) refuse "use a LAN IP, not ${LAN_IP}" ;;
esac
if echo "${LAN_IP}" | grep -q ":"; then refuse "no port allowed in ${LAN_IP}"; fi
for name in QA_USERNAME QA_PASSWORD QA_USERNAME_2 QA_PASSWORD_2; do
  if [ -z "${!name:-}" ]; then refuse "${name} is not set (credentials come from the environment; see README.md)"; fi
done
export QA_USERNAME QA_PASSWORD QA_USERNAME_2 QA_PASSWORD_2
avail_kb="$(df -Pk "${ROOT}" | awk 'NR==2{print $4}')"
if [ "${avail_kb}" -lt 3145728 ]; then refuse "free disk under 3 GB"; fi
if [ -n "$(git status --porcelain)" ]; then refuse "dirty working tree"; fi

# 2. Restore a leftover capture, then capture the running values. The capture
#    is written to a temporary name first: a failed `show` must not leave an
#    empty capture file behind, which the next run would try to restore from.
if [ -f "${SCRATCH}/stack-before.json" ]; then
  "${QA_DIR}/stack.sh" restore || refuse "could not restore a leftover capture"
fi
rm -f "${SCRATCH}"/results-cases.json "${SCRATCH}"/results-latency.json "${SCRATCH}"/results.json \
  "${SCRATCH}"/stack-during.json "${SCRATCH}"/stack-after.json "${SCRATCH}"/stack-before.recorded.json
"${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-before.json.tmp" || refuse "could not read the running configuration"
mv "${SCRATCH}/stack-before.json.tmp" "${SCRATCH}/stack-before.json"
cp "${SCRATCH}/stack-before.json" "${SCRATCH}/stack-before.recorded.json"
HAS_CAPTURE=1

# 3. Cleanup installed before the first mutation (the trap above is already set).

# 4. qa-up and build check. qa-up also verifies the access lifetime by
#    behaviour, through the ingress at the LAN address.
QA_INGRESS="http://${LAN_IP}" "${QA_DIR}/stack.sh" qa-up || { fail 1; exit 1; }
served="$(curl -s "http://${LAN_IP}/" | sed -n 's/.*name="erp-build" content="\([^"]*\)".*/\1/p' | head -1)"
if [ "${served}" != "$(git rev-parse HEAD)" ]; then
  refuse "served build ${served} != HEAD"
fi
"${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-during.json" || { fail 1; exit 1; }

# 5. Cases and W1 in Playwright. The host probe answers the one database
#    question case 14 has (see host-probe.sh).
"${QA_DIR}/host-probe.sh" "${SCRATCH}" > "${SCRATCH}/host-probe.log" 2>&1 &
PROBE_PID=$!
in_playwright cases.mjs stack-during.json || fail 1
kill "${PROBE_PID}" 2>/dev/null || true
PROBE_PID=""

# 6. Restore, then measure latency under the restored configuration. The
#    measurement runs whether or not a case failed (it cannot clear the
#    status), but never over a stack that was not restored.
restore_stack
if [ "${RESTORE_FAILED}" -eq 0 ]; then
  if "${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-after.json"; then
    in_playwright measure.mjs stack-after.json || fail 1
  else
    fail 1
  fi
fi

# 7. results.json and the summary.
finalize
echo "run complete: status=${STATUS}"
exit "${STATUS}"
