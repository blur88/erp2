-- #1398 P4 stage 1. Read-only ledger and stock valuation consistency report.
\set ON_ERROR_STOP on
SELECT COALESCE((SELECT status='active' FROM inventory_valuation_state WHERE id=true),false) AS valuation_active \gset
\if :valuation_active
WITH balances AS (
  SELECT b."productId", b.method, b."quantityOnHand" AS qty, b."valueOnHand" AS value,
         p."stockQuantity" AS physical_qty,
         COALESCE((SELECT SUM(h."remainingQuantity") FROM purchase_cost_history h WHERE h."productId"=b."productId"),0) AS batch_qty,
         COALESCE((SELECT SUM(l."remainingValue") FROM inventory_cost_layers l WHERE l."productId"=b."productId" AND l."remainingQuantity">0),0) AS layer_value,
         COALESCE((SELECT SUM(e.value) FROM stock_valuation_entries e WHERE e."productId"=b."productId"),0) AS entry_value,
         (SELECT e."runningValue" FROM stock_valuation_entries e WHERE e."productId"=b."productId" ORDER BY e."createdAt" DESC,e.id DESC LIMIT 1) AS last_running_value
    FROM product_valuation_balances b JOIN products p ON p.id=b."productId"
), checks AS (
  SELECT '1' AS invariant, "productId", (entry_value=value AND last_running_value=value) AS ok,
         format('entries=%s last=%s balance=%s',entry_value,last_running_value,value) AS details FROM balances
  UNION ALL
  SELECT '2', "productId", (qty=physical_qty AND qty=batch_qty),
         format('valuation=%s stock=%s batches=%s',qty,physical_qty,batch_qty) FROM balances
  UNION ALL
  SELECT '3', "productId", (method<>'FIFO' OR value=layer_value),
         format('method=%s balance=%s layers=%s',method,value,layer_value) FROM balances
), inv AS (
  SELECT "inventoryAccountId" AS account_id FROM accounting_settings WHERE id=true
), postings AS (
  SELECT e.id,
         COALESCE((SELECT SUM(l.debit) FROM journal_entry_line l,inv WHERE l."entryId"=e.id AND l."accountId"=inv.account_id AND l."deletedAt" IS NULL AND l."isActive"=true),0) AS actual_debit,
         COALESCE((SELECT SUM(l.credit) FROM journal_entry_line l,inv WHERE l."entryId"=e.id AND l."accountId"=inv.account_id AND l."deletedAt" IS NULL AND l."isActive"=true),0) AS actual_credit,
         COALESCE((SELECT SUM(CASE WHEN v.value>0 THEN v.value ELSE 0 END) FROM stock_valuation_entries v WHERE v."journalEntryId"=e.id),0) AS expected_debit,
         COALESCE((SELECT SUM(CASE WHEN v.value<0 THEN -v.value ELSE 0 END) FROM stock_valuation_entries v WHERE v."journalEntryId"=e.id),0) AS expected_credit
    FROM journal_entry e WHERE EXISTS(SELECT 1 FROM journal_entry_line l,inv WHERE l."entryId"=e.id AND l."accountId"=inv.account_id AND l."deletedAt" IS NULL AND l."isActive"=true)
), checks4 AS (
  SELECT '4' AS invariant, NULL::uuid AS "productId", bool_and(actual_debit=expected_debit AND actual_credit=expected_credit) AS ok,
         COALESCE(string_agg(format('%s Dr %s/%s Cr %s/%s',id,actual_debit,expected_debit,actual_credit,expected_credit),'; '),'no inventory postings') AS details FROM postings
), checks5 AS (
  SELECT '5' AS invariant, NULL::uuid AS "productId",
         COALESCE((SELECT SUM(value) FROM balances),0)=COALESCE((SELECT SUM(l.debit-l.credit) FROM journal_entry_line l,inv WHERE l."accountId"=inv.account_id AND l."deletedAt" IS NULL AND l."isActive"=true),0) AS ok,
         format('valuation=%s control=%s',(SELECT COALESCE(SUM(value),0) FROM balances),(SELECT COALESCE(SUM(l.debit-l.credit),0) FROM journal_entry_line l,inv WHERE l."accountId"=inv.account_id AND l."deletedAt" IS NULL AND l."isActive"=true)) AS details
)
SELECT invariant, COALESCE("productId"::text,'all') AS product_id, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, details FROM checks
UNION ALL SELECT invariant,COALESCE("productId"::text,'all'),CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,details FROM checks4
UNION ALL SELECT invariant,COALESCE("productId"::text,'all'),CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,details FROM checks5
ORDER BY invariant,product_id;
\else
\echo INACTIVE: nothing to check
\endif
