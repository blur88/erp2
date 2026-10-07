#!/usr/bin/env bash
# Tests of run.sh's exit-status rule and address refusals (lib/run-guard.sh),
# of run.sh itself against stand-ins, and of stack.sh's health wait. Plain
# bash, no Docker, no bats:
#
#   bash frontend/qa/cross-tab-session/run-status.test.sh
#
# Each status scenario is a small script that sources the same file run.sh
# sources, installs the same traps through the same function, and stands in
# for the three things run.sh supplies (restore, finalize, stopping helpers).
# RUN_GUARD_LIB points the scenarios at another file: that is how the rule was
# shown to fail against the logic it replaced.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${RUN_GUARD_LIB:-${HERE}/lib/run-guard.sh}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
PASSED=0
FAILED=0

ok() { PASSED=$((PASSED + 1)); echo "ok    $1"; }
not_ok() { FAILED=$((FAILED + 1)); echo "FAIL  $1 — $2"; }

# scenario <name> <body>: runs the body as run.sh would run its own steps.
# Environment: RESTORE_RC and FINALIZE_RC are what the stand-ins return.
# Leaves <name>.rc (exit status), <name>.restore (one line per restore) and
# <name>.finalize (what the last finalize was told).
scenario() {
  local name="$1" body="$2"
  cat > "${TMP}/${name}.sh" <<SCRIPT
set -euo pipefail
source "${LIB}"
run_restore() { echo restored >> "${TMP}/${name}.restore"; return "\${RESTORE_RC:-0}"; }
run_finalize() {
  if [ "\${FINALIZE_RC:-0}" -ne 0 ]; then return "\${FINALIZE_RC}"; fi
  echo "status=\${STATUS} completed=\${COMPLETED:-} aborted=\${ABORTED:-} restoreFailed=\${RESTORE_FAILED}" > "${TMP}/${name}.finalize"
}
run_stop_helpers() { :; }
install_status_traps
HAS_CAPTURE=1
${body}
SCRIPT
  bash "${TMP}/${name}.sh" > "${TMP}/${name}.out" 2>&1
  echo $? > "${TMP}/${name}.rc"
}

rc_of() { cat "${TMP}/$1.rc"; }
finalized() { cat "${TMP}/$1.finalize" 2>/dev/null || echo "(not written)"; }

# Pass: the script exits with exactly <want>, and results.json (the finalize
# stand-in) was told the same status.
expect_status() {
  local name="$1" want="$2" what="$3" got told
  got="$(rc_of "${name}")"
  told="$(finalized "${name}")"
  if [ "${got}" != "${want}" ]; then not_ok "${what}" "exit status ${got}, expected ${want}"; return; fi
  if [[ "${told}" != "status=${want} "* ]]; then not_ok "${what}" "exit status ${got} but results said: ${told}"; return; fi
  ok "${what} (exit ${got}; ${told})"
}

# Pass: the script exits non-zero, results.json was told the same non-zero
# status and that the run did not complete, and the stack was restored once.
expect_abort() {
  local name="$1" what="$2" got told restores
  got="$(rc_of "${name}")"
  told="$(finalized "${name}")"
  restores="$(wc -l < "${TMP}/${name}.restore" 2>/dev/null || echo 0)"
  if [ "${got}" -eq 0 ]; then not_ok "${what}" "exit status 0; results said: ${told}"; return; fi
  if [[ "${told}" != "status=${got} completed=0 aborted="?* ]]; then not_ok "${what}" "exit status ${got} but results said: ${told}"; return; fi
  if [ "${restores}" -ne 1 ]; then not_ok "${what}" "restore ran ${restores} times"; return; fi
  ok "${what} (exit ${got}; ${told})"
}

# The last four lines of run.sh, as every completing scenario ends.
END='COMPLETED=1
finalize
exit "${STATUS}"'

echo "# the exit status (${LIB})"

scenario unguarded 'false
'"${END}"
expect_abort unguarded "an unguarded failing command is a failed run"

scenario pipeline 'served="$(false | head -1)"
echo "${served}"
'"${END}"
expect_abort pipeline 'a failing pipeline inside $(...) is a failed run'

scenario term 'kill -TERM $$
sleep 0.2
'"${END}"
expect_abort term "TERM is a failed run"
[ "$(rc_of term)" = "143" ] && ok "TERM exits 143" || not_ok "TERM exits 143" "got $(rc_of term)"

scenario int 'kill -INT $$
sleep 0.2
'"${END}"
expect_abort int "INT is a failed run"
[ "$(rc_of int)" = "130" ] && ok "INT exits 130" || not_ok "INT exits 130" "got $(rc_of int)"

scenario early 'exit 0
'"${END}"
expect_abort early "leaving with 0 before the last line is a failed run"

scenario normal 'restore_stack
'"${END}"
expect_status normal 0 "a run that reaches its last line with no failure exits 0"
[[ "$(finalized normal)" == *"completed=1 aborted= "* ]] && ok "a completed run is recorded as completed and not aborted" \
  || not_ok "a completed run is recorded as completed and not aborted" "$(finalized normal)"

RESTORE_RC=1 scenario restore_after_success 'restore_stack
'"${END}"
expect_status restore_after_success 3 "a failed restore after a successful run exits 3"
[[ "$(finalized restore_after_success)" == *"restoreFailed=1" ]] && ok "the failed restore is recorded" \
  || not_ok "the failed restore is recorded" "$(finalized restore_after_success)"

RESTORE_RC=1 scenario restore_after_case 'fail 7
restore_stack
'"${END}"
expect_status restore_after_case 7 "a failed restore after a case failure keeps the case's status"

scenario case_failure 'fail 1
restore_stack
'"${END}"
expect_status case_failure 1 "a case failure exits with its status after a completed run"

scenario later_failure 'fail 1
fail 5
restore_stack
'"${END}"
expect_status later_failure 1 "a later failure does not replace the first"

FINALIZE_RC=1 scenario finalize_fails 'restore_stack
'"${END}"
[ "$(rc_of finalize_fails)" -ne 0 ] && ok "a results.json that could not be written is a failed run (exit $(rc_of finalize_fails))" \
  || not_ok "a results.json that could not be written is a failed run" "exit status 0"

RESTORE_RC=1 scenario restore_fails_in_abort 'false
'"${END}"
got="$(rc_of restore_fails_in_abort)"
[ "${got}" -ne 0 ] && [[ "$(finalized restore_fails_in_abort)" == *"restoreFailed=1" ]] \
  && ok "an abort whose restore also fails is non-zero and records the failed restore (exit ${got})" \
  || not_ok "an abort whose restore also fails is non-zero and records the failed restore" "exit ${got}; $(finalized restore_fails_in_abort)"

echo "# run.sh itself, with stand-ins for docker, git, curl, df and stack.sh"
# A copy of run.sh in a scratch tree, so that nothing it does reaches Docker
# or the repository: stack.sh and host-probe.sh there are stand-ins, and
# docker, git, curl and df are stand-ins on PATH. What the stand-ins were
# asked to do is logged. RUN_SH points at another run.sh: that is how the
# script was shown to exit 0 from an abort before this rule.
FAKE="${TMP}/fakeroot"
FQA="${FAKE}/frontend/qa/cross-tab-session"
mkdir -p "${FQA}/lib" "${FAKE}/bin"
cp "${RUN_SH:-${HERE}/run.sh}" "${FQA}/run.sh"
cp "${LIB}" "${FQA}/lib/run-guard.sh"
cat > "${FQA}/stack.sh" <<'STUB'
#!/usr/bin/env bash
echo "stack $1" >> "${FAKE_LOG}"
case "$1" in
  show) echo '{"accessTokenExpiry":"15m","refreshGraceSeconds":"60"}' ;;
  qa-up) exit "${FAKE_QAUP_RC:-0}" ;;
  restore) [ "${FAKE_RESTORE_RC:-0}" -eq 0 ] && rm -f "${ERP_SESSION_SCRATCH}/stack-before.json"; exit "${FAKE_RESTORE_RC:-0}" ;;
esac
STUB
printf '#!/usr/bin/env bash\nsleep 30\n' > "${FQA}/host-probe.sh"
cat > "${FAKE}/bin/docker" <<'STUB'
#!/usr/bin/env bash
all="$*"
case "${all}" in
  ps*) echo "erp_backend	Up" ;;
  *finalize.mjs*)
    echo "finalize status=$(printf '%s\n' "$@" | sed -n 's/^QA_RUN_STATUS=//p') completed=$(printf '%s\n' "$@" | sed -n 's/^QA_RUN_COMPLETED=//p') aborted=$(printf '%s\n' "$@" | sed -n 's/^QA_RUN_ABORTED=//p')" >> "${FAKE_LOG}"
    exit "${FAKE_FINALIZE_RC:-0}" ;;
  *QA_SCRIPT=cases.mjs*)
    echo "cases" >> "${FAKE_LOG}"
    if [ "${FAKE_TERM_DURING_CASES:-0}" = "1" ]; then kill -TERM "${PPID}"; fi
    exit "${FAKE_CASES_RC:-0}" ;;
  *QA_SCRIPT=measure.mjs*) echo "measure" >> "${FAKE_LOG}"; exit "${FAKE_MEASURE_RC:-0}" ;;
esac
STUB
cat > "${FAKE}/bin/git" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "rev-parse HEAD") echo abc123 ;;
  "status --porcelain") : ;;
esac
STUB
cat > "${FAKE}/bin/curl" <<'STUB'
#!/usr/bin/env bash
if [ "${FAKE_CURL_RC:-0}" -ne 0 ]; then exit "${FAKE_CURL_RC}"; fi
echo '<meta name="erp-build" content="abc123">'
STUB
printf '#!/usr/bin/env bash\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/x 99999999 1 99999999 1%% /"\n' > "${FAKE}/bin/df"
chmod +x "${FQA}"/*.sh "${FAKE}/bin"/*

# run_sh <name> [address]: one run of the copy. Leaves <name>.rc and <name>.log.
run_sh() {
  local name="$1" address="${2:-10.1.1.34}"
  rm -rf "${TMP}/scratch-${name}"
  ( export PATH="${FAKE}/bin:${PATH}" ERP_SESSION_SCRATCH="${TMP}/scratch-${name}" FAKE_LOG="${TMP}/${name}.log"
    export QA_USERNAME=a QA_PASSWORD=a QA_USERNAME_2=b QA_PASSWORD_2=b QA_USERNAME_3=c QA_PASSWORD_3=c
    : > "${FAKE_LOG}"
    bash "${FQA}/run.sh" "${address}" > "${TMP}/${name}.out" 2>&1 )
  echo $? > "${TMP}/${name}.rc"
}
log_has() { grep -q "$2" "${TMP}/$1.log"; }
last_finalize() { grep '^finalize' "${TMP}/$1.log" | tail -1; }

run_sh full
if [ "$(rc_of full)" = "0" ] && log_has full '^cases$' && log_has full '^measure$' && [[ "$(last_finalize full)" == "finalize status=0 completed=1 "* ]] \
  && [ "$(grep -c '^stack restore$' "${TMP}/full.log")" = "1" ]; then
  ok "run.sh: a complete run exits 0, restores once and reports status 0, completed"
else not_ok "run.sh: a complete run exits 0, restores once and reports status 0, completed" "exit $(rc_of full); $(tr '\n' ';' < "${TMP}/full.log")"; fi

# The path the review named: curl fails in `served="$(curl ... | sed ... | head -1)"`
# after qa-up has changed the stack.
FAKE_CURL_RC=7 run_sh curl_fails
if [ "$(rc_of curl_fails)" != "0" ] && log_has curl_fails '^stack restore$' && ! log_has curl_fails '^cases$' \
  && [[ "$(last_finalize curl_fails)" == "finalize status=$(rc_of curl_fails) completed=0 aborted="?* ]]; then
  ok "run.sh: a failed curl after qa-up is a failed run: restored, no case run, reported as aborted (exit $(rc_of curl_fails))"
else not_ok "run.sh: a failed curl after qa-up is a failed run" "exit $(rc_of curl_fails); $(tr '\n' ';' < "${TMP}/curl_fails.log")"; fi

FAKE_TERM_DURING_CASES=1 run_sh term_in_cases
if [ "$(rc_of term_in_cases)" = "143" ] && log_has term_in_cases '^stack restore$' && ! log_has term_in_cases '^measure$' \
  && [[ "$(last_finalize term_in_cases)" == "finalize status=143 completed=0 aborted=interrupted by TERM"* ]]; then
  ok "run.sh: TERM while the cases run exits 143: restored, latency not measured, reported as interrupted"
else not_ok "run.sh: TERM while the cases run exits 143" "exit $(rc_of term_in_cases); $(tr '\n' ';' < "${TMP}/term_in_cases.log")"; fi

FAKE_CASES_RC=1 run_sh cases_fail
if [ "$(rc_of cases_fail)" = "1" ] && log_has cases_fail '^measure$' && [[ "$(last_finalize cases_fail)" == "finalize status=1 completed=1 "* ]]; then
  ok "run.sh: a failed case exits 1 after a completed run (latency still measured)"
else not_ok "run.sh: a failed case exits 1 after a completed run" "exit $(rc_of cases_fail); $(tr '\n' ';' < "${TMP}/cases_fail.log")"; fi

FAKE_RESTORE_RC=1 run_sh restore_fails
if [ "$(rc_of restore_fails)" = "3" ] && ! log_has restore_fails '^measure$'; then
  ok "run.sh: a failed restore after passing cases exits 3 and measures nothing over the unrestored stack"
else not_ok "run.sh: a failed restore after passing cases exits 3" "exit $(rc_of restore_fails); $(tr '\n' ';' < "${TMP}/restore_fails.log")"; fi

FAKE_FINALIZE_RC=1 run_sh finalize_fails_run
if [ "$(rc_of finalize_fails_run)" != "0" ]; then ok "run.sh: results.json that cannot be written fails the run (exit $(rc_of finalize_fails_run))"
else not_ok "run.sh: results.json that cannot be written fails the run" "exit 0"; fi

run_sh loopback 127.0.1.1
if [ "$(rc_of loopback)" = "1" ] && [ ! -s "${TMP}/loopback.log" ] && grep -q "refusing" "${TMP}/loopback.out"; then
  ok "run.sh: 127.0.1.1 is refused before anything is asked of the stack"
else not_ok "run.sh: 127.0.1.1 is refused before anything is asked of the stack" "exit $(rc_of loopback); $(tr '\n' ';' < "${TMP}/loopback.log")"; fi

echo "# the address"
if declare -F address_refusal > /dev/null || source "${HERE}/lib/run-guard.sh"; then
  # Names that exist nowhere are answered here, so the test does not depend on
  # the resolver of the machine it runs on.
  resolve_host() {
    case "$1" in
      myhost) echo 127.0.1.1 ;;
      lanhost) echo 10.1.1.34 ;;
      both) printf '10.1.1.34\n::1\n' ;;
      nowhere.invalid) : ;;
      *) getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u ;;
    esac
  }
  for refused in "" localhost LOCALHOST app.localhost 127.0.0.1 127.0.1.1 127.255.255.254 127.1 2130706433 \
    ::1 "[::1]" 10.1.1.34:80 "http://10.1.1.34/" myhost both nowhere.invalid; do
    if reason="$(address_refusal "${refused}")"; then ok "refuses '${refused}' (${reason})"; else not_ok "refuses '${refused}'" "it was accepted"; fi
  done
  for accepted in 10.1.1.34 192.168.1.20 10.127.0.1 172.16.127.1 lanhost; do
    if reason="$(address_refusal "${accepted}")"; then not_ok "accepts '${accepted}'" "refused: ${reason}"; else ok "accepts '${accepted}'"; fi
  done
fi

echo "# the health wait of stack.sh"
# stack.sh is sourced (it dispatches only when executed) and `docker` is a
# stand-in that reports the health named in FAKE_HEALTH, both as the state
# `docker inspect` prints and as the text `docker compose ps` prints.
health_wait() {
  (
    export ERP_SESSION_SCRATCH="${TMP}/stack"
    # shellcheck disable=SC1091
    source "${STACK_SH:-${HERE}/stack.sh}" > /dev/null 2>&1
    set +e
    docker() {
      case "$1" in
        inspect) echo "${FAKE_HEALTH}" ;;
        compose) echo "erp_backend   erp-backend   Up 2 minutes (${FAKE_HEALTH})" ;;
      esac
    }
    sleep() { :; }
    FAKE_HEALTH="$1"
    wait_healthy 2 > /dev/null 2>&1
  )
}
if health_wait healthy; then ok "a healthy backend passes the health wait"; else not_ok "a healthy backend passes the health wait" "it did not"; fi
for state in unhealthy starting none; do
  if health_wait "${state}"; then not_ok "a backend that is '${state}' fails the health wait" "it passed"; else ok "a backend that is '${state}' fails the health wait"; fi
done

echo
echo "${PASSED} passed, ${FAILED} failed"
[ "${FAILED}" -eq 0 ]
