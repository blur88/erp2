-- #1406 stock correction deploy preflight. This script is read-only and reports
-- inventory evidence; it does not decide whether the evidence horizon is safe.
-- In particular, earliest timestamps and the absence of detected gaps cannot
-- establish that the complete stock history is present.
--
-- Run against the target database before deploying #1405/#1406:
--   docker compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/preflight-stock-correction-path.sql
--
-- -X skips any psqlrc so startup configuration cannot affect execution. Exit 0
-- means the report was generated, not that deployment is approved: reported
-- discrepancies still need review and a recorded disposition.
--
-- Result sets (each has a `section` label): order counts; received PO rows whose
-- legacy receipt shape does not match; products whose movement sum differs from
-- stockQuantity; horizon context and unmatched correction audit/reversal rows;
-- products carrying batches or other stock history; product quantities that
-- exceed current cost-batch coverage (ordinary fulfillment remains enabled for
-- these rows during the interim valuation-gap release); and recorded valuation
-- gaps when the #1406 migration has been applied. Before that migration, no gap
-- records can exist and the last section reports that fact.

BEGIN READ ONLY;

SELECT
  'order_counts' AS section,
  (SELECT count(*)::bigint FROM sales_orders
    WHERE status::text = 'FULFILLED') AS fulfilled_sales_orders,
  (SELECT count(*)::bigint FROM purchase_orders
    WHERE status::text = 'RECEIVED') AS received_purchase_orders;

WITH received AS (
  SELECT id, "orderNumber" AS order_number
  FROM purchase_orders
  WHERE status::text = 'RECEIVED'
),
line_products AS (
  SELECT i."purchaseOrderId" AS po_id, i."productId" AS product_id,
         count(*) AS line_count, sum(i.quantity)::numeric AS quantity
  FROM purchase_order_items i
  JOIN received po ON po.id = i."purchaseOrderId"
  GROUP BY i."purchaseOrderId", i."productId"
),
movement_products AS (
  SELECT m."referenceId" AS po_id, m."productId" AS product_id,
         count(*) AS movement_count, sum(m.quantity)::numeric AS quantity
  FROM stock_movements m
  JOIN received po ON po.id = m."referenceId"
  WHERE m."referenceType" = 'purchase_order'
    AND m."movementType"::text = 'purchase_receipt'
  GROUP BY m."referenceId", m."productId"
),
batch_products AS (
  SELECT b."purchaseOrderId" AS po_id, b."productId" AS product_id,
         count(*) AS batch_count, sum(b."receivedQuantity")::numeric AS quantity,
         sum(b."receivedQuantity" * b."landedCost")::numeric AS value
  FROM purchase_cost_history b
  JOIN received po ON po.id = b."purchaseOrderId"
  GROUP BY b."purchaseOrderId", b."productId"
),
entry_shape AS (
  SELECT po.id AS po_id,
         count(DISTINCT e.id) FILTER (WHERE e."reversalOfEntryId" IS NULL) AS original_count,
         count(DISTINCT e.id) FILTER (WHERE e."reversalOfEntryId" IS NOT NULL) AS reversal_count,
         COALESCE(sum(l.debit) FILTER (WHERE e."reversalOfEntryId" IS NULL), 0)::numeric AS posted_debit
  FROM received po
  LEFT JOIN journal_entry e
    ON e."sourceDocumentId" = po.id
   AND e."sourceType"::text = 'PURCHASE_ORDER'
   AND e."postingType"::text = 'PURCHASE_RECEIVE'
  LEFT JOIN journal_entry_line l ON l."entryId" = e.id
  GROUP BY po.id
),
po_shape AS (
  SELECT po.id, po.order_number,
         COALESCE(lines.line_count, 0) AS item_count,
         COALESCE(movements.movement_count, 0) AS movement_count,
         COALESCE(batches.batch_count, 0) AS batch_count,
         COALESCE(entries.original_count, 0) AS original_count,
         COALESCE(entries.reversal_count, 0) AS reversal_count,
         COALESCE(entries.posted_debit, 0) AS posted_debit,
         COALESCE(batches.batch_value, 0) AS batch_value,
         EXISTS (
           SELECT 1
           FROM line_products lp
           FULL JOIN movement_products mp
             ON mp.po_id = lp.po_id AND mp.product_id = lp.product_id
           FULL JOIN batch_products bp
             ON bp.po_id = COALESCE(lp.po_id, mp.po_id)
            AND bp.product_id = COALESCE(lp.product_id, mp.product_id)
           WHERE COALESCE(lp.po_id, mp.po_id, bp.po_id) = po.id
             AND (lp.line_count IS DISTINCT FROM mp.movement_count
               OR lp.quantity IS DISTINCT FROM mp.quantity
               OR lp.line_count IS DISTINCT FROM bp.batch_count
               OR lp.quantity IS DISTINCT FROM bp.quantity)
         ) AS product_shape_mismatch
  FROM received po
  LEFT JOIN (
    SELECT po_id, sum(line_count)::bigint AS line_count FROM line_products GROUP BY po_id
  ) lines ON lines.po_id = po.id
  LEFT JOIN (
    SELECT po_id, sum(movement_count)::bigint AS movement_count FROM movement_products GROUP BY po_id
  ) movements ON movements.po_id = po.id
  LEFT JOIN (
    SELECT po_id, sum(batch_count)::bigint AS batch_count,
           sum(value)::numeric AS batch_value FROM batch_products GROUP BY po_id
  ) batches ON batches.po_id = po.id
  LEFT JOIN entry_shape entries ON entries.po_id = po.id
),
classified AS (
  SELECT *, CASE
    WHEN item_count = 0 THEN 'no_purchase_order_items'
    WHEN original_count = 0 THEN 'missing_purchase_receive_entry'
    WHEN original_count <> 1 THEN 'multiple_purchase_receive_entries'
    WHEN reversal_count > 0 THEN 'purchase_receive_already_reversed'
    WHEN product_shape_mismatch THEN 'movement_or_batch_shape_mismatch'
    WHEN movement_count <> item_count THEN 'movement_count_mismatch'
    WHEN batch_count <> item_count THEN 'batch_count_mismatch'
    WHEN round(batch_value, 2) <> round(posted_debit, 2) THEN 'batch_value_differs_from_receipt_entry'
  END AS reason
  FROM po_shape
)
SELECT 'legacy_receipt_shape' AS section, id AS purchase_order_id,
       order_number, reason, item_count, movement_count, batch_count,
       original_count, reversal_count, batch_value, posted_debit
FROM classified
WHERE reason IS NOT NULL
ORDER BY reason, order_number, id;

WITH movement_totals AS (
  SELECT "productId" AS product_id,
         count(*)::bigint AS movement_count,
         sum(quantity)::numeric AS movement_quantity
  FROM stock_movements
  GROUP BY "productId"
)
SELECT 'stock_balance_reconciliation' AS section,
       p.id AS product_id, p.name AS product_name,
       p."stockQuantity"::numeric AS stock_quantity,
       COALESCE(m.movement_quantity, 0)::numeric AS movement_quantity,
       COALESCE(m.movement_count, 0)::bigint AS movement_count,
       (p."stockQuantity"::numeric - COALESCE(m.movement_quantity, 0))::numeric AS difference
FROM products p
LEFT JOIN movement_totals m ON m.product_id = p.id
WHERE p."stockQuantity"::numeric IS DISTINCT FROM COALESCE(m.movement_quantity, 0)::numeric
ORDER BY p.name, p.id;

WITH correction_audits AS (
  SELECT a.id AS audit_id, a."entityType" AS entity_type, a."entityId" AS document_id,
         a.description, a."createdAt" AS created_at,
         CASE
           WHEN a.description LIKE 'Unfulfilled sales order:%' THEN 'sales'
           WHEN a.description LIKE 'Returned purchase order:%' THEN 'purchases'
         END AS correction_kind
  FROM audit_logs a
  WHERE a.description LIKE 'Unfulfilled sales order:%'
     OR a.description LIKE 'Returned purchase order:%'
),
correction_reversals AS (
  SELECT e.id AS journal_entry_id, e."sourceDocumentId" AS document_id,
         e."postingType"::text AS posting_type, e."createdAt" AS created_at,
         CASE
           WHEN e."postingType"::text IN ('SALES_FULFILLMENT_REVENUE', 'SALES_FULFILLMENT_COGS') THEN 'sales'
           WHEN e."postingType"::text = 'PURCHASE_RECEIVE' THEN 'purchases'
         END AS correction_kind
  FROM journal_entry e
  WHERE e."reversalOfEntryId" IS NOT NULL
    AND e."postingType"::text IN ('SALES_FULFILLMENT_REVENUE', 'SALES_FULFILLMENT_COGS', 'PURCHASE_RECEIVE')
),
audit_counts AS (
  SELECT document_id, correction_kind, count(*)::bigint AS audit_count
  FROM correction_audits
  GROUP BY document_id, correction_kind
),
reversal_counts AS (
  SELECT document_id, correction_kind,
         count(*) FILTER (WHERE posting_type IN ('SALES_FULFILLMENT_REVENUE', 'PURCHASE_RECEIVE'))::bigint
           AS reversal_marker_count,
         count(*) FILTER (WHERE posting_type = 'SALES_FULFILLMENT_COGS')::bigint AS cogs_reversal_count
  FROM correction_reversals
  GROUP BY document_id, correction_kind
),
mismatch_groups AS (
  SELECT COALESCE(a.document_id, r.document_id) AS document_id,
         COALESCE(a.correction_kind, r.correction_kind) AS correction_kind,
         COALESCE(a.audit_count, 0)::bigint AS audit_count,
         COALESCE(r.reversal_marker_count, 0)::bigint AS reversal_marker_count,
         COALESCE(r.cogs_reversal_count, 0)::bigint AS cogs_reversal_count,
         CASE
           WHEN COALESCE(a.audit_count, 0) > 1 OR COALESCE(r.reversal_marker_count, 0) > 1
             THEN 'multiple_corrections_cannot_be_paired_from_legacy_audit_data'
           WHEN COALESCE(a.audit_count, 0) <> COALESCE(r.reversal_marker_count, 0)
             THEN 'correction_audit_and_reversal_counts_differ'
           WHEN COALESCE(r.cogs_reversal_count, 0) > COALESCE(r.reversal_marker_count, 0)
             THEN 'cogs_reversal_without_revenue_reversal'
         END AS mismatch_reason
  FROM audit_counts a
  FULL JOIN reversal_counts r
    ON r.document_id = a.document_id AND r.correction_kind = a.correction_kind
),
unmatched_audits AS (
  SELECT a.*, g.mismatch_reason, g.audit_count, g.reversal_marker_count
  FROM correction_audits a
  JOIN mismatch_groups g
    ON g.document_id = a.document_id AND g.correction_kind = a.correction_kind
  WHERE g.mismatch_reason IS NOT NULL
),
unmatched_reversals AS (
  SELECT r.*, g.mismatch_reason, g.audit_count, g.reversal_marker_count
  FROM correction_reversals r
  JOIN mismatch_groups g
    ON g.document_id = r.document_id AND g.correction_kind = r.correction_kind
  WHERE g.mismatch_reason IS NOT NULL
),
horizon AS (
  SELECT (SELECT min("createdAt") FROM journal_entry) AS earliest_journal_entry_at,
         (SELECT min("createdAt") FROM audit_logs) AS earliest_audit_at,
         (SELECT count(*)::bigint FROM unmatched_audits) AS unmatched_audit_count,
         (SELECT count(*)::bigint FROM unmatched_reversals) AS unmatched_reversal_count
)
SELECT 'history_horizon_context' AS section, 'summary' AS record_type,
       'These dates and the absence of detected gaps cannot establish complete history.'::text AS interpretation,
       earliest_journal_entry_at, earliest_audit_at,
       unmatched_audit_count, unmatched_reversal_count,
       NULL::uuid AS audit_id, NULL::uuid AS journal_entry_id,
       NULL::uuid AS document_id, NULL::text AS detail
FROM horizon
UNION ALL
SELECT 'history_horizon_context', 'audit_unmatched_or_ambiguous', NULL::text,
       NULL::timestamptz, NULL::timestamptz, NULL::bigint, NULL::bigint,
       audit_id, NULL::uuid, document_id,
       concat_ws(' | ', description, mismatch_reason,
         format('audits=%s reversalMarkers=%s', audit_count, reversal_marker_count))
FROM unmatched_audits
UNION ALL
SELECT 'history_horizon_context', 'reversal_unmatched_or_ambiguous', NULL::text,
       NULL::timestamptz, NULL::timestamptz, NULL::bigint, NULL::bigint,
       NULL::uuid, journal_entry_id, document_id,
       concat_ws(' | ', posting_type, mismatch_reason,
         format('audits=%s reversalMarkers=%s', audit_count, reversal_marker_count))
FROM unmatched_reversals
ORDER BY record_type, document_id, audit_id, journal_entry_id;

WITH batch_counts AS (
  SELECT "productId" AS product_id, count(*)::bigint AS batch_count
  FROM purchase_cost_history
  GROUP BY "productId"
),
movement_counts AS (
  SELECT "productId" AS product_id, count(*)::bigint AS movement_count
  FROM stock_movements
  GROUP BY "productId"
)
SELECT 'product_stock_history' AS section, p.id AS product_id, p.name AS product_name,
       COALESCE(b.batch_count, 0)::bigint AS batch_count,
       COALESCE(m.movement_count, 0)::bigint AS movement_count,
       (COALESCE(b.batch_count, 0) > 0) AS has_batches,
       (COALESCE(b.batch_count, 0) > 0 OR COALESCE(m.movement_count, 0) > 0) AS has_stock_history,
       (COALESCE(b.batch_count, 0) > 0 OR COALESCE(m.movement_count, 0) > 0) AS protected_from_permanent_delete
FROM products p
LEFT JOIN batch_counts b ON b.product_id = p.id
LEFT JOIN movement_counts m ON m.product_id = p.id
WHERE COALESCE(b.batch_count, 0) > 0 OR COALESCE(m.movement_count, 0) > 0
ORDER BY p.name, p.id;

WITH batch_coverage AS (
  SELECT "productId" AS product_id,
         COALESCE(sum("remainingQuantity"), 0)::numeric AS batch_quantity,
         count(*)::bigint AS batch_count
  FROM purchase_cost_history
  GROUP BY "productId"
)
SELECT 'fulfilment_batch_coverage_exposure' AS section,
       p.id AS product_id,
       p.name AS product_name,
       p."stockQuantity"::numeric AS stock_quantity,
       COALESCE(b.batch_quantity, 0)::numeric AS batch_quantity,
       (p."stockQuantity"::numeric - COALESCE(b.batch_quantity, 0))::numeric AS uncovered_quantity,
       COALESCE(b.batch_count, 0)::bigint AS cost_batch_count,
       'uncovered valuation is unknown, value is not assumed to be zero'::text AS interpretation
FROM products p
LEFT JOIN batch_coverage b ON b.product_id = p.id
WHERE p."stockQuantity"::numeric > COALESCE(b.batch_quantity, 0)::numeric
ORDER BY uncovered_quantity DESC, p.name, p.id;

SELECT CASE
  WHEN to_regclass('stock_movement_valuation_gaps') IS NULL THEN
    $$SELECT 'valuation_gap_exposure' AS section,
             'not migrated yet, no gaps can be recorded before #1406'::text AS status$$
  ELSE
    $$SELECT 'valuation_gap_exposure' AS section,
             p.id AS product_id,
             p.name AS product_name,
             count(DISTINCT o.id)::bigint AS fulfillment_occurrences,
             count(DISTINCT m.id)::bigint AS sale_movements,
             sum(g.quantity)::numeric AS uncovered_quantity,
             'unvalued, recorded zero posted value is not known zero cost'::text AS valuation_status
      FROM stock_movement_valuation_gaps g
      JOIN stock_movements m ON m.id = g."movementId"
      JOIN stock_occurrences o ON o.id = m."occurrenceId"
      JOIN products p ON p.id = m."productId"
      GROUP BY p.id, p.name
      ORDER BY uncovered_quantity DESC, p.name, p.id$$
END AS query
\gexec

-- IMPORTANT: this context does not prove historical completeness. The dates
-- above and the absence of detected gaps cannot establish complete history.
ROLLBACK;
