# Sales Orders Filter Bar Modernization

**Issue:** #265
**Date:** 2026-04-03

---

## Overview

Modernize the Sales Orders filter bar to add period, fulfillment status filters, and extended search coverage (customer name + product name). Move the Sort button into `FilterBar` as a reusable prop, applied to both `OrdersPage` and `PurchaseOrdersPage`.

---

## Backend

### `SalesOrderQueryService.findAll` — Extended Search

**Main query** — extend the search `andWhere` clause. The joins on `customer` and `product` already exist, so this is additive:

```sql
-- before
order.orderNumber ILIKE :search

-- after
(order.orderNumber ILIKE :search
 OR customer.name ILIKE :search
 OR product.name ILIKE :search)
```

**Count query** — the count query has no joins. Adding a join on `items`+`product` would inflate `COUNT(order.id)` (fan-out: one order with 3 matching items = counted 3×). Solution: add a `leftJoin` on `customer` for the customer name OR, and use an EXISTS subquery for product name:

```sql
(order.orderNumber ILIKE :search
 OR customer.name ILIKE :search
 OR EXISTS (
   SELECT 1 FROM sales_order_items i
   JOIN products p ON p.id = i."productId"
   WHERE i."salesOrderId" = order.id
   AND p.name ILIKE :search
 ))
```

No changes to `QuerySalesOrdersDto` — `fromDate`, `toDate`, and `fulfillmentStatus` are already defined there.

---

## Frontend

### `FilterBar.tsx` + `filterBar.types.ts` — Sort Prop

Add an optional `sort` prop to `FilterBar`. Rendered after the Reset button.

```ts
// filterBar.types.ts addition
export interface FilterBarSortConfig {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}
```

```tsx
// FilterBar.tsx — sort button rendering
{sort && (
  <Button
    size="small"
    variant={sort.sortBy === sort.field ? 'contained' : 'outlined'}
    color={sort.sortBy === sort.field ? 'primary' : 'inherit'}
    startIcon={
      sort.sortBy === sort.field
        ? sort.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />
        : <SortIcon />
    }
    onClick={() => sort.onSort(sort.field)}
  >
    Sort
  </Button>
)}
```

**Button styling standard:**
- Sort active: `variant="contained" color="primary"` — blue, signals active sort to the user at a glance
- Sort inactive: `variant="outlined" color="inherit"` — neutral grey
- Reset: `variant="outlined" color="inherit"` — neutral grey (unchanged)
- Font: `textTransform: 'none'`, `fontWeight: 500` from theme global override (automatic)

### `OrdersPage.tsx` — New Filters + Sort Prop

**Extend `SalesOrderFilters`:**

```ts
interface SalesOrderFilters {
  search: string
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  period: PeriodValue
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
}
```

**Extend `filterConfig`:**

```ts
{ field: 'period', label: 'Period', type: 'period' },
{
  field: 'fulfillmentStatus',
  label: 'Fulfillment',
  type: 'select',
  options: [
    { value: 'unfulfilled', label: 'Unfulfilled' },
    { value: 'fulfilled', label: 'Fulfilled' },
  ],
},
```

Period defaults to `{ key: 'this_month', from: null, to: null }` — consistent with how `useFilterBar` handles period fields.

**Map period → `fromDate`/`toDate` in `orderQueryArgs`:**

```ts
// getStartOfWeek reads localStorage — call it in the component body, not inside useMemo
const weekStartsOn = getStartOfWeek()
const dateRange = useMemo(() => {
  const p = appliedFilters.period
  if (!p || p.key === 'custom') {
    return { fromDate: p?.from ?? undefined, toDate: p?.to ?? undefined }
  }
  const r = getPeriodDateRange(p.key, weekStartsOn)
  return { fromDate: r.from, toDate: r.to }
}, [appliedFilters.period, weekStartsOn])

const orderQueryArgs = useMemo(() => ({
  sortBy,
  sortOrder,
  search: appliedFilters.search || undefined,
  customerId: appliedFilters.customerId || undefined,
  paymentStatus: appliedFilters.paymentStatus || undefined,
  fulfillmentStatus: appliedFilters.fulfillmentStatus || undefined,
  fromDate: dateRange.fromDate,
  toDate: dateRange.toDate,
}), [appliedFilters, sortBy, sortOrder, dateRange])
```

**Pass sort prop to `FilterBar`, remove standalone `Button`:**

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={filterHandlers}
  hasActiveFilters={hasActiveFilters}
  searchInputRef={pageState.searchInputRef}
  sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: handleSort }}
/>
```

Remove the standalone Sort `Button` and the outer `Stack`/`Box` wrapper that previously held it alongside `FilterBar`. The `Box sx={{ flex: 1 }}` wrapping `FilterBar` should be removed too since the Sort button now lives inside `FilterBar` and the layout no longer needs a flex row at the page level for this section.

### `PurchaseOrdersPage.tsx` — Sort Prop Only

Same change: remove standalone Sort `Button`, pass `sort` prop to `FilterBar`. No new filter fields on this page in this PR — that is a follow-up.

---

## Reuse

All filter infrastructure is reused — nothing new created:

| Piece | Status |
|---|---|
| `FilterBar` | Reused — extended with optional `sort` prop |
| `useFilterBar` | Reused — no changes |
| `FilterPeriod` | Reused — no changes |
| `FilterSelect` | Reused — no changes |
| `getPeriodDateRange` | Reused — no changes |
| `getStartOfWeek` | Reused — no changes |
| `filterBar.url.ts` (serialize/parse) | Reused — no changes |

---

## Tests

### `sales-order-query.service.spec.ts`
- Search by customer name returns matching orders
- Search by product name returns matching orders
- Search by product name does not inflate count (an order with 3 matching items counts as 1)
- Existing order number search test unchanged

### `OrdersPage.filterbar.test.tsx`
- Restoring `fulfillmentStatus=fulfilled` from URL passes it to the query
- Restoring `period=this_week` from URL resolves to correct `fromDate`/`toDate` in the query
- Existing tests unchanged

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/modules/sales/services/sales-order-query.service.ts` | Extend search OR clause in main query; add customer join + EXISTS subquery in count query |
| `frontend/src/types/filterBar.types.ts` | Add `FilterBarSortConfig` type |
| `frontend/src/components/filters/FilterBar.tsx` | Add optional `sort` prop, render Sort button |
| `frontend/src/pages/sales/OrdersPage.tsx` | Add `period` + `fulfillmentStatus` filters; wire date range; pass `sort` to FilterBar |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Pass `sort` to FilterBar, remove standalone button |
| `backend/src/modules/sales/services/sales-order-query.service.spec.ts` | New search tests |
| `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` | New filter tests |
