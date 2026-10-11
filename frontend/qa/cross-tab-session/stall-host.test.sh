#!/usr/bin/env bash
# Tests of the host side of the stall runs (#1370) against stand-ins: the CPU
# load host-probe.sh starts and stops, and that nothing run-one.sh started is
# left behind when a run fails. Plain bash, no Docker:
#
#   bash frontend/qa/cross-tab-session/stall-host.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
PASSED=0
FAILED=0
ok() { PASSED=$((PASSED + 1)); echo "ok    $1"; }
not_ok() { FAILED=$((FAILED + 1)); echo "FAIL  $1 — $2"; }
check() { if eval "$2"; then ok "$1"; else not_ok "$1" "${3:-condition was: $2}"; fi; }

# --- host-probe.sh: the CPU load ---------------------------------------------------
BIN="${TMP}/bin"
mkdir -p "${BIN}"
cat > "${BIN}/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "${FAKE_LOG}"
case "$1" in
  run) [ "${FAKE_RUN_RC:-0}" -eq 0 ] && echo cid123; exit "${FAKE_RUN_RC:-0}" ;;
  ps) [ -f "${FAKE_LOG}.running" ] && echo erp_qa_cpu_load ;;
esac
exit 0
STUB
chmod +x "${BIN}/docker"

# probe <name> <request...>: one request to a host-probe.sh started for it.
# Leaves <name>.res (the answer) and <name>.log (what docker was asked).
probe() {
  local name="$1"; shift
  local scratch="${TMP}/scratch-${name}"
  mkdir -p "${scratch}/probe"
  : > "${TMP}/${name}.log"
  ( export PATH="${BIN}:${PATH}" FAKE_LOG="${TMP}/${name}.log"; exec bash "${HERE}/host-probe.sh" "${scratch}" ) > /dev/null 2>&1 &
  local pid=$!
  printf '%s\n' "$*" > "${scratch}/probe/1.req"
  for _ in $(seq 1 50); do [ -f "${scratch}/probe/1.res" ] && break; sleep 0.1; done
  cat "${scratch}/probe/1.res" > "${TMP}/${name}.res" 2>/dev/null || echo "(no answer)" > "${TMP}/${name}.res"
  kill "${pid}" 2>/dev/null; wait "${pid}" 2>/dev/null
}

probe start cpu-load-start 8
check "cpu-load-start answers ok" '[ "$(cat "${TMP}/start.res")" = "ok" ]' "answered: $(cat "${TMP}/start.res")"
check "cpu-load-start runs the workers in a container of that name" 'grep -q "^docker run .*--name erp_qa_cpu_load .*cpu-load.mjs 8$" "${TMP}/start.log"' "$(tr '\n' ';' < "${TMP}/start.log")"
check "a host probe that is stopped removes the workers" 'tail -1 "${TMP}/start.log" | grep -q "^docker rm -f erp_qa_cpu_load$"' "$(tr '\n' ';' < "${TMP}/start.log")"

probe bad cpu-load-start 800
check "a worker count outside 1 to 64 is refused and nothing is run" 'grep -q "^error:" "${TMP}/bad.res" && ! grep -q "^docker run" "${TMP}/bad.log"' "answered: $(cat "${TMP}/bad.res")"

FAKE_RUN_RC=1 probe fails cpu-load-start 8
check "a container that does not start is an error, not ok" 'grep -q "^error:" "${TMP}/fails.res"' "answered: $(cat "${TMP}/fails.res")"

probe stop cpu-load-stop
check "cpu-load-stop removes the container and answers ok" '[ "$(cat "${TMP}/stop.res")" = "ok" ] && grep -q "^docker rm -f erp_qa_cpu_load$" "${TMP}/stop.log"' "answered: $(cat "${TMP}/stop.res")"

probe idle cpu-load-status
check "cpu-load-status says stopped when no such container runs" '[ "$(cat "${TMP}/idle.res")" = "stopped" ]' "answered: $(cat "${TMP}/idle.res")"
touch "${TMP}/busy.log.running"
probe busy cpu-load-status
check "cpu-load-status says running when one does" '[ "$(cat "${TMP}/busy.res")" = "running" ]' "answered: $(cat "${TMP}/busy.res")"

# --- run-one.sh: nothing left behind -----------------------------------------------
FAKE="${TMP}/fakeroot"
FQA="${FAKE}/frontend/qa/cross-tab-session"
mkdir -p "${FQA}/lib" "${FAKE}/bin"
cp "${HERE}/run-one.sh" "${FQA}/run-one.sh"
cp "${HERE}/lib/run-guard.sh" "${FQA}/lib/run-guard.sh"
: > "${FQA}/diagnose-stall.mjs"
cat > "${FQA}/stack.sh" <<'STUB'
#!/usr/bin/env bash
echo "stack $1 grace=${QA_GRACE_SECONDS:-unset}" >> "${FAKE_LOG}"
case "$1" in
  show) echo '{"accessTokenExpiry":"15m","refreshGraceSeconds":"60"}' ;;
  restore) rm -f "${ERP_SESSION_SCRATCH}/stack-before.json" ;;
esac
STUB
printf '#!/usr/bin/env bash\nsleep 30\n' > "${FQA}/host-probe.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "${FQA}/upstream-capture.sh"
cat > "${FAKE}/bin/docker" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  logs) exec sleep 300 ;;
  run)
    echo "docker run" >> "${FAKE_LOG}"
    printf '%s\n' "$@" | grep -E '^QA_STALL_[A-Z_]+(=|$)' | sed 's/^/passed /' >> "${FAKE_LOG}"
    exit "${FAKE_SCRIPT_RC:-0}" ;;
  *) echo "docker $*" >> "${FAKE_LOG}" ;;
esac
STUB
cat > "${FAKE}/bin/git" <<'STUB'
#!/usr/bin/env bash
case "$*" in "rev-parse HEAD") echo abc123 ;; "status --porcelain") : ;; esac
STUB
printf '#!/usr/bin/env bash\necho %s\n' "'<meta name=\"erp-build\" content=\"abc123\">'" > "${FAKE}/bin/curl"
printf '#!/usr/bin/env bash\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/x 99999999 1 99999999 1%% /"\n' > "${FAKE}/bin/df"
chmod +x "${FQA}"/*.sh "${FAKE}/bin"/*

run_one() {
  local name="$1"
  ( export PATH="${FAKE}/bin:${PATH}" ERP_SESSION_SCRATCH="${TMP}/one-${name}" FAKE_LOG="${TMP}/${name}.log"
    export QA_USERNAME=a QA_PASSWORD=a QA_USERNAME_2=b QA_PASSWORD_2=b QA_USERNAME_3=c QA_PASSWORD_3=c
    : > "${FAKE_LOG}"
    bash "${FQA}/run-one.sh" 10.1.1.34 diagnose-stall.mjs > "${TMP}/${name}.out" 2>&1 )
  echo $? > "${TMP}/${name}.rc"
}

FAKE_SCRIPT_RC=1 run_one failed
check "run-one.sh: a failed script is a failed run" '[ "$(cat "${TMP}/failed.rc")" = "1" ]' "exit $(cat "${TMP}/failed.rc"); $(tail -3 "${TMP}/failed.out" | tr '\n' ';')"
check "run-one.sh: a failed run removes the CPU workers" 'grep -q "^docker rm -f erp_qa_cpu_load$" "${TMP}/failed.log"' "$(tr '\n' ';' < "${TMP}/failed.log")"
check "run-one.sh: a failed run still restores the stack" 'grep -q "^stack restore" "${TMP}/failed.log"' "$(tr '\n' ';' < "${TMP}/failed.log")"

QA_GRACE_SECONDS=60 FAKE_SCRIPT_RC=1 run_one failed60
check "run-one.sh: the cell's grace reaches stack.sh qa-up" 'grep -q "^stack qa-up grace=60$" "${TMP}/failed60.log"' "$(tr '\n' ';' < "${TMP}/failed60.log")"
check "run-one.sh: a failed run at a 60 s grace still restores the stack" 'grep -q "^stack restore" "${TMP}/failed60.log" && [ "$(cat "${TMP}/failed60.rc")" = "1" ]' "$(tr '\n' ';' < "${TMP}/failed60.log")"

QA_STALL_CELL=H12 QA_STALL_KIND=calibration QA_STALL_GATE=1 QA_STALL_BARRIER_MS=10000 QA_STALL_NUDGE_PATH=/inventory/products QA_STALL_ROUNDS=1 QA_STALL_HOLD_MS=12000 QA_STALL_PROBE=1 run_one passes
for name in QA_STALL_CELL QA_STALL_KIND QA_STALL_ROUNDS QA_STALL_GATE QA_STALL_BARRIER_MS QA_STALL_NUDGE_PATH QA_STALL_HOLD_MS QA_STALL_PROBE; do
  check "run-one.sh: ${name} is passed into the container" 'grep -q "^passed ${name}$" "${TMP}/passes.log"' "$(grep '^passed' "${TMP}/passes.log" | tr '\n' ';')"
done

# --- stack.sh: the grace a cell asks for -------------------------------------------
SBIN="${TMP}/sbin"
mkdir -p "${SBIN}"
cat > "${SBIN}/docker" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "compose build"*) echo "build" >> "${FAKE_LOG}" ;;
  "compose up -d") echo "up access=${JWT_ACCESS_TOKEN_EXPIRY:-} grace=${REFRESH_GRACE_SECONDS:-}" >> "${FAKE_LOG}"
    echo "${JWT_ACCESS_TOKEN_EXPIRY:-}" > "${FAKE_LOG}.access"; echo "${REFRESH_GRACE_SECONDS:-}" > "${FAKE_LOG}.grace" ;;
  "compose ps backend") echo "erp_backend Up" ;;
  *"printenv JWT_ACCESS_TOKEN_EXPIRY") cat "${FAKE_LOG}.access" 2>/dev/null ;;
  *"printenv REFRESH_GRACE_SECONDS") cat "${FAKE_LOG}.grace" 2>/dev/null ;;
  inspect*Health*) echo healthy ;;
  inspect*) echo sha256:img ;;
esac
STUB
cat > "${SBIN}/curl" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *http_code*) printf 200 ;;
  *) echo '<meta name="erp-build" content="abc123">' ;;
esac
STUB
cp "${FAKE}/bin/git" "${SBIN}/git"
chmod +x "${SBIN}"/*

# stack <name> <capture json or ""> <command>: the real stack.sh against the stand-ins.
stack() {
  local name="$1" capture="$2"; shift 2
  local scratch="${TMP}/stack-${name}"
  mkdir -p "${scratch}"
  [ -n "${capture}" ] && printf '%s\n' "${capture}" > "${scratch}/stack-before.json"
  ( export PATH="${SBIN}:${PATH}" ERP_SESSION_SCRATCH="${scratch}" FAKE_LOG="${TMP}/${name}.log" QA_USERNAME=a QA_PASSWORD=a
    : > "${FAKE_LOG}"
    bash "${HERE}/stack.sh" "$@" > "${TMP}/${name}.out" 2>&1 )
  echo $? > "${TMP}/${name}.rc"
}
CAPTURE='{"accessTokenExpiry":"15m","refreshGraceSeconds":"60"}'

QA_GRACE_SECONDS=30 stack grace30 "${CAPTURE}" qa-up
check "stack.sh: a grace that is neither 5 nor 60 is refused before anything is built" '[ "$(cat "${TMP}/grace30.rc")" = "2" ] && [ ! -s "${TMP}/grace30.log" ]' "exit $(cat "${TMP}/grace30.rc"); $(tr '\n' ';' < "${TMP}/grace30.log")"

QA_GRACE_SECONDS=60 stack grace60 "${CAPTURE}" qa-up
check "stack.sh: QA_GRACE_SECONDS=60 starts the stack at access 20s, grace 60" 'grep -q "^up access=20s grace=60$" "${TMP}/grace60.log"' "$(tr '\n' ';' < "${TMP}/grace60.log")"

stack grace5 "${CAPTURE}" qa-up
check "stack.sh: with no grace asked for it is 5, as before" 'grep -q "^up access=20s grace=5$" "${TMP}/grace5.log"' "$(tr '\n' ';' < "${TMP}/grace5.log")"

QA_GRACE_SECONDS=60 stack restore60 "${CAPTURE}" restore
check "stack.sh: restore uses the captured values whatever grace the run asked for" 'grep -q "^up access=15m grace=60$" "${TMP}/restore60.log" && [ "$(cat "${TMP}/restore60.rc")" = "0" ]' "exit $(cat "${TMP}/restore60.rc"); $(tr '\n' ';' < "${TMP}/restore60.log")"
QA_GRACE_SECONDS=60 stack restore5 '{"accessTokenExpiry":"15m","refreshGraceSeconds":"5"}' restore
check "stack.sh: restore of a capture taken at grace 5 goes back to 5, not to what the run asked for" 'grep -q "^up access=15m grace=5$" "${TMP}/restore5.log"' "$(tr '\n' ';' < "${TMP}/restore5.log")"

# --- stall-cell.sh: what it refuses ------------------------------------------------
CQA="${TMP}/cellroot/frontend/qa/cross-tab-session"
mkdir -p "${CQA}/lib" "${TMP}/cellroot/docs/modules/auth" "${TMP}/cellroot/bin"
cp "${HERE}/stall-cell.sh" "${CQA}/stall-cell.sh" 2>/dev/null
cp "${HERE}/lib/stall-cells.mjs" "${CQA}/lib/stall-cells.mjs"
printf '#!/usr/bin/env bash\necho "run-one $* cell=${QA_STALL_CELL:-} kind=${QA_STALL_KIND:-} grace=${QA_GRACE_SECONDS:-} gate=${QA_STALL_GATE:-} barrier=${QA_STALL_BARRIER_MS:-} nudge=${QA_STALL_NUDGE_PATH:-}" >> "${FAKE_LOG}"\n' > "${CQA}/run-one.sh"
printf '#!/usr/bin/env bash\necho "{\\"accessTokenExpiry\\":\\"15m\\",\\"refreshGraceSeconds\\":\\"60\\"}"\n' > "${CQA}/stack.sh"
printf '#!/usr/bin/env bash\necho "rows $*" >> "${FAKE_LOG}"\necho "{}"\n' > "${CQA}/replay-server-rows.sh"
printf 'console.log("judged")\n' > "${CQA}/judge-stall.mjs"
cat > "${TMP}/cellroot/bin/git" <<'STUB'
#!/usr/bin/env bash
case "$*" in "branch --show-current") echo "${FAKE_BRANCH}" ;; "rev-parse HEAD") echo abc123 ;; esac
STUB
printf '#!/usr/bin/env bash\necho "CONTAINER"\n' > "${TMP}/cellroot/bin/docker"
chmod +x "${CQA}"/*.sh "${TMP}/cellroot/bin"/*
PROTOCOL="${TMP}/cellroot/docs/modules/auth/REPLAY_STALL_PROTOCOL.md"

# cell <name> <branch> <args...>
cell() {
  local name="$1" branch="$2"; shift 2
  ( export PATH="${TMP}/cellroot/bin:${PATH}" FAKE_LOG="${TMP}/${name}.log" FAKE_BRANCH="${branch}" \
      ERP_SESSION_SCRATCH="${TMP}/cell-scratch-${name}" ERP_QA_EVIDENCE="${TMP}/evidence-${name}"
    : > "${FAKE_LOG}"
    bash "${CQA}/stall-cell.sh" "$@" > "${TMP}/${name}.out" 2>&1 )
  echo $? > "${TMP}/${name}.rc"
}

printf '## Frozen values\n\nNot yet frozen. No recorded round may run while this line stands.\n' > "${PROTOCOL}"
cell unfrozen qa/1370-replay-stall-runs 10.1.1.34 H12 recorded
check "stall-cell.sh: a recorded cell is refused while the protocol is not frozen" '[ "$(cat "${TMP}/unfrozen.rc")" = "2" ] && ! grep -q "^run-one" "${TMP}/unfrozen.log"' "exit $(cat "${TMP}/unfrozen.rc"); $(cat "${TMP}/unfrozen.out" | tr '\n' ';')"
cell calib qa/1370-replay-stall-runs 10.1.1.34 H12 calibration
check "stall-cell.sh: calibration runs before the freeze, at the cell's grace" 'grep -q "^run-one 10.1.1.34 diagnose-stall.mjs cell=H12 kind=calibration grace=5 " "${TMP}/calib.log"' "exit $(cat "${TMP}/calib.rc"); $(cat "${TMP}/calib.out" "${TMP}/calib.log" | tr '\n' ';')"

printf '## Frozen values\n\nfrozen-mechanism: gate=1 barrier-ms=7000 nudge-path=/inventory/products\n' > "${PROTOCOL}"
QA_STALL_BARRIER_MS=1 QA_STALL_GATE=0 cell frozen qa/1370-replay-stall-runs 10.1.1.34 G60 recorded
check "stall-cell.sh: a recorded cell runs the frozen mechanism, whatever the environment says" 'grep -q "^run-one 10.1.1.34 diagnose-stall.mjs cell=G60 kind=recorded grace=60 gate=1 barrier=7000 nudge=/inventory/products$" "${TMP}/frozen.log"' "exit $(cat "${TMP}/frozen.rc"); $(cat "${TMP}/frozen.out" "${TMP}/frozen.log" | tr '\n' ';')"
check "stall-cell.sh: the evidence is filed under the cell and the start time" 'ls "${TMP}/evidence-frozen/G60"/*/head.txt > /dev/null 2>&1' "$(find "${TMP}/evidence-frozen" 2>/dev/null | head -5 | tr '\n' ';')"
check "stall-cell.sh: calibration evidence is filed apart" 'ls "${TMP}/evidence-calib/calibration"/*/head.txt > /dev/null 2>&1' "$(find "${TMP}/evidence-calib" 2>/dev/null | head -5 | tr '\n' ';')"

cell again qa/1370-replay-stall-runs 10.1.1.34 G60 recorded
check "stall-cell.sh: a first recorded invocation files its evidence" 'ls "${TMP}/evidence-again/G60"/*/head.txt > /dev/null 2>&1' "first run exit $(cat "${TMP}/again.rc")"
( export PATH="${TMP}/cellroot/bin:${PATH}" FAKE_LOG="${TMP}/again2.log" FAKE_BRANCH=qa/1370-replay-stall-runs ERP_SESSION_SCRATCH="${TMP}/cell-scratch-again" ERP_QA_EVIDENCE="${TMP}/evidence-again"
  : > "${FAKE_LOG}"; bash "${CQA}/stall-cell.sh" 10.1.1.34 G60 recorded > "${TMP}/again2.out" 2>&1; echo $? > "${TMP}/again2.rc" )
check "stall-cell.sh: the second recorded invocation of a cell is refused" '[ "$(cat "${TMP}/again2.rc")" = "2" ] && ! grep -q "^run-one" "${TMP}/again2.log"' "exit $(cat "${TMP}/again2.rc"); $(cat "${TMP}/again2.out" | tr '\n' ';')"

mkdir -p "${TMP}/cell-scratch-stale" && echo stale > "${TMP}/cell-scratch-stale/stack-during.json" && echo stale > "${TMP}/cell-scratch-stale/ingress-access.log"
cell stale qa/1370-replay-stall-runs 10.1.1.34 H21 recorded
check "stall-cell.sh: files an earlier invocation left in the scratch directory are not filed as this one's" '! grep -rq "^stale$" "${TMP}/evidence-stale"' "$(grep -rl '^stale$' "${TMP}/evidence-stale" | tr '\n' ';')"

cell wrongbranch qa/1370-replay-stall-runs 10.1.1.34 C-unfixed recorded
check "stall-cell.sh: the control's unfixed half is refused on the evidence branch" '[ "$(cat "${TMP}/wrongbranch.rc")" = "2" ] && ! grep -q "^run-one" "${TMP}/wrongbranch.log"' "exit $(cat "${TMP}/wrongbranch.rc")"
cell wrongbranch2 qa/1370-control-unfixed 10.1.1.34 H21 recorded
check "stall-cell.sh: a main cell is refused on the control branch" '[ "$(cat "${TMP}/wrongbranch2.rc")" = "2" ] && ! grep -q "^run-one" "${TMP}/wrongbranch2.log"' "exit $(cat "${TMP}/wrongbranch2.rc")"
cell control qa/1370-control-unfixed 10.1.1.34 C-unfixed recorded
check "stall-cell.sh: the control's unfixed half runs on the control branch" 'grep -q "^run-one .* cell=C-unfixed " "${TMP}/control.log"' "exit $(cat "${TMP}/control.rc"); $(cat "${TMP}/control.out" | tr '\n' ';')"
cell unknown qa/1370-replay-stall-runs 10.1.1.34 H13 recorded
check "stall-cell.sh: an unknown cell is refused" '[ "$(cat "${TMP}/unknown.rc")" = "2" ]' "exit $(cat "${TMP}/unknown.rc")"
cell badkind qa/1370-replay-stall-runs 10.1.1.34 H12 practice
check "stall-cell.sh: a kind that is neither calibration nor recorded is refused" '[ "$(cat "${TMP}/badkind.rc")" = "2" ]' "exit $(cat "${TMP}/badkind.rc")"

echo "passed ${PASSED}, failed ${FAILED}"
[ "${FAILED}" -eq 0 ]
