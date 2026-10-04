#!/usr/bin/env bash
# Verification of bank reconciliation database guards and triggers (#1342).
#
# Proves that each of the 8 triggers and 3 constraints/indexes:
#   1. BLOCKS its forbidden operation when active
#   2. UNBLOCKS when the guard is dropped in an uncommitted transaction
#
# Refuses to run against non-disposable databases.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5432}"
export DB_USERNAME="${DB_USERNAME:-erp_user}"

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "DB_PASSWORD is not set. Provide it via backend/.env.local or the environment." >&2
  exit 2
fi
export DB_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/pg-transport.sh
. "$SCRIPT_DIR/lib/pg-transport.sh"

GUARD_DB="erp_bsr_guardcheck_$$"

case "$GUARD_DB" in
  erp_bsr_guardcheck_*) ;;
  *)
    echo "Refusing to run against non-disposable database: $GUARD_DB" >&2
    exit 2
    ;;
esac

psql_admin() {
  pg_psql -U "$DB_USERNAME" -d postgres -tAc "$1" >/dev/null 2>&1 || true
}

q() {
  pg_psql -U "$DB_USERNAME" -d "$GUARD_DB" -tAc "$1" | tr -d '\r' | head -n 1
}

q_exec() {
  pg_psql -U "$DB_USERNAME" -d "$GUARD_DB" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1
}

trap 'psql_admin "DROP DATABASE IF EXISTS $GUARD_DB;"' EXIT

psql_admin "DROP DATABASE IF EXISTS $GUARD_DB;"
pg_psql -U "$DB_USERNAME" -d postgres -c "CREATE DATABASE $GUARD_DB OWNER \"$DB_USERNAME\";" >/dev/null

# Run migrations to build the candidate schema
DB_DATABASE="$GUARD_DB" npm run migration:run >/dev/null 2>&1

# Seed minimal test data
BANK_ACCT_ID=$(q "SELECT id FROM chart_of_account WHERE code = '1200' LIMIT 1;")
BANK_ACCT_ID_2=$(q "SELECT id FROM chart_of_account WHERE code = '1210' LIMIT 1;")
CONTRA_ACCT_ID=$(q "SELECT id FROM chart_of_account WHERE code = '5100' LIMIT 1;")

ENTRY_ID=$(q "
  INSERT INTO journal_entry (\"journalNo\", \"entryDate\", \"sourceType\", \"postingType\", description, \"createdBy\")
  VALUES ('J-GUARD', '2026-01-10', 'EXPENSE', 'EXPENSE_PAYMENT', 'Guard test entry', 'test')
  RETURNING id;
")

LINE_ID_1=$(q "
  INSERT INTO journal_entry_line (\"entryId\", \"accountId\", debit, credit)
  VALUES ('$ENTRY_ID', '$BANK_ACCT_ID', 100, 0)
  RETURNING id;
")

LINE_ID_2=$(q "
  INSERT INTO journal_entry_line (\"entryId\", \"accountId\", debit, credit)
  VALUES ('$ENTRY_ID', '$BANK_ACCT_ID', 200, 0)
  RETURNING id;
")

q_exec "
  INSERT INTO journal_entry_line (\"entryId\", \"accountId\", debit, credit)
  VALUES ('$ENTRY_ID', '$CONTRA_ACCT_ID', 0, 300);
"

RECON_ID_1=$(q "
  INSERT INTO bank_statement_reconciliations (
    \"reconciliationNo\", \"bankAccountId\", \"sequenceNo\",
    \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\", status
  ) VALUES (
    'BR-GUARD-1', '$BANK_ACCT_ID', 1,
    '2026-01-01', '2026-01-31', 0, 0, 'DRAFT'
  ) RETURNING id;
")

RECON_ID_2=$(q "
  INSERT INTO bank_statement_reconciliations (
    \"reconciliationNo\", \"bankAccountId\", \"sequenceNo\",
    \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\", status
  ) VALUES (
    'BR-GUARD-2', '$BANK_ACCT_ID_2', 1,
    '2026-02-01', '2026-02-28', 0, 0, 'DRAFT'
  ) RETURNING id;
")

VERSION_ID_2=$(q "SELECT uuid_generate_v4();")
VERSION_LINE_ID_2=$(q "SELECT uuid_generate_v4();")

q_exec "
  BEGIN;
  INSERT INTO bank_statement_reconciliation_versions (
    id, \"reconciliationId\", \"versionNo\", \"reconciliationNo\", \"sequenceNo\",
    \"bankAccountId\", \"bankAccountCode\", \"bankAccountName\",
    \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\"
  ) VALUES (
    '$VERSION_ID_2', '$RECON_ID_2', 1, 'BR-GUARD-2', 1,
    '$BANK_ACCT_ID_2', '1210', 'Bank 2',
    '2026-02-01', '2026-02-28', 0, 0
  );
  INSERT INTO bank_statement_reconciliation_version_lines (
    id, \"versionId\", \"journalEntryLineId\", role, \"entryDate\", \"journalEntryId\",
    \"journalNo\", \"sourceType\", \"moneyIn\", \"moneyOut\"
  ) VALUES (
    '$VERSION_LINE_ID_2', '$VERSION_ID_2', '$LINE_ID_2', 'MATCHED',
    '2026-01-10', '$ENTRY_ID', 'J-GUARD', 'EXPENSE', 200, 0
  );
  UPDATE bank_statement_reconciliation_versions
     SET \"sealedAt\" = now()
   WHERE id = '$VERSION_ID_2';
  COMMIT;
"

# Update RECON_ID_2 to COMPLETED and point currentVersionNo to sealed version 1
q_exec "
  UPDATE bank_statement_reconciliations
     SET \"currentVersionNo\" = 1,
         status = 'COMPLETED',
         \"completedAt\" = now(),
         \"completedBy\" = 'test'
   WHERE id = '$RECON_ID_2';
"

# Helper to verify a guard:
# test_guard <name> <forbidden_sql> <drop_and_run_inside_tx_sql>
test_guard() {
  local name="$1"
  local forbidden_sql="$2"
  local unblock_tx_sql="$3"

  local blocks="no"
  local removal_unblocks="no"

  # 1. Assert forbidden fails
  if ! q_exec "$forbidden_sql"; then
    blocks="yes"
  fi

  # 2. Assert inside transaction with guard dropped, it succeeds
  if q_exec "$unblock_tx_sql"; then
    removal_unblocks="yes"
  fi

  if [ "$blocks" = "yes" ] && [ "$removal_unblocks" = "yes" ]; then
    echo "guard $name: blocks=yes, removal-unblocks=yes"
  else
    echo "guard $name: blocks=$blocks, removal-unblocks=$removal_unblocks" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# 1. trg_bsr_line_classification
# Setup mark exists for LINE_ID_1 in RECON_ID_1; cannot insert OPENING_CLEARED line.
# ---------------------------------------------------------------------------
q_exec "
  INSERT INTO bank_statement_reconciliation_setup_marks (\"reconciliationId\", \"journalEntryLineId\", \"markedBy\", \"markedAt\")
  VALUES ('$RECON_ID_1', '$LINE_ID_1', 'test', now());
"

test_guard "trg_bsr_line_classification" \
  "INSERT INTO bank_statement_reconciliation_lines (\"reconciliationId\", \"journalEntryLineId\", kind, \"addedBy\", \"addedAt\") VALUES ('$RECON_ID_1', '$LINE_ID_1', 'OPENING_CLEARED', 'test', now());" \
  "BEGIN; DROP TRIGGER \"trg_bsr_line_classification\" ON \"bank_statement_reconciliation_lines\"; INSERT INTO bank_statement_reconciliation_lines (\"reconciliationId\", \"journalEntryLineId\", kind, \"addedBy\", \"addedAt\") VALUES ('$RECON_ID_1', '$LINE_ID_1', 'OPENING_CLEARED', 'test', now()); ROLLBACK;"

# ---------------------------------------------------------------------------
# 2. trg_bsr_mark_classification
# OPENING_CLEARED line exists for LINE_ID_2 in RECON_ID_1; cannot insert mark.
# ---------------------------------------------------------------------------
q_exec "
  INSERT INTO bank_statement_reconciliation_lines (\"reconciliationId\", \"journalEntryLineId\", kind, \"addedBy\", \"addedAt\")
  VALUES ('$RECON_ID_1', '$LINE_ID_2', 'OPENING_CLEARED', 'test', now());
"

test_guard "trg_bsr_mark_classification" \
  "INSERT INTO bank_statement_reconciliation_setup_marks (\"reconciliationId\", \"journalEntryLineId\", \"markedBy\", \"markedAt\") VALUES ('$RECON_ID_1', '$LINE_ID_2', 'test', now());" \
  "BEGIN; DROP TRIGGER \"trg_bsr_mark_classification\" ON \"bank_statement_reconciliation_setup_marks\"; INSERT INTO bank_statement_reconciliation_setup_marks (\"reconciliationId\", \"journalEntryLineId\", \"markedBy\", \"markedAt\") VALUES ('$RECON_ID_1', '$LINE_ID_2', 'test', now()); ROLLBACK;"

# ---------------------------------------------------------------------------
# 3. trg_bsr_line_immutable_ids
# Cannot update journalEntryLineId on working line.
# ---------------------------------------------------------------------------
test_guard "trg_bsr_line_immutable_ids" \
  "UPDATE bank_statement_reconciliation_lines SET \"journalEntryLineId\" = '$LINE_ID_1' WHERE \"reconciliationId\" = '$RECON_ID_1' AND \"journalEntryLineId\" = '$LINE_ID_2';" \
  "BEGIN; DROP TRIGGER \"trg_bsr_line_immutable_ids\" ON \"bank_statement_reconciliation_lines\"; UPDATE bank_statement_reconciliation_lines SET \"journalEntryLineId\" = '$LINE_ID_1' WHERE \"reconciliationId\" = '$RECON_ID_1' AND \"journalEntryLineId\" = '$LINE_ID_2'; ROLLBACK;"

# ---------------------------------------------------------------------------
# 4. trg_bsr_mark_immutable_ids
# Cannot update journalEntryLineId on setup mark.
# ---------------------------------------------------------------------------
test_guard "trg_bsr_mark_immutable_ids" \
  "UPDATE bank_statement_reconciliation_setup_marks SET \"journalEntryLineId\" = '$LINE_ID_2' WHERE \"reconciliationId\" = '$RECON_ID_1' AND \"journalEntryLineId\" = '$LINE_ID_1';" \
  "BEGIN; DROP TRIGGER \"trg_bsr_mark_immutable_ids\" ON \"bank_statement_reconciliation_setup_marks\"; UPDATE bank_statement_reconciliation_setup_marks SET \"journalEntryLineId\" = '$LINE_ID_2' WHERE \"reconciliationId\" = '$RECON_ID_1' AND \"journalEntryLineId\" = '$LINE_ID_1'; ROLLBACK;"

# ---------------------------------------------------------------------------
# 5. trg_bsr_version_guard
# Sealed version cannot be updated.
# ---------------------------------------------------------------------------
test_guard "trg_bsr_version_guard" \
  "UPDATE bank_statement_reconciliation_versions SET \"openingBalance\" = 999 WHERE id = '$VERSION_ID_2';" \
  "BEGIN; DROP TRIGGER \"trg_bsr_version_guard\" ON \"bank_statement_reconciliation_versions\"; UPDATE bank_statement_reconciliation_versions SET \"openingBalance\" = 999 WHERE id = '$VERSION_ID_2'; ROLLBACK;"

# ---------------------------------------------------------------------------
# 6. trg_bsr_version_line_guard
# Version lines cannot be updated.
# ---------------------------------------------------------------------------
test_guard "trg_bsr_version_line_guard" \
  "UPDATE bank_statement_reconciliation_version_lines SET \"moneyIn\" = 999 WHERE id = '$VERSION_LINE_ID_2';" \
  "BEGIN; DROP TRIGGER \"trg_bsr_version_line_guard\" ON \"bank_statement_reconciliation_version_lines\"; UPDATE bank_statement_reconciliation_version_lines SET \"moneyIn\" = 999 WHERE id = '$VERSION_LINE_ID_2'; ROLLBACK;"

# ---------------------------------------------------------------------------
# 7. trg_bsr_version_sealed_at_commit
# An unsealed version fails at commit.
# ---------------------------------------------------------------------------
test_guard "trg_bsr_version_sealed_at_commit" \
  "INSERT INTO bank_statement_reconciliation_versions (\"reconciliationId\", \"versionNo\", \"reconciliationNo\", \"sequenceNo\", \"bankAccountId\", \"bankAccountCode\", \"bankAccountName\", \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\") VALUES ('$RECON_ID_1', 10, 'BR-G-10', 10, '$BANK_ACCT_ID', '1200', 'Bank', '2026-01-01', '2026-01-31', 0, 0);" \
  "BEGIN; DROP TRIGGER \"trg_bsr_version_sealed_at_commit\" ON \"bank_statement_reconciliation_versions\"; INSERT INTO bank_statement_reconciliation_versions (\"reconciliationId\", \"versionNo\", \"reconciliationNo\", \"sequenceNo\", \"bankAccountId\", \"bankAccountCode\", \"bankAccountName\", \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\") VALUES ('$RECON_ID_1', 10, 'BR-G-10', 10, '$BANK_ACCT_ID', '1200', 'Bank', '2026-01-01', '2026-01-31', 0, 0); ROLLBACK;"

# ---------------------------------------------------------------------------
# 8. trg_bsr_current_version_sealed
# Cannot point currentVersionNo to an unsealed version (or non-sealed version).
# Inside unblock: an unsealed version (RECON_ID_1, 10) is inserted with trigger 7
# dropped; setting currentVersionNo = 10 is blocked while trigger 8 is active,
# but succeeds when trigger 8 is dropped.
# ---------------------------------------------------------------------------
test_guard "trg_bsr_current_version_sealed" \
  "BEGIN; DROP TRIGGER \"trg_bsr_version_sealed_at_commit\" ON \"bank_statement_reconciliation_versions\"; INSERT INTO bank_statement_reconciliation_versions (\"reconciliationId\", \"versionNo\", \"reconciliationNo\", \"sequenceNo\", \"bankAccountId\", \"bankAccountCode\", \"bankAccountName\", \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\") VALUES ('$RECON_ID_1', 10, 'BR-G-10', 10, '$BANK_ACCT_ID', '1200', 'Bank', '2026-01-01', '2026-01-31', 0, 0); UPDATE bank_statement_reconciliations SET \"currentVersionNo\" = 10 WHERE id = '$RECON_ID_1'; ROLLBACK;" \
  "BEGIN; DROP TRIGGER \"trg_bsr_version_sealed_at_commit\" ON \"bank_statement_reconciliation_versions\"; DROP TRIGGER \"trg_bsr_current_version_sealed\" ON \"bank_statement_reconciliations\"; INSERT INTO bank_statement_reconciliation_versions (\"reconciliationId\", \"versionNo\", \"reconciliationNo\", \"sequenceNo\", \"bankAccountId\", \"bankAccountCode\", \"bankAccountName\", \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\") VALUES ('$RECON_ID_1', 10, 'BR-G-10', 10, '$BANK_ACCT_ID', '1200', 'Bank', '2026-01-01', '2026-01-31', 0, 0); UPDATE bank_statement_reconciliations SET \"currentVersionNo\" = 10 WHERE id = '$RECON_ID_1'; ROLLBACK;"

# ---------------------------------------------------------------------------
# 9. UQ_bsr_line_journal_line
# Cannot reserve same journalEntryLineId in two reconciliation working sets.
# LINE_ID_2 is in RECON_ID_1; attempting to add to RECON_ID_2 working lines fails.
# ---------------------------------------------------------------------------
test_guard "UQ_bsr_line_journal_line" \
  "INSERT INTO bank_statement_reconciliation_lines (\"reconciliationId\", \"journalEntryLineId\", kind, \"addedBy\", \"addedAt\") VALUES ('$RECON_ID_2', '$LINE_ID_2', 'MATCHED', 'test', now());" \
  "BEGIN; DROP INDEX \"UQ_bsr_line_journal_line\"; INSERT INTO bank_statement_reconciliation_lines (\"reconciliationId\", \"journalEntryLineId\", kind, \"addedBy\", \"addedAt\") VALUES ('$RECON_ID_2', '$LINE_ID_2', 'MATCHED', 'test', now()); ROLLBACK;"

# ---------------------------------------------------------------------------
# 10. UQ_bsr_one_draft_per_account
# Cannot create a second DRAFT on the same bank account.
# ---------------------------------------------------------------------------
test_guard "UQ_bsr_one_draft_per_account" \
  "INSERT INTO bank_statement_reconciliations (\"reconciliationNo\", \"bankAccountId\", \"sequenceNo\", \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\", status) VALUES ('BR-EXTRA-DRAFT', '$BANK_ACCT_ID', 99, '2026-03-01', '2026-03-31', 0, 0, 'DRAFT');" \
  "BEGIN; DROP INDEX \"UQ_bsr_one_draft_per_account\"; INSERT INTO bank_statement_reconciliations (\"reconciliationNo\", \"bankAccountId\", \"sequenceNo\", \"periodFrom\", \"periodTo\", \"openingBalance\", \"closingBalance\", status) VALUES ('BR-EXTRA-DRAFT', '$BANK_ACCT_ID', 99, '2026-03-01', '2026-03-31', 0, 0, 'DRAFT'); ROLLBACK;"

# ---------------------------------------------------------------------------
# 11. FK_bsr_current_version
# Cannot set currentVersionNo to a version that does not belong to this reconciliation.
# RECON_ID_1 setting currentVersionNo = 1 (which belongs to RECON_ID_2) is blocked by FK.
# With trigger 8 dropped, FK blocks; with FK also dropped, it succeeds.
# ---------------------------------------------------------------------------
test_guard "FK_bsr_current_version" \
  "BEGIN; DROP TRIGGER \"trg_bsr_current_version_sealed\" ON \"bank_statement_reconciliations\"; UPDATE bank_statement_reconciliations SET \"currentVersionNo\" = 1 WHERE id = '$RECON_ID_1'; ROLLBACK;" \
  "BEGIN; DROP TRIGGER \"trg_bsr_current_version_sealed\" ON \"bank_statement_reconciliations\"; ALTER TABLE \"bank_statement_reconciliations\" DROP CONSTRAINT \"FK_bsr_current_version\"; UPDATE bank_statement_reconciliations SET \"currentVersionNo\" = 1 WHERE id = '$RECON_ID_1'; ROLLBACK;"

exit 0
