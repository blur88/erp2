# Supplier Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Supplier Type" filter (`local` / `international`) to the Suppliers page filter bar, wired to the existing backend `type` query parameter.

**Architecture:** Mirror the `customer-type` filter pattern exactly — new `FilterSupplierType` component wraps the shared `FilterSelect`, registered in `filterBar.types.ts` and `FilterBar.tsx`, then consumed in `SuppliersPage.tsx`.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/types/filterBar.types.ts` |
| Create | `frontend/src/components/filters/FilterSupplierType.tsx` |
| Modify | `frontend/src/components/filters/FilterBar.tsx` |
| Modify | `frontend/src/pages/purchasing/SuppliersPage.tsx` |
| Modify | `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx` |

---

### Task 1: Add `supplier-type` to the filter type system

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`

- [ ] **Step 1: Add the type and interface**

In `frontend/src/types/filterBar.types.ts`, make three edits:

**1a.** Add `'supplier-type'` to the `FilterFieldType` union (after `'product-type'`):

```typescript
export type FilterFieldType =
  | 'status'
  | 'user-status'
  | 'customer-type'
  | 'supplier-type'
  | 'role'
  | 'stock-adjustment-status'
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

**1b.** Add the interface after `CustomerTypeFilterFieldConfig`:

```typescript
export interface SupplierTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'supplier-type'
}
```

**1c.** Add it to the `FilterFieldConfig` union (after `CustomerTypeFilterFieldConfig<TFilters, keyof TFilters>`):

```typescript
export type FilterFieldConfig<TFilters> =
  | StatusFilterFieldConfig<TFilters, keyof TFilters>
  | UserStatusFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerTypeFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierTypeFilterFieldConfig<TFilters, keyof TFilters>
  | RoleFilterFieldConfig<TFilters, keyof TFilters>
  | StockAdjustmentStatusFilterFieldConfig<TFilters, keyof TFilters>
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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/types/filterBar.types.ts
git commit -m "feat(filters): add supplier-type to FilterFieldType"
```

---

### Task 2: Create `FilterSupplierType` component

**Files:**
- Create: `frontend/src/components/filters/FilterSupplierType.tsx`

- [ ] **Step 1: Write the failing test**

No dedicated unit test file needed — the component is a trivial wrapper (same as `FilterCustomerType` which has none). It will be covered by the page-level filter bar test in Task 4.

- [ ] **Step 2: Create the component**

Create `frontend/src/components/filters/FilterSupplierType.tsx`:

```tsx
import { FilterSelect } from './FilterSelect'

const SUPPLIER_TYPE_OPTIONS = [
  { value: 'local', label: 'Local' },
  { value: 'international', label: 'International' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSupplierType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Supplier Type"
      value={value}
      options={SUPPLIER_TYPE_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/filters/FilterSupplierType.tsx
git commit -m "feat(filters): add FilterSupplierType component"
```

---

### Task 3: Register `supplier-type` in `FilterBar`

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Add import**

In `frontend/src/components/filters/FilterBar.tsx`, add the import after `FilterCustomerType`:

```typescript
import { FilterSupplierType } from './FilterSupplierType'
```

- [ ] **Step 2: Add the branch in `renderQuickField`**

After the `customer-type` branch (lines ~59–68), add:

```typescript
  if (field.type === 'supplier-type') {
    return (
      <FilterSupplierType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/filters/FilterBar.tsx
git commit -m "feat(filters): register supplier-type in FilterBar"
```

---

### Task 4: Wire the filter into `SuppliersPage`

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`, add two test cases inside the existing `describe('SuppliersPage FilterBar', ...)` block:

```typescript
  it('passes type=local to query when type filter is set', () => {
    renderPage('/?type=local')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'local' }),
    )
  })

  it('does not pass type when type filter is unset', () => {
    renderPage('/')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ type: expect.anything() }),
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
```

Expected: the two new tests FAIL (type is not passed yet).

- [ ] **Step 3: Update `SuppliersPage.tsx`**

In `frontend/src/pages/purchasing/SuppliersPage.tsx`:

**3a.** Extend the `SupplierFilters` interface:

```typescript
interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'local' | 'international' | null
}
```

**3b.** Update `filterConfig` to add the type field and default:

```typescript
  const filterConfig = useMemo<FilterBarConfig<SupplierFilters>>(
    () => ({
      search: { placeholder: 'Search by company name...' },
      fields: [
        { field: 'status', label: 'Status', type: 'status' },
        { field: 'type', label: 'Supplier Type', type: 'supplier-type' },
      ],
      defaults: { search: '', status: null, type: null },
    }),
    [],
  )
```

**3c.** Add `type` to `supplierQueryParams`:

```typescript
  const supplierQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
      type: appliedFilters.type ?? undefined,
    }),
    [appliedFilters],
  )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/purchasing/SuppliersPage.tsx src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
git commit -m "feat(suppliers): add supplier type filter to SuppliersPage

Closes #323"
```
