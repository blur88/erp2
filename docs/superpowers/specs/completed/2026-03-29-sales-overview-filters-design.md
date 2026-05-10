# Sales Overview Filters — Design Spec
**Issue:** #196
**Date:** 2026-03-29

## Overview

Add Customer, Order Status (Fulfillment), and Payment Status filters to the Sales Overview dashboard. All filters apply to every section of the dashboard (metrics cards, trend chart, top customers, top products) and are preserved in the URL for bookmarkable/shareable links.

## Decisions Made

- **Customer list:** Pre-loaded simple dropdown (small customer count, under 50)
- **URL persistence:** All three new filters stored in URL params under the `sales_` namespace
- **Component strategy:** Extend `DashboardFilterBar` with optional props (backward-compatible); other pages unaffected
- **Filter scope:** All filters apply to all dashboard sections — metrics, chart, top customers, top products
- **Customer filter:** Filters both order metrics and invoice/payment metrics together

---

## Backend

### DTO (`backend/src/modules/sales/dto/sales-analytics.dto.ts`)

Add two optional fields to `SalesAnalyticsQueryDto`:

```ts
@ApiPropertyOptional({ description: 'Filter by fulfillment status', example: true })
@IsOptional()
@IsBoolean()
@Transform(({ value }) => value === 'true' || value === true)
isFulfilled?: boolean;

@ApiPropertyOptional({ description: 'Filter by payment/invoice status', enum: InvoiceStatus })
@IsOptional()
@IsEnum(InvoiceStatus)
paymentStatus?: InvoiceStatus;
```

Import `InvoiceStatus` from `../../../database/entities/invoice.entity`.

### Controller (`backend/src/modules/sales/controllers/sales-analytics.controller.ts`)

Add to `getSalesAnalytics` endpoint:

```ts
@ApiQuery({ name: 'isFulfilled', required: false, description: 'Filter by fulfillment status (true/false)' })
@ApiQuery({ name: 'paymentStatus', required: false, enum: InvoiceStatus, description: 'Filter by invoice payment status' })
```

### Service (`backend/src/modules/sales/services/sales-analytics.service.ts`)

**`calculateSalesMetrics`** — after the existing `customerId` block:
```ts
if (query?.isFulfilled !== undefined) {
  orderQuery = orderQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
}
if (query?.paymentStatus) {
  invoiceQuery = invoiceQuery.andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
}
```

**`getPeriodData`** — accept full `query: SalesAnalyticsQueryDto` and apply same `isFulfilled` filter to order queries.

**`getTopCustomers`** — accept full `query` and apply `isFulfilled` and `paymentStatus` filters.

**`getTopProducts`** — accept full `query` and apply `isFulfilled` and `paymentStatus` filters.

In `getSalesAnalytics`, pass `query` through to all four methods instead of just `startDate`/`endDate`.

---

## Frontend

### Hook (`frontend/src/hooks/useDashboardFilters.ts`)

Add three new state variables, all URL-persisted:

| State | URL param | Values |
|---|---|---|
| `customerId` | `{namespace}_customer` | UUID string or absent |
| `isFulfilled` | `{namespace}_fulfilled` | `'true'`, `'false'`, or absent |
| `paymentStatus` | `{namespace}_payment` | `'draft'`, `'partial_paid'`, `'paid'`, or absent |

Add setters: `setCustomerId`, `setFulfilled`, `setPaymentStatus` — each updates state and calls `replaceState`.

Update `reset` to clear all three to null.

Update `isDefault` to include all three in its check (`customerId === null && isFulfilled === null && paymentStatus === null`).

Update `resolvedApiParams` to include the three new params when non-null.

### Analytics Hook (`frontend/src/pages/sales/hooks/useDashboardAnalytics.ts`)

Extend `DashboardAnalyticsParams` interface:
```ts
customerId?: string
isFulfilled?: boolean
paymentStatus?: string
```

No other changes needed — params are forwarded as-is to the API.

### Filter Bar (`frontend/src/components/dashboard/DashboardFilterBar.tsx`)

Add three optional prop groups to `DashboardFilterBarProps`:

```ts
// Customer filter (optional — only renders when provided)
customers?: { id: string; name: string }[]
customerId?: string | null
onCustomerChange?: (id: string | null) => void

// Order status filter (optional)
isFulfilled?: boolean | null
onFulfilledChange?: (value: boolean | null) => void

// Payment status filter (optional)
paymentStatus?: 'draft' | 'partial_paid' | 'paid' | null
onPaymentStatusChange?: (value: 'draft' | 'partial_paid' | 'paid' | null) => void
```

Render three new MUI `Select` dropdowns (size="small") when the corresponding props are provided:

- **Customer:** "All Customers" + one `MenuItem` per customer
- **Order Status:** All / Fulfilled / Pending (values: `null` / `true` / `false`)
- **Payment Status:** All / Paid / Partially Paid / Draft (values: `null` / `'paid'` / `'partial_paid'` / `'draft'`)

All three render between the existing Compare select and the context label. Backward-compatible — existing usages without these props are unaffected.

### Sales Page (`frontend/src/pages/sales/SalesPage.tsx`)

1. Fetch customers via RTK Query `useGetCustomersQuery({})`, map to `{ id, name }` pairs.
2. Destructure `customerId`, `isFulfilled`, `paymentStatus`, `setCustomerId`, `setFulfilled`, `setPaymentStatus` from `useDashboardFilters('sales')`.
3. Pass all new state and setters to `DashboardFilterBar`.

---

## URL Param Examples

```
/sales?sales_period=this_month&sales_customer=uuid-abc&sales_fulfilled=true&sales_payment=paid
```

---

## Testing

### Backend
- `calculateSalesMetrics` with `isFulfilled=true` — verify `order.isFulfilled = true` WHERE clause applied
- `calculateSalesMetrics` with `isFulfilled=false` — verify `order.isFulfilled = false` WHERE clause applied
- `calculateSalesMetrics` with `paymentStatus='paid'` — verify `invoice.status = 'paid'` WHERE clause applied
- `getTopCustomers` with new filters — verify they propagate
- `getTopProducts` with new filters — verify they propagate

### Frontend
- `useDashboardFilters`: new URL params read correctly on mount, written on change, cleared on reset
- `DashboardFilterBar`: three new selects render when props provided, absent when not provided
- `SalesPage`: customers fetched and passed to filter bar; filter values flow through to analytics params
