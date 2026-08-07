#!/usr/bin/env bash
# Verifies the COMPLETED backfill against a genuinely pre-migration database.
# The e2e harness migrates before tests run, so it cannot cover this.
set -euo pipefail

DB="verify_expense_backfill_$$"
# The migration immediately preceding this change. It is also the one that adds
# OVERPAID, so both probe rows below are seedable at this state.
PRIOR_MIGRATION="AddExpenseOverpaidStatus1785900000000"
PSQL=(psql -h "${DB_HOST:-localhost}" -U "${DB_USERNAME:-erp_user}")

cleanup() { "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB"

# 1. Migrate fully, then revert the two new migrations to reach the state
#    immediately BEFORE this change.
DB_DATABASE="$DB" npm run migration:run
DB_DATABASE="$DB" npm run migration:revert   # backfill
DB_DATABASE="$DB" npm run migration:revert   # enum value

# Assert we actually landed on the expected prior migration — two reverts only
# reach it if no other migration was added after this plan was written.
TOP=$("${PSQL[@]}" -d "$DB" -tAc 'SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
if [ "$TOP" != "$PRIOR_MIGRATION" ]; then
  echo "FAIL: expected to be at $PRIOR_MIGRATION after two reverts, but top applied is $TOP"
  echo "      A migration was likely added since this script was written — adjust the revert count."
  exit 1
fi

# 2. Seed both settled states as they existed pre-change.
"${PSQL[@]}" -d "$DB" <<'SQL'
INSERT INTO expenses ("expenseNumber","expenseDate","description","expenseAccountId",
                      "totalAmount","paidAmount","balance","documentStatus","paymentStatus")
SELECT 'VERIFY-PAID','2026-08-06','backfill probe paid', id,
       '100.0000','100.0000','0.0000','DRAFT','PAID'
FROM chart_of_account WHERE "isPostable" = true LIMIT 1;

INSERT INTO expenses ("expenseNumber","expenseDate","description","expenseAccountId",
                      "totalAmount","paidAmount","balance","documentStatus","paymentStatus")
SELECT 'VERIFY-OVER','2026-08-06','backfill probe overpaid', id,
       '100.0000','150.0000','-50.0000','DRAFT','OVERPAID'
FROM chart_of_account WHERE "isPostable" = true LIMIT 1;
SQL

# 3. Apply the new migrations.
DB_DATABASE="$DB" npm run migration:run

# 4. Assert both rows became COMPLETED.
RESULT=$("${PSQL[@]}" -d "$DB" -tAc \
  "SELECT count(*) FROM expenses WHERE \"expenseNumber\" IN ('VERIFY-PAID','VERIFY-OVER') AND \"documentStatus\" = 'COMPLETED'")

if [ "$RESULT" != "2" ]; then
  echo "FAIL: expected 2 backfilled rows, got $RESULT"
  exit 1
fi
echo "PASS: backfill converted both settled rows to COMPLETED"
