# Issue #292 — Purchasing Filter Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `FilterSupplier` and `FilterPurchasingStatus` reusable filter components, register them as named types in the filter system, and refactor `PurchasingPage` and `PurchaseOrdersPage` to use them.

**Architecture:** Follow the exact pattern of `FilterCustomer` / `FilterOrderStatus` — each component owns its own data fetching or static options and renders a `FilterSelect`. Two new named types (`'supplier'`, `'purchasing-status'`) are added to `FilterFieldType` and handled in `FilterBar.tsx`'s `renderQuickField` function.

**Tech Stack:** React 19, TypeScript (strict: false), RTK Query (`purchasingApi`), Material-UI v7, Vitest

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/components/filters/FilterSupplier.tsx` | Create |
| `frontend/src/components/filters/FilterPurchasingStatus.tsx` | Create |
| `frontend/src/components/filters/index.ts` | Modify — add 2 exports |
| `frontend/src/types/filterBar.types.ts` | Modify — add 2 types |
| `frontend/src/components/filters/FilterBar.tsx` | Modify — add 2 render branches |
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Modify — remove inline supplier query + static options |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Modify — remove inline supplier query |

---

### Task 1: Create `FilterSupplier` and `FilterPurchasingStatus` components

**Files:**
- Create: `frontend/src/components/filters/FilterSupplier.tsx`
- Create: `frontend/src/components/filters/FilterPurchasingStatus.tsx`

- [ ] **Step 1: Create `FilterSupplier.tsx`**

```tsx
// frontend/src/components/filters/FilterSupplier.tsx
import { useId } from 'react'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSupplier({ value, onChange }: Props) {
  const uid = useId()
  const { data } = useGetSuppliersQuery({ limit: 999999 })
  const options = (data?.data ?? []).map((supplier) => ({
    value: supplier.id,
    label: supplier.companyName ?? supplier.name,
  }))

  return (
    <FilterSelect
      field={uid}
      label="Supplier"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 2: Create `FilterPurchasingStatus.tsx`**

```tsx
// frontend/src/components/filters/FilterPurchasingStatus.tsx
import { useId } from 'react'
import { FilterSelect } from './FilterSelect'

const PURCHASING_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPurchasingStatus({ value, onChange }: Props) {
  const uid = useId()
  return (
    <FilterSelect
      field={uid}
      label="Order Status"
      type="select"
      value={value}
      options={PURCHASING_STATUS_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "FilterSupplier|FilterPurchasingStatus|error" | head -20
```

Expected: no errors for the new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/FilterSupplier.tsx frontend/src/components/filters/FilterPurchasingStatus.tsx
git commit -m "feat(filters): add FilterSupplier and FilterPurchasingStatus components"
```

---

### Task 2: Register new types in the filter type system

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/index.ts`

- [ ] **Step 1: Update `filterBar.types.ts`**

Add `'supplier'` and `'purchasing-status'` to the `FilterFieldType` union and add their config interfaces. The complete updated file:

```ts
// frontend/src/types/filterBar.types.ts
import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}

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

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

export interface SelectFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'select' | 'multi-select'
  options: FilterOption[]
}

export interface PeriodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'period'
}

export interface CompareFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'compare'
}

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

export interface SupplierFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'supplier'
}

export interface PurchasingStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'purchasing-status'
}

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerFilterFieldConfig<TFilters, keyof TFilters>
  | OrderStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierFilterFieldConfig<TFilters, keyof TFilters>
  | PurchasingStatusFilterFieldConfig<TFilters, keyof TFilters>

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  fields: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
  namespace?: string
}

export interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void
  onSearchCommit: () => void
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void
  onClearField: (field: keyof TFilters) => void
  onClearAll: () => void
}

export interface FilterBarSortConfig {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}
```

- [ ] **Step 2: Update `FilterBar.tsx` — add two render branches**

Add the two new branches immediately after the `'payment-status'` branch (before the final `return null`). The section from line 100 to end of `renderQuickField`:

```tsx
  if (field.type === 'payment-status') {
    return (
      <FilterPaymentStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
        includeOverpaid={field.includeOverpaid}
      />
    )
  }

  if (field.type === 'supplier') {
    return (
      <FilterSupplier
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'purchasing-status') {
    return (
      <FilterPurchasingStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  return null
}
```

Also add the two imports at the top of `FilterBar.tsx` alongside the other filter imports:

```tsx
import { FilterPurchasingStatus } from './FilterPurchasingStatus'
import { FilterSupplier } from './FilterSupplier'
```

- [ ] **Step 3: Update `index.ts` — add two exports**

```ts
// frontend/src/components/filters/index.ts
export { FilterBar } from './FilterBar'
export { FilterCompare } from './FilterCompare'
export { FilterCustomer } from './FilterCustomer'
export { FilterOrderStatus } from './FilterOrderStatus'
export { FilterPaymentStatus } from './FilterPaymentStatus'
export { FilterPeriod } from './FilterPeriod'
export { FilterPurchasingStatus } from './FilterPurchasingStatus'
export { FilterSupplier } from './FilterSupplier'
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "filterBar|FilterBar|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/filterBar.types.ts frontend/src/components/filters/FilterBar.tsx frontend/src/components/filters/index.ts
git commit -m "feat(filters): register supplier and purchasing-status filter types"
```

---

### Task 3: Refactor `PurchasingPage.tsx`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`

- [ ] **Step 1: Remove inline supplier query and update filter config**

Remove lines 77–81 (the `suppliersData` / `supplierOptions` block) and update the two filter fields. The import line `import { useGetSuppliersQuery } from '@/store/api/purchasingApi'` should also be removed.

The updated imports block (top of file):

```tsx
import { usePurchasingAnalytics } from './hooks/usePurchasingAnalytics'
import { resolveApiParams } from '@/utils/dashboardApiParams'
import type { DashboardCompare } from '@/utils/dashboardApiParams'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
```

(Remove the `useGetSuppliersQuery` import — `purchasingApi` is no longer needed in this file.)

The updated `purchasingConfig` fields array (replace the `supplierId` and `status` field entries):

```tsx
  const purchasingConfig: FilterBarConfig<PurchasingDashboardFilters> = {
    namespace: 'purchasing',
    fields: [
      {
        field: 'period',
        label: 'Period',
        type: 'period',
      },
      {
        field: 'compareWith',
        label: 'Compare',
        type: 'compare',
      },
      {
        field: 'supplierId',
        label: 'Supplier',
        type: 'supplier',
        paramKey: 'supplier',
      },
      {
        field: 'status',
        label: 'Order Status',
        type: 'purchasing-status',
        paramKey: 'status',
      },
      {
        field: 'paymentStatus',
        label: 'Payment Status',
        type: 'payment-status',
        paramKey: 'payment',
      },
    ],
    defaults: {
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      supplierId: null,
      status: null,
      paymentStatus: null,
    },
  }
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "PurchasingPage|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Run existing purchasing page tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/ 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/PurchasingPage.tsx
git commit -m "refactor(purchasing): use FilterSupplier and FilterPurchasingStatus in PurchasingPage"
```

---

### Task 4: Refactor `PurchaseOrdersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

- [ ] **Step 1: Remove inline supplier query and update filter config**

Remove `useGetSuppliersQuery` from the import on line 23 and remove the `suppliers` local var (lines 48–49). Update the `filterConfig` `useMemo`.

The updated import block for `purchasingApi` (remove `useGetSuppliersQuery`):

```tsx
import {
  useDeletePurchaseOrderMutation,
  useGetPurchaseOrdersQuery,
  useLazyGetPurchaseOrderQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordOrderPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
```

The updated `filterConfig` useMemo (no `[suppliers]` dependency, no `options` array):

```tsx
  const filterConfig = useMemo<FilterBarConfig<PurchaseOrderFilters>>(
    () => ({
      search: { placeholder: 'Search purchase orders...' },
      fields: [
        {
          field: 'supplierId',
          label: 'Supplier',
          type: 'supplier',
        },
      ],
      defaults: {
        search: '',
        supplierId: null,
      },
    }),
    [],
  )
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "PurchaseOrdersPage|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Run existing purchase orders tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/ 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "refactor(purchasing): use FilterSupplier in PurchaseOrdersPage"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full type check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```

Expected: no errors.

- [ ] **Step 2: Run all purchasing tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/ src/components/filters/ 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint 2>&1 | grep -E "PurchasingPage|PurchaseOrdersPage|FilterSupplier|FilterPurchasingStatus|error" | head -20
```

Expected: no errors in touched files.
