#!/usr/bin/env bash
# One cell of the replay stall runs (#1370), from start to filed evidence:
#
#   stall-cell.sh <lan-ip> <cell> <calibration|recorded>
#
# It reads the cell's settings from lib/stall-cells.mjs, runs diagnose-stall.mjs
# through run-one.sh at the cell's grace, reads the server's rows for the
# sessions the rounds used, judges, and copies everything to
#   ${ERP_QA_EVIDENCE:-~/erp2-qa-evidence/1370}/<cell>/<UTC start>/
# (calibration under .../calibration/<UTC start>/).
#
# Refusals, before anything is run:
#   - a cell that is not in the matrix, or a kind that is neither;
#   - a cell on the wrong branch: the control's unfixed half runs only on
#     qa/1370-control-unfixed, every other cell only on qa/1370-replay-stall-runs;
#   - `recorded` while docs/modules/auth/REPLAY_STALL_PROTOCOL.md carries no
#     `frozen-mechanism:` line. A recorded cell runs the mechanism that line
#     states, whatever the environment says; only calibration reads
#     QA_STALL_GATE, QA_STALL_BARRIER_MS, QA_STALL_NUDGE_PATH, QA_STALL_HOLD_MS,
#     QA_STALL_PROBE and QA_STALL_ROUNDS from the environment.
#
# A cell's ten recorded rounds are run once and never rerun: a second
# `recorded` invocation of a cell that already has filed evidence is refused.
#
# Exits with run-one.sh's status, or 4 if the run passed and the judge did not.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
SCRATCH="${ERP_SESSION_SCRATCH:-/tmp/opencode/erp-session-qa}"
EVIDENCE="${ERP_QA_EVIDENCE:-${HOME}/erp2-qa-evidence/1370}"
PROTOCOL="${ROOT}/docs/modules/auth/REPLAY_STALL_PROTOCOL.md"
EVIDENCE_BRANCH="qa/1370-replay-stall-runs"
CONTROL_BRANCH="qa/1370-control-unfixed"
LAN_IP="${1:-}"
CELL="${2:-}"
KIND="${3:-}"

refuse() { echo "refusing: $1" >&2; exit 2; }

if [ -z "${LAN_IP}" ] || [ -z "${CELL}" ]; then refuse "usage: stall-cell.sh <lan-ip> <cell> <calibration|recorded>"; fi
if [ "${KIND}" != "calibration" ] && [ "${KIND}" != "recorded" ]; then refuse "the kind must be calibration or recorded, not '${KIND}'"; fi
if ! [[ "${CELL}" =~ ^[A-Za-z0-9-]{1,20}$ ]]; then refuse "'${CELL}' is not a cell"; fi

# The cell's build and grace, from the one table.
if ! read -r BUILD GRACE < <(node --input-type=module -e '
  const { cellSettings } = await import(process.argv[1])
  const c = cellSettings(process.argv[2])
  console.log(c.build, c.graceSeconds)
' "${HERE}/lib/stall-cells.mjs" "${CELL}" 2>/dev/null); then
  refuse "'${CELL}' is not a cell of the matrix"
fi
if [ -z "${BUILD:-}" ] || [ -z "${GRACE:-}" ]; then refuse "'${CELL}' is not a cell of the matrix"; fi

cd "${ROOT}"
BRANCH="$(git branch --show-current)"
if [ "${BUILD}" = "control" ] && [ "${BRANCH}" != "${CONTROL_BRANCH}" ]; then refuse "${CELL} runs on ${CONTROL_BRANCH}; this is ${BRANCH}"; fi
if [ "${BUILD}" = "main" ] && [ "${BRANCH}" != "${EVIDENCE_BRANCH}" ]; then refuse "${CELL} runs on ${EVIDENCE_BRANCH}; this is ${BRANCH}"; fi

if [ "${KIND}" = "recorded" ]; then
  FROZEN="$(grep -m1 '^frozen-mechanism: ' "${PROTOCOL}" 2>/dev/null || true)"
  if [ -z "${FROZEN}" ]; then refuse "the protocol carries no frozen-mechanism line: no recorded round runs before the mechanism is frozen"; fi
  if ! [[ "${FROZEN}" =~ ^frozen-mechanism:\ gate=([01])\ barrier-ms=([0-9]+)\ nudge-path=(/[a-z0-9/-]+)$ ]]; then
    refuse "the protocol's frozen-mechanism line cannot be read: ${FROZEN}"
  fi
  export QA_STALL_GATE="${BASH_REMATCH[1]}" QA_STALL_BARRIER_MS="${BASH_REMATCH[2]}" QA_STALL_NUDGE_PATH="${BASH_REMATCH[3]}"
  unset QA_STALL_HOLD_MS QA_STALL_PROBE QA_STALL_ROUNDS
fi
export QA_STALL_CELL="${CELL}" QA_STALL_KIND="${KIND}" QA_GRACE_SECONDS="${GRACE}"

if [ "${KIND}" = "recorded" ] && [ -n "$(ls -A "${EVIDENCE}/${CELL}" 2>/dev/null)" ]; then
  refuse "${CELL} already has recorded evidence under ${EVIDENCE}/${CELL}: a cell's recorded rounds are not rerun"
fi

START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ "${KIND}" = "calibration" ]; then DEST="${EVIDENCE}/calibration/${START}"; else DEST="${EVIDENCE}/${CELL}/${START}"; fi
mkdir -p "${SCRATCH}" "${DEST}"
# Nothing an earlier invocation left in the scratch directory is filed as this
# one's. What an invocation wrote was filed when it ended; a killed one's
# diagnosis is moved aside, not deleted.
if [ -f "${SCRATCH}/stall-diagnosis.json" ]; then mv "${SCRATCH}/stall-diagnosis.json" "${SCRATCH}/stall-diagnosis.unfiled-$(date -u +%s).json"; fi
rm -f "${SCRATCH}/stall-verdicts.json" "${SCRATCH}/server-rows.json" "${SCRATCH}/stack-during.json" \
  "${SCRATCH}/host-probe.log" "${SCRATCH}/ingress-access.log" "${SCRATCH}/ingress-error.log" "${SCRATCH}/playwright-install.log"

# What the host was running, and what the stack was configured as, beforehand.
git rev-parse HEAD > "${DEST}/head.txt"
echo "${BRANCH}" >> "${DEST}/head.txt"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > "${DEST}/docker-ps.txt" 2>&1 || true
uptime > "${DEST}/uptime.txt" 2>&1 || true
"${HERE}/stack.sh" show > "${DEST}/stack-before.json" 2> "${DEST}/stack-before.err" || true

RUN_RC=0
"${HERE}/run-one.sh" "${LAN_IP}" diagnose-stall.mjs > "${DEST}/run-one.out" 2>&1 || RUN_RC=$?
echo "${RUN_RC}" > "${DEST}/run-one.status"
tail -n 15 "${DEST}/run-one.out"

"${HERE}/stack.sh" show > "${DEST}/stack-after.json" 2> "${DEST}/stack-after.err" || true

# The server's rows for the sessions the rounds used. A read that fails leaves
# no file, which the judge reads as "no rows were read".
JUDGE_RC=0
if [ -f "${SCRATCH}/stall-diagnosis.json" ]; then
  mapfile -t SESSIONS < <(node -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const ids = new Set((d.rounds || []).map((r) => r.sessionId).filter((id) => typeof id === "string" && id !== ""))
    for (const id of ids) console.log(id)
  ' "${SCRATCH}/stall-diagnosis.json")
  if "${HERE}/replay-server-rows.sh" "${START}" "${SESSIONS[@]+"${SESSIONS[@]}"}" > "${SCRATCH}/server-rows.json.tmp" 2> "${DEST}/server-rows.err"; then
    mv "${SCRATCH}/server-rows.json.tmp" "${SCRATCH}/server-rows.json"
  else
    rm -f "${SCRATCH}/server-rows.json.tmp"
    echo "the server rows could not be read: every round will be undetermined" >&2
  fi
  node "${HERE}/judge-stall.mjs" "${SCRATCH}/stall-diagnosis.json" "${SCRATCH}/server-rows.json" | tee "${DEST}/judge.out" || JUDGE_RC=$?
else
  echo "the run wrote no stall-diagnosis.json" >&2
  JUDGE_RC=1
fi

for file in stall-diagnosis.json server-rows.json stall-verdicts.json stack-during.json host-probe.log ingress-access.log ingress-error.log playwright-install.log; do
  if [ -f "${SCRATCH}/${file}" ]; then cp "${SCRATCH}/${file}" "${DEST}/${file}"; fi
done
echo "evidence: ${DEST}"

if [ "${RUN_RC}" -ne 0 ]; then exit "${RUN_RC}"; fi
if [ "${JUDGE_RC}" -ne 0 ]; then exit 4; fi
exit 0
