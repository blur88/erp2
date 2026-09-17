#!/usr/bin/env bash
# Issue #1243 migration gate. Four scenarios, each from a fresh disposable DB:
#   V1  fresh install succeeds
#   V2  a conflicting account aborts with NO changes (proves scan ordering)
#   V2b a failure DURING A3 rolls everything back (proves the transaction)
#   V3  a pre-existing mapping survives untouched
#
# V2 does NOT prove rollback: the conflict scan runs before any write, so it
# aborts at the same point for any of the four codes. V2b is the only rollback
# test, and it must be proven red with the runner's transaction disabled.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
DB_USERNAME="${DB_USERNAME:-erp_user}"
TEST_DB="${TEST_DB:-erp_pmm_gate}"
FAILED=0

psql_admin() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d postgres -tAc "$1" | tr -d '\r'
}
q() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d "$TEST_DB" -tAc "$1" | tr -d '\r'
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

rebuild_db() {
  psql_admin "DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE);" >/dev/null
  psql_admin "CREATE DATABASE $TEST_DB;" >/dev/null
}

# Run the full chain. Returns non-zero if migration:run fails.
run_migrations() {
  if [ -n "${NO_TXN_DS:-}" ]; then
    DB_DATABASE="$TEST_DB" npm run typeorm -- -d "$NO_TXN_DS" migration:run \
      >/tmp/pmm-migrate.log 2>&1
  else
    DB_DATABASE="$TEST_DB" npm run migration:run >/tmp/pmm-migrate.log 2>&1
  fi
}

# Run the chain UP TO but excluding our migration, so a scenario can seed
# conflicting data against a realistic pre-migration database.
run_migrations_before_ours() {
  local ours
  ours="$(basename "$(ls src/database/migrations/*AddPaymentMethodChannelAccounts.ts)")"
  # Temporarily move ours aside, migrate, then restore it. The body runs in a
  # subshell so its EXIT trap is local and cannot clobber a script-wide trap;
  # the trap restores the file even when the pre-migration chain fails under
  # set -e, preserving the original non-zero status.
  (
    restore_ours() {
      local status=$?
      if [ -f "/tmp/$ours" ]; then
        mv "/tmp/$ours" "src/database/migrations/$ours" || \
          echo "  WARN could not restore $ours from /tmp" >&2
      fi
      exit "$status"
    }
    trap restore_ours EXIT

    mv "src/database/migrations/$ours" "/tmp/$ours"
    DB_DATABASE="$TEST_DB" npm run migration:run >/tmp/pmm-migrate-pre.log 2>&1
    mv "/tmp/$ours" "src/database/migrations/$ours"
    trap - EXIT
  )
}

echo "==> V1: fresh installation succeeds"
rebuild_db
if run_migrations; then
  check "1200 renamed"        "CIMB" "$(q "SELECT name FROM chart_of_account WHERE code='1200';")"
  check "new accounts"        "1210,1220,1230,1240" \
    "$(q "SELECT string_agg(code, ',' ORDER BY code) FROM chart_of_account WHERE code IN ('1210','1220','1230','1240');")"
  check "all postable assets" "4" \
    "$(q "SELECT count(*) FROM chart_of_account WHERE code IN ('1210','1220','1230','1240') AND type='Asset' AND \"isPostable\" AND \"parentId\"=(SELECT id FROM chart_of_account WHERE code='1000');")"
  check "new methods"         "CIMB,MAYBANK" \
    "$(q "SELECT string_agg(code, ',' ORDER BY code) FROM payment_methods WHERE code IN ('CIMB','MAYBANK');")"
  check "six mappings"        "CASH>1100,CIMB>1200,MAYBANK>1210,SHOPEE>1220,TIKTOK>1230,ATOME>1240" \
    "$(q "SELECT string_agg(pm.code||'>'||a.code, ',' ORDER BY a.code) FROM payment_method_account_mappings m JOIN payment_methods pm ON pm.id=m.\"paymentMethodId\" JOIN chart_of_account a ON a.id=m.\"accountId\";")"
else
  echo "  FAIL migration:run failed on a clean database"; cat /tmp/pmm-migrate.log; FAILED=1
fi

echo "==> V2: conflicting account aborts with no changes"
rebuild_db
run_migrations_before_ours
q "INSERT INTO chart_of_account (code,name,type,\"parentId\",\"isSystem\",\"isPostable\") VALUES ('1210','Petty Cash','Asset',(SELECT id FROM chart_of_account WHERE code='1000'),false,true);" >/dev/null
if run_migrations; then
  echo "  FAIL migration succeeded despite a conflicting 1210"; FAILED=1
else
  echo "  ok   migration exited non-zero"
  # The exit status proves the abort; the log pins WHY it aborted. TypeORM's
  # CLI logs the query, its parameter and the error, so "1210" appears several
  # times — a count would pin CLI logging, not migration behavior. Assert the
  # specific abort phrase is present instead.
  if grep -Fq 'account 1210 already exists' /tmp/pmm-migrate.log; then
    echo "  ok   abort names the code"
  else
    echo "  FAIL abort names the code — 'account 1210 already exists' missing from the abort log"
    FAILED=1
  fi
  check "1200 untouched"       "Bank" "$(q "SELECT name FROM chart_of_account WHERE code='1200';")"
  check "no 1220/1230/1240"    "0" \
    "$(q "SELECT count(*) FROM chart_of_account WHERE code IN ('1220','1230','1240');")"
  check "no new methods"       "0" \
    "$(q "SELECT count(*) FROM payment_methods WHERE code IN ('CIMB','MAYBANK');")"
  check "no migrations row"    "0" \
    "$(q "SELECT count(*) FROM migrations WHERE name LIKE '%AddPaymentMethodChannelAccounts%';")"
fi

echo "==> V2b: failure during A3 rolls back A1 and A2"
rebuild_db
run_migrations_before_ours
# A raising BEFORE INSERT trigger on payment_methods. Chosen over a
# unique-index collision on the mapping table: A4 inserts only where no
# mapping exists, so a pre-seeded mapping is SKIPPED and may never fire.
# This trigger fires on the insert A3 always performs.
q "CREATE FUNCTION pmm_boom() RETURNS trigger AS \$\$ BEGIN RAISE EXCEPTION 'pmm injected failure'; END; \$\$ LANGUAGE plpgsql;" >/dev/null
q "CREATE TRIGGER pmm_boom_trg BEFORE INSERT ON payment_methods FOR EACH ROW EXECUTE FUNCTION pmm_boom();" >/dev/null
if run_migrations; then
  echo "  FAIL migration succeeded despite the injected failure"; FAILED=1
else
  check "A1 rename rolled back"  "Bank" "$(q "SELECT name FROM chart_of_account WHERE code='1200';")"
  check "A2 inserts rolled back" "0" \
    "$(q "SELECT count(*) FROM chart_of_account WHERE code IN ('1210','1220','1230','1240');")"
  check "no methods"             "0" \
    "$(q "SELECT count(*) FROM payment_methods WHERE code IN ('CIMB','MAYBANK');")"
  check "no mappings added"      "0" \
    "$(q "SELECT count(*) FROM payment_method_account_mappings;")"
  check "no migrations row"      "0" \
    "$(q "SELECT count(*) FROM migrations WHERE name LIKE '%AddPaymentMethodChannelAccounts%';")"
fi
q "DROP TRIGGER IF EXISTS pmm_boom_trg ON payment_methods; DROP FUNCTION IF EXISTS pmm_boom();" >/dev/null

echo "==> V3: an existing mapping survives"
rebuild_db
run_migrations_before_ours
q "INSERT INTO payment_methods (code,name,\"sortOrder\",\"useForPurchases\",\"accountingChannel\") VALUES ('MAYBANK','Maybank',99,true,'BANK');" >/dev/null
q "INSERT INTO payment_method_account_mappings (\"paymentMethodId\",\"accountId\") SELECT (SELECT id FROM payment_methods WHERE code='MAYBANK'), (SELECT id FROM chart_of_account WHERE code='1100');" >/dev/null
if run_migrations; then
  check "MAYBANK mapping preserved" "1100" \
    "$(q "SELECT a.code FROM payment_method_account_mappings m JOIN payment_methods pm ON pm.id=m.\"paymentMethodId\" JOIN chart_of_account a ON a.id=m.\"accountId\" WHERE pm.code='MAYBANK';")"
  check "no duplicate mapping"      "1" \
    "$(q "SELECT count(*) FROM payment_method_account_mappings m JOIN payment_methods pm ON pm.id=m.\"paymentMethodId\" WHERE pm.code='MAYBANK';")"
  check "others still defaulted"    "1200" \
    "$(q "SELECT a.code FROM payment_method_account_mappings m JOIN payment_methods pm ON pm.id=m.\"paymentMethodId\" JOIN chart_of_account a ON a.id=m.\"accountId\" WHERE pm.code='CIMB';")"
else
  echo "  FAIL migration:run failed in V3"; cat /tmp/pmm-migrate.log; FAILED=1
fi

psql_admin "DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE);" >/dev/null
if [ "$FAILED" -ne 0 ]; then echo "GATE FAILED"; exit 1; fi
echo "GATE PASSED"
