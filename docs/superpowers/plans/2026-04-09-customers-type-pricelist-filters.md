# Customer Type & Price List Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Customer Type and Price List filters to the Customers page FilterBar, and fix the backend `priceListId` filter that was silently ignored.

**Architecture:** The backend fix is a one-line addition to `CustomerService.findAll` — add `priceListId` to the query builder. The frontend adds a new `FilterPriceList` component (following the `FilterSupplier` pattern), registers `'price-list'` as a new filter type across the type system, `FilterBar`, and URL serialization, then wires both new filters into `CustomersPage`.

**Tech Stack:** NestJS / TypeORM (backend), React 19 / RTK Query / MUI v7 / Vitest (frontend)

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/src/modules/sales/services/customer.service.ts` |
| Modify | `backend/src/modules/sales/services/customer.service.spec.ts` |
| Create | `frontend/src/components/filters/FilterPriceList.tsx` |
| Create | `frontend/src/components/filters/__tests__/FilterPriceList.test.tsx` |
| Modify | `frontend/src/components/filters/index.ts` |
| Modify | `frontend/src/types/filterBar.types.ts` |
| Modify | `frontend/src/components/filters/FilterBar.tsx` |
| Modify | `frontend/src/utils/filterBar.url.ts` |
| Modify | `frontend/src/pages/sales/CustomersPage.tsx` |

---

## Task 1: Fix backend priceListId filter

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts:87-101`
- Test: `backend/src/modules/sales/services/customer.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Open `backend/src/modules/sales/services/customer.service.spec.ts`. After the closing `})` of the `'pagination removal'` describe block (around line 125), add a new describe block:

```ts
describe('findAll filters', () => {
  it('applies priceListId filter via query builder', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    customerRepository.createQueryBuilder.mockReturnValue(qb as any);

    await service.findAll({ priceListId: 'pl-uuid-1' });

    expect(qb.andWhere).toHaveBeenCalledWith(
      'customer.priceListId = :priceListId',
      { priceListId: 'pl-uuid-1' },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: FAIL — `andWhere` not called with priceListId args.

- [ ] **Step 3: Implement the fix**

In `backend/src/modules/sales/services/customer.service.ts`, update `findAll`. Change the destructure on line ~88 from:

```ts
const {
  search,
  type,
  isActive,
  sortBy = 'name',
  sortOrder = 'ASC',
} = query;
```

to:

```ts
const {
  search,
  type,
  priceListId,
  isActive,
  sortBy = 'name',
  sortOrder = 'ASC',
} = query;
```

Then add this block immediately after the `if (isActive !== undefined) where.isActive = isActive;` line (~line 100):

```ts
if (priceListId) {
  queryBuilder.andWhere('customer.priceListId = :priceListId', { priceListId });
}
```

Note: this `andWhere` must be placed **after** `queryBuilder` is initialized (after the `createQueryBuilder` call on line ~104) and after the `Object.entries(where)` loop. The correct insertion point is after the loop that applies `where` conditions and before the `if (search)` block. The full sequence in `findAll` becomes:

```ts
// Use query builder for case-insensitive sorting
let queryBuilder = this.customerRepository.createQueryBuilder('customer')
  .leftJoinAndSelect('customer.priceList', 'priceList');

// Apply base where conditions
Object.entries(where).forEach(([key, value]) => {
  queryBuilder.andWhere(`customer.${key} = :${key}`, { [key]: value });
});

// Apply priceListId filter
if (priceListId) {
  queryBuilder.andWhere('customer.priceListId = :priceListId', { priceListId });
}

// Apply search conditions
if (search) {
  queryBuilder.andWhere(
    '(customer.name ILIKE :search OR customer.phone ILIKE :search)',
    { search: `%${search}%` }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "fix(sales): apply priceListId filter in CustomerService.findAll"
```

---

## Task 2: Create FilterPriceList component and test

**Files:**
- Create: `frontend/src/components/filters/FilterPriceList.tsx`
- Create: `frontend/src/components/filters/__tests__/FilterPriceList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/filters/__tests__/FilterPriceList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterPriceList } from '../FilterPriceList'

const { useGetPriceListsQuery } = vi.hoisted(() => ({
  useGetPriceListsQuery: vi.fn(() => ({
    data: {
      data: [
        { id: 'pl1', name: 'Retail' },
        { id: 'pl2', name: 'Wholesale' },
      ],
    },
  })),
}))

vi.mock('@/store/api/priceListApi', () => ({
  useGetPriceListsQuery,
}))

function renderWithStore(ui: ReactElement) {
  const store = configureStore({ reducer: {} })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('FilterPriceList', () => {
  it('renders with Price List label', () => {
    renderWithStore(<FilterPriceList value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/price list/i)).toBeInTheDocument()
  })

  it('shows price list names as options', async () => {
    renderWithStore(<FilterPriceList value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Retail')).toBeInTheDocument()
    expect(await screen.findByText('Wholesale')).toBeInTheDocument()
  })

  it('queries only active price lists', () => {
    renderWithStore(<FilterPriceList value={null} onChange={vi.fn()} />)
    expect(useGetPriceListsQuery).toHaveBeenCalledWith({ page: 1, limit: 200, isActive: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPriceList.test.tsx
```

Expected: FAIL — `FilterPriceList` module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/filters/FilterPriceList.tsx`:

```tsx
import { useId } from 'react'
import { useGetPriceListsQuery } from '@/store/api/priceListApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPriceList({ value, onChange }: Props) {
  const uid = useId()
  const { data } = useGetPriceListsQuery({ page: 1, limit: 200, isActive: true })
  const options = (data?.data ?? []).map((pl) => ({
    value: pl.id,
    label: pl.name,
  }))

  return (
    <FilterSelect
      field={uid}
      label="Price List"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPriceList.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterPriceList.tsx frontend/src/components/filters/__tests__/FilterPriceList.test.tsx
git commit -m "feat(filters): add FilterPriceList component"
```

---

## Task 3: Register price-list filter type in the type system and FilterBar

**Files:**
- Modify: `frontend/src/components/filters/index.ts`
- Modify: `frontend/src/types/filterBar.types.ts`
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/utils/filterBar.url.ts`

- [ ] **Step 1: Export FilterPriceList from index**

In `frontend/src/components/filters/index.ts`, add the export after the `FilterPurchasingStatus` line:

```ts
export { FilterPriceList } from './FilterPriceList'
```

- [ ] **Step 2: Add price-list to the type system**

In `frontend/src/types/filterBar.types.ts`:

Add `'price-list'` to `FilterFieldType` (after `'stock-status'`):

```ts
export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'period'
  | 'compare'
  | 'customer'
  | 'order-status'
  | 'payment-status'
  | 'supplier'
  | 'purchasing-status'
  | 'category'
  | 'product-type'
  | 'stock-status'
  | 'price-list'
```

Add the config interface after `StockStatusFilterFieldConfig`:

```ts
export interface PriceListFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'price-list'
}
```

Add `PriceListFilterFieldConfig` to the `FilterFieldConfig` union (after `StockStatusFilterFieldConfig`):

```ts
export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerFilterFieldConfig<TFilters, keyof TFilters>
  | OrderStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierFilterFieldConfig<TFilters, keyof TFilters>
  | PurchasingStatusFilterFieldConfig<TFilters, keyof TFilters>
  | CategoryFilterFieldConfig<TFilters, keyof TFilters>
  | ProductTypeFilterFieldConfig<TFilters, keyof TFilters>
  | StockStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PriceListFilterFieldConfig<TFilters, keyof TFilters>
```

- [ ] **Step 3: Add FilterPriceList branch to FilterBar**

In `frontend/src/components/filters/FilterBar.tsx`:

Add the import at the top with the other filter imports:

```ts
import { FilterPriceList } from './FilterPriceList'
```

Add a branch in `renderQuickField` after the `if (field.type === 'supplier')` block (around line 124):

```tsx
if (field.type === 'price-list') {
  return (
    <FilterPriceList
      key={String(field.field)}
      value={(value as string | null) ?? null}
      onChange={onChange as (value: string | null) => void}
    />
  )
}
```

- [ ] **Step 4: Add price-list to URL serialization**

In `frontend/src/utils/filterBar.url.ts`, there are two `isSingleValueField` blocks (around lines 67–76 and 143–152). In **both**, add `field.type === 'price-list'` to the condition:

First block (around line 67):
```ts
const isSingleValueField =
  field.type === 'select' ||
  field.type === 'customer' ||
  field.type === 'order-status' ||
  field.type === 'payment-status' ||
  field.type === 'supplier' ||
  field.type === 'purchasing-status' ||
  field.type === 'category' ||
  field.type === 'product-type' ||
  field.type === 'stock-status' ||
  field.type === 'price-list'
```

Second block (around line 143) — same change:
```ts
const isSingleValueField =
  field.type === 'select' ||
  field.type === 'customer' ||
  field.type === 'order-status' ||
  field.type === 'payment-status' ||
  field.type === 'supplier' ||
  field.type === 'purchasing-status' ||
  field.type === 'category' ||
  field.type === 'product-type' ||
  field.type === 'stock-status' ||
  field.type === 'price-list'
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/index.ts frontend/src/types/filterBar.types.ts frontend/src/components/filters/FilterBar.tsx frontend/src/utils/filterBar.url.ts
git commit -m "feat(filters): register price-list filter type in FilterBar system"
```

---

## Task 4: Wire filters into CustomersPage

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Update CustomerFilters interface**

In `frontend/src/pages/sales/CustomersPage.tsx`, replace the `CustomerFilters` interface (lines 23–26):

```ts
interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'individual' | 'business' | null
  priceListId: string | null
}
```

- [ ] **Step 2: Add new fields to filterConfig**

In the `filterConfig` useMemo, add two new entries to the `fields` array after the existing `status` field, and update `defaults`:

```ts
const filterConfig = useMemo<FilterBarConfig<CustomerFilters>>(
  () => ({
    search: { placeholder: 'Search by name or phone...' },
    fields: [
      {
        field: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
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
    ],
    defaults: { search: '', status: null, type: null, priceListId: null },
  }),
  [],
)
```

- [ ] **Step 3: Pass new filters to customerQueryParams**

Replace the `customerQueryParams` useMemo (lines 75–88):

```ts
const customerQueryParams = useMemo(
  () => ({
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
    type: appliedFilters.type ?? undefined,
    priceListId: appliedFilters.priceListId ?? undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }),
  [appliedFilters, sortBy, sortOrder],
)
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Run CustomersPage-related tests**

```bash
cd frontend && npx vitest run src/pages/sales
```

Expected: all tests PASS. If any test asserts on `filterConfig` shape or `customerQueryParams` and fails, update the mock/expected values to include the new `type` and `priceListId` fields.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): add Customer Type and Price List filters to CustomersPage"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run full backend test suite for affected module**

```bash
cd backend && npx jest src/modules/sales --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 2: Run full frontend filter test suite**

```bash
cd frontend && npx vitest run src/components/filters
```

Expected: all tests PASS.

- [ ] **Step 3: TypeScript check (full)**

```bash
cd frontend && npm run type-check
```

Expected: no errors.
