# shellcheck shell=bash
# Bounded readiness waits for deploy.sh and setup.sh (#1959).
#
# setup.sh must run with only docker-compose.prod.yml beside it, so it embeds
# a verbatim copy of this file between its "BEGIN wait-ready.sh" and
# "END wait-ready.sh" markers; scripts/__tests__/wait-ready.test.js fails if
# the copy drifts. Edit this file, then paste it into setup.sh.
#
# Every wait has its own deadline of READY_TIMEOUT seconds (default 180). No
# single attempt may outlive the deadline, and a success that arrives after it
# is reported as a timeout. On timeout the caller's print_compose_status
# function, if defined, prints diagnostics.
#
# Safe under `set -e`: failures are returned, never raised.

ready_error() {
    if declare -F print_error >/dev/null; then
        print_error "$1"
    else
        echo "ERROR: $1" >&2
    fi
}

ready_timeout_report() {
    ready_error "$1"
    if declare -F print_compose_status >/dev/null; then
        print_compose_status || true
    fi
}

# Run a command, terminating it if it outlives the given number of seconds.
# Returns the command's status (non-zero if it was terminated).
ready_run_bounded() {
    local limit="$1" pid watcher status
    shift
    "$@" &
    pid=$!
    ( sleep "$limit"; kill -TERM "$pid" 2>/dev/null ) >/dev/null 2>&1 &
    watcher=$!
    status=0
    wait "$pid" || status=$?
    kill "$watcher" 2>/dev/null || true
    wait "$watcher" 2>/dev/null || true
    return "$status"
}

ready_sleep_until() {
    local deadline="$1" remaining
    remaining=$((deadline - SECONDS))
    if [ "$remaining" -gt 5 ]; then
        remaining=5
    fi
    if [ "$remaining" -gt 0 ]; then
        sleep "$remaining"
    fi
}

# wait_for_http_200 URL
wait_for_http_200() {
    local url="$1"
    local timeout="${READY_TIMEOUT:-180}"
    local deadline=$((SECONDS + timeout))
    local remaining code=none
    while :; do
        remaining=$((deadline - SECONDS))
        if [ "$remaining" -le 0 ]; then
            ready_timeout_report "No HTTP 200 from $url within ${timeout}s (last status: $code)"
            return 1
        fi
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$remaining" "$url" 2>/dev/null) || true
        code="${code:-000}"
        if [ "$code" = "200" ] && [ "$SECONDS" -lt "$deadline" ]; then
            return 0
        fi
        ready_sleep_until "$deadline"
    done
}

# wait_for_command DESCRIPTION COMMAND [ARGS...]
wait_for_command() {
    local description="$1"
    shift
    local timeout="${READY_TIMEOUT:-180}"
    local deadline=$((SECONDS + timeout))
    local remaining
    while :; do
        remaining=$((deadline - SECONDS))
        if [ "$remaining" -le 0 ]; then
            ready_timeout_report "$description not ready within ${timeout}s"
            return 1
        fi
        if ready_run_bounded "$remaining" "$@" && [ "$SECONDS" -lt "$deadline" ]; then
            return 0
        fi
        ready_sleep_until "$deadline"
    done
}
