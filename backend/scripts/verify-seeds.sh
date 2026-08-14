#!/usr/bin/env bash
# Seed gate for the migration baseline (#950).
#
# A schema-only diff cannot see data. This asserts the canonical seed rows
# by exact count and value against the candidate database built by
# verify-baseline.sh.
set -euo pipefail

# psql runs inside the postgres container via docker compose exec, so no
# password is needed here — and none is hardcoded. The role comes from the
# configured DB_USERNAME (backend/.env.local or the environment) so any
# deployment not using the erp_user default can still run this gate.
ENV_FILE="${ENV_FILE:-.env.local}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
DB_USERNAME="${DB_USERNAME:-erp_user}"
CAND_DB="${CAND_DB:-erp_gate_candidate}"
FAILED=0

q() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d "$CAND_DB" -tAc "$1" | tr -d '\r'
}

# Admin-context query. q() targets $CAND_DB and therefore cannot run when that
# database is absent — this one connects to `postgres` instead. It is correct
# ONLY for the existence probe; every migrations query must use q(), since the
# migrations table lives in the candidate.
q_admin() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d postgres -tAc "$1" | tr -d '\r'
}

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ok   $label"
  else
    echo "  FAIL $label — expected [$expected], got [$actual]"
    FAILED=1
  fi
}

# Prerequisite preflight (#1061).
#
# This script grades seed CONTENT in a database that verify-baseline.sh builds.
# Without this block, an absent candidate produced eight content failures
# interleaved with psql FATAL noise — a missing prerequisite disguised as a
# correctness failure — and a STALE candidate silently produced a false PASS,
# which is worse. Since #1060, verify-baseline.sh aborts early on a credential
# problem, so a stale-or-absent candidate is now a routine outcome.
#
# Exit 2 (not 1) marks "prerequisite unmet" as distinct from "seed data wrong",
# matching verify-baseline.sh.
#
# Every capture below uses `if ! VAR=$(... 2>/dev/null)`. Under `set -euo
# pipefail` (line 7) a bare VAR=$(failing_cmd) aborts the script silently
# before any diagnostic can print, and the 2>/dev/null keeps psql's error text
# out of the output this block exists to clean up.
fail_prerequisite() {
  echo "PREREQUISITE NOT MET: $1" >&2
  echo >&2
  echo "Build the candidate database first:" >&2
  echo "  cd backend && ./scripts/verify-baseline.sh" >&2
  exit 2
}

# Resolve migrations from THIS script's location, never the caller's cwd: a
# glob evaluated elsewhere matches zero files and would report every candidate
# stale — a false failure that looks like a real one.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../src/database/migrations"

EXPECTED_COUNT=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXPECTED_COUNT" -eq 0 ]; then
  fail_prerequisite "no migration files found at $MIGRATIONS_DIR — cannot establish what a fresh candidate looks like."
fi

# Newest = numerically largest timestamp prefix, NOT ls order. TypeORM stores
# migrations.name as <ClassName><timestamp>, while the file is
# <timestamp>-<ClassName>.ts — so the halves are swapped to compare.
NEWEST_FILE=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.ts' -printf '%f\n' | sort -n | tail -1)
EXPECTED_LATEST="${NEWEST_FILE#*-}"          # strip timestamp and dash
EXPECTED_LATEST="${EXPECTED_LATEST%.ts}"     # strip extension
EXPECTED_LATEST="${EXPECTED_LATEST}${NEWEST_FILE%%-*}"  # append timestamp

# (a) Existence.
if ! DB_PRESENT=$(q_admin "SELECT count(*) FROM pg_database WHERE datname = '$CAND_DB';" 2>/dev/null); then
  fail_prerequisite "cannot query PostgreSQL to check whether '$CAND_DB' exists."
fi
if [ "$DB_PRESENT" != "1" ]; then
  fail_prerequisite "database '$CAND_DB' does not exist."
fi

# (b) Applied migration count. A missing migrations table errors here rather
# than returning 0 — that is a database built by something other than
# migration:run, which is exactly a stale candidate.
if ! APPLIED_COUNT=$(q 'SELECT count(*) FROM migrations;' 2>/dev/null); then
  fail_prerequisite "database '$CAND_DB' has no readable migrations table — it was not built by migration:run."
fi
if [ "$APPLIED_COUNT" != "$EXPECTED_COUNT" ]; then
  fail_prerequisite "database '$CAND_DB' is stale — expected $EXPECTED_COUNT migrations, candidate has $APPLIED_COUNT."
fi

# (c) Latest applied migration.
#
# Both (b) and (c) are checked: a matching count can still be a DIFFERENT
# migration set of the same size, and a matching latest name can still hide a
# gap earlier in the chain.
#
# Neither signal detects an EDIT to the body of an already-applied migration —
# such a candidate is reported fresh when it is not. That limitation is exactly
# why committed migrations must remain immutable; this check does not enforce
# it.
if ! APPLIED_LATEST=$(q 'SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1;' 2>/dev/null); then
  fail_prerequisite "database '$CAND_DB' has no readable migrations table — it was not built by migration:run."
fi
if [ "$APPLIED_LATEST" != "$EXPECTED_LATEST" ]; then
  fail_prerequisite "database '$CAND_DB' is stale — expected latest migration '$EXPECTED_LATEST', candidate has '$APPLIED_LATEST'."
fi

echo "==> Row counts"
check "document_number_settings" 5  "$(q 'SELECT count(*) FROM document_number_settings;')"
check "payment_methods"          7  "$(q 'SELECT count(*) FROM payment_methods;')"
check "chart_of_account"         16 "$(q 'SELECT count(*) FROM chart_of_account;')"
check "accounting_settings"      1  "$(q 'SELECT count(*) FROM accounting_settings;')"
check "regional_settings"        1  "$(q 'SELECT count(*) FROM regional_settings;')"
check "company_settings (lazy)"  0  "$(q 'SELECT count(*) FROM company_settings;')"
check "print_settings (lazy)"    0  "$(q 'SELECT count(*) FROM print_settings;')"
check "users (no default admin)" 0  "$(q 'SELECT count(*) FROM users;')"

echo "==> document_number_settings values"
check "doc numbers" \
  "Expenses|EXP|3|1|-1;Journal Entries|JE|3|1|-1;Purchase Orders|PO|3|1|-1;Sales Orders|SO|3|1|-1;Stock Adjustment|SA|3|1|-1" \
  "$(q "SELECT string_agg(\"documentName\"||'|'||prefix||'|'||\"paddingDigits\"||'|'||\"nextNumber\"||'|'||\"lastResetYear\", ';' ORDER BY \"documentName\") FROM document_number_settings;")"

echo "==> payment_methods values"
check "payment methods" \
  "ATOME|Atome|5|true|BANK;BANK|Bank Transfer|2|true|BANK;CASH|Cash|1|true|CASH;CC|Credit Card|4|true|BANK;SHOPEE|Shopee|6|true|BANK;TIKTOK|TikTok|7|true|BANK;TNG|Touch n Go|3|true|BANK" \
  "$(q "SELECT string_agg(code||'|'||name||'|'||\"sortOrder\"||'|'||\"useForPurchases\"||'|'||\"accountingChannel\", ';' ORDER BY code) FROM payment_methods;")"

echo "==> chart_of_account exact tuples"
check "COA tuples" \
  "1000|Assets|Asset|-|true|false;1100|Cash|Asset|1000|true|true;1200|Bank|Asset|1000|true|true;1300|Inventory|Asset|1000|true|true;1400|Supplier Deposit|Asset|1000|true|true;2000|Liabilities|Liability|-|true|false;2100|Customer Deposit|Liability|2000|true|true;3000|Equity|Equity|-|true|false;3100|Owner Capital|Equity|3000|true|true;3200|Opening Balance Equity|Equity|3000|true|true;4000|Income|Income|-|true|false;4100|Sales Revenue|Income|4000|true|true;5000|Cost of Sales|Expense|-|true|false;5100|Cost of Goods Sold|Expense|5000|true|true;6000|Expenses|Expense|-|true|false;6990|Other Expenses|Expense|6000|true|true" \
  "$(q "SELECT string_agg(c.code||'|'||c.name||'|'||c.type::text||'|'||coalesce((SELECT p.code FROM chart_of_account p WHERE p.id = c.\"parentId\"), '-')||'|'||c.\"isSystem\"||'|'||c.\"isPostable\", ';' ORDER BY c.code) FROM chart_of_account c;")"

echo "==> accounting_settings column-to-code mappings"
check "settings mappings (cash,bank,inventory,supplierDeposit,customerDeposit,openingBalanceEquity,salesRevenue,cogs,defaultExpense)" \
  "1100,1200,1300,1400,2100,3200,4100,5100,6990" \
  "$(q "SELECT
     (SELECT code FROM chart_of_account WHERE id = s.\"cashAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"bankAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"inventoryAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"supplierDepositAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"customerDepositAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"openingBalanceEquityAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"salesRevenueAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"cogsAccountId\")||','||
     (SELECT code FROM chart_of_account WHERE id = s.\"defaultExpenseAccountId\")
   FROM accounting_settings s;")"

echo "==> regional_settings defaults"
check "regional defaults" "MYR|AVERAGE|DD/MM/YYYY|24h|1,234.56|Asia/Kuala_Lumpur|10|1" \
  "$(q "SELECT currency||'|'||\"costingMethod\"||'|'||\"dateFormat\"||'|'||\"timeFormat\"||'|'||\"numberFormat\"||'|'||timezone||'|'||\"lowStockThreshold\"||'|'||\"startOfWeek\" FROM regional_settings;")"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: all canonical seed data verified"
  exit 0
fi
echo "FAIL: seed verification failed"
exit 1
