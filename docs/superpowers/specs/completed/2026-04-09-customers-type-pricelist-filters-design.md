# Design: Customer Type & Price List Filters (Issue #316)

## Overview

Add `Customer Type` (Individual/Business) and `Price List` filters to the Customers page `FilterBar`, and fix the backend `priceListId` filter that was being silently ignored.

---

## Backend

**File:** `backend/src/modules/sales/services/customer.service.ts`

`findAll` already destructures `query` and uses a query builder, but `priceListId` is never read. Fix: destructure `priceListId` from `query` and add an `andWhere` clause when it is present.

```ts
// Add to destructure:
const { search, type, priceListId, isActive, sortBy = 'name', sortOrder = 'ASC' } = query;

// Add after the type/isActive conditions:
if (priceListId) {
  queryBuilder.andWhere('customer.priceListId = :priceListId', { priceListId });
}
```

No DTO changes needed — `priceListId?: string` already exists in `QueryCustomersDto`.

---

## Frontend

### 1. New component: `FilterPriceList.tsx`

**Location:** `frontend/src/components/filters/FilterPriceList.tsx`

Follows the `FilterSupplier` pattern exactly:
- Calls `useGetPriceListsQuery({ page: 1, limit: 200, isActive: true })`
- Maps results to `{ value: pl.id, label: pl.name }`
- Renders via `FilterSelect` with `label="Price List"`
- Export added to `filters/index.ts`

### 2. Type system: `filterBar.types.ts`

- Add `'price-list'` to `FilterFieldType` union
- Add `PriceListFilterFieldConfig` interface (same shape as `SupplierFilterFieldConfig`)
- Add `PriceListFilterFieldConfig` to `FilterFieldConfig` union

### 3. `FilterBar.tsx`

Add a `field.type === 'price-list'` branch in `renderQuickField` that renders:
```tsx
<FilterPriceList
  key={String(field.field)}
  value={value as string | null}
  onChange={onChange as (value: string | null) => void}
/>
```

### 4. `filterBar.url.ts`

In the two places that handle entity filter URL param serialization (around lines 69 and 145), add `'price-list'` alongside `'customer'` and `'supplier'`.

### 5. `CustomersPage.tsx`

**Interface update:**
```ts
interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'individual' | 'business' | null
  priceListId: string | null
}
```

**filterConfig additions:**
```ts
{
  field: 'type',
  label: 'Customer Type',
  type: 'select',
  options: [
    { value: 'individual', label: 'Individual' },
    { value: 'business', label: 'Business' },
  ],
},
{
  field: 'priceListId',
  label: 'Price List',
  type: 'price-list',
},
```

**defaults update:**
```ts
defaults: { search: '', status: null, type: null, priceListId: null }
```

**customerQueryParams update:**
```ts
const customerQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  isActive: appliedFilters.status === 'active' ? true
    : appliedFilters.status === 'inactive' ? false
    : undefined,
  type: appliedFilters.type ?? undefined,
  priceListId: appliedFilters.priceListId ?? undefined,
  sortBy,
  sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
}), [appliedFilters, sortBy, sortOrder])
```

---

## Testing

- Backend: add a unit test to `customer.service.spec.ts` verifying that `priceListId` is passed through to the query builder condition.
- Frontend: update `CustomersPage` tests (if any) to include the new filter fields in the mock filterConfig. `FilterPriceList` needs a basic render test mocking `useGetPriceListsQuery`.

---

## Out of Scope

- Pagination on customers endpoint (not in this issue)
- Multi-select for type or price list
- Any changes to `PriceListSelector` component
