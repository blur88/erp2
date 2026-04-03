# Filter Bar Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bespoke `DashboardFilterBar` + `useDashboardFilters` with the generic `FilterBar` + `useFilterBar`, extending the generic system minimally to support a `compare` field type and `isFetching` prop.

**Architecture:** Add a `'compare'` field type to `FilterBarConfig` that renders a "Compare with" MUI Select (disabled when period is `'today'`). Extract period→API-param translation into a shared `resolveApiParams` utility. Migrate both dashboard pages to `useFilterBar` + `FilterBar`, then delete the two bespoke files.

**Tech Stack:** React 19, TypeScript (strict: false), Material UI v7, Vitest + Testing Library, react-router-dom v7 (`useLocation`, `window.history.replaceState`)

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/types/filterBar.types.ts` |
| Modify | `frontend/src/utils/filterBar.url.ts` |
| Modify | `frontend/src/components/filters/FilterBar.tsx` |
| Create | `frontend/src/utils/dashboardApiParams.ts` |
| Modify | `frontend/src/pages/sales/SalesPage.tsx` |
| Modify | `frontend/src/pages/purchasing/PurchasingPage.tsx` |
| Delete | `frontend/src/components/filters/DashboardFilterBar.tsx` |
| Delete | `frontend/src/hooks/useDashboardFilters.ts` |
| Delete | `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx` |
| Delete | `frontend/src/hooks/useDashboardFilters.test.ts` |
| Modify | `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx` |
| Create | `frontend/src/utils/dashboardApiParams.test.ts` |
| Modify | `frontend/src/utils/filterBar.url.test.ts` |
| Modify | `frontend/src/components/filters/__tests__/FilterBar.test.tsx` |

---

## Task 1: Add `compare` type to `filterBar.types.ts` and `isFetching` to FilterBar props

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`

- [ ] **Step 1: Update the types file**

Replace the entire file content with:

```typescript
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

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>

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

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors (the new type is additive).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/types/filterBar.types.ts
git commit -m "feat: add compare field type and isFetching prop types to FilterBar"
```

---

## Task 2: Handle `compare` in `filterBar.url.ts`

**Files:**
- Modify: `frontend/src/utils/filterBar.url.ts`
- Modify: `frontend/src/utils/filterBar.url.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `frontend/src/utils/filterBar.url.test.ts` and append these tests at the end of the file (before the final closing brace of any describe, or as a new top-level describe block):

```typescript
// --- compare field type tests ---

type CompareFilters = {
  period: PeriodValue
  compareWith: 'previous_period' | 'last_month' | 'last_year' | null
}

const compareConfig: FilterBarConfig<CompareFilters> = {
  namespace: 'sales',
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'compareWith', label: 'Compare', type: 'compare' },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
    compareWith: null,
  },
}

describe('compare field type — serializeFilters', () => {
  it('omits compareWith when null', () => {
    const params = serializeFilters(
      { period: { key: 'this_month', from: null, to: null }, compareWith: null },
      compareConfig,
      new URLSearchParams(),
    )
    expect(params.get('sales_compareWith')).toBeNull()
  })

  it('serializes compareWith when set', () => {
    const params = serializeFilters(
      { period: { key: 'this_month', from: null, to: null }, compareWith: 'previous_period' },
      compareConfig,
      new URLSearchParams(),
    )
    expect(params.get('sales_compareWith')).toBe('previous_period')
  })
})

describe('compare field type — parseFilters', () => {
  it('returns null when param is absent', () => {
    const result = parseFilters<CompareFilters>(new URLSearchParams(), compareConfig)
    expect(result.compareWith).toBeNull()
  })

  it('parses valid compare value', () => {
    const result = parseFilters<CompareFilters>(
      new URLSearchParams('sales_compareWith=last_year'),
      compareConfig,
    )
    expect(result.compareWith).toBe('last_year')
  })

  it('rejects invalid compare value and returns null', () => {
    const result = parseFilters<CompareFilters>(
      new URLSearchParams('sales_compareWith=garbage'),
      compareConfig,
    )
    expect(result.compareWith).toBeNull()
  })
})

describe('compare field type — getManagedParamKeys', () => {
  it('includes compareWith as a single key (no _from/_to suffix)', () => {
    const keys = getManagedParamKeys(compareConfig)
    expect(keys).toContain('sales_compareWith')
    expect(keys.filter((k) => k.startsWith('sales_compareWith'))).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/filterBar.url.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `compare` field type falls through without serializing/parsing.

- [ ] **Step 3: Implement `compare` handling in `filterBar.url.ts`**

In `serializeFilters`, add a `compare` branch after the `period` branch (inside the `for` loop over `config.fields`):

```typescript
    if (field.type === 'compare') {
      if (value !== null && value !== undefined) {
        orderedEntries.push([key, String(value)])
      }
      continue
    }
```

In `parseFilters`, add a `compare` branch after the `period` branch (inside the `for` loop):

```typescript
    if (field.type === 'compare') {
      const VALID_COMPARES = ['previous_period', 'last_month', 'last_year']
      const raw = searchParams.get(key)
      result[fieldKey] = raw && VALID_COMPARES.includes(raw) ? raw : (defaultValue ?? null)
      continue
    }
```

The `getManagedParamKeys` function already handles any field type as a single key (no special casing needed — the `period` branch is the only one that adds extra keys). No change needed there.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/filterBar.url.test.ts --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/filterBar.url.ts src/utils/filterBar.url.test.ts
git commit -m "feat: add compare field type support to filterBar.url serialize/parse"
```

---

## Task 3: Render `compare` field and `isFetching` in `FilterBar.tsx`

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/filters/__tests__/FilterBar.test.tsx`:

```typescript
// --- compare field and isFetching tests ---
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import userEvent from '@testing-library/user-event'
import type { PeriodValue } from '@/types/filterBar.types'

interface DashFilters {
  period: PeriodValue
  compareWith: 'previous_period' | 'last_month' | 'last_year' | null
}

const dashConfig: FilterBarConfig<DashFilters> = {
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'compareWith', label: 'Compare', type: 'compare' },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
    compareWith: null,
  },
}

const dashHandlers: FilterBarHandlers<DashFilters> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

function wrapWithProvider(ui: React.ReactElement) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>{ui}</LocalizationProvider>,
  )
}

describe('FilterBar — compare field', () => {
  it('renders the Compare select', () => {
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: null }}
        handlers={dashHandlers}
        hasActiveFilters={false}
      />,
    )
    expect(screen.getByLabelText('Compare')).toBeInTheDocument()
  })

  it('compare select is enabled when period is this_month', () => {
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: null }}
        handlers={dashHandlers}
        hasActiveFilters={false}
      />,
    )
    // The MUI Select's hidden input should not be disabled
    const select = screen.getByLabelText('Compare')
    expect(select).not.toBeDisabled()
  })

  it('compare select is disabled when period is today', () => {
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'today', from: null, to: null }, compareWith: null }}
        handlers={dashHandlers}
        hasActiveFilters={false}
      />,
    )
    const select = screen.getByLabelText('Compare')
    expect(select).toBeDisabled()
  })

  it('calls onQuickFilterChange with previous_period when that option is selected', async () => {
    const onQuickFilterChange = vi.fn()
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: null }}
        handlers={{ ...dashHandlers, onQuickFilterChange }}
        hasActiveFilters={false}
      />,
    )
    await userEvent.click(screen.getByLabelText('Compare'))
    await userEvent.click(screen.getByText('Previous Period'))
    expect(onQuickFilterChange).toHaveBeenCalledWith('compareWith', 'previous_period')
  })

  it('calls onQuickFilterChange with null when No Comparison is selected', async () => {
    const onQuickFilterChange = vi.fn()
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: 'last_year' }}
        handlers={{ ...dashHandlers, onQuickFilterChange }}
        hasActiveFilters={false}
      />,
    )
    await userEvent.click(screen.getByLabelText('Compare'))
    await userEvent.click(screen.getByText('No Comparison'))
    expect(onQuickFilterChange).toHaveBeenCalledWith('compareWith', null)
  })
})

describe('FilterBar — isFetching', () => {
  it('renders CircularProgress when isFetching is true', () => {
    render(
      <FilterBar
        config={config}
        draftFilters={{ search: '', status: null }}
        handlers={handlers}
        hasActiveFilters={false}
        isFetching={true}
      />,
    )
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument()
  })

  it('does not render CircularProgress when isFetching is false', () => {
    render(
      <FilterBar
        config={config}
        draftFilters={{ search: '', status: null }}
        handlers={handlers}
        hasActiveFilters={false}
        isFetching={false}
      />,
    )
    expect(document.querySelector('.MuiCircularProgress-root')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `compare` field not rendered, `isFetching` prop not accepted.

- [ ] **Step 3: Implement in `FilterBar.tsx`**

Replace the entire file with:

```typescript
import { CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
import { Stack } from '@mui/material'

import { FilterPeriod } from './FilterPeriod'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
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

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={String(field.field)}
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
    const periodField = config.fields.find((f) => f.type === 'period')
    const periodValue = periodField
      ? (draftFilters[periodField.field] as PeriodValue)
      : null
    const compareDisabled = periodValue?.key === 'today'

    return (
      <Tooltip
        key={String(field.field)}
        title={compareDisabled ? 'Comparison is not available for Today' : ''}
        placement="top"
      >
        <span>
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={(value as string | null) ?? ''}
              label={field.label}
              onChange={(event) => onChange((event.target.value || null) as string | null)}
            >
              <MenuItem value="">No Comparison</MenuItem>
              <MenuItem value="previous_period">Previous Period</MenuItem>
              <MenuItem value="last_month">Same Period Last Month</MenuItem>
              <MenuItem value="last_year">Same Period Last Year</MenuItem>
            </Select>
          </FormControl>
        </span>
      </Tooltip>
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/filters/FilterBar.tsx src/components/filters/__tests__/FilterBar.test.tsx
git commit -m "feat: render compare field and isFetching spinner in FilterBar"
```

---

## Task 4: Create `dashboardApiParams.ts` utility

**Files:**
- Create: `frontend/src/utils/dashboardApiParams.ts`
- Create: `frontend/src/utils/dashboardApiParams.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/dashboardApiParams.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { resolveApiParams } from '@/utils/dashboardApiParams'
import type { PeriodValue } from '@/types/filterBar.types'

describe('resolveApiParams', () => {
  it('maps this_month to dateRange=this_month with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBe('this_month')
    expect(result.groupBy).toBe('day')
    expect(result.compareWith).toBeUndefined()
    expect(result.startDate).toBeUndefined()
    expect(result.endDate).toBeUndefined()
  })

  it('maps last_month to dateRange=last_month with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'last_month', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBe('last_month')
    expect(result.groupBy).toBe('day')
  })

  it('maps this_week to explicit startDate/endDate with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'this_week', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBeUndefined()
    expect(result.startDate).toBeDefined()
    expect(result.endDate).toBeDefined()
    expect(result.groupBy).toBe('day')
  })

  it('maps yesterday to startDate === endDate with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'yesterday', from: null, to: null },
      compareWith: null,
    })
    expect(result.startDate).toBeDefined()
    expect(result.endDate).toBeDefined()
    expect(result.startDate).toBe(result.endDate)
    expect(result.groupBy).toBe('day')
  })

  it('maps last_365_days to groupBy=month', () => {
    const result = resolveApiParams({
      period: { key: 'last_365_days', from: null, to: null },
      compareWith: null,
    })
    expect(result.groupBy).toBe('month')
  })

  it('maps last_30_days to groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'last_30_days', from: null, to: null },
      compareWith: null,
    })
    expect(result.groupBy).toBe('day')
  })

  it('maps custom range ≤31 days to groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: '2026-03-01', to: '2026-03-31' },
      compareWith: null,
    })
    expect(result.startDate).toBe('2026-03-01')
    expect(result.endDate).toBe('2026-03-31')
    expect(result.groupBy).toBe('day')
    expect(result.dateRange).toBeUndefined()
  })

  it('maps custom range 32–90 days to groupBy=week', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: '2026-01-01', to: '2026-03-10' },
      compareWith: null,
    })
    expect(result.groupBy).toBe('week')
  })

  it('maps custom range >90 days to groupBy=month', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: '2025-01-01', to: '2026-03-31' },
      compareWith: null,
    })
    expect(result.groupBy).toBe('month')
  })

  it('falls back to dateRange=this_month when custom has no from/to', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBe('this_month')
    expect(result.groupBy).toBe('day')
  })

  it('includes compareWith when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: 'previous_period',
    })
    expect(result.compareWith).toBe('previous_period')
  })

  it('omits compareWith when null', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
    })
    expect(result.compareWith).toBeUndefined()
  })

  it('passes through customerId when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      customerId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.customerId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('omits customerId when null', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      customerId: null,
    })
    expect(result.customerId).toBeUndefined()
  })

  it('passes through supplierId when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      supplierId: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(result.supplierId).toBe('550e8400-e29b-41d4-a716-446655440001')
  })

  it('passes through isFulfilled=true when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      isFulfilled: 'true',
    })
    expect(result.isFulfilled).toBe(true)
  })

  it('passes through isFulfilled=false when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      isFulfilled: 'false',
    })
    expect(result.isFulfilled).toBe(false)
  })

  it('omits isFulfilled when null', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      isFulfilled: null,
    })
    expect(result.isFulfilled).toBeUndefined()
  })

  it('passes through status when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      status: 'received',
    })
    expect(result.status).toBe('received')
  })

  it('passes through paymentStatus when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      paymentStatus: 'paid',
    })
    expect(result.paymentStatus).toBe('paid')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/dashboardApiParams.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `dashboardApiParams.ts`**

Create `frontend/src/utils/dashboardApiParams.ts`:

```typescript
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import type { PeriodValue } from '@/types/filterBar.types'

export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null

export interface DashboardResolvedApiParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  customerId?: string
  supplierId?: string
  status?: string
  isFulfilled?: boolean
  paymentStatus?: string
  categoryId?: string
  stockStatus?: string
}

export interface DashboardFilterBase {
  period: PeriodValue
  compareWith: DashboardCompare
  customerId?: string | null
  supplierId?: string | null
  isFulfilled?: string | null   // 'true' | 'false' | null
  status?: string | null
  paymentStatus?: string | null
  categoryId?: string | null
  stockStatus?: string | null
}

function groupByForRange(from: string, to: string): string {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  if (days <= 31) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

function periodToApiParams(
  period: PeriodValue,
  compareWith: DashboardCompare,
): Record<string, string | undefined> {
  const compareParam = compareWith ?? undefined

  if (period.key === 'custom') {
    if (period.from && period.to) {
      return {
        startDate: period.from,
        endDate: period.to,
        groupBy: groupByForRange(period.from, period.to),
        compareWith: compareParam,
      }
    }
    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  if (period.key === 'this_month' || period.key === 'last_month') {
    return { dateRange: period.key, groupBy: 'day', compareWith: compareParam }
  }

  if (period.key === null) {
    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  const { from, to } = getPeriodDateRange(period.key, getStartOfWeek())
  return {
    startDate: from,
    endDate: to,
    groupBy: groupByForRange(from, to),
    compareWith: compareParam,
  }
}

export function resolveApiParams(filters: DashboardFilterBase): DashboardResolvedApiParams {
  const base = periodToApiParams(filters.period, filters.compareWith)

  return {
    ...base,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.isFulfilled !== null && filters.isFulfilled !== undefined
      ? { isFulfilled: filters.isFulfilled === 'true' }
      : {}),
    ...(filters.status !== null && filters.status !== undefined
      ? { status: filters.status }
      : {}),
    ...(filters.paymentStatus !== null && filters.paymentStatus !== undefined
      ? { paymentStatus: filters.paymentStatus }
      : {}),
    ...(filters.categoryId !== null && filters.categoryId !== undefined
      ? { categoryId: filters.categoryId }
      : {}),
    ...(filters.stockStatus !== null && filters.stockStatus !== undefined
      ? { stockStatus: filters.stockStatus }
      : {}),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/dashboardApiParams.test.ts --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/utils/dashboardApiParams.ts src/utils/dashboardApiParams.test.ts
git commit -m "feat: add resolveApiParams utility for dashboard filter → API param translation"
```

---

## Task 5: Migrate `SalesPage.tsx` to `FilterBar` + `useFilterBar`

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

This task has no new test file — `SalesPage` has no dedicated filter test (unlike `PurchasingPage`). The existing tests in the suite cover the page rendering; the filter behavior is covered by the unit tests in Tasks 2–4.

- [ ] **Step 1: Rewrite `SalesPage.tsx`**

Replace only the imports and the filter-related code in `SalesPage.tsx`. The rest of the JSX (stats cards, charts, tables) stays identical.

Replace the top of the file (lines 1–36, through the `useDashboardAnalytics` import) with:

```typescript
import React, { useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  PointOfSale as SalesIcon,
  People as CustomersIcon,
  Receipt as OrdersIcon,
  Payment as PaymentsIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate, formatNumber } from '@/utils/formatters'
import { TABLE_STYLES } from '@/constants/tableStyles'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { useGetCustomersQuery } from '@/store/api/salesApi'
import { SalesStatsCards, SalesTrendChart, TopProductsList, TopCustomersList } from './components'
import type { StatItem } from './components'
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics'
import { resolveApiParams } from '@/utils/dashboardApiParams'
import type { DashboardCompare } from '@/utils/dashboardApiParams'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
```

Then replace the `useDashboardFilters` hook call and all related destructuring (lines 42–67) with:

```typescript
  type SalesDashboardFilters = {
    period: PeriodValue
    compareWith: DashboardCompare
    customerId: string | null
    isFulfilled: string | null
    paymentStatus: string | null
  }

  // Assumes small customer count (<50). If this grows, replace with an autocomplete + search endpoint.
  const { data: customersData } = useGetCustomersQuery({})
  const customerOptions = (customersData?.data ?? []).map((customer: { id: string; name: string }) => ({
    value: customer.id,
    label: customer.name,
  }))

  const salesConfig: FilterBarConfig<SalesDashboardFilters> = {
    namespace: 'sales',
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
        field: 'customerId',
        label: 'Customer',
        type: 'select',
        paramKey: 'customer',
        options: [{ value: '', label: 'All Customers' }, ...customerOptions],
      },
      {
        field: 'isFulfilled',
        label: 'Order Status',
        type: 'select',
        paramKey: 'fulfilled',
        options: [
          { value: 'true', label: 'Fulfilled' },
          { value: 'false', label: 'Pending' },
        ],
      },
      {
        field: 'paymentStatus',
        label: 'Payment Status',
        type: 'select',
        paramKey: 'payment',
        options: [
          { value: 'paid', label: 'Paid' },
          { value: 'partial_paid', label: 'Partially Paid' },
          { value: 'draft', label: 'Draft' },
        ],
      },
    ],
    defaults: {
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      customerId: null,
      isFulfilled: null,
      paymentStatus: null,
    },
  }

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(salesConfig)
  const resolvedApiParams = resolveApiParams(appliedFilters)

  const { data, isLoading, isFetching, error } = useDashboardAnalytics(resolvedApiParams)
```

Then replace the `<DashboardFilterBar ... />` JSX block (around line 158–176) with:

```typescript
      <FilterBar
        config={salesConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={isFetching}
      />
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 3: Run the existing sales filter tests (if any) and the full filter bar tests**

```bash
cd frontend && npx vitest run src/utils/dashboardApiParams.test.ts src/utils/filterBar.url.test.ts src/components/filters/__tests__/FilterBar.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/sales/SalesPage.tsx
git commit -m "feat: migrate SalesPage to FilterBar + useFilterBar, remove DashboardFilterBar usage"
```

---

## Task 6: Migrate `PurchasingPage.tsx` to `FilterBar` + `useFilterBar`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`
- Modify: `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx`

- [ ] **Step 1: Update the test first**

Replace `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx` entirely:

```typescript
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PurchasingPage from '../PurchasingPage'

const mockUseGetSuppliersQuery = vi.fn()
const mockUsePurchasingAnalytics = vi.fn()
const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: (...args: unknown[]) => mockUseGetSuppliersQuery(...args),
}))

vi.mock('../hooks/usePurchasingAnalytics', () => ({
  usePurchasingAnalytics: (...args: unknown[]) => mockUsePurchasingAnalytics(...args),
}))

vi.mock('@/components/filters/FilterBar', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return <div data-testid="filter-bar" />
  },
}))

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="purchasing-line-chart" />,
}))

describe('PurchasingPage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGetSuppliersQuery.mockReturnValue({
      data: {
        data: [
          { id: '550e8400-e29b-41d4-a716-446655440001', companyName: 'Acme Supplies' },
        ],
      },
    })
    mockUsePurchasingAnalytics.mockReturnValue({
      data: {
        current: {
          metrics: { totalSpent: 0, totalOrders: 0, averageOrderValue: 0, activeSuppliers: 0 },
          periodData: [],
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
        },
        topSuppliers: [],
        recentOrders: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })
    window.history.replaceState({}, '', '/?purchasing_supplier=550e8400-e29b-41d4-a716-446655440001&purchasing_status=received&purchasing_payment=partial')
  })

  it('passes purchasing filter state into analytics', () => {
    render(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    )

    expect(mockUsePurchasingAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'received',
        paymentStatus: 'partial',
      }),
    )
  })

  it('renders the FilterBar component', () => {
    render(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
  })

  it('renders the purchasing overview heading', () => {
    render(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Purchasing Overview')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (mock points to FilterBar which page hasn't switched to yet)**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — page still uses `DashboardFilterBar`, not `FilterBar`.

- [ ] **Step 3: Rewrite `PurchasingPage.tsx`**

Replace the import block at the top (lines 1–48) with:

```typescript
import React from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Button,
  useTheme,
} from '@mui/material'
import {
  Assignment as PurchasingIcon,
  LocalShipping as SuppliersIcon,
  Inventory2 as GRNIcon,
  Payment as PaymentsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
import { usePurchasingAnalytics } from './hooks/usePurchasingAnalytics'
import { resolveApiParams } from '@/utils/dashboardApiParams'
import type { DashboardCompare } from '@/utils/dashboardApiParams'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
```

Replace the `useDashboardFilters` hook usage and all related destructuring (lines ~66–84) with:

```typescript
  type PurchasingDashboardFilters = {
    period: PeriodValue
    compareWith: DashboardCompare
    supplierId: string | null
    status: string | null
    paymentStatus: string | null
  }

  const { data: suppliersData } = useGetSuppliersQuery({})
  const supplierOptions = suppliersData?.data?.map((supplier) => ({
    value: supplier.id,
    label: supplier.companyName,
  })) ?? []

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
        type: 'select',
        paramKey: 'supplier',
        options: [{ value: '', label: 'All Suppliers' }, ...supplierOptions],
      },
      {
        field: 'status',
        label: 'Order Status',
        type: 'select',
        paramKey: 'status',
        options: [
          { value: 'received', label: 'Received' },
          { value: 'pending', label: 'Pending' },
        ],
      },
      {
        field: 'paymentStatus',
        label: 'Payment Status',
        type: 'select',
        paramKey: 'payment',
        options: [
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ],
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

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(purchasingConfig)
  const resolvedApiParams = resolveApiParams(appliedFilters)

  const { data, isLoading, isFetching, error } = usePurchasingAnalytics(resolvedApiParams)
```

Replace the `<DashboardFilterBar ... />` JSX block (around lines 191–214) with:

```typescript
      <FilterBar
        config={purchasingConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={isFetching}
      />
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: All PASS.

- [ ] **Step 5: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/purchasing/PurchasingPage.tsx src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx
git commit -m "feat: migrate PurchasingPage to FilterBar + useFilterBar, remove DashboardFilterBar usage"
```

---

## Task 7: Delete bespoke files and their tests

**Files:**
- Delete: `frontend/src/components/filters/DashboardFilterBar.tsx`
- Delete: `frontend/src/hooks/useDashboardFilters.ts`
- Delete: `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx`
- Delete: `frontend/src/hooks/useDashboardFilters.test.ts`

- [ ] **Step 1: Verify nothing imports these files**

```bash
cd frontend && grep -r "DashboardFilterBar\|useDashboardFilters" src/ --include="*.ts" --include="*.tsx" 2>&1
```

Expected: No output (zero matches). If any matches appear, fix them before proceeding.

- [ ] **Step 2: Delete the four files**

```bash
cd frontend && rm src/components/filters/DashboardFilterBar.tsx \
  src/hooks/useDashboardFilters.ts \
  src/components/filters/__tests__/DashboardFilterBar.test.tsx \
  src/hooks/useDashboardFilters.test.ts
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 4: Run all affected tests**

```bash
cd frontend && npx vitest run \
  src/utils/dashboardApiParams.test.ts \
  src/utils/filterBar.url.test.ts \
  src/components/filters/__tests__/FilterBar.test.tsx \
  src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx \
  --no-coverage 2>&1 | tail -20
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add -A src/components/filters/DashboardFilterBar.tsx \
  src/hooks/useDashboardFilters.ts \
  src/components/filters/__tests__/DashboardFilterBar.test.tsx \
  src/hooks/useDashboardFilters.test.ts
git commit -m "chore: delete DashboardFilterBar and useDashboardFilters (replaced by generic FilterBar)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

Expected: All tests pass. This takes ~12 minutes — do not assume it hung.

- [ ] **Step 2: Run lint**

```bash
cd frontend && npm run lint 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 3: Final type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.
