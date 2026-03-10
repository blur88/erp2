# Remove Pagination + Fix New Product Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove backend pagination from the products endpoint so all products are always returned, fixing the bug where newly created products fail to highlight in the list (Issue #63).

**Architecture:** Strip `page`/`limit` from `QueryProductsDto` and `ProductListResponseDto`, remove `.skip().take()` from the query builders in `product.service.ts`, then clean up all the now-dead pagination-handling code on the frontend (the `fetchProductById` fallback path, `pendingProductId`, `hasNavigatedWithSelection`, and `hasRestoredSelection` states).

**Tech Stack:** NestJS 11 (backend), React 18 + RTK Query + Redux Toolkit (frontend), Vitest (frontend tests), Jest (backend tests)

---

### Task 1: Remove pagination fields from the backend DTO

**Files:**
- Modify: `backend/src/modules/inventory/dto/product.dto.ts:71-84` (QueryProductsDto)
- Modify: `backend/src/modules/inventory/dto/product.dto.ts:229-242` (ProductListResponseDto meta)

**Step 1: Remove `page` and `limit` from `QueryProductsDto`**

In `product.dto.ts`, find `QueryProductsDto` and delete these lines:

```typescript
// DELETE these two property blocks:
@ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
@IsOptional()
@Type(() => Number)
@IsNumber()
@Min(1)
page?: number = 1;

@ApiPropertyOptional({ description: 'Items per page', minimum: 1, default: 20 })
@IsOptional()
@Type(() => Number)
@IsNumber()
@Min(1)
limit?: number = 20;
```

**Step 2: Simplify `ProductListResponseDto` meta**

Replace the full meta type with just `total`:

```typescript
// BEFORE:
@ApiProperty({ description: 'Pagination metadata' })
meta: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// AFTER:
@ApiProperty({ description: 'Response metadata' })
meta: {
  total: number;
};
```

**Step 3: Run TypeScript check to see compilation errors**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors pointing to the service file (which still references `page`, `limit` etc.) — that's fine, we fix those next.

**Step 4: Commit**

```bash
git add backend/src/modules/inventory/dto/product.dto.ts
git commit -m "refactor(inventory): remove page/limit from QueryProductsDto and simplify meta"
```

---

### Task 2: Remove pagination logic from `product.service.ts` — `findAll`

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts:210-300`

**Step 1: Update the `findAll` method**

Remove `page` and `limit` from the destructure and remove the skip/take/meta calculation:

```typescript
// BEFORE (lines ~212-300):
async findAll(query: QueryProductsDto): Promise<ProductListResponseDto> {
  const {
    page = 1,
    limit = 20,
    search,
    // ... other fields
  } = query;
  // ...
  const offset = (page - 1) * limit;
  queryBuilder.skip(offset).take(limit);

  const [products, total] = await queryBuilder.getManyAndCount();
  const data = products.map(product => this.toResponseDto(product));
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    },
  };
}

// AFTER:
async findAll(query: QueryProductsDto): Promise<ProductListResponseDto> {
  const {
    search,
    categoryId,
    type,
    isActive,
    outOfStock,
    sortBy = 'name',
    sortOrder = 'ASC',
    minStock,
    maxStock,
    minPrice,
    maxPrice,
  } = query;

  // ... (keep all the queryBuilder filter/sort logic unchanged) ...

  // Remove the .skip().take() line entirely

  const [products, total] = await queryBuilder.getManyAndCount();
  const data = products.map(product => this.toResponseDto(product));
  return {
    data,
    meta: { total },
  };
}
```

**Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Expected: fewer errors — `findAll` should now be clean.

**Step 3: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts
git commit -m "refactor(inventory): remove pagination from product findAll"
```

---

### Task 3: Remove pagination logic from `product.service.ts` — `findDeleted`

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts:430-500`

**Step 1: Update the `findDeleted` method**

Same pattern as Task 2 — remove `page`/`limit` from destructure, remove `.skip().take()`, simplify meta:

```typescript
// BEFORE:
async findDeleted(query: QueryProductsDto): Promise<ProductListResponseDto> {
  const {
    page = 1,
    limit = 20,
    search,
    // ...
  } = query;
  // ...
  const offset = (page - 1) * limit;
  queryBuilder.skip(offset).take(limit);
  const [deletedProducts, total] = await queryBuilder.getManyAndCount();
  return {
    data: productDtos,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    },
  };
}

// AFTER:
async findDeleted(query: QueryProductsDto): Promise<ProductListResponseDto> {
  const {
    search,
    categoryId,
    type,
    sortBy = 'deletedAt',
    sortOrder = 'DESC',
  } = query;
  // ... (keep all filters/sorting unchanged) ...
  const [deletedProducts, total] = await queryBuilder.getManyAndCount();
  const productDtos = deletedProducts.map(product => this.toResponseDto(product));
  return {
    data: productDtos,
    meta: { total },
  };
}
```

**Step 2: Run TypeScript check — should be clean**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors (or only unrelated errors).

**Step 3: Run backend tests**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: all pass.

**Step 4: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts
git commit -m "refactor(inventory): remove pagination from product findDeleted"
```

---

### Task 4: Update `PaginatedResponse` type and `normalizePaginated` on the frontend

**Files:**
- Modify: `frontend/src/types/index.ts:509-518`
- Modify: `frontend/src/store/api/normalizers.ts`

**Step 1: Simplify `PaginatedResponse` meta type**

In `frontend/src/types/index.ts`, update the interface:

```typescript
// BEFORE:
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// AFTER:
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
  };
}
```

**Step 2: Simplify `normalizePaginated` in `normalizers.ts`**

```typescript
// BEFORE:
export function normalizePaginated<T>(response: any): PaginatedResponse<T> {
  if (response && Array.isArray(response.data)) {
    return {
      data: response.data,
      meta: response.meta ?? { page: 1, limit: 20, total: response.data.length, totalPages: 1 },
    }
  }
  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { page: 1, limit: response.length, total: response.length, totalPages: 1 },
    }
  }
  return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }
}

// AFTER:
export function normalizePaginated<T>(response: any): PaginatedResponse<T> {
  if (response && Array.isArray(response.data)) {
    return {
      data: response.data,
      meta: { total: response.meta?.total ?? response.data.length },
    }
  }
  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { total: response.length },
    }
  }
  return { data: [], meta: { total: 0 } }
}
```

**Step 3: Run TypeScript check to find all broken usages**

```bash
cd frontend && npm run type-check 2>&1 | head -50
```

Expected: compilation errors in files that still reference `meta.page`, `meta.limit`, `meta.totalPages` — these are the places we need to fix.

**Step 4: Run normalizer tests**

```bash
cd frontend && npx vitest run src/store/api/__tests__/normalizers.test.ts
```

Expected: may need to update test expectations — fix them to match the new `{ total }` shape.

**Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/store/api/normalizers.ts frontend/src/store/api/__tests__/normalizers.test.ts
git commit -m "refactor(frontend): simplify PaginatedResponse meta to total-only"
```

---

### Task 5: Remove pagination params from `ProductsPage.tsx` and fix `total` usage

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`

**Step 1: Remove `page: 1` from the query params**

```typescript
// BEFORE:
const productQueryParams = useMemo(
  () => ({
    page: 1,
    search: productFilters.search || undefined,
    categoryId: productFilters.categoryId || undefined,
  }),
  [productFilters.categoryId, productFilters.search],
)

// AFTER:
const productQueryParams = useMemo(
  () => ({
    search: productFilters.search || undefined,
    categoryId: productFilters.categoryId || undefined,
  }),
  [productFilters.categoryId, productFilters.search],
)
```

**Step 2: Replace `pagination?.total` with `products.length`**

```typescript
// BEFORE (two occurrences):
const pagination = productsResponse?.meta
// ...
total={pagination?.total || 0}   // in ProductsToolbar
// ...
total={pagination?.total || 0}   // in ProductsTable

// AFTER: remove the `pagination` variable entirely, replace both with:
total={products.length}
```

**Step 3: Remove unused imports**

Remove `useLazyGetProductQuery` from the import since we'll remove `fetchProductById` in Task 7:

> **Note:** Do this in Task 7 when we remove the `fetchProductById` usage. Skip for now.

**Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "ProductsPage" | head -10
```

Expected: no errors in this file.

**Step 5: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "fix(inventory): remove page param and pagination variable from ProductsPage"
```

---

### Task 6: Simplify `ProductsTable` — remove `total` prop

**Files:**
- Modify: `frontend/src/pages/inventory/components/ProductsTable.tsx`

**Step 1: Check how `total` is used in ProductsTable**

Read the file and find the `total` prop — it's used for the "Product List (N)" count header.

**Step 2: Replace `total` prop with `products.length`**

Remove the `total: number` from the props interface and replace its usage with `products.length` inline, since `products` is already a prop.

Example (check actual file for exact lines):
```typescript
// BEFORE props interface:
interface ProductsTableProps {
  total: number
  products: Product[]
  // ...
}

// AFTER:
interface ProductsTableProps {
  products: Product[]
  // ...
}

// In JSX, replace:
Product List ({total})
// with:
Product List ({products.length})
```

**Step 3: Remove `total={products.length}` from `ProductsPage.tsx`**

Go back to `ProductsPage.tsx` and remove the `total` prop from both `<ProductsToolbar>` and `<ProductsTable>` call sites. Also check `ProductsToolbar` for the same prop.

**Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "ProductsTable|ProductsToolbar" | head -10
```

**Step 5: Commit**

```bash
git add frontend/src/pages/inventory/components/ProductsTable.tsx frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "refactor(inventory): derive product count from list length instead of meta.total"
```

---

### Task 7: Clean up `useProductsSelection.ts` — remove dead pagination-era code

This is the main fix for Issue #63. Remove all the code that existed only to handle "product not on current page".

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useProductsSelection.ts`
- Modify: `frontend/src/pages/inventory/hooks/useProductsPageState.ts`
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`

**Step 1: Remove params from `UseProductsSelectionParams` interface**

```typescript
// Remove these from the interface:
pendingProductId: string | null
setPendingProductId: (id: string | null) => void
hasNavigatedWithSelection: boolean
setHasNavigatedWithSelection: (value: boolean) => void
hasRestoredSelection: MutableRefObject<boolean>
fetchProductById: (id: string) => { unwrap: () => Promise<Product> }
refetchProducts: () => void
showError: (message: string) => void
```

Also remove `MutableRefObject` from imports if it's no longer used.

**Step 2: Remove the two effects that handled the async fetch fallback**

Remove the entire effect at lines 75-82 (location state handler):
```typescript
// DELETE this entire effect:
useEffect(() => {
  const state = location.state as { selectedProductId?: string } | null
  if (state?.selectedProductId && state.selectedProductId !== pendingProductId) {
    setHasNavigatedWithSelection(true)
    setPendingProductId(state.selectedProductId)
    navigate(location.pathname, { replace: true, state: {} })
  }
}, [location.pathname, location.state, navigate, pendingProductId, setHasNavigatedWithSelection, setPendingProductId])
```

Remove the entire effect at lines 84-113 (pending product resolver with fetchProductById fallback):
```typescript
// DELETE this entire effect:
useEffect(() => {
  if (pendingProductId && products.length > 0) {
    const product = products.find((item) => item.id === pendingProductId)
    if (product) {
      dispatch(setSelectedProduct(product))
      // ...
      setPendingProductId(null)
      setTimeout(() => setHasNavigatedWithSelection(false), 1000)
    } else {
      fetchProductById(pendingProductId)
        .unwrap()
        .then(...)
        // ...
    }
  }
}, [...])
```

**Step 3: Replace with a simple location-state handler**

Now that all products are always in the list, we just need to find the product by ID after the list loads:

```typescript
// ADD this new, simple effect in place of the two deleted ones:
useEffect(() => {
  const state = location.state as { selectedProductId?: string } | null
  if (state?.selectedProductId) {
    navigate(location.pathname, { replace: true, state: {} })
    if (products.length > 0) {
      const product = products.find((item) => item.id === state.selectedProductId)
      if (product) {
        const index = products.findIndex((item) => item.id === state.selectedProductId)
        dispatch(setSelectedProduct(product))
        setFocusedProductIndex(index)
      }
    }
  }
}, [dispatch, location.pathname, location.state, navigate, products, setFocusedProductIndex])
```

**Step 4: Remove the `hasRestoredSelection` effect that depended on removed state**

Check if lines 51-59 (the `hasRestoredSelection` effect) still makes sense without `hasRestoredSelection`. If it only existed for pagination-era restoration, remove it entirely. Also remove the effect at lines 115-119 that references `hasRestoredSelection`.

**Step 5: Remove dead params from `useProductsPageState.ts`**

```typescript
// Remove from useProductsPageState:
const [hasNavigatedWithSelection, setHasNavigatedWithSelection] = useState(false)
const [pendingProductId, setPendingProductId] = useState<string | null>(null)
const hasRestoredSelection = useRef(false)

// Remove from the return object:
hasNavigatedWithSelection,
setHasNavigatedWithSelection,
pendingProductId,
setPendingProductId,
hasRestoredSelection,
```

**Step 6: Update `ProductsPage.tsx` to remove the dead props passed to `useProductsSelection`**

```typescript
// Remove from the useProductsSelection call:
pendingProductId: pageState.pendingProductId,
setPendingProductId: pageState.setPendingProductId,
hasNavigatedWithSelection: pageState.hasNavigatedWithSelection,
setHasNavigatedWithSelection: pageState.setHasNavigatedWithSelection,
hasRestoredSelection: pageState.hasRestoredSelection,
fetchProductById,
refetchProducts,
showError,

// Also remove:
const [fetchProductById] = useLazyGetProductQuery()
useLazyGetProductQuery from imports
```

**Step 7: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: no errors.

**Step 8: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useProductsSelection.ts \
        frontend/src/pages/inventory/hooks/useProductsPageState.ts \
        frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "fix(inventory): remove pagination-era selection fallback, fix new product highlight (issue #63)"
```

---

### Task 8: Verify and test end-to-end

**Step 1: Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

Expected: all pass.

**Step 2: Run all backend tests**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: all pass.

**Step 3: Run full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1
cd backend && npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 4: Manual smoke test**

Start the app (`docker compose up -d` or `cd backend && npm run start:dev` + `cd frontend && npm run dev`) and:

1. Navigate to Inventory > Products — verify all products load (not just 20)
2. Create a new product
3. Verify you are navigated back and the new product is **highlighted** in the list with its **details shown** in the right panel
4. Verify existing product selection still works normally (click a product, details show)

**Step 5: Final commit if any test fixes were needed**

```bash
git add -A
git commit -m "test: update tests for pagination removal"
```
