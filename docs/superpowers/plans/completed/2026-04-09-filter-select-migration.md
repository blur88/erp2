# Filter Select Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic `FilterSelect` component as a `FilterBar` type with dedicated filter components for each filter, fixing the MUI label-clipping bug (issue #320) and making all filters easy to find and manage.

**Architecture:** `FilterSelect` stays as the shared MUI rendering primitive (used internally by all dedicated components). Four new dedicated components are created (`FilterStatus`, `FilterCustomerType`, `FilterRole`, `FilterStockAdjustmentStatus`). All 10 remaining `type: 'select'` usages in page configs are replaced with dedicated types. The `select`/`multi-select` generic fallback is removed from `FilterBar` and `filterBar.types.ts`.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vitest + Testing Library

---

## File Map

**Modified:**
- `frontend/src/components/filters/FilterSelect.tsx` — fix MUI label bug, remove multi-select branch, simplify props
- `frontend/src/components/filters/FilterBar.tsx` — add 4 new type branches, remove select/multi-select branch
- `frontend/src/components/filters/FilterStockStatus.tsx` — remove `useId()`, accept `field` prop
- `frontend/src/components/filters/FilterSupplier.tsx` — remove `useId()`, accept `field` prop
- `frontend/src/components/filters/FilterCategory.tsx` — remove `useId()`, accept `field` prop
- `frontend/src/types/filterBar.types.ts` — add 4 new types, remove select/multi-select, remove `SelectFilterFieldConfig`
- `frontend/src/pages/sales/CustomersPage.tsx` — update filter config
- `frontend/src/pages/purchasing/SuppliersPage.tsx` — update filter config
- `frontend/src/pages/settings/PriceListsPage.tsx` — update filter config
- `frontend/src/pages/settings/UserManagementPage.tsx` — update filter config
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` — update filter config
- `frontend/src/pages/inventory/InventoryPage.tsx` — update filter config
- `frontend/src/components/filters/__tests__/FilterSelect.test.tsx` — remove multi-select tests, update minWidth default test
- `frontend/src/components/filters/__tests__/FilterBar.test.tsx` — replace select type with status type

**Created:**
- `frontend/src/components/filters/FilterStatus.tsx`
- `frontend/src/components/filters/FilterCustomerType.tsx`
- `frontend/src/components/filters/FilterRole.tsx`
- `frontend/src/components/filters/FilterStockAdjustmentStatus.tsx`

---

### Task 1: Fix `FilterSelect` — remove multi-select branch and fix MUI label bug

**Files:**
- Modify: `frontend/src/components/filters/FilterSelect.tsx`
- Modify: `frontend/src/components/filters/__tests__/FilterSelect.test.tsx`

- [ ] **Step 1: Update the tests first**

Replace the entire contents of `frontend/src/components/filters/__tests__/FilterSelect.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterSelect } from '../FilterSelect'

describe('FilterSelect', () => {
  it('renders a custom empty label', async () => {
    render(
      <FilterSelect
        field="customer"
        label="Customer"
        value={null}
        options={[{ value: 'c1', label: 'Acme Corp' }]}
        onChange={vi.fn()}
        emptyLabel="All Customers"
      />,
    )

    await userEvent.click(screen.getByLabelText('Customer'))

    expect(screen.getByText('All Customers')).toBeInTheDocument()
  })

  it('applies a custom minWidth', () => {
    const { container } = render(
      <FilterSelect
        field="customer"
        label="Customer"
        value={null}
        options={[{ value: 'c1', label: 'Acme Corp' }]}
        onChange={vi.fn()}
        minWidth={170}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '170px' })
  })

  it('defaults empty label to All when emptyLabel is omitted', async () => {
    render(
      <FilterSelect
        field="status"
        label="Status"
        value={null}
        options={[{ value: 'active', label: 'Active' }]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByLabelText('Status'))

    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('defaults minWidth to 160 when minWidth is omitted', () => {
    const { container } = render(
      <FilterSelect
        field="status"
        label="Status"
        value={null}
        options={[{ value: 'active', label: 'Active' }]}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '160px' })
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail (minWidth default is still 140)**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterSelect.test.tsx
```

Expected: FAIL — `defaults minWidth to 160` fails because default is still 140. Other tests referencing `type` prop will also fail.

- [ ] **Step 3: Rewrite `FilterSelect.tsx`**

Replace the entire contents of `frontend/src/components/filters/FilterSelect.tsx`:

```tsx
import {
  FormControl,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
} from '@mui/material'

import type { FilterOption } from '@/types/filterBar.types'

interface Props {
  field: string
  label: string
  value: string | null
  options: FilterOption[]
  onChange: (value: string | null) => void
  emptyLabel?: string
  minWidth?: number
}

export function FilterSelect({ field, label, value, options, onChange, emptyLabel, minWidth }: Props) {
  const labelId = `filter-${field}-label`

  return (
    <FormControl size="small" sx={{ minWidth: minWidth ?? 160 }}>
      <InputLabel id={labelId} shrink>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value ?? ''}
        displayEmpty
        input={<OutlinedInput label={label} notched />}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <MenuItem value="">{emptyLabel ?? 'All'}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterSelect.test.tsx
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/filters/FilterSelect.tsx src/components/filters/__tests__/FilterSelect.test.tsx
git commit -m "fix: fix FilterSelect MUI label clipping and remove unused multi-select branch (#320)"
```

---

### Task 2: Create `FilterStatus`, `FilterCustomerType`, `FilterRole`, `FilterStockAdjustmentStatus`

**Files:**
- Create: `frontend/src/components/filters/FilterStatus.tsx`
- Create: `frontend/src/components/filters/FilterCustomerType.tsx`
- Create: `frontend/src/components/filters/FilterRole.tsx`
- Create: `frontend/src/components/filters/FilterStockAdjustmentStatus.tsx`

- [ ] **Step 1: Create `FilterStatus.tsx`**

```tsx
import { FilterSelect } from './FilterSelect'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 2: Create `FilterCustomerType.tsx`**

```tsx
import { FilterSelect } from './FilterSelect'

const CUSTOMER_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCustomerType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Customer Type"
      value={value}
      options={CUSTOMER_TYPE_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 3: Create `FilterRole.tsx`**

```tsx
import { FilterSelect } from './FilterSelect'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales_staff', label: 'Sales Staff' },
  { value: 'inventory_staff', label: 'Inventory Staff' },
  { value: 'procurement_staff', label: 'Procurement Staff' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterRole({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Role"
      value={value}
      options={ROLE_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 4: Create `FilterStockAdjustmentStatus.tsx`**

```tsx
import { FilterSelect } from './FilterSelect'

const STOCK_ADJUSTMENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStockAdjustmentStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={STOCK_ADJUSTMENT_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/FilterStatus.tsx \
        frontend/src/components/filters/FilterCustomerType.tsx \
        frontend/src/components/filters/FilterRole.tsx \
        frontend/src/components/filters/FilterStockAdjustmentStatus.tsx
git commit -m "feat: add FilterStatus, FilterCustomerType, FilterRole, FilterStockAdjustmentStatus (#320)"
```

---

### Task 3: Update existing dedicated components to accept `field` prop (remove `useId()`)

**Files:**
- Modify: `frontend/src/components/filters/FilterStockStatus.tsx`
- Modify: `frontend/src/components/filters/FilterSupplier.tsx`
- Modify: `frontend/src/components/filters/FilterCategory.tsx`
- Modify: `frontend/src/components/filters/FilterOrderStatus.tsx`
- Modify: `frontend/src/components/filters/FilterPaymentStatus.tsx`
- Modify: `frontend/src/components/filters/FilterPurchasingStatus.tsx`
- Modify: `frontend/src/components/filters/FilterProductType.tsx`
- Modify: `frontend/src/components/filters/FilterPriceList.tsx`
- Modify: `frontend/src/components/filters/FilterCustomer.tsx`

- [ ] **Step 1: Update `FilterStockStatus.tsx`**

Replace the entire file:

```tsx
import { FilterSelect } from './FilterSelect'

const STOCK_STATUS_OPTIONS = [
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStockStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Stock Status"
      value={value}
      options={STOCK_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 2: Update `FilterSupplier.tsx`**

Replace the entire file:

```tsx
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSupplier({ field, value, onChange }: Props) {
  // isLoading kept intentionally — options will be empty until data arrives (acceptable UX)
  const { data } = useGetSuppliersQuery({})
  const options = (data?.data ?? []).map((supplier) => ({
    value: supplier.id,
    label: supplier.companyName,
  }))

  return (
    <FilterSelect
      field={field}
      label="Supplier"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 3: Update `FilterCategory.tsx`**

Replace the entire file:

```tsx
import { useGetCategoriesQuery } from '@/store/api/inventoryApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCategory({ field, value, onChange }: Props) {
  const { data } = useGetCategoriesQuery({})
  const options = [...(data ?? [])]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ value: category.id, label: category.name }))

  return (
    <FilterSelect
      field={field}
      label="Category"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 4: Update `FilterOrderStatus.tsx`**

Replace the entire file:

```tsx
import { FilterSelect } from './FilterSelect'

const ORDER_STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterOrderStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Order Status"
      value={value}
      options={ORDER_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 5: Update `FilterPaymentStatus.tsx`**

Replace the entire file:

```tsx
import { FilterSelect } from './FilterSelect'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
  includeOverpaid?: boolean
}

export function FilterPaymentStatus({ field, value, onChange, includeOverpaid = true }: Props) {
  const options = includeOverpaid
    ? PAYMENT_STATUS_OPTIONS
    : PAYMENT_STATUS_OPTIONS.filter((option) => option.value !== 'overpaid')

  return (
    <FilterSelect
      field={field}
      label="Payment"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 6: Check `FilterPurchasingStatus.tsx`, `FilterProductType.tsx`, `FilterPriceList.tsx`, `FilterCustomer.tsx` — update each to accept and pass `field` prop**

Read each file first, then replace following the same pattern as above (remove `useId()`, add `field: string` to Props, pass `field` to `FilterSelect`).

```bash
cd frontend && cat src/components/filters/FilterPurchasingStatus.tsx
cat src/components/filters/FilterProductType.tsx
cat src/components/filters/FilterPriceList.tsx
cat src/components/filters/FilterCustomer.tsx
```

For each file, replace `useId()` with `field` prop following the exact same pattern used in steps 1–5 above.

- [ ] **Step 7: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: TypeScript errors on `FilterBar.tsx` and pages (still passing `field` via `useId` pattern / not yet passing field). These are expected — will be resolved in Task 4.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/filters/FilterStockStatus.tsx \
        frontend/src/components/filters/FilterSupplier.tsx \
        frontend/src/components/filters/FilterCategory.tsx \
        frontend/src/components/filters/FilterOrderStatus.tsx \
        frontend/src/components/filters/FilterPaymentStatus.tsx \
        frontend/src/components/filters/FilterPurchasingStatus.tsx \
        frontend/src/components/filters/FilterProductType.tsx \
        frontend/src/components/filters/FilterPriceList.tsx \
        frontend/src/components/filters/FilterCustomer.tsx
git commit -m "refactor: remove useId() from dedicated filter components, accept field prop (#320)"
```

---

### Task 4: Update `filterBar.types.ts` — add new types, remove select/multi-select

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`

- [ ] **Step 1: Replace the entire file**

```ts
import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}

export type FilterFieldType =
  | 'status'
  | 'customer-type'
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

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

export interface StatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'status'
}

export interface CustomerTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'customer-type'
}

export interface RoleFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'role'
}

export interface StockAdjustmentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'stock-adjustment-status'
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

export interface CategoryFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'category'
}

export interface ProductTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'product-type'
}

export interface StockStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'stock-status'
}

export interface PriceListFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'price-list'
}

export type FilterFieldConfig<TFilters> =
  | StatusFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerTypeFilterFieldConfig<TFilters, keyof TFilters>
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

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: TypeScript errors on `FilterBar.tsx` (select/multi-select branch still references removed types) and on all page files using `type: 'select'`. These are expected — resolved in Tasks 5 and 6.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/filterBar.types.ts
git commit -m "refactor: add status/customer-type/role/stock-adjustment-status types, remove select/multi-select from filterBar.types (#320)"
```

---

### Task 5: Update `FilterBar.tsx` — wire new types, remove select/multi-select branch

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Update the FilterBar test — replace select type with status type**

In `frontend/src/components/filters/__tests__/FilterBar.test.tsx`, the top-level `config` uses `type: 'select'`. Replace it with `type: 'status'` and remove `options` and `label`:

Find this block (lines 29–35):
```ts
const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  defaults: { search: '', status: null },
}
```

Replace with:
```ts
const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
  ],
  defaults: { search: '', status: null },
}
```

- [ ] **Step 2: Run the FilterBar tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: FAIL — `FilterBar` still routes `type: 'select'` to `FilterSelect`, so `type: 'status'` renders nothing and `getByLabelText(/status/i)` fails.

- [ ] **Step 3: Update `FilterBar.tsx`**

Replace the entire `renderQuickField` function and imports in `frontend/src/components/filters/FilterBar.tsx`. The full new file:

```tsx
import { CircularProgress, Stack } from '@mui/material'

import { FilterCategory } from './FilterCategory'
import { FilterCompare } from './FilterCompare'
import { FilterCustomer } from './FilterCustomer'
import { FilterCustomerType } from './FilterCustomerType'
import { FilterOrderStatus } from './FilterOrderStatus'
import { FilterPaymentStatus } from './FilterPaymentStatus'
import { FilterPeriod } from './FilterPeriod'
import { FilterPriceList } from './FilterPriceList'
import { FilterProductType } from './FilterProductType'
import { FilterPurchasingStatus } from './FilterPurchasingStatus'
import { FilterRole } from './FilterRole'
import { FilterSearch } from './FilterSearch'
import { FilterStatus } from './FilterStatus'
import { FilterStockAdjustmentStatus } from './FilterStockAdjustmentStatus'
import { FilterStockStatus } from './FilterStockStatus'
import { FilterSupplier } from './FilterSupplier'
import { AppButton } from '@/components/common/AppButton'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterBarSortConfig,
  PeriodValue,
} from '@/types/filterBar.types'

interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  sort?: FilterBarSortConfig
  isFetching?: boolean
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['fields'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
  config: FilterBarConfig<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onQuickFilterChange(field.field, nextValue)
  const fieldKey = String(field.field)

  if (field.type === 'status') {
    return (
      <FilterStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'customer-type') {
    return (
      <FilterCustomerType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'role') {
    return (
      <FilterRole
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'stock-adjustment-status') {
    return (
      <FilterStockAdjustmentStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={fieldKey}
        value={periodValue.key}
        customFrom={periodValue.from}
        customTo={periodValue.to}
        onChange={(key, from, to) =>
          onChange({ key, from: from ?? null, to: to ?? null } as PeriodValue)
        }
      />
    )
  }

  if (field.type === 'compare') {
    const periodField = config.fields.find((configField) => configField.type === 'period')
    const periodValue = periodField ? (draftFilters[periodField.field] as PeriodValue) : null

    return (
      <FilterCompare
        key={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
        periodValue={periodValue}
      />
    )
  }

  if (field.type === 'customer') {
    return (
      <FilterCustomer
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'order-status') {
    return (
      <FilterOrderStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'payment-status') {
    return (
      <FilterPaymentStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
        includeOverpaid={field.includeOverpaid}
      />
    )
  }

  if (field.type === 'supplier') {
    return (
      <FilterSupplier
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'price-list') {
    return (
      <FilterPriceList
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange as (value: string | null) => void}
      />
    )
  }

  if (field.type === 'purchasing-status') {
    return (
      <FilterPurchasingStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'category') {
    return (
      <FilterCategory
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'product-type') {
    return (
      <FilterProductType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'stock-status') {
    return (
      <FilterStockStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  return null
}

export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  isFetching,
}: Props<TFilters>) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      {config.search ? (
        <FilterSearch
          value={((draftFilters as Record<string, unknown>).search as string | undefined) ?? ''}
          placeholder={config.search.placeholder}
          onChange={handlers.onSearchChange}
          onCommit={handlers.onSearchCommit}
          inputRef={searchInputRef}
        />
      ) : null}
      {config.fields.map((field) => renderQuickField(field, draftFilters, handlers, config))}
      {sort ? (
        <AppButton
          size="filter"
          sortConfig={{ field: sort.field, sortBy: sort.sortBy, sortOrder: sort.sortOrder }}
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </AppButton>
      ) : null}
      {hasActiveFilters ? (
        <AppButton size="filter" variant="outlined" onClick={handlers.onClearAll}>
          Reset
        </AppButton>
      ) : null}
      {isFetching ? <CircularProgress size={16} /> : null}
    </Stack>
  )
}
```

- [ ] **Step 4: Run the FilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx \
        frontend/src/components/filters/__tests__/FilterBar.test.tsx
git commit -m "refactor: wire new dedicated filter types in FilterBar, remove select/multi-select fallback (#320)"
```

---

### Task 6: Update page filter configs

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx`
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`

- [ ] **Step 1: Update `CustomersPage.tsx`**

Find the filter config fields array (around line 46–70). Replace the two `select` entries:

Old:
```ts
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
```

New:
```ts
{ field: 'status', label: 'Status', type: 'status' },
{ field: 'type', label: 'Customer Type', type: 'customer-type' },
```

- [ ] **Step 2: Update `SuppliersPage.tsx`**

Find and replace the status filter entry:

Old:
```ts
{
  field: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
},
```

New:
```ts
{ field: 'status', label: 'Status', type: 'status' },
```

- [ ] **Step 3: Update `PriceListsPage.tsx`**

Find and replace the status filter entry (same pattern as SuppliersPage).

Old:
```ts
{
  field: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
},
```

New:
```ts
{ field: 'status', label: 'Status', type: 'status' },
```

- [ ] **Step 4: Update `UserManagementPage.tsx`**

Find and replace both select filter entries:

Old:
```ts
{
  field: 'role',
  label: 'Role',
  type: 'select',
  options: [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'sales_staff', label: 'Sales Staff' },
    { value: 'inventory_staff', label: 'Inventory Staff' },
    { value: 'procurement_staff', label: 'Procurement Staff' },
  ],
},
{
  field: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
},
```

New:
```ts
{ field: 'role', label: 'Role', type: 'role' },
{ field: 'status', label: 'Status', type: 'status' },
```

- [ ] **Step 5: Update `StockAdjustmentsPage.tsx`**

Find and replace the status filter entry:

Old:
```ts
{
  field: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { value: 'draft', label: 'Draft' },
    { value: 'completed', label: 'Completed' },
  ],
},
```

New:
```ts
{ field: 'status', label: 'Status', type: 'stock-adjustment-status' },
```

- [ ] **Step 6: Update `InventoryPage.tsx`**

Find the three `type: 'select'` entries in the inventory config and replace:

Old:
```ts
{
  field: 'supplierId',
  label: 'Supplier',
  type: 'select',
  paramKey: 'supplier',
  options: [{ value: '', label: 'All Suppliers' }, ...supplierOptions],
},
{
  field: 'categoryId',
  label: 'Category',
  type: 'select',
  paramKey: 'category',
  options: [{ value: '', label: 'All Categories' }, ...categoryOptions],
},
{
  field: 'stockStatus',
  label: 'Stock Status',
  type: 'select',
  paramKey: 'stock_status',
  options: [
    { value: 'in_stock', label: 'In Stock' },
    { value: 'low_stock', label: 'Low Stock' },
    { value: 'out_of_stock', label: 'Out of Stock' },
  ],
},
```

New:
```ts
{ field: 'supplierId', label: 'Supplier', type: 'supplier', paramKey: 'supplier' },
{ field: 'categoryId', label: 'Category', type: 'category', paramKey: 'category' },
{ field: 'stockStatus', label: 'Stock Status', type: 'stock-status', paramKey: 'stock_status' },
```

Also remove the now-unused `supplierOptions` and `categoryOptions` variables and their associated API query calls if no longer needed elsewhere in the file. Check by searching for other usages of `supplierOptions` and `categoryOptions` in the file first.

- [ ] **Step 7: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 8: Run CustomersPage filter tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx
```

Expected: All tests PASS (the tests check for rendered labels which dedicated components still produce).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx \
        frontend/src/pages/purchasing/SuppliersPage.tsx \
        frontend/src/pages/settings/PriceListsPage.tsx \
        frontend/src/pages/settings/UserManagementPage.tsx \
        frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
        frontend/src/pages/inventory/InventoryPage.tsx
git commit -m "refactor: migrate all page filter configs from select type to dedicated types (#320)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run all filter-related tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterSelect.test.tsx \
  src/components/filters/__tests__/FilterBar.test.tsx \
  src/pages/sales/__tests__/CustomersPage.filter.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: No errors.

- [ ] **Step 4: Confirm `FilterSelect` is no longer imported in any page file**

```bash
grep -r "FilterSelect" frontend/src/pages/
```

Expected: No output (pages no longer reference `FilterSelect` directly).

- [ ] **Step 5: Confirm `type: 'select'` is gone from all page configs**

```bash
grep -r "type: 'select'" frontend/src/pages/
```

Expected: No output.

- [ ] **Step 6: Commit if any lint fixes were made, otherwise done**

```bash
git status
# only commit if there are changes from lint auto-fix
```
