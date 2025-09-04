-- Fix specific known hierarchy paths manually

-- Update Electronics -> Computers path
UPDATE categories 
SET path = 'Electronics.Computers'
WHERE id = 'c8852d57-d15f-491d-9294-79a762f03e08' AND name = 'Computers';

-- Update Electronics -> Computers -> Laptops path  
UPDATE categories 
SET path = 'Electronics.Computers.Laptops'
WHERE id = '83e2a6ac-885b-4778-9e1e-719c46b46bf6' AND name = 'Laptops';

-- Update Gaming Laptops path
UPDATE categories 
SET path = 'Electronics.Computers.Laptops.Gaming Laptops'
WHERE id = '97e78a2e-4d53-4d92-87ac-77ab4cc24d51' AND name = 'Gaming Laptops';

-- Update Business Laptops path
UPDATE categories 
SET path = 'Electronics.Computers.Laptops.Business Laptops'
WHERE id = 'eccb5f41-06be-422d-aa49-1a2ebf86cb7a' AND name = 'Business Laptops';

-- Set empty path to name for root categories that have null paths
UPDATE categories SET path = name WHERE "parentId" IS NULL AND (path IS NULL OR path = '');

-- Show the fixed hierarchy
SELECT 
  name, 
  level, 
  path,
  "sortOrder" 
FROM categories 
WHERE name IN ('Electronics', 'Mobile Phones', 'Computers', 'Laptops', 'Gaming Laptops', 'Business Laptops')
ORDER BY COALESCE(path, name) ASC;