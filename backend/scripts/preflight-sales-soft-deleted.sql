-- Deploy gate for #1390. Read-only: it reports and changes nothing.
--
-- #1390 removes soft delete, restore and permanent delete from the sales
-- module. A customer, sales order or payment that is already soft-deleted
-- ("deletedAt" IS NOT NULL) stays hidden from every list after that deploy, and
-- the application no longer has a way to restore or remove it.
--
-- PASS: all three counts are 0 and the second result has no rows.
-- HOLD: anything else. Do not deploy; record the counts and ids below and get a
--       disposition decision. Do not restore or purge rows to make this pass.
--
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/preflight-sales-soft-deleted.sql

BEGIN READ ONLY;

SELECT 'customers' AS table_name, count(*) AS soft_deleted
  FROM customers WHERE "deletedAt" IS NOT NULL
UNION ALL
SELECT 'sales_orders', count(*) FROM sales_orders WHERE "deletedAt" IS NOT NULL
UNION ALL
SELECT 'payments', count(*) FROM payments WHERE "deletedAt" IS NOT NULL
ORDER BY table_name;

SELECT table_name, id, "deletedAt", label
  FROM (
    SELECT 'customers' AS table_name, id, "deletedAt", name::text AS label
      FROM customers WHERE "deletedAt" IS NOT NULL
    UNION ALL
    SELECT 'sales_orders', id, "deletedAt", "orderNumber"::text
      FROM sales_orders WHERE "deletedAt" IS NOT NULL
    UNION ALL
    SELECT 'payments', id, "deletedAt", amount::text
      FROM payments WHERE "deletedAt" IS NOT NULL
  ) AS soft_deleted
 ORDER BY table_name, "deletedAt", id;

ROLLBACK;
