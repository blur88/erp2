# #1412 Missing Stock Constraints Investigation

## 1. Summary

**Confirmed — the development schema has drifted from the current migration
source.** Four objects added to `AddStockOccurrencesAndProvenance1792258286736`
in commit `2e17a0176140d797ff10880cc442a50658d1b9b4` are absent by both name and
definition from development database `erp_db`:
`FK_stock_occurrences_legacy_journal`,
`CHK_stock_occurrence_reversal_reason_length`,
`CHK_stock_batch_consumptions_quantity_positive`, and
`FK_purchase_cost_history_occurrence`. No equivalent constraints under different
names were found. All four are also declared in the entities, and the current
image contains all four. Only the postcheck omits the fourth. No present rows
violate these rules, but that only describes the rows counted at the time of
inspection.

**Likely — the migration was recorded as applied before its source was updated
to add these four constraints.** The October 20 startup evidence in section 6
shows the latest image reporting this migration as already executed while the
catalog lacks its late additions. The additions first appear in the migration
file in the October 19 18:42:37 UTC commit above. The original application time
and image remain unknown.

**Confirmed — the #1406 postcheck detects three missing objects and omits the
fourth.** It reports 11/12 expected foreign keys and 0/2 expected checks. It
does not list `FK_purchase_cost_history_occurrence`. This is an incomplete
postcheck expectation, not an incorrect result from the postcheck.

A separately authorized repair issue is needed. A forward migration, immutable
applied migration rule, live-schema drift check, and complete postcheck are
recommendations only; this investigation does not authorize them.

## 2. Environment and method

All database and image findings here describe **development** evidence: the
`erp2` Compose project, database `erp_db`, and backend `NODE_ENV=development`.
The database is PostgreSQL 18.3. The read-only harness ran on 2026-10-20; the
catalog snapshot was taken at 16:17:24 UTC and the aggregate counts at 16:10:59
UTC. The catalog reported 28 applied migrations; its five latest rows have IDs
31–35, including `AddStockOccurrencesAndProvenance1792258286736` at ID 33 and
the two later migrations at IDs 34 and 35.

The harness sets `PGOPTIONS='-c default_transaction_read_only=on'`, requires
each SQL file to begin with `BEGIN READ ONLY;` and end with `ROLLBACK;`, rejects
prohibited write/DDL keywords outside `--` comments, and sends the query to
`psql` in the Compose Postgres service. All retained final query outputs show
`transaction_read_only = on` as their first result. The initial postcheck run
did not include that diagnostic, so it was rerun with the explicit read-only
confirmation; the reported result was unchanged. Three wrapper refusal checks
(write statement, missing read-only begin, missing rollback) exited 2 without
invoking the Docker stub. No database writes, test writes, `migration:run`, or
`migration:revert` were performed.

Image inspection showed development image `erp-backend:rollback-pre-3250`, ID
`sha256:4f681466304d08dadeeb5d5181fb3b76d1245b5e6328e58a1e110a0dae0b9d2a`,
contains none of the four additions. Image `erp-backend:latest`, ID
`sha256:768d3ed46bc2eefea18886802a8d120aad7ad483880d9d4a059a7a51a50bed27`,
contains all four in the compiled migration. The current backend container uses
the latter image. Image contents establish what code is present, not which image
applied the migration.

## 3. Evidence classes

- **Confirmed** means directly shown by a commit, image contents, database
  query, startup log, or cited source line.
- **Likely** means the evidence supports the explanation but does not directly
  establish it; the report identifies what would confirm it.
- **Unknown** means the available evidence does not answer the question.

PostgreSQL does not retain reliable constraint or table creation times in the
catalogs. Table and constraint OID order, migration row IDs, and business-row
timestamps are indirect ordering evidence only. They are not used alone to claim
when an object was created.

## 4. Per-constraint findings

### `FK_stock_occurrences_legacy_journal`

**Confirmed:** It first appears in the migration and postcheck in commit
`2e17a0176140d797ff10880cc442a50658d1b9b4` (2026-10-19 18:42:37 UTC), following
versions in `9f4c8a360`, `19a2a63e4`, and `0ab9310a4` that do not contain it.
The current migration declares a restrictive FK from
`stock_occurrences.legacyJournalEntryId` to `journal_entry.id` at
`backend/src/database/migrations/1792258286736-AddStockOccurrencesAndProvenance.ts:33`.
The development catalog has no FK with that definition or another name, and
reports no constraint as `NOT VALID` in its place. The rollback image has none;
latest has it.

Without the FK, a database write can store a non-null legacy journal ID that
does not exist, and a hard delete could leave a dangling reference. The normal
receipt-return writer takes the legacy entry ID from assessed receipt evidence
(`backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts:388-399`).
No hard-delete path for `journal_entry` was found in `backend/src`; soft deletion
leaves the target row present. Direct SQL, future code, or another writer could
bypass the API path. Development count at 2026-10-20
16:10:59 UTC: 0 non-null IDs and 0 orphans.

### `CHK_stock_occurrence_reversal_reason_length`

**Confirmed:** It first appears in the same commit and has the same history and
image state described above. The current definition requires a non-null, trimmed
3–500 character reason for `receipt_reversal` and `fulfilment_reversal` rows
(`backend/src/database/migrations/1792258286736-AddStockOccurrencesAndProvenance.ts:30`).
The catalog has neither this check nor an equivalent expression; no unvalidated
equivalent exists. The entity also declares this check
(`backend/src/database/entities/stock-occurrence.entity.ts:44-50`).

Without the check, the database accepts reversal occurrences with a null, empty,
whitespace-only, too-short, or overlong reason. HTTP DTOs trim and validate a
3–500 length reason for purchase returns and sales unfulfil
(`backend/src/modules/purchasing/dto/purchase-order.dto.ts:435-439`,
`backend/src/modules/sales/dto/sales-order.dto.ts:388-392`), but direct service,
repository, or SQL writes bypass those DTOs. The DTO checks are not a database
enforcement boundary. Development count: 0 applicable reversal occurrences
and 0 violations.

### `CHK_stock_batch_consumptions_quantity_positive`

**Confirmed:** It first appears in the same commit; the current migration
requires `quantity > 0`
(`backend/src/database/migrations/1792258286736-AddStockOccurrencesAndProvenance.ts:31`).
The catalog has no equivalent check, validated or unvalidated. The entity
declares the check at
`backend/src/database/entities/stock-batch-consumption.entity.ts:24-26`. The
`quantity` column remains `NOT NULL`.

Without this check, the database accepts zero or negative consumption
quantities. The normal sale writer persists the plan in
`backend/src/modules/sales/services/inventory-integration.service.ts:422-447`;
the planner omits non-positive reductions and only emits positive consumed
quantities in
`backend/src/modules/inventory/services/base-cost-calculator.service.ts:155-178`.
Those are application-path guards, not database enforcement. Unfulfil later
checks that consumed plus uncovered quantity equals the movement quantity and
validates restored provenance
(`backend/src/modules/sales/services/sales-order-fulfillment.service.ts:348-356,517-538`).
Development count: 0 total rows and 0 violations.

### `FK_purchase_cost_history_occurrence`

**Confirmed:** This fourth object was added in the same migration edit, at
`backend/src/database/migrations/1792258286736-AddStockOccurrencesAndProvenance.ts:34`.
It is declared in the entity
(`backend/src/database/entities/purchase-cost-history.entity.ts:132-136`) but
absent from the postcheck. The catalog has no FK from
`purchase_cost_history.occurrenceId` to `stock_occurrences.id`,
including under another name; no unvalidated equivalent exists. The rollback
image has none; latest has it.

Without the FK, a non-null occurrence ID can point to no occurrence, and an
occurrence can be hard-deleted while a cost batch refers to it. The normal
receiving flow supplies the occurrence ID while creating a batch
(`backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts:252-284`;
batch persistence is in
`backend/src/modules/inventory/services/base-cost-calculator.service.ts:280-294`).
Receipt-return assessment loads occurrence-linked batches and rejects mismatched
evidence
(`backend/src/modules/purchasing/services/receipt-reversal-evidence.ts:224-245`),
but that check is not a write-time referential guarantee. Development count: 0
non-null references and 0 orphans.

## 5. The two later migrations and full object comparison

**Confirmed:** Every listed catalog object matches the current migration
definition and is validated where that state applies, except the four absent
constraints detailed in section 4. This table includes all inspected objects
from the first migration and the two later migrations. The column list covers
fields added by these migrations; comments are not treated as independent
schema objects. The migration rows are present as IDs 33, 34, and 35.

<!-- markdownlint-disable MD013 -->
| Migration | Object | Relation | Development catalog |
| --- | --- | --- | --- |
| `1792258286736` | `stock_occurrences_kind_enum` | `type` | matching |
| `1792258286736` | `stock_occurrences` | `table` | matching |
| `1792258286736` | `PK_bbb531cb0d4aea5ed2b2d4604eb` | `stock_occurrences` | matching, validated |
| `1792258286736` | `UQ_stock_occurrence_reverses` | `stock_occurrences` | matching |
| `1792258286736` | `stock_batch_consumptions` | `table` | matching |
| `1792258286736` | `PK_7e6732fdb13b50ec7cc84409be3` | `stock_batch_consumptions` | matching, validated |
| `1792258286736` | `purchase_cost_history.occurrenceId` | `column` | matching |
| `1792258286736` | `purchase_cost_history.reversedAt` | `column` | matching |
| `1792258286736` | `purchase_cost_history.reversedByOccurrenceId` | `column` | matching |
| `1792258286736` | `stock_movements.occurrenceId` | `column` | matching |
| `1792258286736` | `stock_movements.actorUserId` | `column` | matching |
| `1792258286736` | `stock_movements.reversesMovementId` | `column` | matching |
| `1792258286736` | `stock_movements.productSequence` | `column` | matching |
| `1792258286736` | `stock_movements_movementtype_enum:purchase_receipt_reversal` | `enum label` | matching |
| `1792258286736` | `UQ_stock_movement_reverses` | `stock_movements` | matching |
| `1792258286736` | `UQ_stock_movement_product_sequence` | `stock_movements` | matching |
| `1792258286736` | `CHK_purchase_cost_history_reversed` | `purchase_cost_history` | matching, validated |
| `1792258286736` | `CHK_stock_occurrence_reversal_reason_length` | `stock_occurrences` | absent |
| `1792258286736` | `CHK_stock_batch_consumptions_quantity_positive` | `stock_batch_consumptions` | absent |
| `1792258286736` | `FK_a200937c3bef6072ce44d760fe3` | `purchase_cost_history` | matching, validated |
| `1792258286736` | `FK_stock_occurrences_legacy_journal` | `stock_occurrences` | absent |
| `1792258286736` | `FK_purchase_cost_history_occurrence` | `purchase_cost_history` | absent |
| `1792258286736` | `FK_5c780823d6beebab76e469e2e17` | `purchase_cost_history` | matching, validated |
| `1792258286736` | `FK_6e87ea9ab16010d08671f12b633` | `stock_movements` | matching, validated |
| `1792258286736` | `FK_ac607027d537535d292b28f3854` | `stock_movements` | matching, validated |
| `1792258286736` | `FK_a803b54b23d2fb8c0fe7f5389f9` | `stock_occurrences` | matching, validated |
| `1792258286736` | `FK_7a90005ab332be99fb12c7d6c84` | `stock_batch_consumptions` | matching, validated |
| `1792258286736` | `FK_51f795684690dbcdee919a915f2` | `stock_batch_consumptions` | matching, validated |
| `1792369500000` | `stock_occurrences.receiptEvidenceVersion` | `column` | matching |
| `1792369500000` | `CHK_stock_occurrence_receipt_evidence_version` | `stock_occurrences` | matching, validated |
| `1792369500000` | `stock_movements.purchaseOrderItemId` | `column` | matching |
| `1792369500000` | `FK_060822dfc7623d639b8c187bdda` | `stock_movements` | matching, validated |
| `1792369500000` | `CHK_stock_movement_receipt_line_occurrence` | `stock_movements` | matching, validated |
| `1792369500000` | `UQ_stock_movement_occurrence_item` | `stock_movements` | matching |
| `1792369500000` | `purchase_cost_history.purchaseOrderItemId` | `column` | matching |
| `1792369500000` | `FK_54f778f185d6a7cec057169ce19` | `purchase_cost_history` | matching, validated |
| `1792369500000` | `CHK_purchase_cost_history_receipt_line_occurrence` | `purchase_cost_history` | matching, validated |
| `1792369500000` | `UQ_purchase_cost_history_occurrence_item` | `purchase_cost_history` | matching |
| `1792455000000` | `stock_occurrences.hasValuationGap` | `column` | matching |
| `1792455000000` | `CHK_stock_occurrence_valuation_gap_kind` | `stock_occurrences` | matching, validated |
| `1792455000000` | `stock_movement_valuation_gaps` | `table` | matching |
| `1792455000000` | `PK_572cc0ea03c004f55c866f58bdd` | `stock_movement_valuation_gaps` | matching, validated |
| `1792455000000` | `CHK_stock_movement_valuation_gap_quantity_positive` | `stock_movement_valuation_gaps` | matching, validated |
| `1792455000000` | `CHK_stock_movement_valuation_gap_value_zero` | `stock_movement_valuation_gaps` | matching, validated |
| `1792455000000` | `CHK_stock_movement_valuation_gap_status` | `stock_movement_valuation_gaps` | matching, validated |
| `1792455000000` | `FK_stock_movement_valuation_gap_movement` | `stock_movement_valuation_gaps` | matching, validated |
| `1792455000000` | `stock_movement_valuation_gap_immutable` | `pg_proc` | matching |
| `1792455000000` | `stock_occurrence_valuation_gap_consistency` | `pg_proc` | matching |
| `1792455000000` | `trg_stock_movement_valuation_gap_immutable` | `stock_movement_valuation_gaps` | matching |
| `1792455000000` | `trg_stock_occurrence_valuation_gap_consistency` | `stock_occurrences` | matching |
| `1792455000000` | `trg_stock_movement_valuation_gap_consistency` | `stock_movement_valuation_gaps` | matching |

<!-- markdownlint-enable MD013 -->

## 6. Timing

**Confirmed (scoped to the 2026-10-20 startup):** The backend container was
created at 14:52:25 UTC from the `latest` image
(`sha256:768d3ed4…`), which contains all four constraints. At 14:52:32 UTC it
logged that `AddStockOccurrencesAndProvenance1792258286736` was already the
last executed migration. It then executed only the two later migrations. That
startup therefore did not rerun the migration, and its copy of the four
constraints was never applied.

The startup log's displayed date, October 17 17:31:26 UTC, matches the timestamp
encoded in the migration name and the `migrations.timestamp` value; it is not
an application-time record. The same startup log shows
`AddReceiptLineIdentity1792369500000` and
`AddStockMovementValuationGaps1792455000000` executing successfully on October
20. Current backend container metadata traces to the `latest` image digest
recorded above. The four additions first appear in commit
`2e17a0176140d797ff10880cc442a50658d1b9b4` at 2026-10-19 18:42:37 UTC.

**Likely:** The migration was first run from an earlier source version, and
the migration runner later skipped it because its name was already recorded.
That would explain why latest contains the SQL while the database does not.
Commit `2e17a0176` is not an ancestor of `e90947033`, the upper commit bound
for the intermediate image noted in issue #1409 comment 6284817121. That
comment identifies the inspected rollback image as built from an intermediate
commit between `9f4c8a360` and `e90947033`. This narrows the inspected image's
contents but does not tie it to the original migration application.

**Unknown:** The actual time and exact image or source revision that first
applied the migration. The retained startup log reports the migration
timestamp, not an apply-time timestamp. The log search found no original
apply-time record linked to a container image. Catalog OIDs and migration IDs
are only indirect ordering evidence.

## 7. Broader schema drift: Unknown

Objects outside the three migrations were not compared. A whole-schema
comparison of development `erp_db` against a freshly migrated scratch database
was left out by owner decision. That comparison is recommended as separately
authorized follow-up.

## 8. Why no gate caught it

- **Confirmed:** CI runs unit and e2e suites
  (`.github/workflows/ci.yml:122-126`). The e2e flow migrates a test database
  from an empty state; the migration is therefore applied using the currently
  checked-in file. Issue #950 documents the baseline approach of applying
  migrations to an empty database.
- **Confirmed:** `backend/scripts/verify-baseline.sh:118-127` creates reference
  and candidate databases, builds one from entity synchronization and the other
  via `migration:run`, then compares those fresh schemas. It does not compare
  the live development schema.
- **Confirmed:**
  `backend/scripts/postcheck-stock-correction-path.sql:11-24,90-103` checks the
  legacy journal FK and the two named checks, and its output fails at 11/12 FKs
  and 0/2 checks. It does not list `FK_purchase_cost_history_occurrence`.

## 9. Implications for the guards

The #1406 postcheck is a useful signal and currently fails, but it does not
cover the fourth FK. Unfulfil validates quantity and cost-batch provenance when
an operator attempts that workflow. Receipt-return evidence checks
occurrence-linked movements and batches and fails closed on mismatches. These
workflow checks can detect some malformed data when those paths run; they do not
prevent invalid inserts or every dangling reference. Until the discrepancy is
resolved, the database constraints should not be treated as present. The four
development violation counts are zero as of the query timestamp, which describes
current rows only and does not replace the missing enforcement.

## 10. Recommended follow-up (not authorized here)

Each item is a candidate issue requiring separate owner authorization and its
own preflight:

1. **Forward migration:** add the four missing constraints idempotently and
   validate them. Preflight: compare candidate definitions with the live
   catalog, count and report violations, and decide how any violations will be
   resolved before applying the migration.
2. **Applied-migration immutability:** prevent edits to migrations already on
   `main` or included in a release. Preflight: agree on the source of truth for
   merged and released migration identity and check existing history.
3. **Live-schema drift gate:** compare the live catalog with the expected
   schema, beginning with a one-off whole-schema comparison of development
   `erp_db` against a freshly migrated scratch database. Preflight: define
   environment access, exclusions, and a safe read-only comparison process.
4. **Complete postcheck:** list every object created by the migration, including
   `FK_purchase_cost_history_occurrence`. Preflight: derive the expected object
   inventory from the migration source and compare it with the query's catalog
   predicates.

## 11. Appendix

### Reproduce the catalog check

Run in the development Compose project through the read-only harness. This
query captures constraints, indexes, triggers, enum labels, columns, functions,
recent migration rows, and indirect OID ordering evidence.

```sql
BEGIN READ ONLY;
SHOW transaction_read_only;
SELECT clock_timestamp() AT TIME ZONE 'UTC' AS evidence_time_utc;
SELECT c.relname AS table_name, c.oid AS table_oid, con.conname, con.contype,
       con.convalidated, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE c.relname IN (
  'stock_occurrences', 'stock_batch_consumptions', 'purchase_cost_history',
  'stock_movements', 'stock_movement_valuation_gaps'
)
ORDER BY c.relname, con.conname;
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN (
  'stock_occurrences', 'stock_batch_consumptions', 'purchase_cost_history',
  'stock_movements', 'stock_movement_valuation_gaps'
)
ORDER BY tablename, indexname;
SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname IN (
  'stock_occurrences', 'stock_batch_consumptions', 'purchase_cost_history',
  'stock_movements', 'stock_movement_valuation_gaps'
) AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
SELECT t.typname, e.enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname IN (
  'stock_occurrences_kind_enum', 'stock_movements_movementtype_enum'
)
ORDER BY t.typname, e.enumsortorder;
SELECT id, timestamp, name FROM migrations ORDER BY id DESC LIMIT 5;
SELECT c.relname AS table_name, c.oid AS table_oid
FROM pg_class c
WHERE c.relname IN (
  'stock_occurrences', 'stock_batch_consumptions',
  'stock_movement_valuation_gaps', 'stock_movements', 'purchase_cost_history'
)
ORDER BY c.relname;
SELECT con.conname, con.oid AS constraint_oid, c.relname AS table_name
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE con.conname IN (
  'FK_stock_occurrences_legacy_journal',
  'CHK_stock_occurrence_reversal_reason_length',
  'CHK_stock_batch_consumptions_quantity_positive',
  'FK_purchase_cost_history_occurrence'
)
ORDER BY con.conname;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN (
  'stock_occurrences', 'stock_batch_consumptions', 'purchase_cost_history',
  'stock_movements', 'stock_movement_valuation_gaps'
)
ORDER BY table_name, ordinal_position;
SELECT p.proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.proname IN (
  'stock_movement_valuation_gap_immutable',
  'stock_occurrence_valuation_gap_consistency'
)
ORDER BY p.proname;
ROLLBACK;
```

### Reproduce aggregate violation counts

```sql
BEGIN READ ONLY;
SHOW transaction_read_only;
SELECT clock_timestamp() AT TIME ZONE 'UTC' AS evidence_time_utc;
SELECT 'FK_stock_occurrences_legacy_journal' AS rule,
 count(*) FILTER (WHERE o."legacyJournalEntryId" IS NOT NULL)::bigint AS scoped_rows,
 count(*) FILTER (WHERE o."legacyJournalEntryId" IS NOT NULL AND j.id IS NULL)
   ::bigint AS violations
FROM stock_occurrences o
LEFT JOIN journal_entry j ON j.id = o."legacyJournalEntryId"
UNION ALL
SELECT 'CHK_stock_occurrence_reversal_reason_length',
 count(*) FILTER (WHERE o.kind::text IN ('receipt_reversal','fulfilment_reversal'))::bigint,
 count(*) FILTER (
   WHERE o.kind::text IN ('receipt_reversal','fulfilment_reversal')
     AND (o.reason IS NULL
       OR char_length(btrim(o.reason)) NOT BETWEEN 3 AND 500)
 )::bigint
FROM stock_occurrences o
UNION ALL
SELECT 'CHK_stock_batch_consumptions_quantity_positive', count(*)::bigint,
 count(*) FILTER (WHERE c.quantity <= 0 OR c.quantity IS NULL)::bigint
FROM stock_batch_consumptions c
UNION ALL
SELECT 'FK_purchase_cost_history_occurrence',
 count(*) FILTER (WHERE b."occurrenceId" IS NOT NULL)::bigint,
 count(*) FILTER (WHERE b."occurrenceId" IS NOT NULL AND o.id IS NULL)::bigint
FROM purchase_cost_history b LEFT JOIN stock_occurrences o ON o.id = b."occurrenceId";
ROLLBACK;
```

Raw query output and image/log evidence remain local in `~/erp-evidence/1412/`;
no raw rows, row identifiers, product names, or other row contents are included
in this report.
