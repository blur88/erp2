#!/usr/bin/env bash
# One of the suite's diagnostic scripts against the QA stack, from start to restore:
#
#   run-one.sh <lan-ip> <script.mjs>
#
# It brings the stack up in the QA configuration the way run.sh does, follows
# the ingress log, starts the host probe, runs the named script in the
# Playwright container, and restores the stack. capture-feasibility.sh is the
# same thing for one script, kept as it was recorded.
#
# A diagnostic run. It is not a recorded run of the suite, writes no
# results.json, and what it writes is whatever the script writes.
#
# Same refusals as run.sh: a loopback address, missing credentials, less than
# 3 GB of free disk, a dirty tree, a served build that is not HEAD.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QA_DIR="${ROOT}/frontend/qa/cross-tab-session"
SCRATCH="${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
PLAYWRIGHT_PACKAGE="playwright@1.63.0"
LAN_IP="${1:-}"
SCRIPT="${2:-}"
PROBE_PID=""
INGRESS_PID=""

mkdir -p "${SCRATCH}"
cd "${ROOT}"

# shellcheck source=frontend/qa/cross-tab-session/lib/run-guard.sh
source "${QA_DIR}/lib/run-guard.sh"

run_restore() {
  if ! "${QA_DIR}/stack.sh" restore; then
    echo "the capture file is ${SCRATCH}/stack-before.json" >&2
    return 1
  fi
}

# This run has no results.json: its record is written by the script itself.
run_finalize() { :; }

run_stop_helpers() {
  if [ -n "${PROBE_PID}" ]; then kill "${PROBE_PID}" 2>/dev/null || true; PROBE_PID=""; fi
  if [ -n "${INGRESS_PID}" ]; then kill "${INGRESS_PID}" 2>/dev/null || true; INGRESS_PID=""; fi
  # A segment the script did not get to stop.
  "${QA_DIR}/upstream-capture.sh" stop "${SCRATCH}" feasibility >/dev/null 2>&1 || true
}

install_status_traps

refuse() { echo "refusing: $1" >&2; fail 1; exit 1; }

# 1. Refusals (nothing changed yet).
if reason="$(address_refusal "${LAN_IP}")"; then refuse "${reason/run.sh <lan-ip>/run-one.sh <lan-ip> <script.mjs>}"; fi
if ! [[ "${SCRIPT}" =~ ^[a-z0-9-]+\.mjs$ ]] || [ ! -f "${QA_DIR}/${SCRIPT}" ]; then refuse "'${SCRIPT}' is not a script of the suite"; fi
for name in QA_USERNAME QA_PASSWORD QA_USERNAME_2 QA_PASSWORD_2 QA_USERNAME_3 QA_PASSWORD_3; do
  if [ -z "${!name:-}" ]; then refuse "${name} is not set (credentials come from the environment; see README.md)"; fi
done
export QA_USERNAME QA_PASSWORD QA_USERNAME_2 QA_PASSWORD_2 QA_USERNAME_3 QA_PASSWORD_3
avail_kb="$(df -Pk "${ROOT}" | awk 'NR==2{print $4}')"
if [ "${avail_kb}" -lt 3145728 ]; then refuse "free disk under 3 GB"; fi
if [ -n "$(git status --porcelain)" ]; then refuse "dirty working tree"; fi

# 2. Restore a leftover capture, then capture the running values.
if [ -f "${SCRATCH}/stack-before.json" ]; then
  "${QA_DIR}/stack.sh" restore || refuse "could not restore a leftover capture"
fi
rm -f "${SCRATCH}/stack-during.json" \
  "${SCRATCH}/ingress-access.log" "${SCRATCH}/ingress-error.log"
"${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-before.json.tmp" || refuse "could not read the running configuration"
mv "${SCRATCH}/stack-before.json.tmp" "${SCRATCH}/stack-before.json"
HAS_CAPTURE=1

# 3. The QA configuration, and the build it serves.
QA_INGRESS="http://${LAN_IP}" "${QA_DIR}/stack.sh" qa-up || { fail 1; exit 1; }
served="$(curl -s "http://${LAN_IP}/" | sed -n 's/.*name="erp-build" content="\([^"]*\)".*/\1/p' | head -1)"
if [ "${served}" != "$(git rev-parse HEAD)" ]; then refuse "served build ${served} != HEAD"; fi
"${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-during.json" || { fail 1; exit 1; }

# 4. The host probe (capture segments) and the ingress log, then the run.
"${QA_DIR}/host-probe.sh" "${SCRATCH}" > "${SCRATCH}/host-probe.log" 2>&1 &
PROBE_PID=$!
docker logs -f --since 0s erp_nginx > "${SCRATCH}/ingress-access.log" 2> "${SCRATCH}/ingress-error.log" &
INGRESS_PID=$!

docker run --rm \
  -v "${ROOT}:/repo:ro" -v "${SCRATCH}:/scratch" -w /scratch \
  -e QA_BASE_URL="http://${LAN_IP}" -e QA_SCRATCH=/scratch \
  -e QA_STACK_SHOW=/scratch/stack-during.json \
  -e QA_COMMIT="$(git rev-parse HEAD)" \
  -e QA_PLAYWRIGHT_PACKAGE="${PLAYWRIGHT_PACKAGE}" \
  -e QA_INGRESS_LOG=/scratch/ingress-access.log \
  -e QA_ONE_SCRIPT="${SCRIPT}" \
  -e QA_REPLAY_ATTEMPTS -e QA_REPLAY_TABS \
  -e QA_USERNAME -e QA_PASSWORD -e QA_USERNAME_2 -e QA_PASSWORD_2 -e QA_USERNAME_3 -e QA_PASSWORD_3 \
  "${PLAYWRIGHT_IMAGE}" \
  bash -c '
    set -uo pipefail
    if ! npm i --no-save --no-package-lock "${QA_PLAYWRIGHT_PACKAGE}" > /scratch/playwright-install.log 2>&1; then
      echo "installing ${QA_PLAYWRIGHT_PACKAGE} failed:" >&2
      tail -n 30 /scratch/playwright-install.log >&2
      exit 90
    fi
    exec node "/repo/frontend/qa/cross-tab-session/${QA_ONE_SCRIPT}"
  ' || fail 1

run_stop_helpers

# 5. Restore. A run whose stack was not restored never exits 0.
restore_stack

COMPLETED=1
echo "${SCRIPT} complete: status=${STATUS}; scratch ${SCRATCH}"
exit "${STATUS}"
