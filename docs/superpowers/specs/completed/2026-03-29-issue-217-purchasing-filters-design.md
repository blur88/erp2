# Design: Add Supplier, Order Status, and Payment Status Filters to Purchasing Overview (Issue #217)

## Overview

Add filtering by Supplier, Order Status, and Payment Status to the Purchasing Overview dashboard. Mirrors the Sales Overview filter pattern.

## Backend

### `PurchasingAnalyticsQueryDto`

Add three optional fields to `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`:

- `supplierId?: string` — `@IsOptional() @IsUUID()`
- `status?: 'received' | 'pending'` — `@IsOptional() @IsIn(['received', 'pending'])`
- `paymentStatus?: 'paid' | 'partial' | 'unpaid'` — `@IsOptional() @IsIn(['paid', 'partial', 'unpaid'])`

### `PurchasingAnalyticsService`

File: `backend/src/modules/purchasing/services/purchasing-analytics.service.ts`

Define a filter bag interface:

```ts
interface PurchasingAnalyticsFilters {
  supplierId?: string
  status?: 'received' | 'pending'
  paymentStatus?: 'paid' | 'partial' | 'unpaid'
}
```

Update `getPurchasingAnalytics()` to extract filters from `query` and pass them to each sub-method.

Update each private method signature to accept `filters: PurchasingAnalyticsFilters`:

- **`calculatePurchasingMetrics(startDate, endDate, filters)`**
  - Add `supplierId` WHERE clause to both query builder calls.
  - Add `isFullyReceived` WHERE clause for `status` filter.
  - `paymentStatus` applies only to `recentOrders`-style data, not aggregate metrics — skip for metrics (aggregate spend/count is not meaningfully filterable by payment status without loading all orders; omit for simplicity, consistent with how the comparison period metrics work).
  - Note: `activeSuppliers` metric — when `supplierId` filter is active, result will be 0 or 1; that's correct and expected.

- **`getPurchasingPeriodData(startDate, endDate, groupBy, filters)`**
  - Add `supplierId` and `status` (`isFullyReceived`) WHERE clauses.
  - `paymentStatus` requires post-query filtering (no DB column). Load raw orders with amounts and vendor payments, then filter by computed payment status. For period data this is heavier; use sub-query approach: join vendor payments and compare sums, similar to how the report service handles it.

- **`getTopSuppliers(startDate, endDate, limit, filters)`**
  - Add `supplierId` and `status` WHERE clauses. When `supplierId` is set the result is a single supplier — this is correct.
  - `paymentStatus` filtering on top-suppliers aggregation: skip (payment status is per-order, not per-supplier aggregate — filtering would give misleading totals). Keep consistent with issue spec which does not specifically require it for this sub-component.

- **`getRecentPurchaseOrders(limit, filters)`**
  - Add all 3 filters. `supplierId` and `status` as WHERE clauses. `paymentStatus` as post-DB in-app filter (load extra rows, filter, slice to `limit`), consistent with existing report methods.

## Frontend

### `useDashboardFilters` (`frontend/src/hooks/useDashboardFilters.ts`)

Add `supplierId` alongside `customerId`:

- Add `supplierId?: string` to `DashboardResolvedApiParams` interface.
- Add `supplierId: string | null` to `parseUrl` return type; read from `${namespace}_supplier` URL param; validate as UUID.
- Add `supplierId` to `writeUrl` signature; write to `${namespace}_supplier` param.
- Add `supplierId` state + `setSupplierId` callback (same shape as `setCustomerId`).
- Include `supplierId` in `isDefault` check (`&& supplierId === null`).
- Spread `supplierId` into `resolvedApiParams` when set.
- Clear `supplierId` in `reset()`.
- Return `supplierId` and `setSupplierId` from the hook.

Also add `status` (order status) to the hook and to `DashboardResolvedApiParams`:
- Add `status: string | null` state to the hook (URL param: `${namespace}_status`).
- Add `setStatus` callback (same shape as `setPaymentStatus`).
- Include `status` in `isDefault` check and `reset()`.
- Add `status?: string` to `DashboardResolvedApiParams`.

The existing `paymentStatus?: PaymentStatusFilter` covers Sales (`'draft' | 'partial_paid' | 'paid'`). Purchasing uses `'paid' | 'partial' | 'unpaid'` — these are different enums. **Widen `paymentStatus` to `string`** in the `DashboardResolvedApiParams` interface only (keeps the hook clean; each page passes what the backend expects). The `PaymentStatusFilter` type remains for the hook's internal state and Sales usage.

### `PurchasingAnalyticsParams` + `usePurchasingAnalytics`

File: `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts`

Add to `PurchasingAnalyticsParams`:
- `supplierId?: string`
- `status?: string`
- `paymentStatus?: string`

No logic changes — the hook already passes all defined params to the API.

### `DashboardFilterBar` (`frontend/src/components/filters/DashboardFilterBar.tsx`)

Add optional props:

```ts
suppliers?: { id: string; name: string }[]
supplierId?: string | null
onSupplierChange?: (id: string | null) => void
status?: string | null           // 'received' | 'pending'
onStatusChange?: (value: string | null) => void
```

Render a Supplier autocomplete (same as the existing customer autocomplete) when `suppliers` prop is provided.

Render an Order Status select when `onStatusChange` is provided, with options:
- All (null)
- Received (`'received'`)
- Pending (`'pending'`)

The existing `paymentStatus`/`onPaymentStatusChange` props are reused for purchasing payment status. The options rendered should be conditional on context — purchasing needs `'paid' | 'partial' | 'unpaid'` while sales uses `'draft' | 'partial_paid' | 'paid'`. Pass a `paymentStatusOptions` prop to make this configurable, or detect by which options are available. **Preferred: add `paymentStatusOptions?: { value: string; label: string }[]` prop** so the filter bar is generic.

### `PurchasingPage` (`frontend/src/pages/purchasing/PurchasingPage.tsx`)

- Import `useGetSuppliersQuery` from `purchasingApi`.
- Destructure `supplierId`, `setSupplierId`, `status`, `setStatus`, `paymentStatus`, `setPaymentStatus` from `useDashboardFilters('purchasing')`. The existing `isFulfilled`/`setFulfilled` are not used by Purchasing.
- Fetch suppliers: `const { data: suppliersData } = useGetSuppliersQuery({})`.
- Map to `{ id, name }[]` using `supplier.companyName`.
- Pass to `DashboardFilterBar`: `suppliers`, `supplierId`, `onSupplierChange`, `status`, `onStatusChange`, `paymentStatus`, `onPaymentStatusChange`, `paymentStatusOptions` for purchasing values.
- Pass `supplierId`, `status`, `paymentStatus` to `usePurchasingAnalytics` via `resolvedApiParams`.

## Testing

- Backend: unit tests for each updated private method covering supplierId, status, and paymentStatus filter combinations. Mirror existing patterns in `purchasing-analytics.service.spec.ts`.
- Frontend: update `useDashboardFilters` tests to cover `supplierId` read/write/reset. Update `DashboardFilterBar` tests for new props. Update `PurchasingPage` smoke tests.

## What Is Not Changing

- Sales page — no changes; `customerId`/`isFulfilled` remain as-is.
- Inventory Overview — not affected.
- The `DashboardFilterBar` component remains backwards-compatible (all new props are optional).
