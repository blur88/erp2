# shellcheck shell=bash
# The exit-status rule and the address refusals of run.sh, kept apart from it
# so that run-status.test.sh can exercise them with plain bash and no Docker.
# Sourced, never executed.
#
# The status rule:
#   - STATUS only ever moves from zero to non-zero: the first failure decides
#     it and nothing later clears it (fail).
#   - 0 is possible only when the script reached its last line, which sets
#     COMPLETED=1. Leaving any other way is a failure:
#       130  interrupted (INT)
#       143  terminated (TERM)
#       1    aborted: a command failed outside any handled failure (set -e),
#            or the script stopped before its last line for another reason
#   - 3 means the stack was not restored, unless an earlier failure had
#     already set another status. A failed restore never leaves 0.
#   - A results.json that could not be written is a failure too (1).
#
# The caller defines three functions before install_status_traps:
#   run_restore      put the captured configuration back; non-zero on failure
#   run_finalize     write results.json from STATUS, COMPLETED, ABORTED and
#                    RESTORE_FAILED; non-zero on failure
#   run_stop_helpers stop whatever the run started in the background

STATUS=0
COMPLETED=0
ABORTED=""
RESTORED=0
RESTORE_FAILED=0
HAS_CAPTURE=0
FINALIZED_FOR=""
FINALIZE_FAILED=0

fail() { if [ "${STATUS}" -eq 0 ]; then STATUS="$1"; fi; }

restore_stack() {
  if ! run_restore; then
    RESTORE_FAILED=1
    echo "STACK NOT RESTORED: see the capture file" >&2
    fail 3
  fi
  RESTORED=1
}

# results.json is written on every exit that got as far as a capture, so a
# failed run still leaves its evidence, the configuration included. It is
# written again if the status or the abort reason changed after it was
# written, so the file and the exit status cannot disagree.
finalize() {
  if [ "${HAS_CAPTURE}" -eq 0 ] || [ "${FINALIZE_FAILED}" -eq 1 ]; then return 0; fi
  local key="${STATUS}|${COMPLETED}|${ABORTED}|${RESTORE_FAILED}"
  if [ "${FINALIZED_FOR}" = "${key}" ]; then return 0; fi
  if run_finalize; then
    FINALIZED_FOR="${key}"
  else
    FINALIZE_FAILED=1
    echo "could not assemble results.json; the run is not reported as passed" >&2
    fail 1
  fi
}

# INT and TERM before the cleanup: a failing status first, then the normal
# exit path, which restores and writes the results.
on_signal() {
  if [ -z "${ABORTED}" ]; then ABORTED="interrupted by $1"; fi
  fail "$2"
  exit "${STATUS}"
}

# The same signals during the cleanup: recorded, and the cleanup goes on. A
# restore cut short would leave the stack in the QA configuration.
note_signal() {
  if [ -z "${ABORTED}" ]; then ABORTED="interrupted by $1 during cleanup"; fi
  fail "$2"
}

# The EXIT trap. $1 is the exit code the script was leaving with.
on_exit() {
  local code="$1"
  set +e
  trap - EXIT
  trap 'note_signal INT 130' INT
  trap 'note_signal TERM 143' TERM
  if [ "${COMPLETED}" -ne 1 ]; then
    if [ -z "${ABORTED}" ]; then
      if [ "${STATUS}" -eq 0 ]; then
        ABORTED="aborted before the last line: a command failed outside any handled failure (exit code ${code})"
      else
        ABORTED="stopped before the last line after a failure (status ${STATUS})"
      fi
    fi
    fail 1
  fi
  run_stop_helpers
  if [ "${RESTORED}" -eq 0 ] && [ "${HAS_CAPTURE}" -eq 1 ]; then
    restore_stack
  fi
  finalize
  exit "${STATUS}"
}

install_status_traps() {
  trap 'on_exit $?' EXIT
  trap 'on_signal INT 130' INT
  trap 'on_signal TERM 143' TERM
}

# --- the address the run is given ------------------------------------------

# The addresses a name resolves to, one per line. A function of its own so the
# test can answer for names that do not exist on the machine running it.
resolve_host() { getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u; }

is_loopback_ip() {
  case "$1" in
    127.*|::1|::ffff:127.*) return 0 ;;
    *) return 1 ;;
  esac
}

# Prints why the address must be refused and returns 0; returns 1 for an
# address the run may use. Refused: an empty value, a URL, a port, an IPv6
# literal, `localhost` and names under it, anything in 127.0.0.0/8 or ::1
# however it is written, and a name that resolves to one of those or to
# nothing. The page must be loaded from a LAN address: a loopback origin is a
# secure context and behaves differently.
address_refusal() {
  local given="$1" lower resolved r
  lower="$(printf '%s' "${given}" | tr '[:upper:]' '[:lower:]')"
  case "${lower}" in
    "") echo "usage: run.sh <lan-ip>"; return 0 ;;
    */*) echo "use a LAN IP, not a URL: ${given}"; return 0 ;;
    localhost|localhost.|*.localhost|*.localhost.) echo "use a LAN IP, not ${given} (loopback)"; return 0 ;;
    ::1|\[::1\]|0:0:0:0:0:0:0:1) echo "use a LAN IP, not ${given} (loopback)"; return 0 ;;
    *:*) echo "no port and no IPv6 literal allowed in ${given}"; return 0 ;;
  esac
  if is_loopback_ip "${lower}"; then echo "use a LAN IP, not ${given} (loopback)"; return 0; fi
  # Resolved even when it looks like an address: 127.1, 0177.0.0.1 and
  # 2130706433 are all the loopback address.
  resolved="$(resolve_host "${lower}")"
  if [ -z "${resolved}" ]; then echo "${given} does not resolve to an address"; return 0; fi
  for r in ${resolved}; do
    if is_loopback_ip "${r}"; then echo "use a LAN IP, not ${given} (it resolves to the loopback address ${r})"; return 0; fi
  done
  return 1
}
