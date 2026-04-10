# Invoices Page: Payment Status & Order Status Filters

**Issue:** #329  
**Date:** 2026-04-10

## Summary

Add `paymentStatus` (unpaid/partial/paid/overpaid) and `fulfillmentStatus` (fulfilled/unfulfilled) filter controls to the Invoices page filter bar, matching the pattern already used on the Sales Orders page.

## Context & Constraints

- All invoices are linked to a sales order (`salesOrderId` is nullable in the schema but never null in practice).
- `InvoiceStatus` enum (`draft`, `partial_paid`, `paid`) exists on the entity but can drift from actual payment amounts. Filtering on raw `paidAmount`/`totalAmount` columns is more accurate and consistent with the orders page.
- `fulfillmentStatus` maps to `salesOrder.isFulfilled` (boolean on the `SalesOrder` entity).
- Existing `status` and `unpaid` query params on `QueryInvoicesDto` are left untouched for API compatibility.

## Backend Changes

### `invoice.dto.ts` — `QueryInvoicesDto`

Add two new optional fields:

```ts
@IsOptional()
@IsEnum(['unpaid', 'partial', 'paid', 'overpaid'])
paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid'

@IsOptional()
@IsEnum(['fulfilled', 'unfulfilled'])
fulfillmentStatus?: 'fulfilled' | 'unfulfilled'
```

### `invoice.service.ts` — `findAll()`

Migrate from `FindManyOptions` + `findAndCount` to a `QueryBuilder`. The existing `status`, `customerId`, `salesOrderId`, `fromDate`/`toDate`, `search`, and `unpaid` params continue to work as before.

New filter logic added via `andWhere`:

**`paymentStatus`:**
- `unpaid`: `invoice.paidAmount = 0`
- `partial`: `invoice.paidAmount > 0 AND invoice.paidAmount < invoice.totalAmount`
- `paid`: `invoice.paidAmount >= invoice.totalAmount AND invoice.paidAmount > 0`
- `overpaid`: `invoice.paidAmount > invoice.totalAmount`

**`fulfillmentStatus`:**
- LEFT JOIN `salesOrder` on `invoice.salesOrderId = salesOrder.id`
- `fulfilled`: `salesOrder.isFulfilled = true`
- `unfulfilled`: `salesOrder.isFulfilled = false`

Relations (`customer`, `salesOrder`, `items`, `items.product`, `payments`) loaded via joins in the QueryBuilder.

## Frontend Changes

### `InvoicesPage.tsx`

Extend `InvoiceFilters` interface:
```ts
interface InvoiceFilters {
  search: string
  period: PeriodValue
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
}
```

Add to `filterConfig.fields` after `customerId`:
```ts
{ field: 'paymentStatus', label: 'Payment', type: 'payment-status' },
{ field: 'fulfillmentStatus', label: 'Order Status', type: 'order-status' },
```

Add to `defaults`:
```ts
paymentStatus: null,
fulfillmentStatus: null,
```

Add to `queryArgs`:
```ts
paymentStatus: appliedFilters.paymentStatus || undefined,
fulfillmentStatus: appliedFilters.fulfillmentStatus || undefined,
```

No changes needed to `salesApi.ts` — `getInvoices` already passes params as `Record<string, unknown>`.

## Tests

### `InvoicesPage.filterbar.test.tsx`

Add two new test cases:
1. URL `?paymentStatus=paid` → `useGetInvoicesQuery` called with `{ paymentStatus: 'paid' }`
2. URL `?fulfillmentStatus=fulfilled` → `useGetInvoicesQuery` called with `{ fulfillmentStatus: 'fulfilled' }`

## Filter Order in UI

Period → Customer → Payment → Order Status

(Matches the order on the Sales Orders page.)
