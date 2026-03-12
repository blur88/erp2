# Full Codebase Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all Redux async thunks with RTK Query, decompose monolithic pages and backend services, and enforce type safety throughout.

**Architecture:** RTK Query `createApi` per module handles all server cache (fetching, caching, invalidation). Redux slices shrink to UI-only state. Backend `SalesOrderService` (2,632 lines) is decomposed into focused domain services behind a facade. Page files over 800 lines are split into co-located sub-components.

**Tech Stack:** React 18, RTK Query (via `@reduxjs/toolkit ^2.11.2`), MUI v7, Vitest + @testing-library/react, NestJS 11, TypeORM, Jest

---

## Phase 0: Setup and Verification

### Task 0: Read this plan and understand the scope

Before touching any file, read these files in full:
- `docs/plans/2026-03-06-refactor-design.md` — the approved design
- `frontend/src/services/api.ts` — the existing Axios instance and `ApiService` class
- `frontend/src/store/index.ts` — the Redux store configuration
- `frontend/src/store/slices/inventorySlice.ts` — representative example of what gets replaced
- `backend/src/modules/sales/services/sales-order.service.ts` — the backend god object

**Step 1: Verify the test suite passes before you touch anything**

```bash
cd backend && npm run test -- --passWithNoTests
cd frontend && npm run test
```

Expected: All green. If not, stop and fix the failures before proceeding — you need a clean baseline.

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check
```

Expected: Zero errors. Note any pre-existing errors so you don't chase them later.

**Step 3: Commit a baseline marker**

```bash
git commit --allow-empty -m "chore: refactor baseline — all tests passing"
```

---

## Phase 1: RTK Query Infrastructure

### Task 1: Install MSW for frontend testing

MSW (Mock Service Worker) is not yet in the project. It is the RTK Query team's recommended way to test components that use query hooks.

**Step 1: Install MSW**

```bash
cd frontend && npm install --save-dev msw@latest
```

**Step 2: Create the MSW browser and server setup**

Create `frontend/src/mocks/server.ts`:
```ts
import { setupServer } from 'msw/node'
export const server = setupServer()
```

Create `frontend/src/mocks/handlers.ts`:
```ts
import { http, HttpResponse } from 'msw'

// Add handlers here as you migrate each module.
// Example:
// http.get('/api/inventory/products', () => HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }))
export const handlers: Parameters<typeof import('msw/node').setupServer>[0][] = []
```

**Step 3: Wire MSW into Vitest setup**

Check if `frontend/src/setupTests.ts` or `frontend/vitest.config.ts` exists for the setup file location:
```bash
cat frontend/vitest.config.ts
```

In the setup file (create `frontend/src/setupTests.ts` if it doesn't exist, and add it to `vitest.config.ts` under `setupFiles`):
```ts
import { server } from './mocks/server'
import '@testing-library/jest-dom'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

**Step 4: Run existing tests to confirm MSW setup doesn't break anything**

```bash
cd frontend && npm run test
```

Expected: All tests still pass.

**Step 5: Commit**

```bash
git add frontend/src/mocks/ frontend/src/setupTests.ts frontend/vitest.config.ts frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): install msw and configure test server"
```

---

### Task 2: Create the shared `axiosBaseQuery`

This is the single piece of infrastructure that all RTK Query api slices will use. It wraps the existing `api` Axios instance (which already handles auth token injection, token refresh, and 401 redirect) so RTK Query benefits from all of that automatically.

**Files:**
- Create: `frontend/src/store/api/baseQuery.ts`

**Step 1: Create the base query**

```ts
// frontend/src/store/api/baseQuery.ts
import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import type { AxiosRequestConfig, Method } from 'axios'
import api from '@/services/api'

export interface BaseQueryArgs {
  url: string
  method?: Method
  data?: unknown
  params?: Record<string, unknown>
  headers?: Record<string, string>
}

/**
 * Shared RTK Query base query that reuses the existing Axios instance.
 * The Axios instance already handles:
 *   - Auth token injection
 *   - Token refresh on 401
 *   - VPN fallback URL logic
 */
export const axiosBaseQuery = (): BaseQueryFn<BaseQueryArgs, unknown, { status?: number; data: string }> =>
  async ({ url, method = 'GET', data, params, headers }) => {
    try {
      const config: AxiosRequestConfig = { url, method, data, params, headers }
      const result = await api(config)
      return { data: result.data }
    } catch (err: any) {
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data?.message ?? err.message ?? 'Unknown error',
        },
      }
    }
  }
```

**Step 2: Create the response normalizer utility**

From CLAUDE.md: paginated list endpoints return `{ data: T[], meta: {...} }`. Tree/hierarchy endpoints (categories, chart of accounts) return a plain array. This utility handles both, called once in `transformResponse` per endpoint.

Create `frontend/src/store/api/normalizers.ts`:
```ts
import type { PaginatedResponse } from '@/types'

/**
 * Normalize a paginated API response.
 * Handles both `{ data: T[], meta: {...} }` and `{ data: { data: T[], meta: {...} } }` wrapping.
 */
export function normalizePaginated<T>(response: any): PaginatedResponse<T> {
  // ApiService already strips the Axios wrapper, so response is the backend body.
  // Backend body for list endpoints is: { data: T[], meta: { page, limit, total, totalPages } }
  if (response && Array.isArray(response.data)) {
    return {
      data: response.data,
      meta: response.meta ?? { page: 1, limit: 20, total: response.data.length, totalPages: 1 },
    }
  }
  // Fallback: plain array (tree endpoints, hierarchy)
  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { page: 1, limit: response.length, total: response.length, totalPages: 1 },
    }
  }
  return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }
}

/**
 * Normalize a single-item API response.
 * Handles `{ data: T }` or plain `T`.
 */
export function normalizeSingle<T>(response: any): T {
  if (response && 'data' in response && !Array.isArray(response.data)) {
    return response.data as T
  }
  return response as T
}
```

**Step 3: Run type-check to confirm no issues**

```bash
cd frontend && npm run type-check
```

**Step 4: Commit**

```bash
git add frontend/src/store/api/
git commit -m "feat(frontend): add RTK Query axiosBaseQuery and response normalizers"
```

---

## Phase 2: RTK Query API Slices (per module)

Work through each module in this order (simplest first to establish the pattern, then more complex):

1. Audit Logs
2. Backup
3. Price Lists
4. User Management
5. Settings
6. Dashboard
7. Inventory
8. Purchasing
9. Sales
10. Accounting

For each module, follow this identical pattern. The inventory module is shown in full detail — use it as the template for all others.

---

### Task 3: Inventory RTK Query API slice

**Files:**
- Create: `frontend/src/store/api/inventoryApi.ts`
- Modify: `frontend/src/store/slices/inventorySlice.ts`
- Modify: `frontend/src/store/index.ts`

**Step 1: Read the existing slice and services to understand all endpoints**

```bash
cat frontend/src/store/slices/inventorySlice.ts
cat frontend/src/services/inventoryApi.ts
```

Note every thunk and the HTTP operation it calls. You will create one RTK Query endpoint per thunk.

**Step 2: Create the RTK Query api slice**

```ts
// frontend/src/store/api/inventoryApi.ts
import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'
import type { Product, Category, StockMovement, StockAdjustment, PaginatedResponse } from '@/types'

export const inventoryApiSlice = createApi({
  reducerPath: 'inventoryApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Product', 'DeletedProduct', 'Category', 'DeletedCategory', 'StockAdjustment', 'DeletedStockAdjustment'],
  endpoints: (builder) => ({
    // Products
    getProducts: builder.query<PaginatedResponse<Product>, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/products', params: { isActive: true, sortBy: 'name', sortOrder: 'asc', ...params } }),
      transformResponse: normalizePaginated<Product>,
      providesTags: ['Product'],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => ({ url: `/inventory/products/${id}` }),
      transformResponse: normalizeSingle<Product>,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),
    getDeletedProducts: builder.query<PaginatedResponse<Product>, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/products/deleted', params }),
      transformResponse: normalizePaginated<Product>,
      providesTags: ['DeletedProduct'],
    }),
    createProduct: builder.mutation<Product, Partial<Product>>({
      query: (body) => ({ url: '/inventory/products', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Product>,
      invalidatesTags: ['Product'],
    }),
    updateProduct: builder.mutation<Product, { id: string; data: Partial<Product> }>({
      query: ({ id, data }) => ({ url: `/inventory/products/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Product>,
      invalidatesTags: ['Product'],
    }),
    deleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/products/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Product', 'DeletedProduct'],
    }),
    restoreProduct: builder.mutation<Product, string>({
      query: (id) => ({ url: `/inventory/products/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Product>,
      invalidatesTags: ['Product', 'DeletedProduct'],
    }),
    bulkRestoreProducts: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (productIds) => ({ url: '/inventory/products/bulk-restore', method: 'POST', data: { productIds } }),
      invalidatesTags: ['Product', 'DeletedProduct'],
    }),
    permanentDeleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/products/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedProduct'],
    }),
    bulkPermanentDeleteProducts: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (productIds) => ({ url: '/inventory/products/bulk-permanent-delete', method: 'POST', data: { productIds } }),
      invalidatesTags: ['DeletedProduct'],
    }),
    checkProductDuplicate: builder.query<{ nameExists: boolean; barcodeExists: boolean }, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/products/check-duplicate', params }),
    }),

    // Categories
    getCategories: builder.query<Category[], Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/categories', params: { includeProductCount: true, ...params } }),
      // Categories endpoint returns plain array (per CLAUDE.md "tree/hierarchy endpoints")
      transformResponse: (response: any) => Array.isArray(response) ? response : (response?.data ?? []),
      providesTags: ['Category'],
    }),
    getDeletedCategories: builder.query<PaginatedResponse<Category>, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/categories/deleted', params }),
      transformResponse: normalizePaginated<Category>,
      providesTags: ['DeletedCategory'],
    }),
    createCategory: builder.mutation<Category, Partial<Category>>({
      query: (body) => ({ url: '/inventory/categories', method: 'POST', data: body }),
      invalidatesTags: ['Category'],
    }),
    updateCategory: builder.mutation<Category, { id: string; data: Partial<Category> }>({
      query: ({ id, data }) => ({ url: `/inventory/categories/${id}`, method: 'PATCH', data }),
      invalidatesTags: ['Category'],
    }),
    deleteCategory: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Category', 'DeletedCategory'],
    }),
    restoreCategory: builder.mutation<Category, string>({
      query: (id) => ({ url: `/inventory/categories/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['Category', 'DeletedCategory'],
    }),
    permanentDeleteCategory: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/categories/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedCategory'],
    }),
    bulkRestoreCategories: builder.mutation<void, string[]>({
      query: (categoryIds) => ({ url: '/inventory/categories/bulk-restore', method: 'POST', data: { categoryIds } }),
      invalidatesTags: ['Category', 'DeletedCategory'],
    }),
    bulkPermanentDeleteCategories: builder.mutation<void, string[]>({
      query: (categoryIds) => ({ url: '/inventory/categories/bulk-permanent-delete', method: 'POST', data: { categoryIds } }),
      invalidatesTags: ['DeletedCategory'],
    }),

    // Stock Adjustments
    getStockAdjustments: builder.query<PaginatedResponse<StockAdjustment>, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/stock-adjustments', params }),
      transformResponse: normalizePaginated<StockAdjustment>,
      providesTags: ['StockAdjustment'],
    }),
    getStockAdjustment: builder.query<StockAdjustment, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}` }),
      transformResponse: normalizeSingle<StockAdjustment>,
      providesTags: (_result, _error, id) => [{ type: 'StockAdjustment', id }],
    }),
    getDeletedStockAdjustments: builder.query<PaginatedResponse<StockAdjustment>, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/stock-adjustments/deleted', params }),
      transformResponse: normalizePaginated<StockAdjustment>,
      providesTags: ['DeletedStockAdjustment'],
    }),
    restoreStockAdjustment: builder.mutation<StockAdjustment, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['StockAdjustment', 'DeletedStockAdjustment'],
    }),
    permanentDeleteStockAdjustment: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedStockAdjustment'],
    }),
    bulkPermanentDeleteStockAdjustments: builder.mutation<void, string[]>({
      query: (ids) => ({ url: '/inventory/stock-adjustments/bulk-permanent-delete', method: 'POST', data: { ids } }),
      invalidatesTags: ['DeletedStockAdjustment'],
    }),
  }),
})

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useGetDeletedProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useRestoreProductMutation,
  useBulkRestoreProductsMutation,
  usePermanentDeleteProductMutation,
  useBulkPermanentDeleteProductsMutation,
  useCheckProductDuplicateQuery,
  useGetCategoriesQuery,
  useGetDeletedCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useRestoreCategoryMutation,
  usePermanentDeleteCategoryMutation,
  useBulkRestoreCategoriesMutation,
  useBulkPermanentDeleteCategoriesMutation,
  useGetStockAdjustmentsQuery,
  useGetStockAdjustmentQuery,
  useGetDeletedStockAdjustmentsQuery,
  useRestoreStockAdjustmentMutation,
  usePermanentDeleteStockAdjustmentMutation,
  useBulkPermanentDeleteStockAdjustmentsMutation,
} = inventoryApiSlice
```

**Step 3: Gut the inventory slice — keep only UI state**

Rewrite `frontend/src/store/slices/inventorySlice.ts` to contain only:
- `selectedProduct: Product | null`
- `selectedCategory: Category | null`
- `selectedStockAdjustment: StockAdjustment | null`
- `filters.products: { search, categoryId, lowStock, inStock }`
- `filters.categories: { search }`

Remove entirely: `loading`, `error`, `pagination`, `products`, `deletedProducts`, `categories`, `deletedCategories`, `stockAdjustments`, `deletedStockAdjustments`, and ALL `extraReducers` / thunk definitions.

New slim slice:
```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Product, Category, StockAdjustment } from '@/types'
import type { RootState } from '@/store'

interface InventoryUIState {
  selectedProduct: Product | null
  selectedCategory: Category | null
  selectedStockAdjustment: StockAdjustment | null
  filters: {
    products: { search: string; categoryId?: string; lowStock: boolean; inStock: boolean }
    categories: { search: string }
  }
}

const initialState: InventoryUIState = {
  selectedProduct: null,
  selectedCategory: null,
  selectedStockAdjustment: null,
  filters: {
    products: { search: '', lowStock: false, inStock: true },
    categories: { search: '' },
  },
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => { state.selectedProduct = action.payload },
    setSelectedCategory: (state, action: PayloadAction<Category | null>) => { state.selectedCategory = action.payload },
    setSelectedStockAdjustment: (state, action: PayloadAction<StockAdjustment | null>) => { state.selectedStockAdjustment = action.payload },
    setProductFilters: (state, action: PayloadAction<Partial<InventoryUIState['filters']['products']>>) => {
      state.filters.products = { ...state.filters.products, ...action.payload }
    },
    setCategoryFilters: (state, action: PayloadAction<Partial<InventoryUIState['filters']['categories']>>) => {
      state.filters.categories = { ...state.filters.categories, ...action.payload }
    },
  },
})

export const { setSelectedProduct, setSelectedCategory, setSelectedStockAdjustment, setProductFilters, setCategoryFilters } = inventorySlice.actions

// Typed selectors (RootState, not any)
export const selectSelectedProduct = (state: RootState) => state.inventory.selectedProduct
export const selectSelectedCategory = (state: RootState) => state.inventory.selectedCategory
export const selectSelectedStockAdjustment = (state: RootState) => state.inventory.selectedStockAdjustment
export const selectProductFilters = (state: RootState) => state.inventory.filters.products
export const selectCategoryFilters = (state: RootState) => state.inventory.filters.categories

export default inventorySlice.reducer
```

**Step 4: Register the RTK Query slice in the store**

In `frontend/src/store/index.ts`, add the inventory API:
```ts
import { inventoryApiSlice } from './api/inventoryApi'

// In rootReducer:
const rootReducer = combineReducers({
  // ... existing slices ...
  [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
})

// In configureStore middleware:
middleware: (getDefaultMiddleware) =>
  getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      ignoredPaths: ['register'],
    },
  }).concat(inventoryApiSlice.middleware),
```

Also remove `inventory` from the `persistConfig.whitelist` — RTK Query manages its own cache and should NOT be persisted via redux-persist (it handles re-fetching on mount automatically).

**Step 5: Run type-check**

```bash
cd frontend && npm run type-check
```

Fix any type errors before continuing. Common issues:
- Import paths — use `@/` alias
- Pages importing old thunks — they will break; you'll fix them in Phase 3

**Step 6: Run tests**

```bash
cd frontend && npm run test
```

Any slice tests for inventory that assert on Redux state should be deleted (the state no longer exists). Tests asserting on rendered UI output should be adapted.

**Step 7: Commit**

```bash
git add frontend/src/store/api/inventoryApi.ts frontend/src/store/slices/inventorySlice.ts frontend/src/store/index.ts
git commit -m "feat(frontend): migrate inventory to RTK Query, slim slice to UI state only"
```

---

### Task 4: Remaining RTK Query API slices

Apply the same pattern from Task 3 to each remaining module. For each:

1. Read the existing slice + `src/services/*Api.ts` to list all endpoints
2. Create `frontend/src/store/api/<module>Api.ts` following the same `createApi` structure
3. Gut the corresponding slice(s) to UI state only
4. Register in `frontend/src/store/index.ts`
5. `npm run type-check` — fix errors
6. `npm run test` — delete obsolete Redux state tests, adapt UI tests
7. Commit per module

**Module order and their existing service files:**

| Module | Slice file(s) | Service file |
|--------|--------------|-------------|
| Audit Logs | `auditLogSlice.ts` | `services/auditLogApi.ts` |
| Backup | `backupSlice.ts` | `services/backupService.ts` |
| Price Lists | `priceListSlice.ts` | `services/priceListApi.ts` |
| User Management | (check `store/slices/`) | `services/userManagementApi.ts` |
| Dashboard | `dashboardSlice.ts` | (inline API calls) |
| Purchasing | `purchasingSlice.ts`, `supplierSlice.ts` | `services/purchasingApi.ts` |
| Sales | `salesSlice.ts`, `customerSlice.ts` | `services/salesApi.ts` |
| Accounting | `chartOfAccountsSlice.ts`, `journalEntriesSlice.ts`, `fiscalPeriodsSlice.ts`, `accountMappingsSlice.ts`, `accountingReportsSlice.ts`, `bankReconciliationsSlice.ts`, `paymentMethodsSlice.ts`, `settlementsSlice.ts`, `ownerEquitySlice.ts`, `expenseSlice.ts` | `services/accountingApi.ts` |

**Important notes for specific modules:**

**Purchasing:** `purchasingSlice.ts` and `supplierSlice.ts` can be consolidated into one `purchasingApiSlice` with tag types `['PurchaseOrder', 'Supplier', 'GRN', 'VendorPayment']`.

**Sales:** `salesSlice.ts` and `customerSlice.ts` into one `salesApiSlice` with tag types `['Order', 'DeletedOrder', 'Invoice', 'DeletedInvoice', 'Customer', 'DeletedCustomer', 'Payment', 'DeletedPayment']`.

**Accounting:** Create one `accountingApiSlice` with tag types covering all accounting entities. The 10 slices collapse into one api file — this is the biggest win in the accounting module.

**Dashboard:** The dashboard likely calls multiple endpoints. Create a `dashboardApiSlice` that calls the relevant `/dashboard/*` or `/sales/analytics/dashboard` endpoints. Read `dashboardSlice.ts` first to understand what data it fetches.

**For each module, after gutting the slice:**
- Keep `auth` and `theme` and `notifications` slices untouched — they hold genuine UI/session state
- Remove the module key from `persistConfig.whitelist` in `store/index.ts` (only `theme` and `auth` should remain persisted)

**Step (per module): Commit**
```bash
git commit -m "feat(frontend): migrate <module> to RTK Query"
```

---

## Phase 3: Update Pages to Use RTK Query Hooks

After all API slices are created, pages still import old thunks. Fix them module by module.

### Task 5: Update inventory pages

**Files to update:**
- `frontend/src/pages/inventory/ProductsPage.tsx`
- `frontend/src/pages/inventory/CategoriesPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/inventory/CreateProductPage.tsx`
- `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`

**Pattern to apply in each file:**

Before:
```ts
const dispatch = useAppDispatch()
const products = useAppSelector(selectProducts)
const loading = useAppSelector(selectInventoryLoading)

useEffect(() => {
  dispatch(fetchProducts({ page, search }))
}, [page, search])
```

After:
```ts
const { data, isLoading, error } = useGetProductsQuery({ page, search })
const products = data?.data ?? []
const totalPages = data?.meta?.totalPages ?? 0
```

For mutations:
Before:
```ts
const handleDelete = async (id: string) => {
  await dispatch(deleteProduct(id))
  dispatch(fetchProducts({})) // manual refetch
}
```

After:
```ts
const [deleteProduct] = useDeleteProductMutation()
const handleDelete = async (id: string) => {
  await deleteProduct(id) // cache invalidation triggers automatic refetch
}
```

**Step 1: Update ProductsPage.tsx**

Read the file first, then replace all `dispatch(fetch*)` calls with query hooks and all `dispatch(deleteProduct/restoreProduct/etc)` calls with mutation hooks.

**Step 2: Run type-check after each file**

```bash
cd frontend && npm run type-check
```

**Step 3: Commit after all inventory pages are updated**

```bash
git commit -m "feat(frontend): update inventory pages to use RTK Query hooks"
```

### Task 6: Update purchasing pages

Same pattern as Task 5. Files:
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- All report pages in `purchasing/`

```bash
git commit -m "feat(frontend): update purchasing pages to use RTK Query hooks"
```

### Task 7: Update sales pages

Same pattern. Files include:
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/sales/InvoicesPage.tsx`
- `frontend/src/pages/sales/CustomersPage.tsx`
- All report pages in `sales/`

```bash
git commit -m "feat(frontend): update sales pages to use RTK Query hooks"
```

### Task 8: Update accounting pages

Same pattern for all pages in `frontend/src/pages/accounting/`.

```bash
git commit -m "feat(frontend): update accounting pages to use RTK Query hooks"
```

### Task 9: Final type-check and test pass

**Step 1: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: Zero errors. Every `(state: any)` selector should now be `(state: RootState)`. If you see remaining `any` casts in selectors, grep for them and fix:

```bash
grep -r "state: any" frontend/src/store/slices/
```

**Step 2: Full test run**

```bash
cd frontend && npm run test
```

**Step 3: Verify no old thunk imports remain**

```bash
grep -r "createAsyncThunk" frontend/src/store/slices/
```

Expected: zero results. All `createAsyncThunk` calls should be gone from slices.

```bash
grep -r "dispatch(fetch" frontend/src/pages/
```

Expected: zero results. No manual refetch dispatches in pages.

**Step 4: Commit**

```bash
git commit -m "chore(frontend): verify RTK Query migration complete — zero thunks, zero (state: any)"
```

---

## Phase 4: Page Decomposition

Target pages over 800 lines. Do NOT do all at once — one page at a time.

**Priority order (largest first):**

1. `OrdersPage.tsx` — 2,485 lines (sales)
2. `PurchaseOrdersPage.tsx` — 1,756 lines (purchasing)
3. `InvoicesPage.tsx` — 1,353 lines (sales)
4. `ProductsPage.tsx` — 1,032 lines (inventory)

Report pages (`CustomerOrderHistory`, `SalesByProductSummary`, etc.) over 800 lines are data-display only — their size comes from table column definitions and filter forms. Extract these into:
- `components/` folder per domain — shared column defs, filter bar components
- Do report pages last after CRUD pages are done

### Task 10: Decompose OrdersPage.tsx

**Step 1: Read the file in full**

```bash
wc -l frontend/src/pages/sales/OrdersPage.tsx
cat frontend/src/pages/sales/OrdersPage.tsx
```

**Step 2: Identify split points**

As you read, tag each block:
- Dialog components (any `<Dialog` that has local state) → extract to `components/`
- Table row component (if defined inline as `const OrderRow = ...`) → extract
- Filter bar (search + date + status selects) → extract
- Summary strip / totals → extract

**Step 3: Create the components directory**

```bash
mkdir -p frontend/src/pages/sales/components
```

**Step 4: Extract each component one at a time**

For each extracted component:
1. Create the file: `frontend/src/pages/sales/components/<ComponentName>.tsx`
2. Copy the relevant JSX + local state + imports
3. Define the props interface explicitly (no `any`)
4. Import and use it in `OrdersPage.tsx`
5. Run `npm run type-check` — fix errors
6. Run `npm run test` — fix test failures

**Step 5: Verify OrdersPage.tsx is under 400 lines**

```bash
wc -l frontend/src/pages/sales/OrdersPage.tsx
```

**Step 6: Commit**

```bash
git commit -m "refactor(frontend): decompose OrdersPage into co-located components"
```

### Task 11: Decompose PurchaseOrdersPage.tsx

Same process as Task 10. Target components:

```
frontend/src/pages/purchasing/components/
  PurchaseOrdersTable.tsx        — table + row component + columns
  PurchaseOrderFilters.tsx       — search, supplier filter, date range, sort controls
  PurchaseOrderDetailPanel.tsx   — the side/bottom detail view if any
  VendorPaymentSection.tsx       — payment recording UI
```

Note: `DeletedPurchaseOrdersDialog` already exists at `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx` — do not move it, just import it.

```bash
git commit -m "refactor(frontend): decompose PurchaseOrdersPage into co-located components"
```

### Task 12: Decompose InvoicesPage.tsx

Same process. Target:
```
frontend/src/pages/sales/components/
  InvoicesTable.tsx
  InvoicesFilters.tsx
  InvoiceDetailPanel.tsx
```

```bash
git commit -m "refactor(frontend): decompose InvoicesPage into co-located components"
```

### Task 13: Decompose ProductsPage.tsx

Same process. Target:
```
frontend/src/pages/inventory/components/
  ProductsTable.tsx
  ProductFilters.tsx
  ProductDetailPanel.tsx
```

```bash
git commit -m "refactor(frontend): decompose ProductsPage into co-located components"
```

---

## Phase 5: Backend Service Decomposition

This phase does not touch any controller, DTO, or API route. The public interface of `SalesOrderService` is preserved — only the implementation is reorganized.

### Task 14: Audit the sales-order service and map responsibilities

**Step 1: Read the full service**

```bash
cat backend/src/modules/sales/services/sales-order.service.ts
```

**Step 2: Map each method to a responsibility bucket**

Based on the method list, the natural groupings are:

| New Service | Methods to move |
|------------|----------------|
| `OrderLifecycleService` | `delete`, `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete`, `findDeleted` |
| `OrderFulfillmentService` | `fulfillOrder`, `unfulfillOrder`, `getFulfillmentStatus`, `recordPayment`, `recordPayments`, `unpayOrder` |
| `OrderAccountingService` | `updateAssociatedInvoices`, `createInvoiceFromOrder`, private accounting-related helpers |
| Keep in `SalesOrderService` (facade) | `create`, `findAll`, `findById`, `findByOrderNumber`, `update`, `duplicateOrder`, `findSummaries`, `getDashboardStats`, `findOrdersByCustomer`, `getOrderInvoices` |

Private helpers (`generateSequentialOrderNumber`, `generateInvoiceNumber`, `validateAndProcessItems`, `updateCustomerSalesMetrics`, `findPreviousOrder`) stay in whichever service they primarily support.

**Step 3: Verify backend tests pass before touching anything**

```bash
cd backend && npm run test -- --passWithNoTests
```

### Task 15: Extract OrderLifecycleService

**Files:**
- Create: `backend/src/modules/sales/services/order-lifecycle.service.ts`
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`
- Modify: `backend/src/modules/sales/sales.module.ts`

**Step 1: Write a test for one lifecycle method before moving code**

Create `backend/src/modules/sales/services/order-lifecycle.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { OrderLifecycleService } from './order-lifecycle.service'
import { SalesOrder } from '../../../database/entities/sales-order.entity'
import { AuditLogService } from '../../audit-logs/services'

describe('OrderLifecycleService', () => {
  let service: OrderLifecycleService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrderLifecycleService,
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn(), softDelete: jest.fn(), restore: jest.fn(), find: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile()
    service = module.get(OrderLifecycleService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
```

**Step 2: Run the test to confirm it fails (service doesn't exist yet)**

```bash
cd backend && npx jest src/modules/sales/services/order-lifecycle.service.spec.ts --no-coverage
```

Expected: FAIL — "Cannot find module"

**Step 3: Create OrderLifecycleService**

Create `backend/src/modules/sales/services/order-lifecycle.service.ts`.

Move the following methods from `SalesOrderService` verbatim (cut, not copy):
- `findDeleted`
- `restore`
- `bulkRestore`
- `permanentDelete`
- `bulkPermanentDelete`

The new service needs these injected dependencies (look at what the moved methods use):
- `@InjectRepository(SalesOrder) salesOrderRepository`
- `@InjectRepository(SalesOrderItem) salesOrderItemRepository`
- `@InjectRepository(Invoice) invoiceRepository`
- `@InjectRepository(InvoiceItem) invoiceItemRepository`
- `auditLogService: AuditLogService`
- `dataSource: DataSource`

```ts
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name)

  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepository: Repository<InvoiceItem>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  // paste moved methods here
}
```

**Step 4: In SalesOrderService, inject OrderLifecycleService and delegate**

```ts
// In SalesOrderService constructor, add:
private readonly orderLifecycleService: OrderLifecycleService,

// Replace the moved method bodies with delegation:
async findDeleted(query: QuerySalesOrdersDto) {
  return this.orderLifecycleService.findDeleted(query)
}
async restore(id: string, userId?: string, username?: string) {
  return this.orderLifecycleService.restore(id, userId, username)
}
// ... etc for bulkRestore, permanentDelete, bulkPermanentDelete
```

**Step 5: Register OrderLifecycleService in sales.module.ts**

```ts
providers: [
  CustomerService,
  SalesOrderService,
  OrderLifecycleService,  // add
  InvoiceService,
  PaymentService,
  SalesAnalyticsService,
  InventoryIntegrationService,
  TransactionManager,
],
```

**Step 6: Run tests**

```bash
cd backend && npx jest src/modules/sales/services/order-lifecycle.service.spec.ts --no-coverage
cd backend && npm run test -- --passWithNoTests
```

Expected: All pass. If `SalesOrderService` tests fail due to missing injections, add `OrderLifecycleService` to the test module providers.

**Step 7: Check sales-order.service.ts line count**

```bash
wc -l backend/src/modules/sales/services/sales-order.service.ts
```

**Step 8: Commit**

```bash
git add backend/src/modules/sales/services/order-lifecycle.service.ts backend/src/modules/sales/services/order-lifecycle.service.spec.ts backend/src/modules/sales/services/sales-order.service.ts backend/src/modules/sales/sales.module.ts
git commit -m "refactor(backend): extract OrderLifecycleService from SalesOrderService"
```

### Task 16: Extract OrderFulfillmentService

Same process as Task 15.

**Methods to move from SalesOrderService:**
- `fulfillOrder`
- `unfulfillOrder`
- `getFulfillmentStatus`
- `recordPayment`
- `recordPayments`
- `unpayOrder`

**Dependencies needed (read the method implementations to confirm):**
- `salesOrderRepository`
- `salesOrderItemRepository`
- `invoiceRepository`
- `inventoryIntegrationService: InventoryIntegrationService`
- `stockMovementService: StockMovementService`
- `auditLogService: AuditLogService`
- `accountingService: AccountingService`
- `dataSource: DataSource`

**Step 1: Write a spec first**

Create `backend/src/modules/sales/services/order-fulfillment.service.spec.ts` following the same pattern as the lifecycle spec.

**Step 2: Create the service, move methods, add delegation in facade**

**Step 3: Register in sales.module.ts**

**Step 4: Run all backend tests**

```bash
cd backend && npm run test -- --passWithNoTests
```

**Step 5: Commit**

```bash
git commit -m "refactor(backend): extract OrderFulfillmentService from SalesOrderService"
```

### Task 17: Extract OrderAccountingService

**Methods to move from SalesOrderService:**
- `updateAssociatedInvoices`
- `createInvoiceFromOrder`
- Private helper: `generateInvoiceNumber`

**Dependencies needed:**
- `salesOrderRepository`
- `invoiceRepository`
- `invoiceItemRepository`
- `accountingService: AccountingService`
- `auditLogService: AuditLogService`

Follow the same spec-first → create → delegate → test → commit flow.

```bash
git commit -m "refactor(backend): extract OrderAccountingService from SalesOrderService"
```

### Task 18: Decompose SalesAnalyticsService

**Step 1: Read and identify groups**

```bash
cat backend/src/modules/sales/services/sales-analytics.service.ts
```

**Group 1 → `analytics/revenue-analytics.service.ts`:**
- `getRevenueReport`
- `getSalesOrderProfitReport`
- Private: `getRevenueDataByPeriod`, `getPeriodData`

**Group 2 → `analytics/customer-analytics.service.ts`:**
- `getCustomerAnalytics`
- `getCustomerPaymentSummary`
- `getCustomerPaymentByOrder`
- `getCustomerPaymentDetails`
- `getCustomerOrderHistory`
- `getProductCustomerReport`

**Keep in `SalesAnalyticsService` (coordinator):**
- `getSalesAnalytics`
- `getSalesPipeline`
- `getDashboardMetrics`
- `getProductSummary`
- `getProductDetails`
- Private: `calculateSalesMetrics`, `getTopCustomers`, `getTopProducts`

**Step 2: Create `analytics/` directory**

```bash
mkdir -p backend/src/modules/sales/services/analytics
```

**Step 3: Create each analytics service with spec-first approach**

Create specs, create services, move methods, delegate from `SalesAnalyticsService`, register in `sales.module.ts`.

**Step 4: Run all backend tests**

```bash
cd backend && npm run test -- --passWithNoTests
```

**Step 5: Commit**

```bash
git commit -m "refactor(backend): decompose SalesAnalyticsService into focused analytics services"
```

---

## Phase 6: Final Verification

### Task 19: Success criteria check

**Step 1: No Redux slice exceeds 200 lines**

```bash
find frontend/src/store/slices -name "*.ts" | xargs wc -l | sort -rn | head -10
```

Expected: All under 200. If any exceed, identify what server state is still there and move it to the RTK Query api slice.

**Step 2: No page file exceeds 400 lines**

```bash
find frontend/src/pages -name "*.tsx" | xargs wc -l | sort -rn | head -10
```

If report pages still exceed 400 lines, extract their filter bar and column definitions.

**Step 3: No backend service exceeds 600 lines**

```bash
find backend/src/modules/sales/services -name "*.service.ts" | xargs wc -l | sort -rn
```

**Step 4: Zero `(state: any)` selectors**

```bash
grep -r "state: any" frontend/src/store/slices/
```

Expected: zero matches.

**Step 5: Zero manual refetch dispatches**

```bash
grep -r "dispatch(fetch" frontend/src/pages/
```

Expected: zero matches.

**Step 6: Zero `createAsyncThunk` in slices**

```bash
grep -r "createAsyncThunk" frontend/src/store/slices/
```

Expected: zero matches.

**Step 7: Full test suites**

```bash
cd backend && npm run test
cd frontend && npm run test
```

Expected: all green.

**Step 8: TypeScript clean**

```bash
cd frontend && npm run type-check
```

Expected: zero errors.

**Step 9: Final commit**

```bash
git commit -m "chore: refactor complete — RTK Query migration, page decomposition, service decomposition"
```

---

## Appendix: Common Pitfalls

**1. `redux-persist` and RTK Query cache**

RTK Query's cache reducer must NOT be in `persistConfig.whitelist`. If it is, stale cache will be hydrated from localStorage on app start, defeating cache invalidation. Only `theme` and `auth` should be persisted.

**2. The `axiosBaseQuery` returns `result.data` (not `result`)**

The existing Axios instance returns `AxiosResponse`. The base query does `result.data` to strip the Axios wrapper. But `ApiService.get<T>` already does this — so if you ever switch from the raw `api` instance to `ApiService`, you'd be double-stripping. The base query uses the raw `api` instance directly to avoid this.

**3. Tree endpoints vs paginated endpoints**

Per CLAUDE.md: categories and chart-of-accounts use tree/hierarchy endpoints that return a plain array (not `{ data, meta }`). Do NOT call `normalizePaginated` on these — use the inline transformer shown in the inventory api slice for `getCategories`.

**4. Circular dependency: `api.ts` imports `store`**

The existing `api.ts` imports `store` lazily via dynamic import to avoid circular deps. The `axiosBaseQuery` wraps the same `api` instance, so it inherits this behavior automatically — no circular dep issue.

**5. The `persistConfig.version` and migration**

If you remove keys from `persistConfig.whitelist` (e.g., `inventory`), old persisted state in users' localStorage will have stale `inventory` data. The existing `migrate` function handles this gracefully — old keys are just ignored on rehydration. Bump `version` to 4 when you finalize the store changes to trigger the migrator for existing sessions.

**6. Backend: `SalesOrderService` is exported and used by other modules**

From `sales.module.ts`, `SalesOrderService` is in `exports`. Other modules that import `SalesModule` depend on it. The facade pattern preserves this — same public methods, same class name, just thinner implementation.
