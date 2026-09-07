#!/usr/bin/env bash
# E2E fixture leak detection against a persistent database (#1204).
#
# Runs the e2e suites TWICE against a database that is never dropped between
# passes, and asserts they restore a captured baseline. Pass 1 asks whether
# suites restore the baseline; pass 2 asks whether their cleanup depends on a
# clean slate — a suite that only works on a fresh database passes 1 and
# fails 2.
#
# Exit codes:
#   0  clean
#   1  a real finding: a test failure, or baseline drift
#   2  prerequisite unmet: bad baseline, migration mismatch, provisioning
#      failure, unreachable database
#
# NOTE: deliberately no `set -e`. The phases must continue past a failure so
# that a red pass 1 still produces a pass-2 result and both snapshots.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER="$SCRIPT_DIR/e2e-leakcheck.mjs"

LEAKCHECK_DB="erp_db_leakcheck_test"
FRESH=0
SHOW_HELP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --fresh) FRESH=1; shift ;;
    --help|-h) SHOW_HELP=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ "$SHOW_HELP" -eq 1 ]; then
  cat <<'EOF'
Usage: verify-e2e-cleanup.sh [--fresh]

  --fresh   Drop, recreate, migrate and re-baseline the leak-check database.
            Required after a migration change or a runtime-seed change.

Exit codes: 0 clean | 1 finding (test failure or drift) | 2 prerequisite unmet
EOF
  exit 0
fi

# Full DB_* export is required, not just DB_DATABASE. cli-datasource.ts loads
# no env file and database-config.factory.ts defaults DB_HOST to "postgres",
# so migration:run would target the Docker service name and fail with
# getaddrinfo EAI_AGAIN. The global setup we are removing is what normally
# compensates for this.
if [ -f "$BACKEND_DIR/.env.test" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$BACKEND_DIR/.env.test"
  set +a
fi
export DB_DATABASE="$LEAKCHECK_DB"
export NODE_ENV=test
export NODE_OPTIONS=--experimental-vm-modules

REPORT_DIR="${LEAKCHECK_REPORT_DIR:-$BACKEND_DIR/leakcheck-reports}"
mkdir -p "$REPORT_DIR"
export LEAKCHECK_REPORT_DIR="$REPORT_DIR"

WORST=0
# 1 (a real finding) outranks 2 (prerequisite unmet): a leak found in pass 1
# must not be masked by a prerequisite problem reported later.
record() {
  local code="$1"
  [ "$code" -eq 0 ] && return
  if [ "$code" -eq 1 ] || [ "$WORST" -eq 0 ]; then WORST="$code"; fi
  if [ "$WORST" -eq 2 ] && [ "$code" -eq 1 ]; then WORST=1; fi
}

SUMMARY="$REPORT_DIR/summary.txt"
: > "$SUMMARY"

# Everything the operator needs must reach the artifact, not just the console:
# on CI the console scrollback is not what gets uploaded.
say() { echo "$*" | tee -a "$SUMMARY"; }
say_err() { echo "$*" | tee -a "$SUMMARY" >&2; }

# A hard stop that PRESERVES the failing exit code. Provisioning problems are
# 2; a dirty-start drift is 1 (it is a real baseline difference — see
# verify-reusable). Collapsing both to 2 would misreport a genuine finding as
# "nothing was checked".
die() {
  local code="$1" msg="$2"
  say_err ""
  say_err "STOPPED: $msg"
  say_err "No pass was run."
  say_err "Reports: $REPORT_DIR"
  exit "$code"
}

cd "$BACKEND_DIR" || die 2 "cannot cd to $BACKEND_DIR"

# Branch EXPLICITLY on the three outcomes. Treating "not 0" as absent would
# route a transient connection failure (2) into database creation, which then
# fails confusingly against a database that already exists — or worse,
# re-initializes one that was fine.
node "$HELPER" db-exists
DB_PRESENT=$?
case "$DB_PRESENT" in
  0) ;; # exists
  1) ;; # absent
  *) die 2 "could not determine whether $LEAKCHECK_DB exists (exit $DB_PRESENT). \
This is a connection or configuration problem, not an absent database." ;;
esac

if [ "$FRESH" -eq 1 ] || [ "$DB_PRESENT" -eq 1 ]; then
  if [ "$DB_PRESENT" -eq 0 ]; then
    say "==> dropping $LEAKCHECK_DB (--fresh)"
    node "$HELPER" db-drop 2>&1 | tee -a "$SUMMARY"
    [ "${PIPESTATUS[0]}" -eq 0 ] || die 2 "could not drop $LEAKCHECK_DB"
  fi
  say "==> creating $LEAKCHECK_DB"
  node "$HELPER" db-create 2>&1 | tee -a "$SUMMARY"
  [ "${PIPESTATUS[0]}" -eq 0 ] || die 2 "could not create $LEAKCHECK_DB"

  say "==> running migrations"
  npm run migration:run > "$REPORT_DIR/migrations.log" 2>&1 \
    || die 2 "migrations failed — see $REPORT_DIR/migrations.log"

  # Materializes admin and RETAIL, which are OnModuleInit seeds, NOT migration
  # rows. Without this the baseline is captured with users and price_lists
  # empty and both are reported as leaks on pass 1.
  say "==> seed boot"
  npx ts-node -r tsconfig-paths/register ./test/e2e-leakcheck-boot.ts \
    > "$REPORT_DIR/seed-boot.log" 2>&1 \
    || die 2 "seed boot failed — see $REPORT_DIR/seed-boot.log"

  say "==> capturing baseline"
  node "$HELPER" init 2>&1 | tee -a "$SUMMARY"
  [ "${PIPESTATUS[0]}" -eq 0 ] || die 2 "baseline capture failed"
else
  say "==> verifying the retained database is reusable"
  node "$HELPER" verify-reusable 2>&1 | tee -a "$SUMMARY"
  REUSE_STATUS="${PIPESTATUS[0]}"
  # Propagate the helper's own code: 1 = the retained database has drifted (a
  # real finding), 2 = the baseline is missing or incompatible.
  [ "$REUSE_STATUS" -eq 0 ] \
    || die "$REUSE_STATUS" "database is not reusable (see above); re-run with --fresh"
fi

run_pass() {
  local label="$1"
  say ""
  say "==> $label: running e2e suites"
  npx jest --config ./test/jest-e2e-leakcheck.json 2>&1 \
    | tee "$REPORT_DIR/$label-jest.log"
  local jest_status="${PIPESTATUS[0]}"
  # Never `| tee ... && echo ok`: && binds to tee, not jest.
  if [ "$jest_status" -ne 0 ]; then
    say "$label: SUITES FAILED (exit $jest_status)"
    record 1
  else
    say "$label: suites passed"
  fi

  # Runs even when jest failed. A failing suite is MORE likely to leak — it may
  # have aborted before its cleanup — so that is exactly when the delta matters.
  say "==> $label: comparing against baseline"
  node "$HELPER" check "$label" 2>&1 | tee -a "$SUMMARY"
  local check_status="${PIPESTATUS[0]}"
  case "$check_status" in
    0) say "$label: baseline restored" ;;
    1) say "$label: BASELINE DRIFT" ;;
    *) say "$label: CHECK INCOMPLETE (exit $check_status)" ;;
  esac
  record "$check_status"
}

run_pass pass-1
# Runs even after a failed pass 1: the two passes answer different questions,
# and skipping this would hide the non-idempotent-cleanup finding behind an
# unrelated failure and cost a second full run to see it.
run_pass pass-2

say ""
say "==> reports written to $REPORT_DIR"
case "$WORST" in
  0) say "RESULT: clean — both passes restored the baseline." ;;
  1) say "RESULT: FINDING — see the reports above." ;;
  2) say "RESULT: prerequisite unmet — verification was incomplete." ;;
esac
exit "$WORST"
