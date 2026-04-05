# Design: Purchase Orders Filter Bar (Issue #299)

## Goal

Add `period`, `paymentStatus`, and `status` filters to the Purchase Orders page FilterBar, matching the Sales Orders page layout and behavior.

## Backend

### `PurchaseOrderQueryDto` (`backend/src/modules/purchasing/dto/purchase-order.dto.ts`)

Add two optional fields:

```ts
@ApiPropertyOptional({ description: 'Filter by GRN status', enum: ['draft', 'received'] })
@IsOptional()
@IsEnum(['draft', 'received'])
status?: 'draft' | 'received';

@ApiPropertyOptional({ description: 'Filter by payment status', enum: ['unpaid', 'partial', 'paid', 'overpaid'] })
@IsOptional()
@IsEnum(['unpaid', 'partial', 'paid', 'overpaid'])
paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
```

The existing `orderDateFrom` / `orderDateTo` fields are already present and used for date range filtering.

### `findAll` (`backend/src/modules/purchasing/services/purchase-order.service.ts`)

After the existing `supplierId` and date filters, add:

**Payment status filter** (comparing `po.paidAmount` to `po.totalAmount`):

| Value | Condition |
|-------|-----------|
| `unpaid` | `po.paidAmount = 0 OR po.paidAmount IS NULL` |
| `partial` | `po.paidAmount > 0 AND po.paidAmount < po.totalAmount` |
| `paid` | `po.paidAmount >= po.totalAmount AND po.paidAmount > 0` |
| `overpaid` | `po.paidAmount > po.totalAmount` |

**Status filter** (via already-joined `grns`):

| Value | Condition |
|-------|-----------|
| `draft` | `grns.status = 'draft'` |
| `received` | `grns.status = 'received'` |

The `grns` left join is already in the query builder — no additional join needed.

## Frontend

### `PurchaseOrderFilters` interface (`frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`)

```ts
interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  period: PeriodValue
  status: 'draft' | 'received' | null
}
```

### `filterConfig`

Fields in order (matching Sales Orders layout):

1. `period` — type `period`
2. `supplierId` — type `supplier`
3. `paymentStatus` — type `payment-status`
4. `status` — type `purchasing-status`

Defaults:

```ts
defaults: {
  search: '',
  supplierId: null,
  paymentStatus: null,
  period: { key: null, from: null, to: null },
  status: null,
}
```

### `queryParams` mapping

Copy `dateRange` computation from `OrdersPage` (using `getPeriodDateRange` / `getStartOfWeek`), then map:

```ts
const queryParams = useMemo(() => ({
  sortBy: pageState.sorting.sortBy,
  sortOrder: pageState.sorting.sortOrder.toUpperCase(),
  search: filterBar.appliedFilters.search || undefined,
  supplierId: filterBar.appliedFilters.supplierId || undefined,
  paymentStatus: filterBar.appliedFilters.paymentStatus || undefined,
  status: filterBar.appliedFilters.status || undefined,
  orderDateFrom: dateRange.fromDate,
  orderDateTo: dateRange.toDate,
}), [filterBar.appliedFilters, dateRange, pageState.sorting])
```

### `hasActiveFilters`

No explicit change needed — `useFilterBar` derives this automatically from the `defaults` config. Adding the new fields to `defaults` is sufficient.

## System Design Note

1 PO : 1 GRN always. The `status` filter directly matches `grns.status` without any aggregation needed.

## Out of Scope

- Pagination (already handled)
- Count query duplicate filter application (the `getCount()` call precedes pagination; no separate count query builder used in purchasing unlike sales)
