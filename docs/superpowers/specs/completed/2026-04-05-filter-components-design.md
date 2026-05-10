# Filter Components & Backend Alignment — Design Spec

**Issue:** #277
**Date:** 2026-04-05
**Status:** Approved

---

## Overview

Create four standalone, reusable filter components (`FilterCustomer`, `FilterOrderStatus`, `FilterPaymentStatus`, `FilterCompare`) and register them as first-class types in `FilterBarConfig`. Simultaneously align backend payment status and fulfillment status APIs across all modules so every page uses the same canonical values.

---

## Canonical Filter Values

### Payment Status
All pages and all backend APIs use: `unpaid | partial | paid | overpaid`

| Value | Label |
|-------|-------|
| `unpaid` | Unpaid |
| `partial` | Partial |
| `paid` | Paid |
| `overpaid` | Overpaid |

`FilterPaymentStatus` accepts `includeOverpaid?: boolean` (default `true`). Currently all pages pass the default.

### Fulfillment / Order Status
All pages use: `fulfilled | unfulfilled`

| Value | Label |
|-------|-------|
| `unfulfilled` | Unfulfilled |
| `fulfilled` | Fulfilled |

Purchasing uses a separate `status: 'received' | 'pending'` field (different concept — GRN receipt, not order fulfillment). This field is unchanged and remains a plain `'select'` type.

---

## Part 1: Backend Alignment

### Sales Analytics (`SalesAnalyticsQueryDto`)

**Payment status:** Change `paymentStatus` from `InvoiceStatus` enum (`draft | partial_paid | paid`) to `'unpaid' | 'partial' | 'paid' | 'overpaid'`.

Translation layer in `sales-analytics.service.ts`:
- `unpaid` → filter invoices with `status = 'draft'`
- `partial` → filter invoices with `status = 'partial_paid'`
- `paid` → filter invoices with `status = 'paid'`
- `overpaid` → filter invoices with `status = 'paid'` where payment total exceeds invoice total

**Fulfillment status:** Replace `isFulfilled?: boolean` with `fulfillmentStatus?: 'fulfilled' | 'unfulfilled'`.

Translation layer in `sales-analytics.service.ts`:
- `fulfilled` → `isFulfilled = true`
- `unfulfilled` → `isFulfilled = false`

All internal query calls that currently pass `isFulfilled` boolean are updated to translate from the new param.

### Purchasing Analytics (`PurchasingAnalyticsQueryDto`)

**Payment status:** Change `paymentStatus` from `'paid' | 'partial' | 'unpaid'` to `'unpaid' | 'partial' | 'paid' | 'overpaid'`.

Translation layer in `purchasing-analytics.service.ts`:
- `unpaid` → orders where no payment recorded
- `partial` → orders where partial payment recorded
- `paid` → orders where payment covers full amount exactly
- `overpaid` → orders where payment total exceeds order total

**No fulfillment change** — purchasing uses `status: 'received' | 'pending'` which stays as-is.

### Sales Orders (`QuerySalesOrdersDto`)

Already uses `unpaid | partial | paid | overpaid` and `fulfilled | unfulfilled`. **No backend changes needed.**

---

## Part 2: Frontend — New Filter Components

All new components live in `frontend/src/components/filters/`.

### `FilterCustomer.tsx`
- Self-contained: calls `useGetCustomersQuery({ limit: 999999 })` internally
- Renders a `FilterSelect` with customer options
- Props: `value: string | null`, `onChange: (value: string | null) => void`
- Pages no longer call `useGetCustomersQuery` just for filter options

### `FilterOrderStatus.tsx`
- Hardcoded options: `unfulfilled/Unfulfilled`, `fulfilled/Fulfilled`
- Renders a `FilterSelect`
- Props: `value: string | null`, `onChange: (value: string | null) => void`

### `FilterPaymentStatus.tsx`
- Hardcoded options: `unpaid/Unpaid`, `partial/Partial`, `paid/Paid`, `overpaid/Overpaid`
- Props: `value: string | null`, `onChange: (value: string | null) => void`, `includeOverpaid?: boolean` (default `true`)
- When `includeOverpaid=false`, the `overpaid` option is omitted

### `FilterCompare.tsx`
- Extracted from the inline `'compare'` block in `FilterBar.tsx`
- Retains existing Tooltip + disabled-when-today logic
- Props: `value: string | null`, `onChange: (value: string | null) => void`, `periodValue: PeriodValue | null`

### New constants: `frontend/src/constants/filterOptions.ts`
Exports:
```ts
export const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'Previous Period' },
  { value: 'last_month', label: 'Same Period Last Month' },
  { value: 'last_year', label: 'Same Period Last Year' },
]
```

---

## Part 3: FilterBar Type System

### Updated `FilterFieldType` in `filterBar.types.ts`
```ts
export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'period'
  | 'compare'
  | 'customer'
  | 'order-status'
  | 'payment-status'
```

### New config interfaces
```ts
export interface CustomerFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'customer'
}

export interface OrderStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'order-status'
}

export interface PaymentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'payment-status'
  includeOverpaid?: boolean
}
```

`FilterFieldConfig` union updated to include the three new interfaces.

### `FilterBar.tsx` — `renderQuickField` updated
Three new branches added:
- `type === 'customer'` → renders `<FilterCustomer />`
- `type === 'order-status'` → renders `<FilterOrderStatus />`
- `type === 'payment-status'` → renders `<FilterPaymentStatus includeOverpaid={field.includeOverpaid} />`

The existing `'compare'` branch delegates to `<FilterCompare />` instead of inline JSX.

---

## Part 4: Page Refactors

### `OrdersPage.tsx`
- Remove `useGetCustomersQuery` import and call
- Change `customerId` field: `type: 'select', options: [...]` → `type: 'customer'`
- Change `paymentStatus` field: `type: 'select', options: [...]` → `type: 'payment-status'`
- Change `fulfillmentStatus` field: `type: 'select', options: [...]` → `type: 'order-status'`

### `SalesPage.tsx`
- Remove `useGetCustomersQuery` import and call
- Change `customerId` field → `type: 'customer'`
- Change `paymentStatus` field → `type: 'payment-status'`
- Rename `isFulfilled: string | null` in `SalesDashboardFilters` type to `fulfillmentStatus: string | null`
- Change `isFulfilled` filter field → `field: 'fulfillmentStatus'`, `type: 'order-status'`
- Update `resolveApiParams` / query params to pass `fulfillmentStatus` instead of `isFulfilled`

### `PurchasingPage.tsx`
- Change `paymentStatus` field → `type: 'payment-status'`
- Keep `status` field (received/pending) as plain `'select'` — unchanged
- No supplier field change (not a `FilterCustomer` — different entity)

### `InventoryPage.tsx`
- No payment/fulfillment filter fields — no filter type changes
- `compare` type automatically benefits from `FilterCompare` extraction — no page-level changes needed

---

## Part 5: Testing

- **`FilterBar.test.tsx`**: add cases for `'customer'`, `'order-status'`, `'payment-status'` types rendering correctly
- **`OrdersPage.filterbar.test.tsx`**: update to use new type names; mock `useGetCustomersQuery` at component level since `FilterCustomer` owns the call
- **`SalesPage` / `PurchasingPage` filter tests**: update option values to canonical set
- **Backend**: update `sales-analytics.service.spec.ts` to use `fulfillmentStatus: 'fulfilled'` instead of `isFulfilled: true`; update purchasing analytics spec to include `overpaid` test cases

---

## Files Changed

### Backend
- `backend/src/modules/sales/dto/sales-analytics.dto.ts`
- `backend/src/modules/sales/services/sales-analytics.service.ts`
- `backend/src/modules/sales/services/sales-analytics.service.spec.ts`
- `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`
- `backend/src/modules/purchasing/services/purchasing-analytics.service.ts`
- `backend/src/modules/purchasing/services/purchasing-analytics.service.spec.ts`

### Frontend
- `frontend/src/types/filterBar.types.ts`
- `frontend/src/constants/filterOptions.ts` *(new)*
- `frontend/src/components/filters/FilterCustomer.tsx` *(new)*
- `frontend/src/components/filters/FilterOrderStatus.tsx` *(new)*
- `frontend/src/components/filters/FilterPaymentStatus.tsx` *(new)*
- `frontend/src/components/filters/FilterCompare.tsx` *(new)*
- `frontend/src/components/filters/FilterBar.tsx`
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/sales/SalesPage.tsx`
- `frontend/src/pages/purchasing/PurchasingPage.tsx`
- `frontend/src/components/filters/__tests__/FilterBar.test.tsx`
- `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`
- `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx`
- `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx`
