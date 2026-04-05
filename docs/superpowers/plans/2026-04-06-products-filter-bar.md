# Products Page Filter Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Category, Product Type, and Stock Status filters to `ProductsPage` while removing the existing Status filter, using the standard `FilterBar` system.

**Architecture:** Three new dedicated filter components follow the existing `FilterSupplier`/`FilterPurchasingStatus` patterns. New field types are registered in `filterBar.types.ts` and handled in `FilterBar.tsx`. `ProductsPage` maps filter values to backend query params (`categoryId`, `type`, `lowStock`, `outOfStock`).

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/components/filters/FilterCategory.tsx` |
| Create | `frontend/src/components/filters/FilterProductType.tsx` |
| Create | `frontend/src/components/filters/FilterStockStatus.tsx` |
| Modify | `frontend/src/types/filterBar.types.ts` |
| Modify | `frontend/src/components/filters/FilterBar.tsx` |
| Modify | `frontend/src/pages/inventory/ProductsPage.tsx` |
| Modify | `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx` |

---

### Task 1: Add new field types to `filterBar.types.ts`

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`

- [ ] **Step 1: Add the three new field types and config interfaces**

Open `frontend/src/types/filterBar.types.ts`. Make the following changes:

1. Add `'category' | 'product-type' | 'stock-status'` to `FilterFieldType`:

```typescript
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
```

2. Add three new config interfaces after `PurchasingStatusFilterFieldConfig`:

```typescript
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
```

3. Add all three to the `FilterFieldConfig` union:

```typescript
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
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/filterBar.types.ts
git commit -m "feat(filters): add category, product-type, stock-status to FilterFieldType"
```

---

### Task 2: Create `FilterProductType.tsx`

**Files:**
- Create: `frontend/src/components/filters/FilterProductType.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/src/components/filters/FilterProductType.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterProductType } from './FilterProductType'

describe('FilterProductType', () => {
  it('renders a Product Type select', () => {
    render(<FilterProductType value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Product Type')).toBeInTheDocument()
  })

  it('calls onChange with "goods" when Goods is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterProductType value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Product Type'))
    await user.click(screen.getByRole('option', { name: 'Goods' }))

    expect(onChange).toHaveBeenCalledWith('goods')
  })

  it('calls onChange with "service" when Service is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterProductType value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Product Type'))
    await user.click(screen.getByRole('option', { name: 'Service' }))

    expect(onChange).toHaveBeenCalledWith('service')
  })

  it('calls onChange with null when All is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterProductType value="goods" onChange={onChange} />)

    await user.click(screen.getByLabelText('Product Type'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/filters/FilterProductType.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FilterProductType.tsx`**

Create `frontend/src/components/filters/FilterProductType.tsx`:

```typescript
import { useId } from 'react'

import { FilterSelect } from './FilterSelect'

const PRODUCT_TYPE_OPTIONS = [
  { value: 'goods', label: 'Goods' },
  { value: 'service', label: 'Service' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterProductType({ value, onChange }: Props) {
  const uid = useId()

  return (
    <FilterSelect
      field={uid}
      label="Product Type"
      type="select"
      value={value}
      options={PRODUCT_TYPE_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/filters/FilterProductType.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterProductType.tsx frontend/src/components/filters/FilterProductType.test.tsx
git commit -m "feat(filters): add FilterProductType component"
```

---

### Task 3: Create `FilterStockStatus.tsx`

**Files:**
- Create: `frontend/src/components/filters/FilterStockStatus.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/src/components/filters/FilterStockStatus.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterStockStatus } from './FilterStockStatus'

describe('FilterStockStatus', () => {
  it('renders a Stock Status select', () => {
    render(<FilterStockStatus value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Stock Status')).toBeInTheDocument()
  })

  it('calls onChange with "low_stock" when Low Stock is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterStockStatus value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Stock Status'))
    await user.click(screen.getByRole('option', { name: 'Low Stock' }))

    expect(onChange).toHaveBeenCalledWith('low_stock')
  })

  it('calls onChange with "out_of_stock" when Out of Stock is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterStockStatus value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Stock Status'))
    await user.click(screen.getByRole('option', { name: 'Out of Stock' }))

    expect(onChange).toHaveBeenCalledWith('out_of_stock')
  })

  it('calls onChange with null when All is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterStockStatus value="low_stock" onChange={onChange} />)

    await user.click(screen.getByLabelText('Stock Status'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/filters/FilterStockStatus.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FilterStockStatus.tsx`**

Create `frontend/src/components/filters/FilterStockStatus.tsx`:

```typescript
import { useId } from 'react'

import { FilterSelect } from './FilterSelect'

const STOCK_STATUS_OPTIONS = [
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStockStatus({ value, onChange }: Props) {
  const uid = useId()

  return (
    <FilterSelect
      field={uid}
      label="Stock Status"
      type="select"
      value={value}
      options={STOCK_STATUS_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/filters/FilterStockStatus.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterStockStatus.tsx frontend/src/components/filters/FilterStockStatus.test.tsx
git commit -m "feat(filters): add FilterStockStatus component"
```

---

### Task 4: Create `FilterCategory.tsx`

**Files:**
- Create: `frontend/src/components/filters/FilterCategory.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/src/components/filters/FilterCategory.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterCategory } from './FilterCategory'

const { useGetCategoriesQuery } = vi.hoisted(() => ({
  useGetCategoriesQuery: vi.fn(),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoriesQuery,
}))

describe('FilterCategory', () => {
  it('renders a Category select with no options while loading', () => {
    useGetCategoriesQuery.mockReturnValue({ data: undefined })
    render(<FilterCategory value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Category')).toBeInTheDocument()
  })

  it('renders category options from the API sorted alphabetically', async () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [
        { id: '2', name: 'Beverages' },
        { id: '1', name: 'Apparel' },
        { id: '3', name: 'Electronics' },
      ],
    })
    const user = userEvent.setup()
    render(<FilterCategory value={null} onChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Category'))

    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['All', 'Apparel', 'Beverages', 'Electronics'])
  })

  it('calls onChange with the category id when a category is selected', async () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [{ id: 'abc-123', name: 'Electronics' }],
    })
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterCategory value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Category'))
    await user.click(screen.getByRole('option', { name: 'Electronics' }))

    expect(onChange).toHaveBeenCalledWith('abc-123')
  })

  it('calls onChange with null when All is selected', async () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [{ id: 'abc-123', name: 'Electronics' }],
    })
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterCategory value="abc-123" onChange={onChange} />)

    await user.click(screen.getByLabelText('Category'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/filters/FilterCategory.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FilterCategory.tsx`**

Create `frontend/src/components/filters/FilterCategory.tsx`:

```typescript
import { useId } from 'react'
import { useGetCategoriesQuery } from '@/store/api/inventoryApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCategory({ value, onChange }: Props) {
  const uid = useId()
  const { data } = useGetCategoriesQuery({})
  const options = [...(data ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((category) => ({ value: category.id, label: category.name }))

  return (
    <FilterSelect
      field={uid}
      label="Category"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/filters/FilterCategory.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterCategory.tsx frontend/src/components/filters/FilterCategory.test.tsx
git commit -m "feat(filters): add FilterCategory component"
```

---

### Task 5: Register new components in `FilterBar.tsx`

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Add imports and three new `if` blocks in `renderQuickField`**

In `frontend/src/components/filters/FilterBar.tsx`:

1. Add three imports after the existing component imports (after `FilterSupplier`):

```typescript
import { FilterCategory } from './FilterCategory'
import { FilterProductType } from './FilterProductType'
import { FilterStockStatus } from './FilterStockStatus'
```

2. Add three `if` blocks in `renderQuickField` after the `purchasing-status` block (before `return null`):

```typescript
  if (field.type === 'category') {
    return (
      <FilterCategory
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'product-type') {
    return (
      <FilterProductType
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'stock-status') {
    return (
      <FilterStockStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx
git commit -m "feat(filters): register FilterCategory, FilterProductType, FilterStockStatus in FilterBar"
```

---

### Task 6: Update `ProductsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`

- [ ] **Step 1: Update `InventoryProductFilters`, `filterConfig`, `defaults`, and `productQueryParams`**

In `frontend/src/pages/inventory/ProductsPage.tsx`, make the following changes:

1. Replace the `InventoryProductFilters` interface:

```typescript
interface InventoryProductFilters {
  search: string
  categoryId: string | null
  type: 'goods' | 'service' | null
  stockStatus: 'low_stock' | 'out_of_stock' | null
}
```

2. Replace the `filterConfig` `fields` array and `defaults`:

```typescript
  const filterConfig = useMemo<FilterBarConfig<InventoryProductFilters>>(
    () => ({
      search: { placeholder: 'Search by name, barcode, or brand...' },
      fields: [
        { field: 'categoryId', label: 'Category', type: 'category' },
        { field: 'type', label: 'Product Type', type: 'product-type' },
        { field: 'stockStatus', label: 'Stock Status', type: 'stock-status' },
      ],
      defaults: {
        search: '',
        categoryId: null,
        type: null,
        stockStatus: null,
      },
    }),
    [],
  )
```

3. Replace `productQueryParams`:

```typescript
  const productQueryParams = useMemo(() => ({
    search: appliedFilters.search || undefined,
    categoryId: appliedFilters.categoryId ?? undefined,
    type: appliedFilters.type ?? undefined,
    lowStock: appliedFilters.stockStatus === 'low_stock' ? true : undefined,
    outOfStock: appliedFilters.stockStatus === 'out_of_stock' ? true : undefined,
  }), [appliedFilters])
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "feat(inventory): update ProductsPage filter bar with category, type, stockStatus filters"
```

---

### Task 7: Update `ProductsPage.filterbar.test.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`

- [ ] **Step 1: Update existing test and add new tests**

The existing test `'restores filters from URL into the products query'` passes `?status=inactive` which no longer maps to anything. Update it and add tests for the new filters.

Replace the full contents of `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProductsPage } from '../ProductsPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetProductsQuery, useGetCategoriesQuery } = vi.hoisted(() => ({
  useGetProductsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    refetch: vi.fn(),
  })),
  useGetCategoriesQuery: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery,
  useGetCategoriesQuery,
  useDeleteProductMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('../components/ProductsTable', () => ({ default: () => <div>ProductsTable</div> }))
vi.mock('../components/ProductDetailsPanel', () => ({ default: () => <div>ProductDetailsPanel</div> }))
vi.mock('../components/ProductsDialogs', () => ({ default: () => <div>ProductsDialogs</div> }))
vi.mock('../hooks/useProductsActions', () => ({
  useProductsActions: () => ({
    handleAddProduct: vi.fn(),
    handleEditProduct: vi.fn(),
    handleDeleteProduct: vi.fn(),
    handleConfirmDelete: vi.fn(),
    handleCancelDelete: vi.fn(),
    handleExportClick: vi.fn(),
    handleExportClose: vi.fn(),
    handleExport: vi.fn(),
  }),
}))
vi.mock('../hooks/useProductsSelection', () => ({
  useProductsSelection: () => ({
    handleProductSelect: vi.fn(),
    handleProductListFocus: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleNavigateHome: vi.fn(),
    handleNavigateEnd: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleEnterAction: vi.fn(),
    handleEscapeAction: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: {
      inventory: inventoryReducer,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ProductsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ProductsPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGetProductsQuery.mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isFetching: false,
      refetch: vi.fn(),
    })
    useGetCategoriesQuery.mockReturnValue({ data: [] })
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name, barcode, or brand/i)).toBeInTheDocument()
  })

  it('restores search from URL into the products query', () => {
    renderPage('/?search=gundam')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'gundam' }),
    )
  })

  it('restores categoryId from URL into the products query', () => {
    renderPage('/?categoryId=cat-uuid-123')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: 'cat-uuid-123' }),
    )
  })

  it('restores type from URL into the products query', () => {
    renderPage('/?type=goods')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'goods' }),
    )
  })

  it('maps stockStatus=low_stock to lowStock=true in the products query', () => {
    renderPage('/?stockStatus=low_stock')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ lowStock: true }),
    )
  })

  it('maps stockStatus=out_of_stock to outOfStock=true in the products query', () => {
    renderPage('/?stockStatus=out_of_stock')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ outOfStock: true }),
    )
  })

  it('does not pass lowStock or outOfStock when stockStatus is not set', () => {
    renderPage('/')
    const lastCall = useGetProductsQuery.mock.calls.at(-1)?.[0] ?? {}
    expect(lastCall).not.toHaveProperty('lowStock')
    expect(lastCall).not.toHaveProperty('outOfStock')
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```

Expected: PASS (7 tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
git commit -m "test(inventory): update ProductsPage filterbar tests for new filters"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run all filter-related tests**

```bash
cd frontend && npx vitest run src/components/filters/ src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```

Expected: all pass.

- [ ] **Step 2: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.
