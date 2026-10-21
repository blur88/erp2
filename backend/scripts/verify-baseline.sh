#!/usr/bin/env bash
# Schema gate for the migration baseline (#950).
#
# Builds two fresh databases — reference via schema:sync, candidate via
# migration:run — and asserts their schemas match after normalizing away
# migration metadata (migration:run creates the `migrations` table and its
# identity sequence; the reference has neither).
#
# Release 1 (genesis only): expects an EMPTY normalized diff.
# Release 2+ (trigram, price-list partial unique, product case-insensitive
# expression indexes, and migration-only valuation-gap guards): expects exactly
# the migration-indexes allowlist;
#   re-run with ALLOWLIST=migration-indexes.
set -euo pipefail

# Credentials come from backend/.env.local (gitignored) or the caller's
# environment. Never hardcode them here: this file IS committed, and
# .gitignore:17 marks committing real credentials as critical.
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

# Transport selection (#1260). Sourced AFTER the env file so PG_TRANSPORT and
# DB_* can both come from it, and AFTER the DB_PASSWORD check so a missing
# password still reports its own specific error first.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/pg-transport.sh
. "$SCRIPT_DIR/lib/pg-transport.sh"

# Preflight the HOST/TCP connection before touching any database.
#
# This script reaches Postgres two different ways, and only one of them
# exercises the host credentials:
#
#   1. psql_admin() / dump_schema() / q_cand() run via `docker compose exec`,
#      i.e. INSIDE the container as a trusted local user. These succeed no
#      matter what DB_PASSWORD resolves to on the host.
#   2. schema:sync and migration:run run TypeORM ON THE HOST, over TCP to
#      DB_HOST:DB_PORT. These are the only steps the host credentials gate.
#
# Without this preflight, wrong host credentials print four lines of healthy
# DROP/CREATE DATABASE output before failing inside a pg-protocol stack trace
# — which reads like a schema:sync, TypeORM, or entity-metadata bug rather
# than a credentials problem (#1059).
#
# The probe must therefore NOT go through `docker compose exec`: that would
# reproduce the same blind spot. It connects over TCP as DB_USERNAME and runs
# a real authenticated query. There is no host psql in at least one dev setup,
# so it uses the `pg` client already present in backend/node_modules.
#
# ssl mirrors ssl.config.ts's non-production branch (DB_SSL === 'true',
# default false) so the probe negotiates the way the TypeORM steps will.
# stderr is discarded: the pg stack trace is half of what makes the original
# failure unreadable, and suppressing it also guarantees no connection string
# reaches the output.
if ! node -e '
  const { Client } = require("pg");
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: "postgres",
    ssl: process.env.DB_SSL === "true",
    connectionTimeoutMillis: 5000,
  });
  client
    .connect()
    .then(() => client.query("SELECT 1"))
    .then(() => client.end())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
' 2>/dev/null; then
  # Deliberately does NOT claim "authentication failed": this probe cannot
  # distinguish bad credentials from DNS, wrong port, TLS, or Postgres simply
  # being down. Naming a cause it did not establish is the same class of
  # misleading diagnostic this preflight exists to remove.
  cat >&2 <<EOF
Cannot connect to PostgreSQL as '$DB_USERNAME' at $DB_HOST:$DB_PORT.

The schema:sync and migration:run steps run on the host over TCP, so
container-side access succeeding does not mean these credentials work.

Check ENV_FILE ($ENV_FILE) against the credentials the running Postgres was
initialized with, and confirm it is reachable at that host and port.
EOF
  exit 2
fi

REF_DB="${REF_DB:-erp_gate_reference}"
CAND_DB="${CAND_DB:-erp_gate_candidate}"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
ALLOWLIST="${ALLOWLIST:-none}"

psql_admin() {
  pg_psql -U "$DB_USERNAME" -d postgres -c "$1"
}

dump_schema() {
  pg_dump_db -U "$DB_USERNAME" --schema-only --no-owner --no-privileges "$1"
}

for db in "$REF_DB" "$CAND_DB"; do
  psql_admin "DROP DATABASE IF EXISTS $db;"
  psql_admin "CREATE DATABASE $db OWNER \"$DB_USERNAME\";"
done

echo "==> Building reference via schema:sync"
DB_DATABASE=$REF_DB npm run typeorm -- -d ./src/config/database.config.ts schema:sync >/dev/null

echo "==> Building candidate via migration:run"
DB_DATABASE=$CAND_DB npm run migration:run >/dev/null

# Normalize: drop migration metadata (absent from the reference by
# construction) and pg_dump's comment/blank lines.
#
# Statements in pg_dump output are separated by blank lines and span
# multiple lines (CREATE SEQUENCE is 6 lines), so this filters whole
# paragraphs. A line-based filter would leave orphaned body lines and `);`
# fragments behind, producing a false diff.
#
# Verified against the deployed schema: removes all 5 migrations-related
# statements with 0 residue, preserving 36 CREATE TABLE statements (37
# public tables minus `migrations` itself).
# PostgreSQL 18 wraps dumps in `\restrict <random-token>` / `\unrestrict
# <random-token>` psql meta-commands. The token differs per dump, so these
# two lines must be stripped or every diff is spuriously non-empty.
#
# Match them ANCHORED and by full command name. A substring filter on '\r'
# or '\u' would also delete any legitimate line containing those escape
# sequences — e.g. a column DEFAULT of E'\r\n' or a COMMENT containing
# '\u' — silently hiding real schema differences from the gate.
#
# Order-insensitive: pg_dump emits CREATE TABLE columns and COMMENT ON COLUMN
# statements in catalog/column order. An ALTER TABLE ADD COLUMN migration
# therefore shifts the added column to the end of its table (and its comment
# with it), producing pure ordering noise against a schema:sync reference.
# Sorting column lines within each CREATE TABLE paragraph (trailing commas
# stripped, since the last column has none) and collecting COMMENT ON COLUMN
# lines into a sorted set makes the comparison order-insensitive while every
# real difference — a missing/extra column, wrong type, changed constraint —
# still surfaces in the diff.
normalize() {
  awk '
    BEGIN { RS=""; FS="\n" }
    /public\.migrations/ { next }
    $1 ~ /^CREATE TABLE public\./ {
      print $1
      cnt = 0
      for (i = 2; i <= NF - 1; i++) {
        line = $i
        sub(/,$/, "", line)
        j = cnt
        while (j > 0 && cols[j - 1] > line) { cols[j] = cols[j - 1]; j-- }
        cols[j] = line
        cnt++
      }
      for (i = 0; i < cnt; i++) print cols[i]
      print $NF
      next
    }
    NF == 1 && $1 ~ /^COMMENT ON COLUMN public\./ {
      line = $1
      j = ncomments
      while (j > 0 && comments[j - 1] > line) { comments[j] = comments[j - 1]; j-- }
      comments[j] = line
      ncomments++
      next
    }
    in_func {
      for (i = 1; i <= NF; i++) func_str = func_str " " $i
      if ($0 ~ /\$\$;/) {
        print func_str
        in_func = 0
        func_str = ""
      }
      next
    }
    $1 ~ /^CREATE FUNCTION public\./ {
      func_str = $1
      for (i = 2; i <= NF; i++) func_str = func_str " " $i
      if ($0 ~ /\$\$;/) {
        print func_str
        func_str = ""
      } else {
        in_func = 1
      }
      next
    }
    $1 ~ /^ALTER TABLE ONLY public\./ && $2 ~ /^    ADD CONSTRAINT / {
      print $1 " " substr($2, 5)
      next
    }
    { print $0 }
    END { for (i = 0; i < ncomments; i++) print comments[i] }
  ' \
    | grep -vE '^--' | grep -vE '^$' \
    | grep -vE '^\\(un)?restrict '
}

dump_schema "$REF_DB"  | normalize > "$OUT/reference.sql"
dump_schema "$CAND_DB" | normalize > "$OUT/candidate.sql"

echo "==> Diffing (reference vs candidate)"
if diff -u "$OUT/reference.sql" "$OUT/candidate.sql" > "$OUT/diff.txt"; then
  DIFF_EMPTY=yes
else
  DIFF_EMPTY=no
fi

if [ "$ALLOWLIST" = "none" ]; then
  if [ "$DIFF_EMPTY" = "yes" ]; then
    echo "PASS: genesis schema is identical to schema:sync"
    exit 0
  fi
  echo "FAIL: unexpected schema differences:"
  cat "$OUT/diff.txt"
  exit 1
fi

# ALLOWLIST=migration-indexes (formerly "trigram") has two halves. A diff-only
# check is not sufficient: an empty or partial diff would pass it while the
# indexes were missing, which is exactly the divergence this mode exists to fix.
#
# Allowed migration-only objects (created by migrations, NOT expressible by
# schema:sync because TypeORM decorators cannot emit expression/partial
# indexes or gin_trgm_ops):
#   - pg_trgm extension
#   - 8 trigram GIN indexes (Release 2, migration 1785500000000)
#   - UQ_price_lists_single_default (partial unique, migration 1785600000000)
#   - UQ_products_lower_name / UQ_products_lower_barcode (expression unique,
#     migration 1785800000000)
#   - 6 bank reconciliation functions (migration 1791044381374)
#   - 8 bank reconciliation triggers (migration 1791044381374)
#   - FK_bsr_current_version foreign key (migration 1791044381374)
#   - 2 stock valuation-gap guard functions and 3 triggers (migration 1792455000000)
#   - 3 stage-1 valuation guard functions and triggers (migration 1792680000000)
# Anything else in the diff fails the gate.

# (a) Negative: only the allowlisted statements may appear as differences.
UNEXPECTED=$(grep -E '^[+-]' "$OUT/diff.txt" \
  | grep -vE '^(\+\+\+|---)' \
  | grep -vE \
'^\+CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;|^\+COMMENT ON EXTENSION pg_trgm IS|^\+CREATE UNIQUE INDEX "UQ_price_lists_single_default"|^\+CREATE UNIQUE INDEX "UQ_products_lower_(name|barcode)"|^\+CREATE INDEX idx_(customers|products|sales_orders|purchase_orders|suppliers|vendor_payments)_[a-z]+_trgm|^\+CREATE FUNCTION public\.bsr_(assert_version_sealed|guard_classification|guard_current_version|guard_immutable_ids|guard_version|guard_version_line)\(\)|^\+CREATE TRIGGER trg_bsr_(current_version_sealed|line_classification|line_immutable_ids|mark_classification|mark_immutable_ids|version_guard|version_line_guard) |^\+CREATE CONSTRAINT TRIGGER trg_bsr_version_sealed_at_commit |^\+ALTER TABLE ONLY public\.bank_statement_reconciliations ADD CONSTRAINT "FK_bsr_current_version" FOREIGN KEY \(id, "currentVersionNo"\) REFERENCES public\.bank_statement_reconciliation_versions\("reconciliationId", "versionNo"\) ON DELETE RESTRICT;|^\+CREATE FUNCTION public\.stock_(movement_valuation_gap_immutable|occurrence_valuation_gap_consistency)\(\)|^\+CREATE TRIGGER trg_stock_movement_valuation_gap_immutable |^\+CREATE CONSTRAINT TRIGGER trg_stock_(movement|occurrence)_valuation_gap_consistency |^\+CREATE FUNCTION public\.(inventory_layer_consumption_immutable|stock_movement_valuation_coverage|stock_valuation_entry_immutable)\(\)|^\+CREATE TRIGGER trg_(inventory_layer_consumption_immutable|stock_valuation_entry_immutable) |^\+CREATE CONSTRAINT TRIGGER trg_stock_movement_valuation_coverage |^\+CREATE TABLE journal_entry_open_postings |^\+CREATE FUNCTION public\.(inventory_(account_backing_check|account_setting_protect|journal_entry_protect|journal_line_no_append|journal_line_protect|truncate_protect|reconciliation_content_guard|reconciliation_header_guard|cutover_batch_release_immutable)|journal_entry_open_posting_(clear|guard|mark))\(\)|^\+CREATE TRIGGER trg_(inventory_(account_setting_protect|journal_entry_protect|journal_line_no_append|journal_line_protect|truncate_protect|opening_positions_content_guard|opening_position_batches_content_guard|reconciliation_journal_lines_content_guard|reconciliation_header_guard|cutover_batch_release_immutable)|journal_entry_open_posting_(guard|mark)) |^\+CREATE CONSTRAINT TRIGGER trg_(journal_entry_open_posting_clear|journal_line_inventory_backing) |^[+-].*(costing_method_changes|costing_method_change_products|inventory_reconciliations|inventory_opening_positions|inventory_opening_position_batches|inventory_cutover_batch_releases|inventory_reconciliation_journal_lines|journal_entry_open_postings)' \
  || true)

if [ -n "$UNEXPECTED" ]; then
  echo "FAIL: differences outside the migration-indexes allowlist:"
  echo "$UNEXPECTED"
  exit 1
fi

# (b) Positive: the extension and all 11 indexes must actually exist in the
# candidate's catalog, with exact table, uniqueness, and definition.
q_cand() {
  pg_psql -U "$DB_USERNAME" -d "$CAND_DB" -tAc "$1" | tr -d '\r'
}

EXT=$(q_cand "SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm';")
if [ "$EXT" != "1" ]; then
  echo "FAIL: pg_trgm extension not installed (found $EXT)"
  exit 1
fi

# Names alone are not enough: an index with the right name on the wrong
# table or column would pass. Compare name|table|unique|full definition, so
# table, expression, uniqueness, and predicate are all pinned.
EXPECTED_DEFS="UQ_price_lists_single_default|price_lists|true|CREATE UNIQUE INDEX \"UQ_price_lists_single_default\" ON public.price_lists USING btree (\"isDefault\") WHERE ((\"isDefault\" = true) AND (\"deletedAt\" IS NULL))
UQ_products_lower_barcode|products|true|CREATE UNIQUE INDEX \"UQ_products_lower_barcode\" ON public.products USING btree (lower((barcode)::text)) WHERE (barcode IS NOT NULL)
UQ_products_lower_name|products|true|CREATE UNIQUE INDEX \"UQ_products_lower_name\" ON public.products USING btree (lower((name)::text))
idx_customers_name_trgm|customers|false|CREATE INDEX idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops)
idx_customers_phone_trgm|customers|false|CREATE INDEX idx_customers_phone_trgm ON public.customers USING gin (phone gin_trgm_ops)
idx_products_barcode_trgm|products|false|CREATE INDEX idx_products_barcode_trgm ON public.products USING gin (barcode gin_trgm_ops)
idx_products_name_trgm|products|false|CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops)
idx_purchase_orders_ordernumber_trgm|purchase_orders|false|CREATE INDEX idx_purchase_orders_ordernumber_trgm ON public.purchase_orders USING gin (\"orderNumber\" gin_trgm_ops)
idx_sales_orders_ordernumber_trgm|sales_orders|false|CREATE INDEX idx_sales_orders_ordernumber_trgm ON public.sales_orders USING gin (\"orderNumber\" gin_trgm_ops)
idx_suppliers_companyname_trgm|suppliers|false|CREATE INDEX idx_suppliers_companyname_trgm ON public.suppliers USING gin (\"companyName\" gin_trgm_ops)
idx_vendor_payments_referencenumber_trgm|vendor_payments|false|CREATE INDEX idx_vendor_payments_referencenumber_trgm ON public.vendor_payments USING gin (\"referenceNumber\" gin_trgm_ops)"

ACTUAL_DEFS=$(q_cand "
  SELECT x.indexname || '|' || x.tablename || '|' || x.isunique || '|' || x.def
    FROM (
      SELECT i.relname AS indexname, t.relname AS tablename,
             ix.indisunique AS isunique, pg_get_indexdef(ix.indexrelid) AS def
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
       WHERE i.relname IN (
         'idx_customers_name_trgm','idx_customers_phone_trgm',
         'idx_products_barcode_trgm','idx_products_name_trgm',
         'idx_purchase_orders_ordernumber_trgm','idx_sales_orders_ordernumber_trgm',
         'idx_suppliers_companyname_trgm','idx_vendor_payments_referencenumber_trgm',
         'UQ_products_lower_name','UQ_products_lower_barcode',
         'UQ_price_lists_single_default'
       )
    ) x ORDER BY x.indexname;")

if [ "$ACTUAL_DEFS" != "$EXPECTED_DEFS" ]; then
  echo "FAIL: migration-indexes definitions do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_DEFS"
  echo "--- actual ---";   echo "$ACTUAL_DEFS"
  exit 1
fi

EXPECTED_TRIGGERS="bank_statement_reconciliations|trg_bsr_current_version_sealed|O|false|false
bank_statement_reconciliation_lines|trg_bsr_line_classification|O|false|false
bank_statement_reconciliation_lines|trg_bsr_line_immutable_ids|O|false|false
bank_statement_reconciliation_setup_marks|trg_bsr_mark_classification|O|false|false
bank_statement_reconciliation_setup_marks|trg_bsr_mark_immutable_ids|O|false|false
bank_statement_reconciliation_versions|trg_bsr_version_guard|O|false|false
bank_statement_reconciliation_version_lines|trg_bsr_version_line_guard|O|false|false
bank_statement_reconciliation_versions|trg_bsr_version_sealed_at_commit|O|true|true"

ACTUAL_TRIGGERS=$(q_cand "
  SELECT c.relname || '|' || t.tgname || '|' || t.tgenabled::text || '|' || t.tgdeferrable::text || '|' || t.tginitdeferred::text
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname IN (
     'trg_bsr_current_version_sealed',
     'trg_bsr_line_classification',
     'trg_bsr_line_immutable_ids',
     'trg_bsr_mark_classification',
     'trg_bsr_mark_immutable_ids',
     'trg_bsr_version_guard',
     'trg_bsr_version_line_guard',
     'trg_bsr_version_sealed_at_commit'
   )
   ORDER BY t.tgname;")

if [ "$ACTUAL_TRIGGERS" != "$EXPECTED_TRIGGERS" ]; then
  echo "FAIL: bank reconciliation triggers do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_TRIGGERS"
  echo "--- actual ---";   echo "$ACTUAL_TRIGGERS"
  exit 1
fi

EXPECTED_FUNCS="bsr_assert_version_sealed
bsr_guard_classification
bsr_guard_current_version
bsr_guard_immutable_ids
bsr_guard_version
bsr_guard_version_line"

ACTUAL_FUNCS=$(q_cand "
  SELECT proname
    FROM pg_proc
   WHERE proname IN (
     'bsr_assert_version_sealed',
     'bsr_guard_classification',
     'bsr_guard_current_version',
     'bsr_guard_immutable_ids',
     'bsr_guard_version',
     'bsr_guard_version_line'
   )
   ORDER BY proname;")

if [ "$ACTUAL_FUNCS" != "$EXPECTED_FUNCS" ]; then
  echo "FAIL: bank reconciliation functions do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_FUNCS"
  echo "--- actual ---";   echo "$ACTUAL_FUNCS"
  exit 1
fi

EXPECTED_FK="FK_bsr_current_version|bank_statement_reconciliations|id,currentVersionNo|bank_statement_reconciliation_versions|reconciliationId,versionNo|r"

ACTUAL_FK=$(q_cand "
  SELECT
    con.conname || '|' ||
    cls.relname || '|' ||
    (SELECT string_agg(att.attname, ',' ORDER BY ord.ord)
       FROM unnest(con.conkey) WITH ORDINALITY AS ord(attnum, ord)
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ord.attnum) || '|' ||
    fcls.relname || '|' ||
    (SELECT string_agg(fatt.attname, ',' ORDER BY ford.ord)
       FROM unnest(con.confkey) WITH ORDINALITY AS ford(fattnum, ord)
       JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = ford.fattnum) || '|' ||
    con.confdeltype::text
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_class fcls ON fcls.oid = con.confrelid
  WHERE con.conname = 'FK_bsr_current_version';")

if [ "$ACTUAL_FK" != "$EXPECTED_FK" ]; then
  echo "FAIL: FK_bsr_current_version definition does not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_FK"
  echo "--- actual ---";   echo "$ACTUAL_FK"
  exit 1
fi

EXPECTED_GAP_FUNCS="stock_movement_valuation_gap_immutable
stock_occurrence_valuation_gap_consistency"

ACTUAL_GAP_FUNCS=$(q_cand "
  SELECT proname
    FROM pg_proc
   WHERE proname IN (
     'stock_movement_valuation_gap_immutable',
     'stock_occurrence_valuation_gap_consistency'
   )
   ORDER BY proname;")

if [ "$ACTUAL_GAP_FUNCS" != "$EXPECTED_GAP_FUNCS" ]; then
  echo "FAIL: stock valuation-gap guard functions do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_GAP_FUNCS"
  echo "--- actual ---";   echo "$ACTUAL_GAP_FUNCS"
  exit 1
fi

EXPECTED_GAP_TRIGGERS="stock_movement_valuation_gaps|trg_stock_movement_valuation_gap_consistency|O|true|true
stock_movement_valuation_gaps|trg_stock_movement_valuation_gap_immutable|O|false|false
stock_occurrences|trg_stock_occurrence_valuation_gap_consistency|O|true|true"

ACTUAL_GAP_TRIGGERS=$(q_cand "
  SELECT c.relname || '|' || t.tgname || '|' || t.tgenabled::text || '|' || t.tgdeferrable::text || '|' || t.tginitdeferred::text
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname IN (
     'trg_stock_movement_valuation_gap_consistency',
     'trg_stock_movement_valuation_gap_immutable',
     'trg_stock_occurrence_valuation_gap_consistency'
   )
   ORDER BY t.tgname;")

if [ "$ACTUAL_GAP_TRIGGERS" != "$EXPECTED_GAP_TRIGGERS" ]; then
  echo "FAIL: stock valuation-gap triggers do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_GAP_TRIGGERS"
  echo "--- actual ---";   echo "$ACTUAL_GAP_TRIGGERS"
  exit 1
fi

EXPECTED_VALUATION_FUNCS="inventory_layer_consumption_immutable
stock_movement_valuation_coverage
stock_valuation_entry_immutable"

ACTUAL_VALUATION_FUNCS=$(q_cand "
  SELECT proname
    FROM pg_proc
   WHERE proname IN (
     'inventory_layer_consumption_immutable',
     'stock_movement_valuation_coverage',
     'stock_valuation_entry_immutable'
   )
   ORDER BY proname;")

if [ "$ACTUAL_VALUATION_FUNCS" != "$EXPECTED_VALUATION_FUNCS" ]; then
  echo "FAIL: stage-1 valuation guard functions do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_VALUATION_FUNCS"
  echo "--- actual ---";   echo "$ACTUAL_VALUATION_FUNCS"
  exit 1
fi

EXPECTED_VALUATION_TRIGGERS="inventory_layer_consumptions|trg_inventory_layer_consumption_immutable|27|O|false|false
stock_movements|trg_stock_movement_valuation_coverage|5|O|true|true
stock_valuation_entries|trg_stock_valuation_entry_immutable|27|O|false|false"

ACTUAL_VALUATION_TRIGGERS=$(q_cand "
  SELECT c.relname || '|' || t.tgname || '|' || t.tgtype::text || '|' || t.tgenabled::text || '|' || t.tgdeferrable::text || '|' || t.tginitdeferred::text
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname IN (
     'trg_inventory_layer_consumption_immutable',
     'trg_stock_movement_valuation_coverage',
     'trg_stock_valuation_entry_immutable'
   )
   ORDER BY t.tgname;")

if [ "$ACTUAL_VALUATION_TRIGGERS" != "$EXPECTED_VALUATION_TRIGGERS" ]; then
  echo "FAIL: stage-1 valuation triggers do not match exact timing, events, or enabled/deferred state."
  echo "--- expected ---"; echo "$EXPECTED_VALUATION_TRIGGERS"
  echo "--- actual ---";   echo "$ACTUAL_VALUATION_TRIGGERS"
  exit 1
fi

EXPECTED_ACCOUNT_GUARD_FUNCS="inventory_account_backing_check
inventory_account_setting_protect
inventory_journal_entry_protect
inventory_journal_line_no_append
inventory_journal_line_protect
inventory_truncate_protect
journal_entry_open_posting_clear
journal_entry_open_posting_guard
journal_entry_open_posting_mark"
ACTUAL_ACCOUNT_GUARD_FUNCS=$(q_cand "SELECT proname FROM pg_proc WHERE proname IN ('inventory_account_backing_check','inventory_account_setting_protect','inventory_journal_entry_protect','inventory_journal_line_no_append','inventory_journal_line_protect','inventory_truncate_protect','journal_entry_open_posting_clear','journal_entry_open_posting_guard','journal_entry_open_posting_mark') ORDER BY proname;")
if [ "$ACTUAL_ACCOUNT_GUARD_FUNCS" != "$EXPECTED_ACCOUNT_GUARD_FUNCS" ]; then echo "FAIL: inventory account guard functions do not match."; echo "$ACTUAL_ACCOUNT_GUARD_FUNCS"; exit 1; fi
EXPECTED_ACCOUNT_GUARD_TRIGGERS="accounting_settings|trg_inventory_account_setting_protect|19|O|false|false
inventory_cutover_batch_releases|trg_inventory_truncate_protect|34|O|false|false
inventory_layer_consumptions|trg_inventory_truncate_protect|34|O|false|false
journal_entry|trg_inventory_journal_entry_protect|27|O|false|false
journal_entry|trg_inventory_truncate_protect|34|O|false|false
journal_entry|trg_journal_entry_open_posting_mark|5|O|false|false
journal_entry_line|trg_inventory_journal_line_no_append|7|O|false|false
journal_entry_line|trg_inventory_journal_line_protect|27|O|false|false
journal_entry_line|trg_inventory_truncate_protect|34|O|false|false
journal_entry_line|trg_journal_line_inventory_backing|21|O|true|true
journal_entry_open_postings|trg_journal_entry_open_posting_clear|5|O|true|true
journal_entry_open_postings|trg_journal_entry_open_posting_guard|31|O|false|false
stock_valuation_entries|trg_inventory_truncate_protect|34|O|false|false"
ACTUAL_ACCOUNT_GUARD_TRIGGERS=$(q_cand "SELECT c.relname || '|' || t.tgname || '|' || t.tgtype::text || '|' || t.tgenabled::text || '|' || t.tgdeferrable::text || '|' || t.tginitdeferred::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname IN ('trg_inventory_account_setting_protect','trg_inventory_journal_entry_protect','trg_inventory_journal_line_no_append','trg_inventory_journal_line_protect','trg_inventory_truncate_protect','trg_journal_line_inventory_backing','trg_journal_entry_open_posting_clear','trg_journal_entry_open_posting_guard','trg_journal_entry_open_posting_mark') ORDER BY c.relname,t.tgname;")
if [ "$ACTUAL_ACCOUNT_GUARD_TRIGGERS" != "$EXPECTED_ACCOUNT_GUARD_TRIGGERS" ]; then echo "FAIL: inventory account guard triggers do not match."; echo "--- expected ---"; echo "$EXPECTED_ACCOUNT_GUARD_TRIGGERS"; echo "--- actual ---"; echo "$ACTUAL_ACCOUNT_GUARD_TRIGGERS"; exit 1; fi

EXPECTED_RECONCILIATION_FUNCS="inventory_cutover_batch_release_immutable
inventory_reconciliation_content_guard
inventory_reconciliation_header_guard"
ACTUAL_RECONCILIATION_FUNCS=$(q_cand "SELECT proname FROM pg_proc WHERE proname IN ('inventory_cutover_batch_release_immutable','inventory_reconciliation_content_guard','inventory_reconciliation_header_guard') ORDER BY proname;")
if [ "$ACTUAL_RECONCILIATION_FUNCS" != "$EXPECTED_RECONCILIATION_FUNCS" ]; then echo "FAIL: reconciliation guard functions do not match."; echo "$ACTUAL_RECONCILIATION_FUNCS"; exit 1; fi
EXPECTED_RECONCILIATION_TRIGGERS="inventory_cutover_batch_releases|trg_inventory_cutover_batch_release_immutable|27|O|false|false
inventory_opening_position_batches|trg_inventory_opening_position_batches_content_guard|31|O|false|false
inventory_opening_positions|trg_inventory_opening_positions_content_guard|31|O|false|false
inventory_reconciliation_journal_lines|trg_inventory_reconciliation_journal_lines_content_guard|31|O|false|false
inventory_reconciliations|trg_inventory_reconciliation_header_guard|19|O|false|false"
ACTUAL_RECONCILIATION_TRIGGERS=$(q_cand "SELECT c.relname || '|' || t.tgname || '|' || t.tgtype::text || '|' || t.tgenabled::text || '|' || t.tgdeferrable::text || '|' || t.tginitdeferred::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname IN ('trg_inventory_cutover_batch_release_immutable','trg_inventory_opening_position_batches_content_guard','trg_inventory_opening_positions_content_guard','trg_inventory_reconciliation_journal_lines_content_guard','trg_inventory_reconciliation_header_guard') ORDER BY c.relname,t.tgname;")
if [ "$ACTUAL_RECONCILIATION_TRIGGERS" != "$EXPECTED_RECONCILIATION_TRIGGERS" ]; then echo "FAIL: reconciliation guard triggers do not match."; echo "--- expected ---"; echo "$EXPECTED_RECONCILIATION_TRIGGERS"; echo "--- actual ---"; echo "$ACTUAL_RECONCILIATION_TRIGGERS"; exit 1; fi

echo "PASS: pg_trgm installed, all 11 migration-index definitions exact, 6 bsr functions, 8 bsr triggers, FK_bsr_current_version exact, 2 stock valuation-gap functions and 3 triggers, 3 stage-1 valuation functions and triggers, no other differences"
exit 0
