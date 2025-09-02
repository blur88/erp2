-- Fix category hierarchy paths
-- This script rebuilds all category paths to ensure proper hierarchical ordering

-- First, fix all paths using a recursive CTE
WITH RECURSIVE category_paths AS (
  -- Base case: root categories (parentId is NULL)
  SELECT 
    id,
    name,
    "parentId",
    level,
    name as calculated_path
  FROM categories 
  WHERE "parentId" IS NULL

  UNION ALL
  
  -- Recursive case: child categories
  SELECT 
    c.id,
    c.name,
    c."parentId",
    c.level,
    cp.calculated_path || '.' || c.name as calculated_path
  FROM categories c
  INNER JOIN category_paths cp ON c."parentId" = cp.id
)
UPDATE categories 
SET path = cp.calculated_path,
    "updatedAt" = NOW()
FROM category_paths cp 
WHERE categories.id = cp.id;

-- Show the results
SELECT 
  id, 
  name, 
  "parentId", 
  level, 
  path,
  "sortOrder"
FROM categories 
ORDER BY 
  COALESCE(path, name) ASC,
  level ASC,
  "sortOrder" ASC,
  name ASC
LIMIT 30;