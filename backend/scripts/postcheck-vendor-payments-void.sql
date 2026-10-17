-- Deploy gate for #1401. Read-only: it reports and changes nothing.
--
-- After-check for the vendor-payment void migration. Run it after the
-- migration, with the before check's findings and dispositions as the
-- baseline. The before check run after the migration is NOT the validation;
-- this script is. It reads the post-migration shape: the void columns, the
-- two CHECKs, the live predicate ("status" <> 'voided') and paidAmount sums.
--
-- PASS: no `new` row. Any `new` row: stop and report it in #1401; roll back
--       only by decision (migration:revert is allowed only while no
--       application void exists). `dispositioned` rows are baseline findings
--       that are still present and were dispositioned before deploy;
--       `resolved` rows are baseline keys no longer found (informational).
--
-- Baseline: the before check's damage findings and their dispositions, as a
-- JSON array [{ "payment_id": "<uuid>", "reason": "<before-check reason>",
-- "disposition": "<text>" }]. Pass the file through the psql variable:
--
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -v baseline="$(cat vp-void-baseline.json)" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/postcheck-vendor-payments-void.sql
--
-- The baseline file holds production ids: it lives with the deploy record in
-- #1401, not in the repository. A missing variable is a psql error (the
-- unresolved :'baseline' reaches the server as SQL and fails), never an empty
-- baseline; an empty baseline must be passed explicitly as []. A malformed
-- baseline -- a value that is not an array, an entry without a uuid
-- payment_id, a reason that is not a before-check damage reason, or an empty
-- disposition -- is rejected before any finding is reported.
--
-- No time input: whether a finding is new is decided only by the
-- (payment_id, reason) key, never by createdAt or the migration time.
-- `soft_deleted_unreversed` in the baseline carries over to
-- `voided_original_unreversed` (dispositioned when that key is present).
-- `paid_amount_mismatch` has a NULL payment_id and is keyed by
-- (purchase_order_id, reason), so no before-check reason carries over to it
-- and it is always new.
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
-- One row is reported once. A row that is voided and well-formed is not a
-- finding. When several shapes match, the first predicate in the CASE order
-- wins: soft_deleted_row_remains, voided link state, voided unreversed, then
-- zero_amount, no_purchase_order, unexpected_posting_type, foreign_document,
-- live entry state.
--
-- The single result set lists one row per finding: gate, reason, payment_id,
-- purchase_order_id, journal_entry_ids, detail, status. gate is 'blocking'
-- for a new finding and 'damage' otherwise; status is new | dispositioned |
-- resolved, new first. journal_entry_ids holds every original of the event
-- and every reversal of those originals. Rows are ordered by status, reason,
-- payment_id, purchase_order_id.
--
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -v baseline="$(cat vp-void-baseline.json)" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/postcheck-vendor-payments-void.sql

BEGIN READ ONLY;

WITH baseline AS (
  SELECT :'baseline'::jsonb AS value
),
entry_problems AS (
  SELECT
    t.ordinality::int AS position,
    CASE
      WHEN jsonb_typeof(t.entry) <> 'object' THEN 'entry is not a JSON object'
      WHEN t.entry->>'payment_id' IS NULL
        OR t.entry->>'payment_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN format('payment_id %s is not a uuid', COALESCE(t.entry->>'payment_id', 'missing'))
      WHEN t.entry->>'reason' IS NULL
        OR t.entry->>'reason' NOT IN (
          'live_original_reversed',
          'live_without_original',
          'live_lookup_rejected',
          'soft_deleted_unreversed',
          'soft_deleted_no_original',
          'restore_candidate'
        )
        THEN format('reason %s is not a before-check damage reason', COALESCE(t.entry->>'reason', 'missing'))
      WHEN t.entry->>'disposition' IS NULL OR btrim(t.entry->>'disposition') = ''
        THEN 'disposition is empty'
    END AS problem
  FROM baseline,
       jsonb_array_elements(
         CASE WHEN jsonb_typeof(value) = 'array' THEN value END
       ) WITH ORDINALITY AS t(entry, ordinality)
),
problems AS (
  SELECT
    0 AS position,
    format('baseline is %s, not a JSON array', COALESCE(jsonb_typeof(value)::text, 'missing')) AS problem
  FROM baseline
  WHERE jsonb_typeof(value) IS DISTINCT FROM 'array'
  UNION ALL
  SELECT position, problem FROM entry_problems WHERE problem IS NOT NULL
)
-- A malformed baseline must abort the run before any finding is reported.
-- psql does not substitute :'baseline' inside a dollar-quoted DO body, so the
-- abort is forced through current_setting() of a parameter name that carries
-- every problem text.
SELECT current_setting(
         format(
           'postcheck-vendor-payments-void.sql: malformed baseline: %s',
           string_agg(format('entry %s: %s', position, problem), ', ' ORDER BY position)
         )
       ) AS rejection
FROM problems
HAVING count(*) > 0;

WITH baseline_entries AS (
  SELECT
    (t.entry->>'payment_id')::uuid AS payment_id,
    t.entry->>'reason' AS reason,
    t.entry->>'disposition' AS disposition,
    t.ordinality::int AS position
  FROM jsonb_array_elements(:'baseline'::jsonb) WITH ORDINALITY AS t(entry, ordinality)
),
baseline AS (
  SELECT DISTINCT ON (payment_id, reason)
    payment_id,
    reason,
    disposition
  FROM baseline_entries
  ORDER BY payment_id, reason, position
),
candidates AS (
  SELECT
    vp.id AS payment_id,
    vp."purchaseOrderId" AS purchase_order_id,
    vp.amount,
    vp.status,
    vp."deletedAt" AS deleted_at,
    vp."voidedAt" AS voided_at,
    vp."voidReversalEntryId" AS void_reversal_entry_id,
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
    link_reversal."reversalOfEntryId" AS link_reversal_of
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
    ORDER BY o.id
    LIMIT 1
  ) AS expected ON true
  LEFT JOIN LATERAL (
    SELECT r.id
    FROM journal_entry r
    WHERE r."reversalOfEntryId" = expected.id
    ORDER BY r.id
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
  LEFT JOIN journal_entry link_reversal ON link_reversal.id = vp."voidReversalEntryId"
),
classified AS (
  SELECT
    c.*,
    CASE
      WHEN c.deleted_at IS NOT NULL THEN 'soft_deleted_row_remains'
      WHEN c.status = 'voided' THEN
        CASE
          WHEN c.void_reversal_entry_id IS NOT NULL
            AND (c.expected_original_id IS NULL
              OR c.link_reversal_of IS DISTINCT FROM c.expected_original_id)
            THEN 'voided_link_not_own_reversal'
          WHEN c.void_reversal_entry_id IS NULL AND c.expected_reversal_id IS NOT NULL
            THEN 'voided_link_not_own_reversal'
          WHEN c.expected_original_id IS NOT NULL AND c.expected_reversal_id IS NULL
            THEN 'voided_original_unreversed'
        END
      ELSE
        CASE
          WHEN c.amount = 0 THEN 'live_lookup_rejected'
          WHEN c.purchase_order_id IS NULL THEN 'live_lookup_rejected'
          WHEN c.other_original_id IS NOT NULL THEN 'live_lookup_rejected'
          WHEN c.expected_original_id IS NOT NULL
            AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id
            THEN 'live_lookup_rejected'
          WHEN c.expected_original_id IS NOT NULL AND c.expected_reversal_id IS NOT NULL
            THEN 'live_original_reversed'
          WHEN c.expected_original_id IS NULL THEN 'live_without_original'
        END
    END AS reason,
    CASE
      WHEN c.amount = 0 THEN 'zero_amount'
      WHEN c.purchase_order_id IS NULL THEN 'no_purchase_order'
      WHEN c.other_original_id IS NOT NULL THEN 'unexpected_posting_type'
      WHEN c.expected_original_id IS NOT NULL
        AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'foreign_document'
    END AS rejection
  FROM candidates c
),
findings AS (
  SELECT
    cl.payment_id,
    cl.purchase_order_id,
    cl.reason,
    COALESCE(cl.entry_ids, '{}'::uuid[]) AS journal_entry_ids,
    concat_ws(' | ',
      format('amount=%s', cl.amount::text),
      format('expected=%s', COALESCE(cl.expected_type, 'zero')),
      format('postingTypes=%s', COALESCE(array_to_string(cl.posting_types, ','), 'none')),
      format('paymentDate=%s', cl.payment_date::text),
      format('status=%s', cl.status),
      CASE WHEN cl.status = 'voided'
           THEN format('voidedAt=%s', COALESCE(cl.voided_at::text, 'null')) END,
      CASE WHEN cl.status = 'voided'
           THEN format('voidReversalEntryId=%s', COALESCE(cl.void_reversal_entry_id::text, 'null')) END,
      CASE WHEN cl.reason = 'live_lookup_rejected'
           THEN format('rejected=%s', cl.rejection) END
    ) AS detail
  FROM classified cl
  WHERE cl.reason IS NOT NULL
),
po_sums AS (
  SELECT
    p.id AS purchase_order_id,
    p."paidAmount" AS paid_amount,
    COALESCE(sum(vp.amount) FILTER (WHERE vp.status <> 'voided'), 0) AS live_sum
  FROM purchase_orders p
  LEFT JOIN vendor_payments vp ON vp."purchaseOrderId" = p.id
  GROUP BY p.id, p."paidAmount"
),
po_findings AS (
  SELECT
    NULL::uuid AS payment_id,
    s.purchase_order_id,
    'paid_amount_mismatch' AS reason,
    '{}'::uuid[] AS journal_entry_ids,
    format('paidAmount=%s | liveSum=%s', s.paid_amount::text, s.live_sum::text) AS detail
  FROM po_sums s
  WHERE s.paid_amount IS DISTINCT FROM s.live_sum
),
all_findings AS (
  SELECT * FROM findings
  UNION ALL
  SELECT * FROM po_findings
),
matched AS (
  SELECT
    f.*,
    CASE WHEN b.payment_id IS NULL THEN 'new' ELSE 'dispositioned' END AS status,
    b.disposition
  FROM all_findings f
  LEFT JOIN baseline b
    ON b.payment_id = f.payment_id
   AND b.reason = CASE
     WHEN f.reason = 'voided_original_unreversed' THEN 'soft_deleted_unreversed'
     ELSE f.reason
   END
),
resolved AS (
  SELECT
    b.payment_id,
    NULL::uuid AS purchase_order_id,
    b.reason,
    '{}'::uuid[] AS journal_entry_ids,
    format('resolved: no current finding | disposition=%s', b.disposition) AS detail,
    'resolved' AS status,
    NULL::text AS disposition
  FROM baseline b
  WHERE NOT EXISTS (
    SELECT 1
    FROM all_findings f
    WHERE f.payment_id = b.payment_id
      AND (CASE
        WHEN f.reason = 'voided_original_unreversed' THEN 'soft_deleted_unreversed'
        ELSE f.reason
      END) = b.reason
  )
)
SELECT
  gate,
  reason,
  payment_id,
  purchase_order_id,
  journal_entry_ids,
  detail,
  status
FROM (
  SELECT
    CASE WHEN m.status = 'new' THEN 'blocking' ELSE 'damage' END AS gate,
    m.reason,
    m.payment_id,
    m.purchase_order_id,
    m.journal_entry_ids,
    CASE WHEN m.status = 'dispositioned'
         THEN concat_ws(' | ', m.detail, format('disposition=%s', m.disposition))
         ELSE m.detail END AS detail,
    m.status
  FROM matched m
  UNION ALL
  SELECT
    'damage' AS gate,
    r.reason,
    r.payment_id,
    r.purchase_order_id,
    r.journal_entry_ids,
    r.detail,
    r.status
  FROM resolved r
) AS findings
ORDER BY
  CASE status WHEN 'new' THEN 0 WHEN 'dispositioned' THEN 1 ELSE 2 END,
  reason,
  payment_id NULLS LAST,
  purchase_order_id NULLS LAST,
  journal_entry_ids;

ROLLBACK;
