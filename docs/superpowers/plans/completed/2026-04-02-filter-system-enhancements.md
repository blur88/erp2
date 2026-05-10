# Filter System Architectural Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `period` field type to the generic FilterBar config system, rename `quick` → `fields` across the codebase, and add optional URL namespacing to `useFilterBar`.

**Architecture:** Three independent, sequential changes — types first, then URL utilities, then hook and component wiring. The rename pass is mechanical and runs after the core changes are in place. Each task ends with a passing test run and a commit.

**Tech Stack:** React 19, TypeScript (strict: false), Vitest, `@testing-library/react`, MUI v7, `date-fns`, `react-router-dom`

**Spec:** `docs/superpowers/specs/2026-04-02-filter-system-enhancements-design.md`

---

## Task 1: Add `PeriodValue` type and `PeriodFilterFieldConfig` to types

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`

- [ ] **Step 1: Write the failing type-check**

Run the current type-check to establish baseline:
```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: exits 0 (clean).

- [ ] **Step 2: Update `filterBar.types.ts`**

Replace the entire file content:

```ts
import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey
  from: string | null
  to: string | null
}

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'period'

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

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  quick: FilterFieldConfig<TFilters>[]
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
```

Note: `quick` is still named `quick` here — we rename it in Task 5 after all other changes are done. `namespace` is added now so it's available to URL utilities in Task 2.

- [ ] **Step 3: Verify type-check still passes**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/types/filterBar.types.ts
git commit -m "feat(filter): add PeriodValue type, PeriodFilterFieldConfig, and namespace to FilterBarConfig"
```

---

## Task 2: Add period serialize/parse and namespace support to URL utilities

**Files:**
- Modify: `frontend/src/utils/filterBar.url.ts`
- Modify: `frontend/src/utils/filterBar.url.test.ts`

- [ ] **Step 1: Write failing tests for period serialization**

First, add the missing imports to the top of `frontend/src/utils/filterBar.url.test.ts`. The existing imports are:
```ts
import { describe, expect, it } from 'vitest'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '@/utils/filterBar.url'
```

Replace them with:
```ts
import { describe, expect, it } from 'vitest'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '@/utils/filterBar.url'
```

Then append these new describe blocks after the last existing `describe` block in the file:

```ts
// --- Period field tests ---

interface PeriodFilters { period: PeriodValue }

const periodConfig: FilterBarConfig<PeriodFilters> = {
  quick: [
    { field: 'period', label: 'Period', type: 'period' },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
  },
}

describe('serializeFilters — period field', () => {
  it('serializes a preset period key as a single param', () => {
    const params = serializeFilters(
      { period: { key: 'last_week', from: null, to: null } },
      periodConfig,
      new URLSearchParams(),
    )
    expect(params.get('period')).toBe('last_week')
    expect(params.get('period_from')).toBeNull()
    expect(params.get('period_to')).toBeNull()
  })

  it('serializes custom range as three params', () => {
    const params = serializeFilters(
      { period: { key: 'custom', from: '2026-01-01', to: '2026-03-31' } },
      periodConfig,
      new URLSearchParams(),
    )
    expect(params.get('period')).toBe('custom')
    expect(params.get('period_from')).toBe('2026-01-01')
    expect(params.get('period_to')).toBe('2026-03-31')
  })

  it('omits period params when value equals default', () => {
    const params = serializeFilters(
      { period: { key: 'this_month', from: null, to: null } },
      periodConfig,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })
})

describe('parseFilters — period field', () => {
  it('parses a valid preset period key', () => {
    const result = parseFilters(
      new URLSearchParams('period=last_year'),
      periodConfig,
    )
    expect(result.period).toEqual({ key: 'last_year', from: null, to: null })
  })

  it('parses custom range', () => {
    const result = parseFilters(
      new URLSearchParams('period=custom&period_from=2026-01-01&period_to=2026-03-31'),
      periodConfig,
    )
    expect(result.period).toEqual({ key: 'custom', from: '2026-01-01', to: '2026-03-31' })
  })

  it('falls back to default on invalid period key', () => {
    const result = parseFilters(
      new URLSearchParams('period=not_a_real_period'),
      periodConfig,
    )
    expect(result.period).toEqual({ key: 'this_month', from: null, to: null })
  })

  it('falls back to default when period param is absent', () => {
    const result = parseFilters(new URLSearchParams(), periodConfig)
    expect(result.period).toEqual({ key: 'this_month', from: null, to: null })
  })
})

describe('getManagedParamKeys — period field', () => {
  it('includes period key and its from/to companions', () => {
    const keys = getManagedParamKeys(periodConfig)
    expect(keys).toEqual(expect.arrayContaining(['period', 'period_from', 'period_to']))
  })
})

// --- Namespace tests ---

interface NamespacedFilters {
  search: string
  status: string | null
}

const namespacedConfig: FilterBarConfig<NamespacedFilters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  defaults: { search: '', status: null },
  namespace: 'orders',
}

describe('serializeFilters — namespace', () => {
  it('prefixes all params with namespace', () => {
    const params = serializeFilters(
      { search: 'foo', status: 'active' },
      namespacedConfig,
      new URLSearchParams(),
    )
    expect(params.get('orders_search')).toBe('foo')
    expect(params.get('orders_status')).toBe('active')
    expect(params.get('search')).toBeNull()
    expect(params.get('status')).toBeNull()
  })

  it('preserves unrelated params when namespace is set', () => {
    const params = serializeFilters(
      { search: 'foo', status: null },
      namespacedConfig,
      new URLSearchParams('tab=archived'),
    )
    expect(params.get('tab')).toBe('archived')
    expect(params.get('orders_search')).toBe('foo')
  })
})

describe('parseFilters — namespace', () => {
  it('reads params using namespace prefix', () => {
    const result = parseFilters(
      new URLSearchParams('orders_search=foo&orders_status=active'),
      namespacedConfig,
    )
    expect(result.search).toBe('foo')
    expect(result.status).toBe('active')
  })

  it('does not read unprefixed params when namespace is set', () => {
    const result = parseFilters(
      new URLSearchParams('search=foo&status=active'),
      namespacedConfig,
    )
    expect(result.search).toBe('')
    expect(result.status).toBeNull()
  })
})

describe('getManagedParamKeys — namespace', () => {
  it('returns prefixed keys', () => {
    const keys = getManagedParamKeys(namespacedConfig)
    expect(keys).toEqual(expect.arrayContaining(['orders_search', 'orders_status']))
    expect(keys).not.toContain('search')
    expect(keys).not.toContain('status')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/utils/filterBar.url.test.ts 2>&1 | tail -20
```
Expected: multiple FAIL — period and namespace cases hit unimplemented code paths.

- [ ] **Step 3: Rewrite `filterBar.url.ts` with period and namespace support**

Replace the entire file:

```ts
import { PERIOD_KEYS, type PeriodKey } from '@/constants/periods'
import type {
  FilterBarConfig,
  FilterFieldConfig,
  PeriodValue,
} from '@/types/filterBar.types'

function prefixed(key: string, namespace?: string): string {
  return namespace ? `${namespace}_${key}` : key
}

function effectiveKey<TFilters>(field: FilterFieldConfig<TFilters>, namespace?: string): string {
  const base = field.paramKey ?? String(field.field)
  return prefixed(base, namespace)
}

export function getManagedParamKeys<TFilters>(
  config: FilterBarConfig<TFilters>,
): string[] {
  const ns = config.namespace
  const keys: string[] = []

  if (config.search) {
    keys.push(prefixed(config.search.paramKey ?? 'search', ns))
  }

  for (const field of config.quick) {
    const key = effectiveKey(field, ns)
    keys.push(key)
    if (field.type === 'period') {
      keys.push(`${key}_from`)
      keys.push(`${key}_to`)
    }
  }

  return keys
}

export function serializeFilters<TFilters extends object>(
  filters: TFilters,
  config: FilterBarConfig<TFilters>,
  currentSearchParams: URLSearchParams,
): URLSearchParams {
  const ns = config.namespace
  const result = new URLSearchParams(currentSearchParams)

  for (const key of getManagedParamKeys(config)) {
    result.delete(key)
  }

  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const orderedEntries: Array<[string, string]> = []

  if (config.search) {
    const searchKey = prefixed(config.search.paramKey ?? 'search', ns)
    const searchValue = ((filters as Record<string, unknown>).search as string | undefined) ?? ''
    const defaultSearch = (defaults.search as string | undefined) ?? ''
    if (searchValue && searchValue !== defaultSearch) {
      orderedEntries.push([searchKey, searchValue])
    }
  }

  for (const field of config.quick) {
    const key = effectiveKey(field, ns)
    const value = filters[field.field]
    const defaultValue = defaults[String(field.field)]

    if (field.type === 'select') {
      if (value !== null && value !== undefined && value !== defaultValue) {
        orderedEntries.push([key, String(value)])
      }
      continue
    }

    if (field.type === 'multi-select') {
      for (const item of (value as string[] | undefined) ?? []) {
        orderedEntries.push([key, item])
      }
      continue
    }

    if (field.type === 'period') {
      const period = value as PeriodValue | undefined
      const defaultPeriod = defaultValue as PeriodValue | undefined
      if (!period || period.key === (defaultPeriod?.key ?? 'this_month')) continue
      orderedEntries.push([key, period.key])
      if (period.key === 'custom' && period.from && period.to) {
        orderedEntries.push([`${key}_from`, period.from])
        orderedEntries.push([`${key}_to`, period.to])
      }
      continue
    }
  }

  for (const [key, value] of orderedEntries) {
    result.append(key, value)
  }

  return result
}

export function parseFilters<TFilters extends object>(
  searchParams: URLSearchParams,
  config: FilterBarConfig<TFilters>,
): TFilters {
  const ns = config.namespace
  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if (config.search) {
    const searchKey = prefixed(config.search.paramKey ?? 'search', ns)
    result.search = searchParams.get(searchKey) ?? (defaults.search ?? '')
  }

  for (const field of config.quick) {
    const key = effectiveKey(field, ns)
    const fieldKey = String(field.field)
    const defaultValue = defaults[fieldKey]

    if (field.type === 'select') {
      const raw = searchParams.get(key)
      if (raw === null) {
        result[fieldKey] = defaultValue ?? null
      } else {
        const valid = field.options.find((option) => option.value === raw)
        result[fieldKey] = valid ? raw : (defaultValue ?? null)
      }
      continue
    }

    if (field.type === 'multi-select') {
      const validOptions = new Set(field.options.map((option) => option.value))
      result[fieldKey] = searchParams.getAll(key).filter((value) => validOptions.has(value))
      continue
    }

    if (field.type === 'period') {
      const defaultPeriod = (defaultValue as PeriodValue | undefined) ?? { key: 'this_month' as PeriodKey, from: null, to: null }
      const raw = searchParams.get(key)
      if (raw === null || !(PERIOD_KEYS as readonly string[]).includes(raw)) {
        result[fieldKey] = defaultPeriod
        continue
      }
      const periodKey = raw as PeriodKey
      if (periodKey === 'custom') {
        result[fieldKey] = {
          key: 'custom',
          from: searchParams.get(`${key}_from`) ?? null,
          to: searchParams.get(`${key}_to`) ?? null,
        } satisfies PeriodValue
      } else {
        result[fieldKey] = { key: periodKey, from: null, to: null } satisfies PeriodValue
      }
      continue
    }
  }

  return result as TFilters
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/utils/filterBar.url.test.ts 2>&1 | tail -20
```
Expected: all tests PASS.

- [ ] **Step 5: Verify type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/filterBar.url.ts frontend/src/utils/filterBar.url.test.ts
git commit -m "feat(filter): add period serialize/parse and URL namespace support to filterBar.url"
```

---

## Task 3: Add period default to `useFilterBar` and period rendering to `FilterBar`

**Files:**
- Modify: `frontend/src/hooks/useFilterBar.ts`
- Modify: `frontend/src/hooks/useFilterBar.test.tsx`
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Write failing test for period default in `useFilterBar.test.tsx`**

Add this describe block at the bottom of `frontend/src/hooks/useFilterBar.test.tsx`:

```ts
import type { PeriodValue } from '@/types/filterBar.types'

describe('useFilterBar — period field', () => {
  it('defaults period to this_month when no default configured', () => {
    interface PeriodFilters { period: PeriodValue }
    const periodConfig: FilterBarConfig<PeriodFilters> = {
      quick: [{ field: 'period', label: 'Period', type: 'period' }],
    }
    const { result } = renderHook(() => useFilterBar(periodConfig), { wrapper: makeWrapper() })
    expect(result.current.appliedFilters.period).toEqual({
      key: 'this_month',
      from: null,
      to: null,
    })
  })

  it('updates period value via onQuickFilterChange', () => {
    interface PeriodFilters { period: PeriodValue }
    const periodConfig: FilterBarConfig<PeriodFilters> = {
      quick: [{ field: 'period', label: 'Period', type: 'period' }],
    }
    const { result } = renderHook(() => useFilterBar(periodConfig), { wrapper: makeWrapper() })
    act(() => {
      result.current.handlers.onQuickFilterChange('period', { key: 'last_week', from: null, to: null })
    })
    expect(result.current.appliedFilters.period).toEqual({ key: 'last_week', from: null, to: null })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx 2>&1 | tail -20
```
Expected: FAIL — period default returns `undefined` or wrong shape.

- [ ] **Step 3: Update `getDefaults` in `useFilterBar.ts` to handle period fields**

In `frontend/src/hooks/useFilterBar.ts`, replace the `getDefaults` function (lines 7–27):

```ts
import type { FilterBarConfig, FilterBarHandlers, PeriodValue } from '@/types/filterBar.types'

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
    else if (field.type === 'period') {
      defaults[key] = { key: 'this_month', from: null, to: null } satisfies PeriodValue
    }
  }

  return defaults as TFilters
}
```

Also update the import at the top of `useFilterBar.ts` to include `PeriodValue`:
```ts
import type { FilterBarConfig, FilterBarHandlers, PeriodValue } from '@/types/filterBar.types'
```

- [ ] **Step 4: Run hook tests to confirm they pass**

```bash
cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx 2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 5: Write failing test for period rendering in `FilterBar.test.tsx`**

Add this describe block at the bottom of `frontend/src/components/filters/__tests__/FilterBar.test.tsx`:

```tsx
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import type { PeriodValue } from '@/types/filterBar.types'

describe('FilterBar — period field', () => {
  it('renders FilterPeriod when type is period', () => {
    interface PeriodFilters { period: PeriodValue }
    const periodConfig: FilterBarConfig<PeriodFilters> = {
      quick: [{ field: 'period', label: 'Period', type: 'period' }],
    }
    const periodHandlers: FilterBarHandlers<PeriodFilters> = {
      onSearchChange: vi.fn(),
      onSearchCommit: vi.fn(),
      onQuickFilterChange: vi.fn(),
      onClearField: vi.fn(),
      onClearAll: vi.fn(),
    }
    render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterBar
          config={periodConfig}
          draftFilters={{ period: { key: 'this_month', from: null, to: null } }}
          handlers={periodHandlers}
          hasActiveFilters={false}
        />
      </LocalizationProvider>,
    )
    // FilterPeriod renders a Period label in the select
    expect(screen.getByLabelText(/period/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run FilterBar test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx 2>&1 | tail -20
```
Expected: FAIL — period field renders nothing (returns null).

- [ ] **Step 7: Add period branch to `renderQuickField` in `FilterBar.tsx`**

In `frontend/src/components/filters/FilterBar.tsx`, replace the entire file:

```tsx
import { Button, Stack } from '@mui/material'

import { FilterPeriod } from './FilterPeriod'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  PeriodValue,
} from '@/types/filterBar.types'

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

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={String(field.field)}
        value={periodValue.key}
        customFrom={periodValue.from}
        customTo={periodValue.to}
        onChange={(key, from, to) =>
          onChange({ key, from: from ?? null, to: to ?? null } satisfies PeriodValue)
        }
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

- [ ] **Step 8: Run FilterBar tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx 2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 9: Verify type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/hooks/useFilterBar.ts frontend/src/hooks/useFilterBar.test.tsx \
        frontend/src/components/filters/FilterBar.tsx \
        frontend/src/components/filters/__tests__/FilterBar.test.tsx
git commit -m "feat(filter): wire FilterPeriod into FilterBar config system with PeriodValue state"
```

---

## Task 4: Rename `quick` → `fields` across the codebase

**Files (14 total):**
- Modify: `frontend/src/types/filterBar.types.ts`
- Modify: `frontend/src/hooks/useFilterBar.ts`
- Modify: `frontend/src/utils/filterBar.url.ts`
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/utils/filterBar.url.test.ts`
- Modify: `frontend/src/hooks/useFilterBar.test.tsx`
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`

- [ ] **Step 1: Rename `quick` → `fields` in `filterBar.types.ts`**

In `frontend/src/types/filterBar.types.ts`, change the `FilterBarConfig` interface:

```ts
export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  fields: FilterFieldConfig<TFilters>[]   // was: quick
  defaults?: Partial<TFilters>
  namespace?: string
}
```

- [ ] **Step 2: Update all internal references in core files**

In `frontend/src/hooks/useFilterBar.ts`, replace every occurrence of `config.quick` with `config.fields` (there are 2: one in `getDefaults` and one in the `initialFilters` memo).

In `frontend/src/utils/filterBar.url.ts`, replace every occurrence of `config.quick` with `config.fields` (there are 3: in `getManagedParamKeys`, `serializeFilters`, and `parseFilters`).

In `frontend/src/components/filters/FilterBar.tsx`, replace `config.quick.map` with `config.fields.map` (1 occurrence) and the `renderQuickField` type annotation `FilterBarConfig<TFilters>['quick'][number]` with `FilterBarConfig<TFilters>['fields'][number]` (1 occurrence).

- [ ] **Step 3: Update all test fixtures**

In each of these files, replace `quick: [` with `fields: [`:
- `frontend/src/utils/filterBar.url.test.ts` (2 occurrences — `config` and `periodConfig` and `namespacedConfig`)
- `frontend/src/hooks/useFilterBar.test.tsx` (1 occurrence in top-level `config`, plus the 2 inline configs added in Task 3)
- `frontend/src/components/filters/__tests__/FilterBar.test.tsx` (1 occurrence in top-level `config`, plus the inline `periodConfig` added in Task 3)

- [ ] **Step 4: Update all page files**

In each of these files, replace `quick: [` with `fields: [` in the `filterConfig` / `useMemo` body:
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/inventory/ProductsPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/settings/UserManagementPage.tsx`

- [ ] **Step 5: Verify type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: exits 0. If there are errors about `quick` not existing, you missed an occurrence — search with:
```bash
grep -r "\.quick\b\|quick:\s*\[" frontend/src --include="*.ts" --include="*.tsx"
```

- [ ] **Step 6: Run all filter-related tests**

```bash
cd frontend && npx vitest run \
  src/utils/filterBar.url.test.ts \
  src/hooks/useFilterBar.test.tsx \
  src/components/filters/__tests__/FilterBar.test.tsx \
  2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -p  # stage all changes, or use: git add frontend/src
git commit -m "refactor(filter): rename FilterBarConfig.quick to fields"
```

---

## Task 5: Run full filter test suite and verify

**Files:** none (verification only)

- [ ] **Step 1: Run all filterbar page tests**

```bash
cd frontend && npx vitest run \
  src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx \
  src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx \
  src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx \
  src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx \
  src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx \
  src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx \
  src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx \
  src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx \
  2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 2: Run the filter component tests**

```bash
cd frontend && npx vitest run \
  src/components/filters/__tests__/FilterBar.test.tsx \
  src/components/filters/FilterPeriod.test.tsx \
  src/utils/filterBar.url.test.ts \
  src/hooks/useFilterBar.test.tsx \
  2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 3: Final type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: exits 0.

- [ ] **Step 4: Commit (if any fixes were needed)**

Only commit if step 1 or 2 required fixes. Otherwise skip.

```bash
git add frontend/src
git commit -m "fix(filter): correct test fixtures after quick→fields rename"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Add `PeriodValue`, `PeriodFilterFieldConfig`, `namespace` to types |
| 2 | Period serialize/parse + namespace prefix in URL utilities |
| 3 | Period default in hook + period rendering in `FilterBar` |
| 4 | Rename `quick` → `fields` across all 14 files |
| 5 | Full test suite verification |
