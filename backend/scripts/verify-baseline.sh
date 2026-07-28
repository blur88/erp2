#!/usr/bin/env bash
# Schema gate for the migration baseline (#950).
#
# Builds two fresh databases — reference via schema:sync, candidate via
# migration:run — and asserts their schemas match after normalizing away
# migration metadata (migration:run creates the `migrations` table and its
# identity sequence; the reference has neither).
#
# Release 1 (genesis only): expects an EMPTY normalized diff.
# Release 2 (adds AddTrigramIndexes): expects exactly the trigram allowlist;
#   re-run with ALLOWLIST=trigram.
set -euo pipefail

# Credentials come from backend/.env (gitignored) or the caller's
# environment. Never hardcode them here: this file IS committed, and
# .gitignore:17 marks committing real credentials as critical.
ENV_FILE="${ENV_FILE:-.env}"
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
  echo "DB_PASSWORD is not set. Provide it via backend/.env or the environment." >&2
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
normalize() {
  awk 'BEGIN{RS="";FS="\n"} !/public\.migrations/ {print $0 "\n"}' \
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

# Release 2 has two halves. A diff-only check is not sufficient: an empty
# or partial diff would pass it while pg_trgm and the indexes were missing,
# which is exactly the divergence this release exists to fix.

# (a) Negative: nothing outside the allowlist may appear.
UNEXPECTED=$(grep -E '^[+-]' "$OUT/diff.txt" \
  | grep -vE '^(\+\+\+|---)' \
  | grep -viE 'pg_trgm|gin_trgm_ops|idx_(products|customers|sales_orders|purchase_orders|suppliers|vendor_payments)_[a-z]+_trgm' \
  || true)

if [ -n "$UNEXPECTED" ]; then
  echo "FAIL: differences outside the trigram allowlist:"
  echo "$UNEXPECTED"
  exit 1
fi

# (b) Positive: the extension and all 8 indexes must actually exist in the
# candidate's catalog, by exact name.
q_cand() {
  docker compose -f ../docker-compose.yml exec -T postgres \
    psql -U "$DB_USERNAME" -d "$CAND_DB" -tAc "$1" | tr -d '\r'
}

EXT=$(q_cand "SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm';")
if [ "$EXT" != "1" ]; then
  echo "FAIL: pg_trgm extension not installed (found $EXT)"
  exit 1
fi

EXPECTED_INDEXES="idx_customers_name_trgm
idx_customers_phone_trgm
idx_products_barcode_trgm
idx_products_name_trgm
idx_purchase_orders_ordernumber_trgm
idx_sales_orders_ordernumber_trgm
idx_suppliers_companyname_trgm
idx_vendor_payments_referencenumber_trgm"

ACTUAL_INDEXES=$(q_cand "
  SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public' AND indexname LIKE '%_trgm'
   ORDER BY indexname;")

if [ "$ACTUAL_INDEXES" != "$EXPECTED_INDEXES" ]; then
  echo "FAIL: trigram index set does not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_INDEXES"
  echo "--- actual ---";   echo "$ACTUAL_INDEXES"
  exit 1
fi

# Names alone are not enough: an index with the right name on the wrong
# table or column would pass. Compare full normalized definitions, so table,
# column, access method, and operator class are all pinned.
EXPECTED_DEFS="idx_customers_name_trgm|customers|USING gin (name gin_trgm_ops)
idx_customers_phone_trgm|customers|USING gin (phone gin_trgm_ops)
idx_products_barcode_trgm|products|USING gin (barcode gin_trgm_ops)
idx_products_name_trgm|products|USING gin (name gin_trgm_ops)
idx_purchase_orders_ordernumber_trgm|purchase_orders|USING gin (\"orderNumber\" gin_trgm_ops)
idx_sales_orders_ordernumber_trgm|sales_orders|USING gin (\"orderNumber\" gin_trgm_ops)
idx_suppliers_companyname_trgm|suppliers|USING gin (\"companyName\" gin_trgm_ops)
idx_vendor_payments_referencenumber_trgm|vendor_payments|USING gin (\"referenceNumber\" gin_trgm_ops)"

# Strip the leading "CREATE INDEX <name> ON public.<table> " prefix so only the
# access-method clause remains, then join name|table|clause.
ACTUAL_DEFS=$(q_cand "
  SELECT indexname || '|' || tablename || '|' ||
         regexp_replace(indexdef, '^CREATE INDEX .* ON public\.[a-z_]+ ', '')
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname LIKE '%_trgm'
   ORDER BY indexname;")

if [ "$ACTUAL_DEFS" != "$EXPECTED_DEFS" ]; then
  echo "FAIL: trigram index definitions do not match exactly."
  echo "--- expected ---"; echo "$EXPECTED_DEFS"
  echo "--- actual ---";   echo "$ACTUAL_DEFS"
  exit 1
fi

echo "PASS: pg_trgm installed, all 8 trigram index definitions exact, no other differences"
exit 0
