# Migrate CreateProductPage to RTK Query Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `ApiService.post` and `ApiService.get` in `CreateProductPage.tsx` with `useCreateProductMutation` and `useLazyGetProductQuery` so that creating a product correctly invalidates the RTK Query cache and the new product appears in the list immediately (Issue #63 follow-up).

**Architecture:** Two surgical changes in one file — wire up two RTK Query hooks alongside the existing `useUpdateProductMutation`, swap the two `ApiService` calls, remove `loadingProduct` state in favour of `isFetching` from the lazy query, and delete the `ApiService` import. Update the existing test file to mock the new hooks instead of `ApiService`.

**Tech Stack:** React 18, RTK Query (`useCreateProductMutation`, `useLazyGetProductQuery`), Vitest + React Testing Library

---

### Task 1: Update tests to mock RTK Query hooks instead of ApiService

The existing test file mocks `@/services/api` and `@/store/api/inventoryApi`. We need to update both mocks before touching the implementation so tests drive the change (TDD).

**Files:**
- Modify: `frontend/src/pages/inventory/__tests__/CreateProductPage.test.tsx`

**Step 1: Add mock fns for the two new hooks**

At the top of the test file, alongside the existing mock declarations, add:

```typescript
const mockCreateProduct = vi.fn()
const mockFetchProduct = vi.fn()
```

**Step 2: Update the `inventoryApi` mock to include the new hooks**

```typescript
// BEFORE:
vi.mock('@/store/api/inventoryApi', () => ({
  useUpdateProductMutation: () => [mockUpdateProduct],
}))

// AFTER:
vi.mock('@/store/api/inventoryApi', () => ({
  useUpdateProductMutation: () => [mockUpdateProduct],
  useCreateProductMutation: () => [mockCreateProduct],
  useLazyGetProductQuery: () => [mockFetchProduct, { isFetching: false }],
}))
```

**Step 3: Remove the `@/services/api` mock entirely**

Delete this block:
```typescript
vi.mock('@/services/api', () => ({
  ApiService: {
    post: (...args: unknown[]) => mockApiPost(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))
```

And delete the mock fn declarations at the top:
```typescript
// DELETE:
const mockApiPost = vi.fn()
const mockApiPatch = vi.fn()
const mockApiGet = vi.fn()
```

**Step 4: Update `beforeEach` to wire up the new mocks**

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  mockRouteParams = {}

  mockCreateProduct.mockReturnValue({
    unwrap: vi.fn().mockResolvedValue({ id: 'prod-1' }),
  })
  mockFetchProduct.mockReturnValue({
    unwrap: vi.fn().mockResolvedValue({
      id: 'prod-1',
      name: 'Original Product',
      description: '',
      barcode: '',
      type: 'Stocked Product',
      categoryId: 'cat-1',
      baseCost: 0,
      stockQuantity: 0,
      notes: '',
      isActive: true,
      category: { id: 'cat-1', name: 'Category 1' },
      priceListItems: [],
    }),
  })
  mockUpdateProduct.mockReturnValue({
    unwrap: vi.fn().mockResolvedValue({}),
  })
  mockBulkUpdatePrices.mockResolvedValue({})
})
```

**Step 5: Update the "saves a price list item when price is 0" test**

Replace `expect(mockApiPost).toHaveBeenCalled()` with:
```typescript
await waitFor(() => {
  expect(mockCreateProduct).toHaveBeenCalledWith(
    expect.objectContaining({ categoryId: 'cat-1' })
  )
})
```

**Step 6: Update the "uses RTK Query update mutation when editing" test**

Replace `mockApiGet.mockResolvedValue(...)` setup (move it into `mockFetchProduct` in `beforeEach` — it's already there). Remove the inline `mockApiGet.mockResolvedValue` from this test. The rest of the test (`expect(mockUpdateProduct)...`) is unchanged.

**Step 7: Run tests to confirm they fail (implementation not yet updated)**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateProductPage.test.tsx
```

Expected: FAIL — `mockCreateProduct` not called, `mockFetchProduct` not called. This confirms the tests are driving the change.

---

### Task 2: Implement the changes in `CreateProductPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`

**Step 1: Update imports**

```typescript
// BEFORE (line 23-25):
import { ApiService } from '@/services/api'
import { useGetPriceListsQuery, useBulkUpdatePricesMutation, priceListApiSlice } from '@/store/api/priceListApi'
import { useUpdateProductMutation } from '@/store/api/inventoryApi'

// AFTER:
import { useGetPriceListsQuery, useBulkUpdatePricesMutation, priceListApiSlice } from '@/store/api/priceListApi'
import { useCreateProductMutation, useLazyGetProductQuery, useUpdateProductMutation } from '@/store/api/inventoryApi'
```

(Remove the `ApiService` import line entirely.)

**Step 2: Wire up the new hooks (around line 188, after `useUpdateProductMutation`)**

```typescript
// BEFORE:
const [updateProduct] = useUpdateProductMutation()

// AFTER:
const [updateProduct] = useUpdateProductMutation()
const [createProduct] = useCreateProductMutation()
const [fetchProduct, { isFetching: isFetchingProduct }] = useLazyGetProductQuery()
```

**Step 3: Remove `loadingProduct` state (line ~177)**

```typescript
// DELETE this line:
const [loadingProduct, setLoadingProduct] = useState(false)
```

**Step 4: Replace the `loadProduct` function (lines ~249-287)**

```typescript
// BEFORE:
const loadProduct = async (productId: string) => {
  setLoadingProduct(true)
  try {
    const response = await ApiService.get(`/inventory/products/${productId}`)
    const product = response as any
    if (product.category) {
      setSelectedCategory(product.category)
    }
    reset({
      name: product.name || '',
      description: product.description || '',
      barcode: product.barcode || '',
      type: product.type || 'Stocked Product',
      categoryId: product.categoryId || '',
      baseCost: product.baseCost || 0,
      stockQuantity: product.stockQuantity || 0,
      notes: product.notes || '',
      isActive: product.isActive !== undefined ? product.isActive : true,
    })
    if (product.priceListItems && Array.isArray(product.priceListItems)) {
      const pricesMap: Record<string, number> = {}
      product.priceListItems.forEach((item: any) => {
        pricesMap[item.priceListId] = item.price
      })
      setPriceListPrices(pricesMap)
    }
  } catch (err: any) {
    showError(err?.response?.data?.message || 'Failed to load product')
    setError('Failed to load product')
  } finally {
    setLoadingProduct(false)
  }
}

// AFTER:
const loadProduct = async (productId: string) => {
  try {
    const product = await fetchProduct(productId).unwrap()
    if (product.category) {
      setSelectedCategory(product.category as Category)
    }
    reset({
      name: product.name || '',
      description: product.description || '',
      barcode: (product as any).barcode || '',
      type: (product.type as any) || 'Stocked Product',
      categoryId: product.categoryId || '',
      baseCost: product.baseCost || 0,
      stockQuantity: product.stockQuantity || 0,
      notes: (product as any).notes || '',
      isActive: product.isActive !== undefined ? product.isActive : true,
    })
    if ((product as any).priceListItems && Array.isArray((product as any).priceListItems)) {
      const pricesMap: Record<string, number> = {}
      ;(product as any).priceListItems.forEach((item: any) => {
        pricesMap[item.priceListId] = item.price
      })
      setPriceListPrices(pricesMap)
    }
  } catch (err: any) {
    showError(err?.message || 'Failed to load product')
    setError('Failed to load product')
  }
}
```

**Step 5: Replace `ApiService.post` in `onSubmit` (lines ~323-326)**

```typescript
// BEFORE:
} else {
  const response = await ApiService.post('/inventory/products', productData) as any
  // ApiService.post already unwraps response.data, so the response IS the product data
  productId = response?.id
}

// AFTER:
} else {
  const response = await createProduct(productData).unwrap()
  productId = response?.id
}
```

**Step 6: Update JSX loading spinner (line ~421)**

```tsx
// BEFORE:
{loadingProduct ? (

// AFTER:
{isFetchingProduct ? (
```

**Step 7: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no errors. If there are type errors on `product.barcode` etc. (because `Product` type doesn't expose all fields), use `as any` casts as noted in the code above — this matches the existing pattern in the file.

---

### Task 3: Verify tests pass and commit

**Step 1: Run the CreateProductPage tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateProductPage.test.tsx
```

Expected: all tests PASS.

**Step 2: Run broader inventory tests**

```bash
cd frontend && npx vitest run src/pages/inventory src/store/api/__tests__/inventoryApi.test.ts
```

Expected: all PASS.

**Step 3: Confirm `ApiService` is no longer imported in `CreateProductPage.tsx`**

```bash
grep "ApiService" frontend/src/pages/inventory/CreateProductPage.tsx
```

Expected: no output.

**Step 4: Commit**

```bash
git add frontend/src/pages/inventory/CreateProductPage.tsx \
        frontend/src/pages/inventory/__tests__/CreateProductPage.test.tsx
git commit -m "fix(inventory): migrate CreateProductPage to RTK Query mutations (issue #63)"
```
