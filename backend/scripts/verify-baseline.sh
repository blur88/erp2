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
# expression indexes): expects exactly the migration-indexes allowlist;
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

REF_DB=erp_gate_reference
CAND_DB=erp_gate_candidate
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
ALLOWLIST="${ALLOWLIST:-none}"

psql_admin() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d postgres -c "$1"
}

dump_schema() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    pg_dump -U "$DB_USERNAME" --schema-only --no-owner --no-privileges "$1"
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
# Anything else in the diff fails the gate.

# (a) Negative: only the allowlisted statements may appear as differences.
UNEXPECTED=$(grep -E '^[+-]' "$OUT/diff.txt" \
  | grep -vE '^(\+\+\+|---)' \
  | grep -vE \
'^\+CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;|^\+COMMENT ON EXTENSION pg_trgm IS|^\+CREATE UNIQUE INDEX "UQ_price_lists_single_default"|^\+CREATE UNIQUE INDEX "UQ_products_lower_(name|barcode)"|^\+CREATE INDEX idx_(customers|products|sales_orders|purchase_orders|suppliers|vendor_payments)_[a-z]+_trgm' \
  || true)

if [ -n "$UNEXPECTED" ]; then
  echo "FAIL: differences outside the migration-indexes allowlist:"
  echo "$UNEXPECTED"
  exit 1
fi

# (b) Positive: the extension and all 11 indexes must actually exist in the
# candidate's catalog, with exact table, uniqueness, and definition.
q_cand() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d "$CAND_DB" -tAc "$1" | tr -d '\r'
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

echo "PASS: pg_trgm installed, all 11 migration-index definitions exact, no other differences"
exit 0
