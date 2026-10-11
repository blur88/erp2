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

echo "passed ${PASSED}, failed ${FAILED}"
[ "${FAILED}" -eq 0 ]
