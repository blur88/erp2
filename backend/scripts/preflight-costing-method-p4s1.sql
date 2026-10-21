-- #1398 P4 stage 1: stop deployment if a regional setting uses an unsupported method.
-- Read-only by design. Resolve every listed row before applying the migration.
BEGIN READ ONLY;

SELECT id, "costingMethod"
  FROM regional_settings
 WHERE "costingMethod" NOT IN ('AVERAGE', 'FIFO')
 ORDER BY id;

SELECT CASE WHEN EXISTS (
  SELECT 1 FROM regional_settings WHERE "costingMethod" NOT IN ('AVERAGE', 'FIFO')
) THEN 'HOLD: resolve unsupported costing methods before deployment'
  ELSE 'PASS: all costing methods are AVERAGE or FIFO'
END AS result;

ROLLBACK;
