-- Run from the repository root against the development database:
-- docker compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backend/scripts/preflight-stock-constraints-1414.sql
BEGIN READ ONLY;
SHOW transaction_read_only;

WITH expected(name, table_name, kind, definition, source_column, target_table, target_column) AS (
  VALUES
    ('FK_stock_occurrences_legacy_journal', 'stock_occurrences', 'f',
     'FOREIGN KEY ("legacyJournalEntryId") REFERENCES journal_entry(id) ON DELETE RESTRICT',
     'legacyJournalEntryId', 'journal_entry', 'id'),
    ('CHK_stock_occurrence_reversal_reason_length', 'stock_occurrences', 'c',
     'CHECK (((kind <> ALL (ARRAY[''receipt_reversal''::stock_occurrences_kind_enum, ''fulfilment_reversal''::stock_occurrences_kind_enum])) OR ((reason IS NOT NULL) AND ((char_length(btrim(reason)) >= 3) AND (char_length(btrim(reason)) <= 500)))))',
     NULL, NULL, NULL),
    ('CHK_stock_batch_consumptions_quantity_positive', 'stock_batch_consumptions', 'c',
     'CHECK ((quantity > (0)::numeric))', NULL, NULL, NULL),
    ('FK_purchase_cost_history_occurrence', 'purchase_cost_history', 'f',
     'FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT',
     'occurrenceId', 'stock_occurrences', 'id')
), catalog AS (
  SELECT c.*, t.relname AS table_name, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
  WHERE c.connamespace = 'public'::regnamespace
), statuses AS (
  SELECT e.name, e.table_name,
    CASE WHEN named.total = 1 AND named.matches = 1 THEN 'present'
         WHEN named.total > 0 OR equivalent.found THEN 'conflict' ELSE 'absent' END AS status,
    CASE WHEN named.total = 1 AND named.matches = 1 THEN 'validated expected definition'
         WHEN named.total > 0 THEN 'name exists with wrong table, kind, definition, or validation'
         WHEN equivalent.found THEN 'equivalent constraint exists under another name'
         ELSE 'expected constraint is absent' END AS detail
  FROM expected e
  CROSS JOIN LATERAL (
    SELECT count(*) AS total, count(*) FILTER (WHERE c.table_name = e.table_name
      AND c.contype::text = e.kind AND c.convalidated AND c.definition = e.definition) AS matches
    FROM catalog c WHERE c.conname = e.name
  ) named
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM catalog c
      WHERE c.table_name = e.table_name AND c.conname <> e.name AND c.contype::text = e.kind
        AND ((e.kind = 'c' AND c.definition = e.definition)
          OR (e.kind = 'f'
            AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = e.source_column)]::smallint[]
            AND c.confrelid = to_regclass('public.' || e.target_table)
            AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = e.target_column)]::smallint[]))) AS found
  ) equivalent
)
SELECT 'constraint_status' AS section, name AS constraint_name, table_name, status, detail
FROM statuses ORDER BY name;

SELECT 'rule_violations' AS section, 'FK_stock_occurrences_legacy_journal' AS rule,
       count(*) FILTER (WHERE o."legacyJournalEntryId" IS NOT NULL)::bigint AS scoped_rows,
       count(*) FILTER (WHERE o."legacyJournalEntryId" IS NOT NULL AND j.id IS NULL)::bigint AS violations
FROM public.stock_occurrences o LEFT JOIN public.journal_entry j ON j.id = o."legacyJournalEntryId"
UNION ALL
SELECT 'rule_violations', 'CHK_stock_occurrence_reversal_reason_length',
       count(*) FILTER (WHERE o.kind::text IN ('receipt_reversal', 'fulfilment_reversal'))::bigint,
       count(*) FILTER (WHERE o.kind::text IN ('receipt_reversal', 'fulfilment_reversal')
         AND (o.reason IS NULL OR char_length(btrim(o.reason)) NOT BETWEEN 3 AND 500))::bigint
FROM public.stock_occurrences o
UNION ALL
SELECT 'rule_violations', 'CHK_stock_batch_consumptions_quantity_positive', count(*)::bigint,
       count(*) FILTER (WHERE c.quantity <= 0 OR c.quantity IS NULL)::bigint
FROM public.stock_batch_consumptions c
UNION ALL
SELECT 'rule_violations', 'FK_purchase_cost_history_occurrence',
       count(*) FILTER (WHERE b."occurrenceId" IS NOT NULL)::bigint,
       count(*) FILTER (WHERE b."occurrenceId" IS NOT NULL AND o.id IS NULL)::bigint
FROM public.purchase_cost_history b LEFT JOIN public.stock_occurrences o ON o.id = b."occurrenceId";

WITH expected(name, table_name, kind, definition, source_column, target_table, target_column) AS (
  VALUES
    ('FK_stock_occurrences_legacy_journal', 'stock_occurrences', 'f',
     'FOREIGN KEY ("legacyJournalEntryId") REFERENCES journal_entry(id) ON DELETE RESTRICT',
     'legacyJournalEntryId', 'journal_entry', 'id'),
    ('CHK_stock_occurrence_reversal_reason_length', 'stock_occurrences', 'c',
     'CHECK (((kind <> ALL (ARRAY[''receipt_reversal''::stock_occurrences_kind_enum, ''fulfilment_reversal''::stock_occurrences_kind_enum])) OR ((reason IS NOT NULL) AND ((char_length(btrim(reason)) >= 3) AND (char_length(btrim(reason)) <= 500)))))',
     NULL, NULL, NULL),
    ('CHK_stock_batch_consumptions_quantity_positive', 'stock_batch_consumptions', 'c',
     'CHECK ((quantity > (0)::numeric))', NULL, NULL, NULL),
    ('FK_purchase_cost_history_occurrence', 'purchase_cost_history', 'f',
     'FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT',
     'occurrenceId', 'stock_occurrences', 'id')
), catalog AS (
  SELECT c.*, t.relname AS table_name, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
  WHERE c.connamespace = 'public'::regnamespace
), statuses AS (
  SELECT e.name,
    CASE WHEN named.total = 1 AND named.matches = 1 THEN 'present'
         WHEN named.total > 0 OR equivalent.found THEN 'conflict' ELSE 'absent' END AS status
  FROM expected e
  CROSS JOIN LATERAL (
    SELECT count(*) AS total, count(*) FILTER (WHERE c.table_name = e.table_name
      AND c.contype::text = e.kind AND c.convalidated AND c.definition = e.definition) AS matches
    FROM catalog c WHERE c.conname = e.name
  ) named
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM catalog c
      WHERE c.table_name = e.table_name AND c.conname <> e.name AND c.contype::text = e.kind
        AND ((e.kind = 'c' AND c.definition = e.definition)
          OR (e.kind = 'f'
            AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = e.source_column)]::smallint[]
            AND c.confrelid = to_regclass('public.' || e.target_table)
            AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = e.target_column)]::smallint[]))) AS found
  ) equivalent
), violations(rule, violations) AS (
  SELECT 'FK_stock_occurrences_legacy_journal', count(*) FILTER (WHERE o."legacyJournalEntryId" IS NOT NULL AND j.id IS NULL)::bigint
  FROM public.stock_occurrences o LEFT JOIN public.journal_entry j ON j.id = o."legacyJournalEntryId"
  UNION ALL
  SELECT 'CHK_stock_occurrence_reversal_reason_length', count(*) FILTER (WHERE o.kind::text IN ('receipt_reversal', 'fulfilment_reversal')
    AND (o.reason IS NULL OR char_length(btrim(o.reason)) NOT BETWEEN 3 AND 500))::bigint FROM public.stock_occurrences o
  UNION ALL
  SELECT 'CHK_stock_batch_consumptions_quantity_positive', count(*) FILTER (WHERE c.quantity <= 0 OR c.quantity IS NULL)::bigint
  FROM public.stock_batch_consumptions c
  UNION ALL
  SELECT 'FK_purchase_cost_history_occurrence', count(*) FILTER (WHERE b."occurrenceId" IS NOT NULL AND o.id IS NULL)::bigint
  FROM public.purchase_cost_history b LEFT JOIN public.stock_occurrences o ON o.id = b."occurrenceId"
)
SELECT 'verdict' AS section,
       CASE WHEN EXISTS (SELECT 1 FROM statuses WHERE status = 'conflict')
                  OR EXISTS (SELECT 1 FROM violations WHERE violations > 0) THEN 'HOLD' ELSE 'PROCEED' END AS verdict,
       CASE WHEN EXISTS (SELECT 1 FROM statuses WHERE status = 'conflict')
                  OR EXISTS (SELECT 1 FROM violations WHERE violations > 0)
            THEN 'A constraint conflict or rule violation requires an owner decision.'
            ELSE 'No conflicts or rule violations were found.' END AS reason;
ROLLBACK;
