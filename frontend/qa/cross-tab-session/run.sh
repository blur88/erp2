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
#   QA_USERNAME_3 / QA_PASSWORD_3   the user W1 signs in as: NOT an
#                                   administrator (role sales_staff; README)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QA_DIR="${ROOT}/frontend/qa/cross-tab-session"
SCRATCH="${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
PLAYWRIGHT_PACKAGE="playwright@1.63.0"
LAN_IP="${1:-}"

mkdir -p "${SCRATCH}"
cd "${ROOT}"

# The exit-status rule lives in lib/run-guard.sh (tested by
# run-status.test.sh): the first failure decides the status and nothing later
# clears it; 0 is possible only when the last line below was reached; INT is
# 130, TERM is 143, any other early exit is 1; 3 is "stack not restored".
# shellcheck source=frontend/qa/cross-tab-session/lib/run-guard.sh
source "${QA_DIR}/lib/run-guard.sh"
PROBE_PID=""

run_restore() {
  if ! "${QA_DIR}/stack.sh" restore; then
    echo "the capture file is ${SCRATCH}/stack-before.json" >&2
    return 1
  fi
}

run_finalize() {
  docker run --rm \
    -v "${ROOT}:/repo:ro" -v "${SCRATCH}:/scratch" -w /scratch \
    -e QA_SCRATCH=/scratch -e QA_RUN_STATUS="${STATUS}" -e QA_RESTORE_FAILED="${RESTORE_FAILED}" \
    -e QA_RUN_COMPLETED="${COMPLETED}" -e QA_RUN_ABORTED="${ABORTED}" \
    -e QA_COMMIT="$(git rev-parse HEAD)" \
    "${PLAYWRIGHT_IMAGE}" node /repo/frontend/qa/cross-tab-session/finalize.mjs
}

run_stop_helpers() {
  if [ -n "${PROBE_PID}" ]; then kill "${PROBE_PID}" 2>/dev/null || true; PROBE_PID=""; fi
}

# In place before anything is changed: every way out of this script goes
# through on_exit, which restores the stack and writes results.json.
install_status_traps

refuse() { echo "refusing: $1" >&2; fail 1; exit 1; }

# Runs one of the suite's scripts in the Playwright container. A failed
# Playwright install fails the run: it is never mistaken for a script result,
# and never hidden.
#
# The container is on Docker's default bridge, not on the host's network. With
# `--network host` Chromium watches the host's interfaces and fails in-flight
# requests with net::ERR_NETWORK_CHANGED whenever one changes, which on a host
# running other, restarting containers fails cases at random. From the bridge
# the page is still loaded by LAN IP through the ingress on port 80: the origin
# is the same non-localhost, non-secure one, and nothing the cases test depends
# on which network namespace the browser sits in.
in_playwright() {
  local script="$1" show="$2"
  docker run --rm \
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
    -e QA_USERNAME_3 -e QA_PASSWORD_3 \
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
if reason="$(address_refusal "${LAN_IP}")"; then refuse "${reason}"; fi
for name in QA_USERNAME QA_PASSWORD QA_USERNAME_2 QA_PASSWORD_2 QA_USERNAME_3 QA_PASSWORD_3; do
  if [ -z "${!name:-}" ]; then refuse "${name} is not set (credentials come from the environment; see README.md)"; fi
done
export QA_USERNAME QA_PASSWORD QA_USERNAME_2 QA_PASSWORD_2 QA_USERNAME_3 QA_PASSWORD_3
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
  "${SCRATCH}"/stack-during.json "${SCRATCH}"/stack-after.json "${SCRATCH}"/stack-before.recorded.json \
  "${SCRATCH}"/docker-ps-before-latency.txt
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
#    status), but never over a stack that was not restored. Only M1 and M2 can
#    fail it by their size; M3 and M4 are diagnostic since 2026-10-06 (their
#    former 10 / 20 ms targets were replaced, not met) and fail it only if
#    they could not be recorded at all.
restore_stack
if [ "${RESTORE_FAILED}" -eq 0 ]; then
  if "${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-after.json"; then
    # What else runs on this host while the latency is measured. The browser
    # container cannot see it, so it is taken here; finalize.mjs records it
    # with M3 and M4 and flags restarting containers. Written to a temporary
    # name first: if the listing fails there is no file, and results.json says
    # the workload was not captured instead of showing an empty list.
    if docker ps --format '{{.Names}}\t{{.Status}}' > "${SCRATCH}/docker-ps-before-latency.txt.tmp"; then
      mv "${SCRATCH}/docker-ps-before-latency.txt.tmp" "${SCRATCH}/docker-ps-before-latency.txt"
    else
      rm -f "${SCRATCH}/docker-ps-before-latency.txt.tmp"
      echo "could not list the host's containers; the competing workload will be recorded as not captured" >&2
    fi
    in_playwright measure.mjs stack-after.json || fail 1
  else
    fail 1
  fi
fi

# 7. results.json and the summary. COMPLETED is what allows status 0: it is
#    set here and nowhere else, after everything the run does, and a
#    results.json that cannot be written still fails the run (finalize).
COMPLETED=1
finalize
echo "run complete: status=${STATUS}; results in ${SCRATCH}/results.json"
exit "${STATUS}"
