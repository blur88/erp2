# ERP2 Full Codebase Refactor — Design Document

**Date:** 2026-03-06
**Scope:** Frontend (React/Redux) + Backend (NestJS/services)
**Approach:** RTK Query migration + page decomposition + backend service decomposition

---

## Problem Statement

The codebase has three compounding issues:

1. **Quality:** Redux slices use `as any` casts throughout to work around inconsistent API response normalization. 50+ identical `catch (error: any)` patterns. Selectors typed as `(state: any)`.
2. **Performance:** No automatic request deduplication or cache invalidation. Manual `dispatch(fetchX())` calls inside mutations to refetch data.
3. **Maintainability:** 760-line Redux slices, 1,756-line page components, 2,632-line backend service — all caused by the wrong abstraction for server state management.

**Root cause:** Redux is being used to cache server state. It is the wrong tool for that job. RTK Query is the right tool and is already in the dependency tree.

---

## What Changes, What Stays

**Unchanged:**
- NestJS backend API contracts (routes, response shapes, DTOs)
- PostgreSQL schema, migrations, entities
- MUI component library and visual design
- Docker/NGINX deployment
- Auth flow, WebSocket, Redis

**Changes:**
- Frontend: Replace all Redux async thunks + server-state slice state with RTK Query `createApi` endpoints
- Frontend: Decompose page files over 800 lines into co-located sub-components
- Backend: Decompose `sales-order.service.ts` (2,632 lines) and `sales-analytics.service.ts` (1,538 lines) into focused domain services

**Guiding principle:** Redux holds UI state. RTK Query holds server cache. Never mix.

---

## Section 1: RTK Query Migration

**Before:** Each module has a 600–760 line Redux slice with `pending/fulfilled/rejected` triples per thunk, manual refetch dispatches inside mutations, and `as any` payload normalization.

**After:** Each module gets one `createApi` slice (~80 lines). Pages use generated hooks directly.

```ts
// frontend/src/store/api/inventoryApi.ts
export const inventoryApi = createApi({
  reducerPath: 'inventoryApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Product', 'Category', 'StockAdjustment'],
  endpoints: (builder) => ({
    getProducts: builder.query<PaginatedResponse<Product>, ProductsParams>({
      query: (params) => ({ url: '/inventory/products', params }),
      providesTags: ['Product'],
    }),
    deleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/products/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Product'], // auto-refetches — no manual dispatch needed
    }),
  }),
})
```

**What is eliminated:**
- All `pending/fulfilled/rejected` handlers (~60% of every slice file)
- All manual `dispatch(fetchX())` refetch calls inside mutations
- All `as any` payload casts — endpoint return type is the source of truth
- Shared `error: string | null` across unrelated operations

**What stays in Redux slices (small, UI-only):**
- `selectedProduct`, `selectedCategory`, etc.
- Filter state (`search`, `categoryId`, `lowStock`)
- Dialog open/closed state if global

**Scope:** 12 modules × ~1 api file each. Existing `src/services/*.ts` files become the axiosBaseQuery implementation base — no API call logic is rewritten.

---

## Section 2: Page Decomposition

**Target:** Files over 800 lines. Identified:
- `PurchaseOrdersPage.tsx` — 1,756 lines
- `InvoicesPage.tsx` — 1,353 lines
- `ProductsPage.tsx` — 1,032 lines
- 3–5 others in sales/accounting

**Split rule:** If a block of JSX has its own local state, its own close/open trigger, or is conditionally rendered — it becomes a component. Layout glue stays in the page.

**Target structure:**
```
pages/purchasing/
  PurchaseOrdersPage.tsx          (~150 lines — layout + wiring only)
  components/
    PurchaseOrdersTable.tsx
    PurchaseOrderFilters.tsx
    CreatePurchaseOrderDialog.tsx
    DeletedOrdersDialog.tsx
    PurchaseOrderSummaryCard.tsx
```

---

## Section 3: Backend Service Decomposition

**Targets:**
- `sales-order.service.ts` — 2,632 lines
- `sales-analytics.service.ts` — 1,538 lines

**After:**
```
modules/sales/services/
  sales-order.service.ts           (~300 lines — facade)
  order-lifecycle.service.ts       (status transitions, fulfillment logic)
  order-fulfillment.service.ts     (inventory deduction, GRN linking)
  order-accounting.service.ts      (journal entry auto-posting)
  sales-analytics.service.ts       (~400 lines — top-level queries)
  analytics/
    revenue-analytics.service.ts
    customer-analytics.service.ts
```

**What doesn't change:** Controller routes, DTOs, module registration, API responses. Controllers call the same `SalesOrderService` public methods.

**Scope:** Sales module only. Pattern can be applied to purchasing/inventory in a subsequent plan.

---

## Section 4: Error Handling and Type Safety

**Single `axiosBaseQuery`** — one place that handles Axios error shape extraction:

```ts
// frontend/src/store/api/baseQuery.ts
const axiosBaseQuery = (): BaseQueryFn => async ({ url, method, params, data }) => {
  try {
    const result = await apiService.request({ url, method, params, data })
    return { data: result }
  } catch (err: any) {
    return { error: { status: err.response?.status, data: err.response?.data?.message ?? 'Unknown error' } }
  }
}
```

**Response normalizer** — one shared `transformResponse` utility that handles the `{ data: T[], meta }` vs plain array duality documented in CLAUDE.md. Called once per endpoint, not scattered across slices.

**Typed selectors** — replace `(state: any)` with `(state: RootState)` now that UI slices are small enough to type properly.

This is not extra work — it comes as a consequence of centralizing the base query.

---

## Section 5: Testing Strategy

**Frontend:**
- RTK Query endpoints don't need action-dispatch tests
- Replace with MSW (Mock Service Worker) — mock API at network layer
- Tests render components and assert on UI output, not Redux state
- Existing tests asserting on rendered output: keep and adapt
- Existing tests asserting on Redux state: delete (state no longer exists)
- Existing tests mocking `salesApi` service layer: replace with MSW handlers

**Backend:**
- No change to test strategy
- Service decomposition requires new unit tests for extracted services
- Existing `SalesOrderService` public method tests remain valid

---

## Files to Create / Modify Summary

### Frontend (new files)
- `src/store/api/baseQuery.ts`
- `src/store/api/inventoryApi.ts`
- `src/store/api/salesApi.ts`
- `src/store/api/purchasingApi.ts`
- `src/store/api/accountingApi.ts`
- `src/store/api/settingsApi.ts`
- `src/store/api/auditLogApi.ts`
- `src/store/api/backupApi.ts`
- `src/store/api/priceListApi.ts`
- `src/store/api/userManagementApi.ts`
- Page sub-component folders for each decomposed page

### Frontend (modified)
- `src/store/index.ts` — register RTK Query reducers and middleware
- All slice files — strip server state, keep UI state only
- All page files over 800 lines — slim to coordinator
- All page files using thunk dispatch — switch to RTK Query hooks

### Backend (new files)
- `src/modules/sales/services/order-lifecycle.service.ts`
- `src/modules/sales/services/order-fulfillment.service.ts`
- `src/modules/sales/services/order-accounting.service.ts`
- `src/modules/sales/services/analytics/revenue-analytics.service.ts`
- `src/modules/sales/services/analytics/customer-analytics.service.ts`

### Backend (modified)
- `src/modules/sales/services/sales-order.service.ts` — reduce to facade
- `src/modules/sales/services/sales-analytics.service.ts` — reduce to coordinator
- `src/modules/sales/sales.module.ts` — register new services

---

## Success Criteria

- All existing backend Jest tests pass
- All existing frontend Vitest tests pass (or are intentionally replaced with MSW-based tests)
- No Redux slice file exceeds 200 lines
- No page file exceeds 400 lines
- No backend service file exceeds 600 lines
- Zero `(state: any)` selectors
- Zero manual `dispatch(fetchX())` calls inside mutation thunks
- TypeScript `type-check` passes with zero errors
