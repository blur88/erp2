#!/usr/bin/env bash
# One command for a whole recorded cross-tab session run.
#
# Every recorded run happens after its code is committed: the script refuses a
# dirty tree and a bundle whose erp-build SHA is not HEAD. Results are written
# to the scratch directory, which is outside the repository.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QA_DIR="${ROOT}/frontend/qa/cross-tab-session"
SCRATCH="${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
LAN_IP="${1:-}"

mkdir -p "${SCRATCH}"
cd "${ROOT}"

STATUS=0
RESTORED=0
cleanup() {
  if [ "${RESTORED}" -eq 0 ]; then
    if ! "${QA_DIR}/stack.sh" restore; then
      if [ "${STATUS}" -eq 0 ]; then STATUS=3; fi
    fi
    RESTORED=1
  fi
  exit "${STATUS}"
}
trap cleanup EXIT INT TERM

refuse() { echo "refusing: $1" >&2; STATUS=1; exit 1; }

# 1. Refusals (nothing changed yet).
if [ -z "${LAN_IP}" ]; then refuse "usage: run.sh <lan-ip>"; fi
case "${LAN_IP}" in
  localhost|127.0.0.1|*:*/*) refuse "use a LAN IP, not ${LAN_IP}" ;;
esac
if echo "${LAN_IP}" | grep -q ":"; then refuse "no port allowed in ${LAN_IP}"; fi
avail_kb="$(df -Pk "${ROOT}" | awk 'NR==2{print $4}')"
if [ "${avail_kb}" -lt 3145728 ]; then refuse "free disk under 3 GB"; fi
if [ -n "$(git status --porcelain)" ]; then refuse "dirty working tree"; fi

# 2. Restore a leftover capture, then capture the running values.
if [ -f "${SCRATCH}/stack-before.json" ]; then
  "${QA_DIR}/stack.sh" restore || refuse "could not restore a leftover capture"
fi
"${QA_DIR}/stack.sh" show > "${SCRATCH}/stack-before.json"

# 3. Cleanup installed before the first mutation (the trap above is already set).

# 4. qa-up and build check.
"${QA_DIR}/stack.sh" qa-up || { STATUS=1; exit 1; }
served="$(curl -s "http://${LAN_IP}/" | sed -n 's/.*name="erp-build" content="\([^"]*\)".*/\1/p' | head -1)"
if [ "${served}" != "$(git rev-parse HEAD)" ]; then
  refuse "served build ${served} != HEAD"
fi

# 5. Cases and W1 in Playwright.
docker run --rm --network host \
  -v "${ROOT}:/repo:ro" \
  -v "${SCRATCH}:/scratch" \
  -w /scratch \
  -e QA_BASE_URL="http://${LAN_IP}" \
  -e QA_SCRATCH=/scratch \
  "${PLAYWRIGHT_IMAGE}" \
  bash -c 'npm i --no-save --no-package-lock playwright@1.63.0 >/dev/null 2>&1 || true; node /repo/frontend/qa/cross-tab-session/cases.mjs' \
  || { STATUS=1; }

# 6. Restore, then measure latency under the restored configuration.
"${QA_DIR}/stack.sh" restore || { if [ "${STATUS}" -eq 0 ]; then STATUS=3; fi; }
RESTORED=1

if [ "${STATUS}" -eq 0 ]; then
  docker run --rm --network host \
    -v "${ROOT}:/repo:ro" \
    -v "${SCRATCH}:/scratch" \
    -w /scratch \
    -e QA_BASE_URL="http://${LAN_IP}" \
    -e QA_SCRATCH=/scratch \
    "${PLAYWRIGHT_IMAGE}" \
    bash -c 'npm i --no-save --no-package-lock playwright@1.63.0 >/dev/null 2>&1 || true; node /repo/frontend/qa/cross-tab-session/measure.mjs' \
    || { STATUS=1; }
fi

echo "run complete: status=${STATUS}"
exit "${STATUS}"
