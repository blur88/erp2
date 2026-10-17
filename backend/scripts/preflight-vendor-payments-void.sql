-- Deploy gate for #1401. Read-only: it reports and changes nothing.
--
-- Before-check for the vendor-payment void migration. It inventories the rows
-- the migration will touch, reading only columns that exist before the
-- migration (status, "isActive", "deletedAt", amount, "purchaseOrderId").
--
-- PASS: no blocking row. HOLD: any blocking row — record it in #1401 and get a
--       decision before deploy. The migration would abort on it anyway.
-- Every damage row needs a disposition recorded in #1401 before deploy.
-- convert rows are expected: the migration voids them and links the reversal
-- of their expected original. Run this before the migration, not after; the
-- after check is a separate script.
--
-- The entry-lookup rule, for a payment row:
--   expected posting type: amount > 0 -> PURCHASE_PAYMENT, amount < 0 ->
--     PURCHASE_REFUND, amount = 0 -> zero_amount;
--   an original is a journal_entry with sourceType = PURCHASE_ORDER,
--     sourceEventId = the payment id and reversalOfEntryId IS NULL;
--   any original whose posting type is not the expected one ->
--     unexpected_posting_type;
--   the expected original on another document -> foreign_document;
--   "purchaseOrderId" IS NULL -> no_purchase_order.
--
-- One row is reported once. When several shapes match, the first predicate in
-- the CASE order wins: structural blocking shapes, then zero_amount,
-- no_purchase_order, unexpected_posting_type, foreign_document, entry state.
--
-- Result 1 lists one row per finding, ordered by gate, reason, payment_id.
-- journal_entry_ids holds every original of the event and every reversal of
-- those originals. Result 2 counts findings per (gate, reason).
--
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/preflight-vendor-payments-void.sql

BEGIN READ ONLY;

WITH candidates AS (
  SELECT
    vp.id AS payment_id,
    vp."purchaseOrderId" AS purchase_order_id,
    vp.amount,
    vp.status,
    vp."isActive" AS is_active,
    vp."deletedAt" AS deleted_at,
    vp."paymentDate" AS payment_date,
    CASE
      WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
      WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
    END AS expected_type,
    involved.entry_ids,
    involved.posting_types,
    expected.id AS expected_original_id,
    expected."sourceDocumentId" AS expected_original_document,
    expected_reversal.id AS expected_reversal_id,
    other_original.id AS other_original_id,
    (
      SELECT count(*)::int
      FROM vendor_payments sibling
      WHERE sibling."purchaseOrderId" = vp."purchaseOrderId"
        AND sibling."deletedAt" IS NOT NULL
    ) AS soft_deleted_on_po
  FROM vendor_payments vp
  LEFT JOIN LATERAL (
    SELECT
      array_agg(linked.id ORDER BY linked.id) AS entry_ids,
      array_agg(DISTINCT linked."postingType"::text ORDER BY linked."postingType"::text) AS posting_types
    FROM (
      SELECT o.id, o."postingType"
      FROM journal_entry o
      WHERE o."sourceType"::text = 'PURCHASE_ORDER'
        AND o."sourceEventId" = vp.id
        AND o."reversalOfEntryId" IS NULL
      UNION ALL
      SELECT r.id, r."postingType"
      FROM journal_entry r
      JOIN journal_entry o ON o.id = r."reversalOfEntryId"
      WHERE o."sourceType"::text = 'PURCHASE_ORDER'
        AND o."sourceEventId" = vp.id
        AND o."reversalOfEntryId" IS NULL
    ) AS linked
  ) AS involved ON true
  LEFT JOIN LATERAL (
    SELECT o.id, o."sourceDocumentId"
    FROM journal_entry o
    WHERE o."sourceType"::text = 'PURCHASE_ORDER'
      AND o."sourceEventId" = vp.id
      AND o."reversalOfEntryId" IS NULL
      AND o."postingType"::text = CASE
        WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
        WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
      END
    LIMIT 1
  ) AS expected ON true
  LEFT JOIN LATERAL (
    SELECT r.id
    FROM journal_entry r
    WHERE r."reversalOfEntryId" = expected.id
    LIMIT 1
  ) AS expected_reversal ON true
  LEFT JOIN LATERAL (
    SELECT o.id
    FROM journal_entry o
    WHERE o."sourceType"::text = 'PURCHASE_ORDER'
      AND o."sourceEventId" = vp.id
      AND o."reversalOfEntryId" IS NULL
      AND o."postingType"::text IS DISTINCT FROM (CASE
        WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
        WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
      END)
    ORDER BY o.id
    LIMIT 1
  ) AS other_original ON true
),
classified AS (
  SELECT
    c.*,
    CASE
      WHEN c.status = 'voided' THEN 'blocking'
      WHEN c.deleted_at IS NOT NULL AND c.is_active THEN 'blocking'
      WHEN NOT c.is_active AND c.deleted_at IS NULL THEN 'blocking'
      WHEN c.deleted_at IS NOT NULL AND c.status <> 'completed' THEN 'blocking'
      WHEN c.deleted_at IS NOT NULL THEN
        CASE
          WHEN c.amount = 0 THEN 'blocking'
          WHEN c.purchase_order_id IS NULL THEN 'blocking'
          WHEN c.other_original_id IS NOT NULL THEN 'blocking'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'blocking'
          WHEN c.expected_original_id IS NULL THEN 'damage'
          WHEN c.expected_reversal_id IS NOT NULL THEN 'convert'
          ELSE 'damage'
        END
      ELSE
        CASE
          WHEN c.amount = 0 THEN 'damage'
          WHEN c.purchase_order_id IS NULL THEN 'damage'
          WHEN c.other_original_id IS NOT NULL THEN 'damage'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'damage'
          WHEN c.expected_original_id IS NOT NULL AND c.expected_reversal_id IS NOT NULL THEN 'damage'
          WHEN c.expected_original_id IS NULL THEN 'damage'
          WHEN c.soft_deleted_on_po > 0 THEN 'damage'
          ELSE NULL
        END
    END AS gate,
    CASE
      WHEN c.status = 'voided' THEN 'already_voided'
      WHEN c.deleted_at IS NOT NULL AND c.is_active THEN 'soft_deleted_still_active'
      WHEN NOT c.is_active AND c.deleted_at IS NULL THEN 'inactive_not_soft_deleted'
      WHEN c.deleted_at IS NOT NULL AND c.status <> 'completed' THEN 'soft_deleted_not_completed'
      WHEN c.deleted_at IS NOT NULL THEN
        CASE
          WHEN c.amount = 0 THEN 'zero_amount'
          WHEN c.purchase_order_id IS NULL THEN 'no_purchase_order'
          WHEN c.other_original_id IS NOT NULL THEN 'unexpected_posting_type'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'foreign_document'
          WHEN c.expected_original_id IS NULL THEN 'soft_deleted_no_original'
          WHEN c.expected_reversal_id IS NOT NULL THEN 'soft_deleted_linkable'
          ELSE 'soft_deleted_unreversed'
        END
      ELSE
        CASE
          WHEN c.amount = 0 THEN 'live_lookup_rejected'
          WHEN c.purchase_order_id IS NULL THEN 'live_lookup_rejected'
          WHEN c.other_original_id IS NOT NULL THEN 'live_lookup_rejected'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'live_lookup_rejected'
          WHEN c.expected_original_id IS NOT NULL AND c.expected_reversal_id IS NOT NULL THEN 'live_original_reversed'
          WHEN c.expected_original_id IS NULL THEN 'live_without_original'
          WHEN c.soft_deleted_on_po > 0 THEN 'restore_candidate'
          ELSE NULL
        END
    END AS reason
  FROM candidates c
),
findings AS (
  SELECT
    cl.*,
    CASE
      WHEN cl.amount = 0 THEN 'zero_amount'
      WHEN cl.purchase_order_id IS NULL THEN 'no_purchase_order'
      WHEN cl.other_original_id IS NOT NULL THEN 'unexpected_posting_type'
      WHEN cl.expected_original_id IS NOT NULL
        AND cl.expected_original_document IS DISTINCT FROM cl.purchase_order_id THEN 'foreign_document'
    END AS rejection
  FROM classified cl
)
SELECT
  f.gate,
  f.reason,
  f.payment_id,
  f.purchase_order_id,
  COALESCE(f.entry_ids, '{}'::uuid[]) AS journal_entry_ids,
  concat_ws(' | ',
    format('amount=%s', f.amount::text),
    format('expected=%s', COALESCE(f.expected_type, 'zero')),
    format('postingTypes=%s', COALESCE(array_to_string(f.posting_types, ','), 'none')),
    format('paymentDate=%s', f.payment_date::text),
    format('deletedAt=%s', COALESCE(f.deleted_at::text, 'null')),
    format('status=%s', f.status),
    CASE WHEN f.reason = 'live_lookup_rejected' THEN format('rejected=%s', f.rejection) END,
    CASE WHEN f.reason = 'restore_candidate' THEN format('softDeletedOnPo=%s', f.soft_deleted_on_po) END
  ) AS detail
FROM findings f
WHERE f.gate IS NOT NULL
ORDER BY f.gate, f.reason, f.payment_id;

WITH candidates AS (
  SELECT
    vp.id AS payment_id,
    vp."purchaseOrderId" AS purchase_order_id,
    vp.amount,
    vp.status,
    vp."isActive" AS is_active,
    vp."deletedAt" AS deleted_at,
    vp."paymentDate" AS payment_date,
    CASE
      WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
      WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
    END AS expected_type,
    involved.entry_ids,
    involved.posting_types,
    expected.id AS expected_original_id,
    expected."sourceDocumentId" AS expected_original_document,
    expected_reversal.id AS expected_reversal_id,
    other_original.id AS other_original_id,
    (
      SELECT count(*)::int
      FROM vendor_payments sibling
      WHERE sibling."purchaseOrderId" = vp."purchaseOrderId"
        AND sibling."deletedAt" IS NOT NULL
    ) AS soft_deleted_on_po
  FROM vendor_payments vp
  LEFT JOIN LATERAL (
    SELECT
      array_agg(linked.id ORDER BY linked.id) AS entry_ids,
      array_agg(DISTINCT linked."postingType"::text ORDER BY linked."postingType"::text) AS posting_types
    FROM (
      SELECT o.id, o."postingType"
      FROM journal_entry o
      WHERE o."sourceType"::text = 'PURCHASE_ORDER'
        AND o."sourceEventId" = vp.id
        AND o."reversalOfEntryId" IS NULL
      UNION ALL
      SELECT r.id, r."postingType"
      FROM journal_entry r
      JOIN journal_entry o ON o.id = r."reversalOfEntryId"
      WHERE o."sourceType"::text = 'PURCHASE_ORDER'
        AND o."sourceEventId" = vp.id
        AND o."reversalOfEntryId" IS NULL
    ) AS linked
  ) AS involved ON true
  LEFT JOIN LATERAL (
    SELECT o.id, o."sourceDocumentId"
    FROM journal_entry o
    WHERE o."sourceType"::text = 'PURCHASE_ORDER'
      AND o."sourceEventId" = vp.id
      AND o."reversalOfEntryId" IS NULL
      AND o."postingType"::text = CASE
        WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
        WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
      END
    LIMIT 1
  ) AS expected ON true
  LEFT JOIN LATERAL (
    SELECT r.id
    FROM journal_entry r
    WHERE r."reversalOfEntryId" = expected.id
    LIMIT 1
  ) AS expected_reversal ON true
  LEFT JOIN LATERAL (
    SELECT o.id
    FROM journal_entry o
    WHERE o."sourceType"::text = 'PURCHASE_ORDER'
      AND o."sourceEventId" = vp.id
      AND o."reversalOfEntryId" IS NULL
      AND o."postingType"::text IS DISTINCT FROM (CASE
        WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
        WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
      END)
    ORDER BY o.id
    LIMIT 1
  ) AS other_original ON true
),
classified AS (
  SELECT
    c.*,
    CASE
      WHEN c.status = 'voided' THEN 'blocking'
      WHEN c.deleted_at IS NOT NULL AND c.is_active THEN 'blocking'
      WHEN NOT c.is_active AND c.deleted_at IS NULL THEN 'blocking'
      WHEN c.deleted_at IS NOT NULL AND c.status <> 'completed' THEN 'blocking'
      WHEN c.deleted_at IS NOT NULL THEN
        CASE
          WHEN c.amount = 0 THEN 'blocking'
          WHEN c.purchase_order_id IS NULL THEN 'blocking'
          WHEN c.other_original_id IS NOT NULL THEN 'blocking'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'blocking'
          WHEN c.expected_original_id IS NULL THEN 'damage'
          WHEN c.expected_reversal_id IS NOT NULL THEN 'convert'
          ELSE 'damage'
        END
      ELSE
        CASE
          WHEN c.amount = 0 THEN 'damage'
          WHEN c.purchase_order_id IS NULL THEN 'damage'
          WHEN c.other_original_id IS NOT NULL THEN 'damage'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'damage'
          WHEN c.expected_original_id IS NOT NULL AND c.expected_reversal_id IS NOT NULL THEN 'damage'
          WHEN c.expected_original_id IS NULL THEN 'damage'
          WHEN c.soft_deleted_on_po > 0 THEN 'damage'
          ELSE NULL
        END
    END AS gate,
    CASE
      WHEN c.status = 'voided' THEN 'already_voided'
      WHEN c.deleted_at IS NOT NULL AND c.is_active THEN 'soft_deleted_still_active'
      WHEN NOT c.is_active AND c.deleted_at IS NULL THEN 'inactive_not_soft_deleted'
      WHEN c.deleted_at IS NOT NULL AND c.status <> 'completed' THEN 'soft_deleted_not_completed'
      WHEN c.deleted_at IS NOT NULL THEN
        CASE
          WHEN c.amount = 0 THEN 'zero_amount'
          WHEN c.purchase_order_id IS NULL THEN 'no_purchase_order'
          WHEN c.other_original_id IS NOT NULL THEN 'unexpected_posting_type'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'foreign_document'
          WHEN c.expected_original_id IS NULL THEN 'soft_deleted_no_original'
          WHEN c.expected_reversal_id IS NOT NULL THEN 'soft_deleted_linkable'
          ELSE 'soft_deleted_unreversed'
        END
      ELSE
        CASE
          WHEN c.amount = 0 THEN 'live_lookup_rejected'
          WHEN c.purchase_order_id IS NULL THEN 'live_lookup_rejected'
          WHEN c.other_original_id IS NOT NULL THEN 'live_lookup_rejected'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'live_lookup_rejected'
          WHEN c.expected_original_id IS NOT NULL AND c.expected_reversal_id IS NOT NULL THEN 'live_original_reversed'
          WHEN c.expected_original_id IS NULL THEN 'live_without_original'
          WHEN c.soft_deleted_on_po > 0 THEN 'restore_candidate'
          ELSE NULL
        END
    END AS reason
  FROM candidates c
),
findings AS (
  SELECT
    cl.*,
    CASE
      WHEN cl.amount = 0 THEN 'zero_amount'
      WHEN cl.purchase_order_id IS NULL THEN 'no_purchase_order'
      WHEN cl.other_original_id IS NOT NULL THEN 'unexpected_posting_type'
      WHEN cl.expected_original_id IS NOT NULL
        AND cl.expected_original_document IS DISTINCT FROM cl.purchase_order_id THEN 'foreign_document'
    END AS rejection
  FROM classified cl
)
SELECT
  f.gate,
  f.reason,
  count(*)::int AS count
FROM findings f
WHERE f.gate IS NOT NULL
GROUP BY f.gate, f.reason
ORDER BY f.gate, f.reason;

ROLLBACK;
