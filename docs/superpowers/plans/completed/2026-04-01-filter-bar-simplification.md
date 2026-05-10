# Filter Bar Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the advanced filters drawer, active filter chips, and all related infrastructure, leaving a simpler filter bar with search + quick filters + Reset button only.

**Architecture:** Delete 5 files, strip advanced-related code from the core filter system (types, hook, component), then clean up each of the 7 page consumers. All advanced filter fields are dropped entirely — removed from configs, filter type interfaces, defaults, and query args.

**Tech Stack:** React 19, TypeScript, MUI v7, Vitest

---

### Task 1: Delete the 5 dead files

**Files:**
- Delete: `frontend/src/components/filters/AdvancedFiltersDrawer.tsx`
- Delete: `frontend/src/components/filters/ActiveFilterChips.tsx`
- Delete: `frontend/src/components/filters/MoreFiltersButton.tsx`
- Delete: `frontend/src/components/filters/filterBar.chips.ts`
- Delete: `frontend/src/components/filters/__tests__/filterBar.chips.test.ts`

- [ ] **Step 1: Delete the files**

```bash
cd frontend
rm src/components/filters/AdvancedFiltersDrawer.tsx \
   src/components/filters/ActiveFilterChips.tsx \
   src/components/filters/MoreFiltersButton.tsx \
   src/components/filters/filterBar.chips.ts \
   src/components/filters/__tests__/filterBar.chips.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A frontend/src/components/filters/AdvancedFiltersDrawer.tsx \
            frontend/src/components/filters/ActiveFilterChips.tsx \
            frontend/src/components/filters/MoreFiltersButton.tsx \
            frontend/src/components/filters/filterBar.chips.ts \
            frontend/src/components/filters/__tests__/filterBar.chips.test.ts
git commit -m "refactor: delete advanced filter UI and chips files (#242)"
```

---

### Task 2: Simplify `filterBar.types.ts`

**Files:**
- Modify: `frontend/src/components/filters/filterBar.types.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```typescript
export type DateRangeValue = { from: string | null; to: string | null }
export type NumberRangeValue = { min: number | null; max: number | null }

export type FilterOption = { value: string; label: string }

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'date-range'
  | 'number-range'
  | 'toggle'

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

export interface DateRangeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'date-range'
}

export interface NumberRangeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'number-range'
}

export interface ToggleFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'toggle'
}

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | DateRangeFilterFieldConfig<TFilters, keyof TFilters>
  | NumberRangeFilterFieldConfig<TFilters, keyof TFilters>
  | ToggleFilterFieldConfig<TFilters, keyof TFilters>

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  quick: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
}

export interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void
  onSearchCommit: () => void
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void
  onClearField: (field: keyof TFilters) => void
  onClearAll: () => void
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/filterBar.types.ts
git commit -m "refactor: remove advanced/chips types from FilterBarConfig and FilterBarHandlers (#242)"
```

---

### Task 3: Simplify `useFilterBar.ts`

**Files:**
- Modify: `frontend/src/components/filters/useFilterBar.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import type { FilterBarConfig, FilterBarHandlers } from './filterBar.types'
import { parseFilters, serializeFilters } from './filterBar.url'

function getDefaults<TFilters extends object>(
  config: FilterBarConfig<TFilters>,
): TFilters {
  const defaults: Record<string, unknown> = {}

  if (config.search) defaults.search = ''

  for (const field of config.quick) {
    const key = String(field.field)
    const configuredDefault = config.defaults?.[field.field]
    if (configuredDefault !== undefined) {
      defaults[key] = configuredDefault
      continue
    }

    if (field.type === 'select') defaults[key] = null
    else if (field.type === 'multi-select') defaults[key] = []
    else if (field.type === 'toggle') defaults[key] = null
    else if (field.type === 'date-range') defaults[key] = { from: null, to: null }
    else defaults[key] = { min: null, max: null }
  }

  return defaults as TFilters
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function useFilterBar<TFilters extends object>(
  config: FilterBarConfig<TFilters>,
): {
  appliedFilters: TFilters
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
} {
  const location = useLocation()
  const debounceMs = config.search?.debounceMs ?? 400

  const defaults = useMemo(() => getDefaults(config), [config])

  const mountSearchRef = useRef(location.search)

  const initialFilters = useMemo(() => {
    const parsed = parseFilters(new URLSearchParams(mountSearchRef.current), config)
    return { ...defaults, ...parsed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount-only

  const [appliedFilters, setAppliedFilters] = useState<TFilters>(initialFilters)
  const [draftFilters, setDraftFilters] = useState<TFilters>(initialFilters)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchDraftRef = useRef<string>(((initialFilters as Record<string, unknown>).search as string | undefined) ?? '')

  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search)
    const nextParams = serializeFilters(appliedFilters, config, currentParams)
    const nextSearch = nextParams.toString()
    const currentSearch = currentParams.toString()

    if (nextSearch !== currentSearch) {
      const nextUrl = nextSearch
        ? `${location.pathname}?${nextSearch}`
        : location.pathname
      window.history.replaceState(null, '', nextUrl)
    }
  }, [appliedFilters, config, location.pathname])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const onSearchChange = useCallback((value: string) => {
    searchDraftRef.current = value
    setDraftFilters((prev) => ({ ...prev, search: value }))

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (value === '') {
      setAppliedFilters((prev) => ({ ...prev, search: '' }))
      return
    }

    debounceRef.current = setTimeout(() => {
      setAppliedFilters((prev) => ({ ...prev, search: value }))
    }, debounceMs)
  }, [debounceMs])

  const onSearchCommit = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    setAppliedFilters((prev) => ({
      ...prev,
      search: searchDraftRef.current,
    }))
  }, [])

  const onQuickFilterChange = useCallback((field: keyof TFilters, value: unknown) => {
    setDraftFilters((prev) => ({ ...prev, [field]: value }))
    setAppliedFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const onClearField = useCallback((field: keyof TFilters) => {
    const nextValue = (defaults as Record<string, unknown>)[String(field)]
    setDraftFilters((prev) => ({ ...prev, [field]: nextValue }))
    setAppliedFilters((prev) => ({ ...prev, [field]: nextValue }))
    if (field === 'search') {
      searchDraftRef.current = String(nextValue ?? '')
    }
  }, [defaults])

  const onClearAll = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
    searchDraftRef.current = String((defaults as Record<string, unknown>).search ?? '')
  }, [defaults])

  const hasActiveFilters = useMemo(
    () => !isEqual(appliedFilters, defaults),
    [appliedFilters, defaults],
  )

  return {
    appliedFilters,
    draftFilters,
    handlers: {
      onSearchChange,
      onSearchCommit,
      onQuickFilterChange,
      onClearField,
      onClearAll,
    },
    hasActiveFilters,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/useFilterBar.ts
git commit -m "refactor: remove advanced filter logic from useFilterBar (#242)"
```

---

### Task 4: Simplify `FilterBar.tsx`

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { Button, Stack } from '@mui/material'

import { FilterDateRange } from './FilterDateRange'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import { FilterToggle } from './FilterToggle'
import type {
  DateRangeValue,
  FilterBarConfig,
  FilterBarHandlers,
} from './filterBar.types'

interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['quick'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onQuickFilterChange(field.field, nextValue)

  if (field.type === 'select' || field.type === 'multi-select') {
    return (
      <FilterSelect
        key={String(field.field)}
        field={String(field.field)}
        label={field.label}
        type={field.type}
        value={value as string | null | string[]}
        options={field.options}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'date-range') {
    return (
      <FilterDateRange
        key={String(field.field)}
        label={field.label}
        value={value as DateRangeValue}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'number-range') {
    return null
  }

  return (
    <FilterToggle
      key={String(field.field)}
      label={field.label}
      value={value as boolean | null}
      onChange={onChange}
    />
  )
}

export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
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
      {config.quick.map((field) => renderQuickField(field, draftFilters, handlers))}
      {hasActiveFilters ? (
        <Button size="small" variant="outlined" color="inherit" sx={{ ml: 1 }} onClick={handlers.onClearAll}>
          Reset
        </Button>
      ) : null}
    </Stack>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx
git commit -m "refactor: remove advanced drawer and chips from FilterBar component (#242)"
```

---

### Task 5: Update `index.ts` exports

**Files:**
- Modify: `frontend/src/components/filters/index.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
export { FilterBar } from './FilterBar'
export { FilterPeriod } from './FilterPeriod'
export { useFilterBar } from './useFilterBar'
export type {
  DateRangeValue,
  FilterBarConfig,
  FilterBarHandlers,
  FilterFieldConfig,
  FilterFieldType,
  FilterOption,
  NumberRangeValue,
} from './filterBar.types'
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/index.ts
git commit -m "refactor: remove ActiveChip from filter barrel exports (#242)"
```

---

### Task 6: Update `filterBar.url.ts`

**Files:**
- Modify: `frontend/src/components/filters/filterBar.url.ts`

`filterBar.url.ts` spreads `config.advanced` in 3 places (in `getManagedParamKeys`, `serializeFilters`, and `parseFilters`). Remove those spreads so each only iterates `config.quick`.

- [ ] **Step 1: Replace all three occurrences of `[...config.quick, ...config.advanced]` with `config.quick`**

Line 29 — `getManagedParamKeys`:
```typescript
for (const field of config.quick) {
```

Line 68 — `serializeFilters`:
```typescript
for (const field of config.quick) {
```

Line 129 — `parseFilters`:
```typescript
for (const field of config.quick) {
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/filterBar.url.ts
git commit -m "refactor: remove config.advanced spread from filterBar.url (#242)"
```

---

### Task 8: Update core filter tests

**Files:**
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`
- Modify: `frontend/src/components/filters/__tests__/useFilterBar.test.tsx`

- [ ] **Step 1: Replace `FilterBar.test.tsx`**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilterBar } from '../FilterBar'
import type { FilterBarConfig, FilterBarHandlers } from '../filterBar.types'

interface Filters {
  search: string
  status: string | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  defaults: { search: '', status: null },
}

const handlers: FilterBarHandlers<Filters> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

const baseProps = {
  config,
  draftFilters: { search: '', status: null },
  handlers,
  hasActiveFilters: false,
}

describe('FilterBar', () => {
  it('renders search and quick filters', () => {
    render(<FilterBar {...baseProps} />)
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument()
  })

  it('shows reset only with active filters', () => {
    const { rerender } = render(<FilterBar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    rerender(<FilterBar {...baseProps} hasActiveFilters={true} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(handlers.onClearAll).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Replace `useFilterBar.test.tsx`**

```tsx
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '../filterBar.types'
import { useFilterBar } from '../useFilterBar'

interface Filters {
  search: string
  status: string | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: '', debounceMs: 0 },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  defaults: { search: '', status: null },
}

function makeWrapper(initialUrl = '/') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  )
}

describe('useFilterBar', () => {
  it('starts from defaults when URL is empty', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    expect(result.current.appliedFilters).toEqual({ search: '', status: null })
    expect(result.current.draftFilters).toEqual({ search: '', status: null })
  })

  it('restores filters from URL', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper('/?search=gundam&status=active') })
    expect(result.current.appliedFilters.search).toBe('gundam')
    expect(result.current.appliedFilters.status).toBe('active')
  })

  it('updates quick filters immediately in draft and applied state', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    act(() => {
      result.current.handlers.onQuickFilterChange('status', 'active')
    })
    expect(result.current.draftFilters.status).toBe('active')
    expect(result.current.appliedFilters.status).toBe('active')
  })

  it('updates search draft immediately and applied after debounce', async () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    await act(async () => {
      result.current.handlers.onSearchChange('gun')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(result.current.draftFilters.search).toBe('gun')
    expect(result.current.appliedFilters.search).toBe('gun')
  })

  it('clears all filters', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    act(() => {
      result.current.handlers.onQuickFilterChange('status', 'active')
    })
    expect(result.current.hasActiveFilters).toBe(true)
    act(() => {
      result.current.handlers.onClearAll()
    })
    expect(result.current.hasActiveFilters).toBe(false)
  })
})
```

- [ ] **Step 3: Run the filter tests**

```bash
cd frontend
npx vitest run src/components/filters/__tests__/FilterBar.test.tsx src/components/filters/__tests__/useFilterBar.test.tsx src/components/filters/__tests__/filterBar.url.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/__tests__/FilterBar.test.tsx \
        frontend/src/components/filters/__tests__/useFilterBar.test.tsx
git commit -m "test: update filter bar tests — remove advanced/chips cases (#242)"
```

---

### Task 9: Clean up `ProductsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`

Dropped fields: `categoryId` (select), `stockRange` (number-range)

- [ ] **Step 1: Remove `categoryId` and `stockRange` from the filter interface**

Find the filter interface (around line 70) and remove those two fields. It will look like:

```typescript
interface ProductFilters {
  search: string
  status: string | null
}
```

- [ ] **Step 2: Remove `advanced` array from filter config and dropped fields from `defaults`**

The `filterConfig` useMemo `quick` and `defaults` remain, just without the advanced block. Remove the entire `advanced: [...]` array and remove `categoryId` and `stockRange` from `defaults`:

```typescript
defaults: {
  search: '',
  status: null,
},
```

- [ ] **Step 3: Remove `categoryId` and `stockRange` from `useFilterBar` destructuring and query args**

Change the destructuring line to remove `activeChips`, `hasUnappliedChanges`:

```typescript
const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

Remove from `productQueryParams` useMemo: `categoryId`, `minStock`, `maxStock`. Also remove any import of `DateRangeValue` or `NumberRangeValue` if they were only used for those fields.

Find the second location (around line 211) where `categoryId: appliedFilters.categoryId` appears (in export/report args) and remove it too.

- [ ] **Step 4: Remove `activeChips` and `hasUnappliedChanges` props from `<FilterBar>` JSX**

The `<FilterBar>` call becomes:

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  hasActiveFilters={hasActiveFilters}
/>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "ProductsPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "refactor: remove advanced filters from ProductsPage (#242)"
```

---

### Task 10: Clean up `OrdersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`

Dropped fields: `fulfillmentStatus` (select), `dateRange` (date-range)

- [ ] **Step 1: Remove dropped fields from the filter interface**

```typescript
interface SalesOrderFilters {
  search: string
  customerId: string | null
  paymentStatus: string | null
}
```

- [ ] **Step 2: Remove `advanced` array and dropped fields from `defaults`**

```typescript
defaults: {
  search: '',
  customerId: null,
  paymentStatus: null,
},
```

Also remove the `DateRangeValue` import if it's no longer used.

- [ ] **Step 3: Update `useFilterBar` destructuring**

```typescript
const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

(Previously accessed via `filterBar.xxx` — update all `filterBar.appliedFilters` references to `appliedFilters`, etc. if needed.)

- [ ] **Step 4: Remove dropped query args from the orders query useMemo**

Remove `fromDate`, `toDate`, `fulfillmentStatus` from the query args object.

- [ ] **Step 5: Remove `activeChips` and `hasUnappliedChanges` from `<FilterBar>` JSX**

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  hasActiveFilters={hasActiveFilters}
/>
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "OrdersPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "refactor: remove advanced filters from OrdersPage (#242)"
```

---

### Task 11: Clean up `PaymentsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`

Dropped fields: `customerId` (select), `dateRange` (date-range)

Note: This page has a `presetCustomerId` feature. The custom `onClearAll` handler currently clears both `search` and `dateRange` — after this change it only needs to clear `search` (since `dateRange` is removed). The `visibleActiveChips`/`hasVisibleActiveFilters` variables are removed entirely; use `hasActiveFilters` from `useFilterBar` directly.

- [ ] **Step 1: Remove dropped fields from the filter interface**

```typescript
interface PaymentFilters {
  search: string
}
```

Remove the `DateRangeValue` import.

- [ ] **Step 2: Remove `advanced` array and dropped fields from `defaults`**

```typescript
defaults: { search: '' },
```

- [ ] **Step 3: Update `useFilterBar` destructuring — remove `activeChips`, `hasUnappliedChanges`**

```typescript
const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

- [ ] **Step 4: Remove `visibleActiveChips` and `hasVisibleActiveFilters`, update preset handler**

Remove the `visibleActiveChips` useMemo and `hasVisibleActiveFilters` variable entirely.

Update the `filterBarHandlers` useMemo — the custom `onClearAll` now only clears `search`:

```typescript
const filterBarHandlers = useMemo(
  () => (
    presetCustomerId
      ? {
          ...handlers,
          onClearAll: () => {
            handlers.onClearField('search')
          },
        }
      : handlers
  ),
  [handlers, presetCustomerId],
)
```

- [ ] **Step 5: Remove dropped query args and update `<FilterBar>` JSX**

Remove `fromDate`, `toDate`, `customerId` from `paymentQueryArgs` useMemo.

Update `<FilterBar>`:

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={filterBarHandlers}
  hasActiveFilters={hasActiveFilters}
/>
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "PaymentsPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/PaymentsPage.tsx
git commit -m "refactor: remove advanced filters from PaymentsPage (#242)"
```

---

### Task 12: Clean up `CustomersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

Dropped field: `type` (select)

- [ ] **Step 1: Remove `type` from the filter interface**

Find the customers filter interface and remove the `type` field.

- [ ] **Step 2: Remove `advanced` array and `type` from `defaults`**

Remove the entire `advanced: [...]` block. Remove `type: null` from `defaults`.

- [ ] **Step 3: Update `useFilterBar` destructuring — remove `activeChips`, `hasUnappliedChanges`**

```typescript
const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

- [ ] **Step 4: Remove `type` from query args and update `<FilterBar>` JSX**

Remove `type: appliedFilters.type` from the customer query args useMemo.

Update `<FilterBar>`:

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  hasActiveFilters={hasActiveFilters}
/>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CustomersPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "refactor: remove advanced filters from CustomersPage (#242)"
```

---

### Task 13: Clean up `SuppliersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`

Dropped field: `type` (select)

- [ ] **Step 1: Remove `type` from the filter interface**

Find `SupplierFilters` interface and remove the `type` field.

- [ ] **Step 2: Remove `advanced` array and `type` from `defaults`**

Remove the entire `advanced: [...]` block. Remove `type: null` (or similar) from `defaults`.

- [ ] **Step 3: Update `useFilterBar` destructuring — remove `activeChips`, `hasUnappliedChanges`**

```typescript
const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

- [ ] **Step 4: Remove `type` from query args and update `<FilterBar>` JSX**

Remove `type: appliedFilters.type` from the suppliers query args useMemo.

Update `<FilterBar>`:

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  hasActiveFilters={hasActiveFilters}
/>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "SuppliersPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/SuppliersPage.tsx
git commit -m "refactor: remove advanced filters from SuppliersPage (#242)"
```

---

### Task 14: Clean up `StockAdjustmentsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

Dropped field: `dateRange` (date-range)

- [ ] **Step 1: Remove `dateRange` from the filter interface**

Find `StockAdjustmentFilters` interface and remove `dateRange: DateRangeValue`. Remove the `DateRangeValue` import.

- [ ] **Step 2: Remove `advanced` array and `dateRange` from `defaults`**

Remove the entire `advanced: [...]` block. Remove `dateRange: { from: null, to: null }` from `defaults`.

- [ ] **Step 3: Update `useFilterBar` destructuring — remove `activeChips`, `hasUnappliedChanges`**

```typescript
const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

- [ ] **Step 4: Remove `fromDate`/`toDate` from query args and update `<FilterBar>` JSX**

Remove `fromDate: appliedFilters.dateRange.from` and `toDate: appliedFilters.dateRange.to` from the query args useMemo.

Update `<FilterBar>`:

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  hasActiveFilters={hasActiveFilters}
/>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "StockAdjustmentsPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/StockAdjustmentsPage.tsx
git commit -m "refactor: remove advanced filters from StockAdjustmentsPage (#242)"
```

---

### Task 15: Clean up `PurchaseOrdersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

Dropped field: `dateRange` (date-range)

- [ ] **Step 1: Remove `dateRange` from the filter interface**

Find `PurchaseOrderFilters` interface and remove `dateRange: DateRangeValue`. Remove the `DateRangeValue` import.

- [ ] **Step 2: Remove `advanced` array and `dateRange` from `defaults`**

Remove the entire `advanced: [...]` block. Remove `dateRange: { from: null, to: null }` from `defaults`.

- [ ] **Step 3: Update `useFilterBar` destructuring — remove `activeChips`, `hasUnappliedChanges`**

The page uses `filterBar.xxx` pattern. Update:

```typescript
const filterBar = useFilterBar(filterConfig)
```

No destructuring change needed — just ensure `filterBar.activeChips` and `filterBar.hasUnappliedChanges` are not referenced anywhere.

- [ ] **Step 4: Remove `orderDateFrom`/`orderDateTo` from query args and update `<FilterBar>` JSX**

Remove `orderDateFrom: filterBar.appliedFilters.dateRange.from` and `orderDateTo: filterBar.appliedFilters.dateRange.to` from the query args useMemo.

Update `<FilterBar>`:

```tsx
<FilterBar
  config={filterConfig}
  draftFilters={filterBar.draftFilters}
  handlers={filterBar.handlers}
  hasActiveFilters={filterBar.hasActiveFilters}
/>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "PurchaseOrdersPage\|error" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "refactor: remove advanced filters from PurchaseOrdersPage (#242)"
```

---

### Task 16: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Run filter-related tests**

```bash
cd frontend && npx vitest run src/components/filters/
```

Expected: all pass.

- [ ] **Step 3: Run the full test suite**

```bash
cd frontend && npm run test
```

Expected: all pass (suite takes ~12 minutes — do not assume it has hung).

- [ ] **Step 4: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.
