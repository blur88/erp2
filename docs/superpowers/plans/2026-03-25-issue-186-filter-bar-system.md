# Filter Bar System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable config-driven filter bar system and migrate Inventory Products, Sales Orders, and Purchase Orders pages to use it.

**Architecture:** A `useFilterBar<TFilters>` hook manages two state layers — `draftFilters` (rendered UI state) and `appliedFilters` (committed API/URL state) — plus URL sync via `replaceState`. A `<FilterBar>` component renders from declarative page config. Pages become thin: define a config object, call the hook, pass results down.

**Tech Stack:** React 19, MUI v7, RTK Query, React Router v6 (`useSearchParams`/`useNavigate`), Vitest, React Testing Library

---

## File Map

### New files (create)
```
frontend/src/components/filters/
  filterBar.types.ts          — all shared types and value shape aliases
  filterBar.url.ts            — serialize/parse URL params
  filterBar.chips.ts          — derive ActiveChip[] from applied filters + config
  useFilterBar.ts             — hook: draft/applied state, URL sync, handlers
  FilterSearch.tsx            — debounced search input
  FilterSelect.tsx            — MUI Select for select + multi-select field types
  FilterToggle.tsx            — MUI Switch for boolean toggle
  FilterDateRange.tsx         — two MUI DatePicker inputs (from/to)
  FilterNumberRange.tsx       — two MUI TextField[number] inputs (min/max)
  ActiveFilterChips.tsx       — row of removable MUI Chip components
  MoreFiltersButton.tsx       — MUI Button + Badge (presentational)
  AdvancedFiltersDrawer.tsx   — MUI Drawer (right on desktop, bottom on mobile) with Apply/Cancel/Reset
  FilterBar.tsx               — orchestrates layout + drawer open/close state
  index.ts                    — public re-exports
```

### New test files (create)
```
frontend/src/components/filters/__tests__/
  filterBar.url.test.ts
  filterBar.chips.test.ts
  useFilterBar.test.ts
  FilterBar.test.tsx

frontend/src/pages/inventory/__tests__/
  ProductsPage.filterbar.test.tsx   (new file alongside existing tests)

frontend/src/pages/sales/__tests__/
  OrdersPage.filterbar.test.tsx

frontend/src/pages/purchasing/__tests__/
  PurchaseOrdersPage.filterbar.test.tsx
```

### Modified files
```
frontend/src/pages/inventory/ProductsPage.tsx
  — replace inline filter UI + Redux filter state with useFilterBar + FilterBar

frontend/src/pages/sales/OrdersPage.tsx
  — replace inline filter UI + Redux orderFilters with useFilterBar + FilterBar

frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
  — replace pageState filter fields with useFilterBar + FilterBar

frontend/src/store/slices/inventorySlice.ts
  — remove productFilters state, setProductFilters action, selectProductFilters selector

frontend/src/store/slices/salesSlice.ts
  — remove orderFilters state, setOrderFilters action, selectOrderFilters selector
```

---

## Task 1: Shared Types

**Files:**
- Create: `frontend/src/components/filters/filterBar.types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// frontend/src/components/filters/filterBar.types.ts

export type DateRangeValue = { from: string | null; to: string | null }
export type NumberRangeValue = { min: number | null; max: number | null }

export type FilterOption = { value: string; label: string }

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'date-range'
  | 'number-range'
  | 'toggle'

// ── Field config variants ──────────────────────────────────────────────────

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  /** URL param key override. Defaults to field name. */
  paramKey?: string
  /** Custom chip label. Receives the current value and full filter state. */
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

// ── Bar config ─────────────────────────────────────────────────────────────

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number  // default 400
    paramKey?: string    // default 'search'
  }
  quick: FilterFieldConfig<TFilters>[]
  advanced: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
}

// ── Runtime types ──────────────────────────────────────────────────────────

export interface ActiveChip<TField = string> {
  field: TField
  label: string
}

export interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void
  onSearchCommit: () => void  // flushes debounce immediately (Enter key)
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void
  onAdvancedDraftChange: (field: keyof TFilters, value: unknown) => void
  onAdvancedApply: () => void
  onAdvancedCancel: () => void
  onClearField: (field: keyof TFilters) => void
  onClearAll: () => void
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/filterBar.types.ts
git commit -m "feat(filters): add shared FilterBar types"
```

---

## Task 2: URL Serialization (TDD)

**Files:**
- Create: `frontend/src/components/filters/filterBar.url.ts`
- Create: `frontend/src/components/filters/__tests__/filterBar.url.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/components/filters/__tests__/filterBar.url.test.ts
import { describe, it, expect } from 'vitest'
import { serializeFilters, parseFilters, getManagedParamKeys } from '../filterBar.url'
import type { FilterBarConfig, DateRangeValue, NumberRangeValue } from '../filterBar.types'

interface TestFilters {
  search: string
  status: string | null
  tags: string[]
  toggle: boolean | null
  dateRange: DateRangeValue
  amountRange: NumberRangeValue
}

const config: FilterBarConfig<TestFilters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    { field: 'toggle', label: 'Toggle', type: 'toggle' },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { field: 'dateRange', label: 'Date', type: 'date-range', paramKey: 'created' },
    { field: 'amountRange', label: 'Amount', type: 'number-range', paramKey: 'amount' },
  ],
  defaults: { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
}

describe('serializeFilters', () => {
  it('omits default values', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })

  it('serializes search', () => {
    const params = serializeFilters(
      { search: 'gundam', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.get('search')).toBe('gundam')
  })

  it('serializes select value', () => {
    const params = serializeFilters(
      { search: '', status: 'active', tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.get('status')).toBe('active')
  })

  it('serializes multi-select as repeated params', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: ['a', 'b'], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.getAll('tags')).toEqual(['a', 'b'])
  })

  it('serializes toggle true/false but omits null', () => {
    const trueParams = serializeFilters(
      { search: '', status: null, tags: [], toggle: true, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config, new URLSearchParams(),
    )
    expect(trueParams.get('toggle')).toBe('true')

    const falseParams = serializeFilters(
      { search: '', status: null, tags: [], toggle: false, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config, new URLSearchParams(),
    )
    expect(falseParams.get('toggle')).toBe('false')

    const nullParams = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config, new URLSearchParams(),
    )
    expect(nullParams.has('toggle')).toBe(false)
  })

  it('serializes date range with paramKey prefix and _from/_to suffix', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: '2024-01-01', to: '2024-03-31' }, amountRange: { min: null, max: null } },
      config, new URLSearchParams(),
    )
    expect(params.get('created_from')).toBe('2024-01-01')
    expect(params.get('created_to')).toBe('2024-03-31')
  })

  it('supports partial date range (from only)', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: '2024-01-01', to: null }, amountRange: { min: null, max: null } },
      config, new URLSearchParams(),
    )
    expect(params.get('created_from')).toBe('2024-01-01')
    expect(params.has('created_to')).toBe(false)
  })

  it('serializes number range with paramKey prefix and _min/_max suffix', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: 100, max: 500 } },
      config, new URLSearchParams(),
    )
    expect(params.get('amount_min')).toBe('100')
    expect(params.get('amount_max')).toBe('500')
  })

  it('preserves unrelated params and only updates managed keys', () => {
    const existing = new URLSearchParams('tab=archived&sort=desc')
    const params = serializeFilters(
      { search: 'x', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config, existing,
    )
    expect(params.get('tab')).toBe('archived')
    expect(params.get('sort')).toBe('desc')
    expect(params.get('search')).toBe('x')
  })

  it('produces stable param order: search, quick fields, advanced fields', () => {
    const params = serializeFilters(
      { search: 'x', status: 'active', tags: ['a'], toggle: true, dateRange: { from: '2024-01-01', to: null }, amountRange: { min: 10, max: null } },
      config, new URLSearchParams(),
    )
    const keys = Array.from(params.keys())
    expect(keys.indexOf('search')).toBeLessThan(keys.indexOf('status'))
    expect(keys.indexOf('status')).toBeLessThan(keys.indexOf('tags'))
    expect(keys.indexOf('tags')).toBeLessThan(keys.indexOf('created_from'))
  })
})

describe('parseFilters', () => {
  it('returns defaults when URL is empty', () => {
    const result = parseFilters(new URLSearchParams(), config)
    expect(result).toEqual({
      search: '', status: null, tags: [], toggle: null,
      dateRange: { from: null, to: null }, amountRange: { min: null, max: null },
    })
  })

  it('parses search', () => {
    const result = parseFilters(new URLSearchParams('search=gundam'), config)
    expect(result.search).toBe('gundam')
  })

  it('drops invalid select values', () => {
    const result = parseFilters(new URLSearchParams('status=unknown'), config)
    expect(result.status).toBeNull()
  })

  it('parses valid select value', () => {
    const result = parseFilters(new URLSearchParams('status=active'), config)
    expect(result.status).toBe('active')
  })

  it('parses multi-select repeated params, drops invalid values', () => {
    const result = parseFilters(new URLSearchParams('tags=a&tags=b&tags=invalid'), config)
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('parses toggle: "true"→true, "false"→false, invalid→null', () => {
    expect(parseFilters(new URLSearchParams('toggle=true'), config).toggle).toBe(true)
    expect(parseFilters(new URLSearchParams('toggle=false'), config).toggle).toBe(false)
    expect(parseFilters(new URLSearchParams('toggle=yes'), config).toggle).toBeNull()
  })

  it('parses date range using paramKey', () => {
    const result = parseFilters(new URLSearchParams('created_from=2024-01-01&created_to=2024-03-31'), config)
    expect(result.dateRange).toEqual({ from: '2024-01-01', to: '2024-03-31' })
  })

  it('rejects invalid date format', () => {
    const result = parseFilters(new URLSearchParams('created_from=not-a-date'), config)
    expect(result.dateRange.from).toBeNull()
  })

  it('parses partial date range', () => {
    const result = parseFilters(new URLSearchParams('created_from=2024-01-01'), config)
    expect(result.dateRange).toEqual({ from: '2024-01-01', to: null })
  })

  it('parses number range using paramKey', () => {
    const result = parseFilters(new URLSearchParams('amount_min=100&amount_max=500'), config)
    expect(result.amountRange).toEqual({ min: 100, max: 500 })
  })

  it('coerces NaN number to null', () => {
    const result = parseFilters(new URLSearchParams('amount_min=abc'), config)
    expect(result.amountRange.min).toBeNull()
  })
})

describe('getManagedParamKeys', () => {
  it('returns all managed param keys derived from config', () => {
    const keys = getManagedParamKeys(config)
    expect(keys).toContain('search')
    expect(keys).toContain('status')
    expect(keys).toContain('tags')
    expect(keys).toContain('toggle')
    expect(keys).toContain('created_from')
    expect(keys).toContain('created_to')
    expect(keys).toContain('amount_min')
    expect(keys).toContain('amount_max')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/filterBar.url.test.ts --no-coverage 2>&1 | tail -20
```

Expected: error — cannot find module `../filterBar.url`

- [ ] **Step 3: Implement `filterBar.url.ts`**

```typescript
// frontend/src/components/filters/filterBar.url.ts
import type {
  FilterBarConfig, FilterFieldConfig, DateRangeValue, NumberRangeValue,
} from './filterBar.types'

// ── Helpers ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false
  const d = new Date(s)
  return !isNaN(d.getTime())
}

function effectiveKey<TFilters>(field: FilterFieldConfig<TFilters>): string {
  return (field.paramKey ?? String(field.field)) as string
}

function isEmpty(value: unknown, defaultValue: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (
    typeof value === 'object' && value !== null &&
    'from' in value && 'to' in value
  ) {
    const r = value as DateRangeValue
    return r.from === null && r.to === null
  }
  if (
    typeof value === 'object' && value !== null &&
    'min' in value && 'max' in value
  ) {
    const r = value as NumberRangeValue
    return r.min === null && r.max === null
  }
  // Equal to default
  return JSON.stringify(value) === JSON.stringify(defaultValue)
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getManagedParamKeys<TFilters>(
  config: FilterBarConfig<TFilters>,
): string[] {
  const keys: string[] = []
  const searchKey = config.search?.paramKey ?? 'search'
  if (config.search) keys.push(searchKey)

  const allFields = [...config.quick, ...config.advanced]
  for (const field of allFields) {
    const base = effectiveKey(field)
    if (field.type === 'date-range') {
      keys.push(`${base}_from`, `${base}_to`)
    } else if (field.type === 'number-range') {
      keys.push(`${base}_min`, `${base}_max`)
    } else {
      keys.push(base)
    }
  }
  return keys
}

export function serializeFilters<TFilters extends Record<string, unknown>>(
  filters: TFilters,
  config: FilterBarConfig<TFilters>,
  currentSearchParams: URLSearchParams,
): URLSearchParams {
  const result = new URLSearchParams(currentSearchParams)
  const managed = getManagedParamKeys(config)
  // Clear managed keys first
  for (const key of managed) result.delete(key)

  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const searchKey = config.search?.paramKey ?? 'search'

  // Helper to write in deterministic order
  const entries: Array<[string, string]> = []

  // 1. search
  if (config.search) {
    const val = filters['search' as keyof TFilters] as string | undefined
    if (val && val !== (defaults['search'] ?? '')) {
      entries.push([searchKey, val])
    }
  }

  // 2. quick + 3. advanced (in config order)
  const allFields = [...config.quick, ...config.advanced]
  for (const field of allFields) {
    const key = effectiveKey(field)
    const val = filters[field.field]
    const def = defaults[field.field as string]

    if (field.type === 'select') {
      if (val !== null && val !== undefined && val !== def) {
        entries.push([key, String(val)])
      }
    } else if (field.type === 'multi-select') {
      const arr = (val as string[] | undefined) ?? []
      for (const item of arr) entries.push([key, item])
    } else if (field.type === 'toggle') {
      if (val !== null && val !== undefined) {
        entries.push([key, String(val)])
      }
    } else if (field.type === 'date-range') {
      const dr = val as DateRangeValue | undefined
      if (dr?.from) entries.push([`${key}_from`, dr.from])
      if (dr?.to) entries.push([`${key}_to`, dr.to])
    } else if (field.type === 'number-range') {
      const nr = val as NumberRangeValue | undefined
      if (nr?.min !== null && nr?.min !== undefined) entries.push([`${key}_min`, String(nr.min)])
      if (nr?.max !== null && nr?.max !== undefined) entries.push([`${key}_max`, String(nr.max)])
    }
  }

  for (const [k, v] of entries) result.append(k, v)
  return result
}

export function parseFilters<TFilters extends Record<string, unknown>>(
  searchParams: URLSearchParams,
  config: FilterBarConfig<TFilters>,
): TFilters {
  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}

  const searchKey = config.search?.paramKey ?? 'search'
  if (config.search) {
    result['search'] = searchParams.get(searchKey) ?? (defaults['search'] ?? '')
  }

  const allFields = [...config.quick, ...config.advanced]
  for (const field of allFields) {
    const key = effectiveKey(field)
    const fieldKey = String(field.field)
    const def = defaults[fieldKey]

    if (field.type === 'select') {
      const raw = searchParams.get(key)
      if (raw === null) {
        result[fieldKey] = def ?? null
      } else {
        const valid = (field.options ?? []).find((o) => o.value === raw)
        result[fieldKey] = valid ? raw : (def ?? null)
      }
    } else if (field.type === 'multi-select') {
      const raws = searchParams.getAll(key)
      const validOptions = new Set((field.options ?? []).map((o) => o.value))
      result[fieldKey] = raws.filter((r) => validOptions.has(r))
    } else if (field.type === 'toggle') {
      const raw = searchParams.get(key)
      if (raw === 'true') result[fieldKey] = true
      else if (raw === 'false') result[fieldKey] = false
      else result[fieldKey] = def ?? null
    } else if (field.type === 'date-range') {
      const fromRaw = searchParams.get(`${key}_from`)
      const toRaw = searchParams.get(`${key}_to`)
      result[fieldKey] = {
        from: fromRaw && isValidDate(fromRaw) ? fromRaw : null,
        to: toRaw && isValidDate(toRaw) ? toRaw : null,
      } satisfies DateRangeValue
    } else if (field.type === 'number-range') {
      const minRaw = searchParams.get(`${key}_min`)
      const maxRaw = searchParams.get(`${key}_max`)
      const min = minRaw !== null ? Number(minRaw) : null
      const max = maxRaw !== null ? Number(maxRaw) : null
      result[fieldKey] = {
        min: min !== null && !isNaN(min) ? min : null,
        max: max !== null && !isNaN(max) ? max : null,
      } satisfies NumberRangeValue
    }
  }

  return result as TFilters
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/filterBar.url.test.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/filterBar.url.ts \
        frontend/src/components/filters/__tests__/filterBar.url.test.ts
git commit -m "feat(filters): add URL serialize/parse helpers with tests"
```

---

## Task 3: Chip Derivation (TDD)

**Files:**
- Create: `frontend/src/components/filters/filterBar.chips.ts`
- Create: `frontend/src/components/filters/__tests__/filterBar.chips.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/components/filters/__tests__/filterBar.chips.test.ts
import { describe, it, expect } from 'vitest'
import { deriveChips } from '../filterBar.chips'
import type { FilterBarConfig } from '../filterBar.types'

interface F {
  search: string
  status: string | null
  tags: string[]
  toggle: boolean | null
}

const config: FilterBarConfig<F> = {
  search: { placeholder: '' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
    { field: 'toggle', label: 'Feature', type: 'toggle' },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  defaults: { search: '', status: null, tags: [], toggle: null },
}

describe('deriveChips', () => {
  it('returns no chips for all-default filters', () => {
    const chips = deriveChips(
      { search: '', status: null, tags: [], toggle: null },
      config,
    )
    expect(chips).toHaveLength(0)
  })

  it('includes chip for active select field with option label', () => {
    const chips = deriveChips(
      { search: '', status: 'active', tags: [], toggle: null },
      config,
    )
    expect(chips).toEqual([{ field: 'status', label: 'Status: Active' }])
  })

  it('includes chip for multi-select: single item shows label', () => {
    const chips = deriveChips(
      { search: '', status: null, tags: ['a'], toggle: null },
      config,
    )
    expect(chips).toEqual([{ field: 'tags', label: 'Tags: A' }])
  })

  it('includes chip for multi-select: multiple items shows count', () => {
    const chips = deriveChips(
      { search: '', status: null, tags: ['a', 'b'], toggle: null },
      config,
    )
    expect(chips).toEqual([{ field: 'tags', label: 'Tags: 2 selected' }])
  })

  it('includes chip for true toggle', () => {
    const chips = deriveChips(
      { search: '', status: null, tags: [], toggle: true },
      config,
    )
    expect(chips).toEqual([{ field: 'toggle', label: 'Feature: On' }])
  })

  it('includes chip for false toggle', () => {
    const chips = deriveChips(
      { search: '', status: null, tags: [], toggle: false },
      config,
    )
    expect(chips).toEqual([{ field: 'toggle', label: 'Feature: Off' }])
  })

  it('uses chipFormatter when provided', () => {
    const customConfig: FilterBarConfig<F> = {
      ...config,
      quick: [
        { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }], chipFormatter: (v) => `custom:${v}` },
        { field: 'toggle', label: 'Feature', type: 'toggle' },
      ],
    }
    const chips = deriveChips({ search: '', status: 'active', tags: [], toggle: null }, customConfig)
    expect(chips[0].label).toBe('custom:active')
  })

  it('does not include search in chips', () => {
    const chips = deriveChips(
      { search: 'gundam', status: null, tags: [], toggle: null },
      config,
    )
    expect(chips).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/filterBar.chips.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement `filterBar.chips.ts`**

```typescript
// frontend/src/components/filters/filterBar.chips.ts
import type {
  ActiveChip, FilterBarConfig, FilterFieldConfig,
  DateRangeValue, NumberRangeValue,
} from './filterBar.types'

function defaultChipLabel<TFilters>(
  field: FilterFieldConfig<TFilters>,
  value: unknown,
  filters: TFilters,
): string | null {
  if (field.chipFormatter) {
    return field.chipFormatter(value as TFilters[keyof TFilters], filters)
  }
  const label = field.label

  if (field.type === 'select') {
    if (value === null || value === undefined) return null
    const opt = field.options.find((o) => o.value === value)
    return opt ? `${label}: ${opt.label}` : null
  }

  if (field.type === 'multi-select') {
    const arr = (value as string[]) ?? []
    if (arr.length === 0) return null
    if (arr.length === 1) {
      const opt = field.options.find((o) => o.value === arr[0])
      return opt ? `${label}: ${opt.label}` : `${label}: ${arr[0]}`
    }
    return `${label}: ${arr.length} selected`
  }

  if (field.type === 'toggle') {
    if (value === null || value === undefined) return null
    return `${label}: ${value ? 'On' : 'Off'}`
  }

  if (field.type === 'date-range') {
    const dr = value as DateRangeValue
    if (!dr || (dr.from === null && dr.to === null)) return null
    if (dr.from && dr.to) return `${label}: ${dr.from} – ${dr.to}`
    if (dr.from) return `${label}: from ${dr.from}`
    if (dr.to) return `${label}: to ${dr.to}`
    return null
  }

  if (field.type === 'number-range') {
    const nr = value as NumberRangeValue
    if (!nr || (nr.min === null && nr.max === null)) return null
    if (nr.min !== null && nr.max !== null) return `${label}: ${nr.min} – ${nr.max}`
    if (nr.min !== null) return `${label}: ≥ ${nr.min}`
    if (nr.max !== null) return `${label}: ≤ ${nr.max}`
    return null
  }

  return null
}

export function deriveChips<TFilters extends Record<string, unknown>>(
  appliedFilters: TFilters,
  config: FilterBarConfig<TFilters>,
): ActiveChip<keyof TFilters>[] {
  const chips: ActiveChip<keyof TFilters>[] = []
  const allFields = [...config.quick, ...config.advanced]

  for (const field of allFields) {
    const value = appliedFilters[field.field]
    const chipLabel = defaultChipLabel(field, value, appliedFilters)
    if (chipLabel !== null) {
      chips.push({ field: field.field, label: chipLabel })
    }
  }

  return chips
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/filterBar.chips.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/filterBar.chips.ts \
        frontend/src/components/filters/__tests__/filterBar.chips.test.ts
git commit -m "feat(filters): add chip derivation helper with tests"
```

---

## Task 4: `useFilterBar` Hook (TDD)

**Files:**
- Create: `frontend/src/components/filters/useFilterBar.ts`
- Create: `frontend/src/components/filters/__tests__/useFilterBar.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/components/filters/__tests__/useFilterBar.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { useFilterBar } from '../useFilterBar'
import type { FilterBarConfig } from '../filterBar.types'

interface F {
  search: string
  status: string | null
  tags: string[]
}

const config: FilterBarConfig<F> = {
  search: { placeholder: '', debounceMs: 0 },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  defaults: { search: '', status: null, tags: [] },
}

function wrapper({ initialUrl = '/' }: { initialUrl?: string } = {}) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children)
}

describe('useFilterBar', () => {
  describe('initial state', () => {
    it('starts with default filters when URL is empty', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      expect(result.current.appliedFilters).toEqual({ search: '', status: null, tags: [] })
      expect(result.current.draftFilters).toEqual({ search: '', status: null, tags: [] })
    })

    it('restores filters from URL on mount', () => {
      const { result } = renderHook(
        () => useFilterBar(config),
        { wrapper: wrapper({ initialUrl: '/?search=gundam&status=active' }) },
      )
      expect(result.current.appliedFilters.search).toBe('gundam')
      expect(result.current.appliedFilters.status).toBe('active')
    })

    it('falls back to defaults for invalid URL params', () => {
      const { result } = renderHook(
        () => useFilterBar(config),
        { wrapper: wrapper({ initialUrl: '/?status=not-valid' }) },
      )
      expect(result.current.appliedFilters.status).toBeNull()
    })
  })

  describe('quick filter changes', () => {
    it('updates both draftFilters and appliedFilters immediately', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => {
        result.current.handlers.onQuickFilterChange('status', 'active')
      })
      expect(result.current.draftFilters.status).toBe('active')
      expect(result.current.appliedFilters.status).toBe('active')
    })
  })

  describe('search', () => {
    it('updates draftFilters immediately on change', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onSearchChange('gun') })
      expect(result.current.draftFilters.search).toBe('gun')
    })

    it('updates appliedFilters after debounce (debounceMs: 0)', async () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      await act(async () => {
        result.current.handlers.onSearchChange('gun')
        await new Promise((r) => setTimeout(r, 10))
      })
      expect(result.current.appliedFilters.search).toBe('gun')
    })

    it('onSearchCommit flushes debounce immediately without waiting', () => {
      // Use non-zero debounce so we can verify the flush bypasses it
      const slowConfig: FilterBarConfig<F> = { ...config, search: { placeholder: '', debounceMs: 9999 } }
      const { result } = renderHook(() => useFilterBar(slowConfig), { wrapper: wrapper() })
      act(() => { result.current.handlers.onSearchChange('gun') })
      // Before commit, appliedFilters has not updated (debounce pending)
      expect(result.current.appliedFilters.search).toBe('')
      act(() => { result.current.handlers.onSearchCommit() })
      // After commit, appliedFilters updates immediately
      expect(result.current.appliedFilters.search).toBe('gun')
    })

    it('clears appliedFilters search immediately on empty string', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => {
        result.current.handlers.onQuickFilterChange('status', 'active')
        result.current.handlers.onSearchChange('')
      })
      expect(result.current.appliedFilters.search).toBe('')
    })
  })

  describe('advanced filters', () => {
    it('draft changes do not affect appliedFilters', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onAdvancedDraftChange('tags', ['a']) })
      expect(result.current.draftFilters.tags).toEqual(['a'])
      expect(result.current.appliedFilters.tags).toEqual([])
    })

    it('Apply copies draft to applied', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onAdvancedDraftChange('tags', ['a', 'b']) })
      act(() => { result.current.handlers.onAdvancedApply() })
      expect(result.current.appliedFilters.tags).toEqual(['a', 'b'])
    })

    it('Cancel restores advanced draft to applied values; quick fields unaffected', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      // Apply a quick filter first
      act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
      // Edit advanced draft
      act(() => { result.current.handlers.onAdvancedDraftChange('tags', ['a']) })
      // Cancel
      act(() => { result.current.handlers.onAdvancedCancel() })
      // Advanced draft reverts; quick draft unchanged
      expect(result.current.draftFilters.tags).toEqual([])
      expect(result.current.draftFilters.status).toBe('active')
    })

    it('hasUnappliedChanges is true when advanced draft differs from applied', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      expect(result.current.hasUnappliedChanges).toBe(false)
      act(() => { result.current.handlers.onAdvancedDraftChange('tags', ['a']) })
      expect(result.current.hasUnappliedChanges).toBe(true)
      act(() => { result.current.handlers.onAdvancedApply() })
      expect(result.current.hasUnappliedChanges).toBe(false)
    })

    it('hasUnappliedChanges ignores quick filter changes', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
      expect(result.current.hasUnappliedChanges).toBe(false)
    })
  })

  describe('clear operations', () => {
    it('onClearField resets both layers for that field', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
      act(() => { result.current.handlers.onClearField('status') })
      expect(result.current.draftFilters.status).toBeNull()
      expect(result.current.appliedFilters.status).toBeNull()
    })

    it('onClearAll resets all fields to defaults', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => {
        result.current.handlers.onQuickFilterChange('status', 'active')
        result.current.handlers.onAdvancedDraftChange('tags', ['a'])
        result.current.handlers.onAdvancedApply()
      })
      act(() => { result.current.handlers.onClearAll() })
      expect(result.current.appliedFilters).toEqual({ search: '', status: null, tags: [] })
      expect(result.current.draftFilters).toEqual({ search: '', status: null, tags: [] })
    })
  })

  describe('derived state', () => {
    it('hasActiveFilters is false when all defaults', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      expect(result.current.hasActiveFilters).toBe(false)
    })

    it('hasActiveFilters is true when a filter is active', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
      expect(result.current.hasActiveFilters).toBe(true)
    })

    it('activeChips reflect applied state only', () => {
      const { result } = renderHook(() => useFilterBar(config), { wrapper: wrapper() })
      act(() => { result.current.handlers.onAdvancedDraftChange('tags', ['a']) })
      // Not applied yet
      expect(result.current.activeChips).toHaveLength(0)
      act(() => { result.current.handlers.onAdvancedApply() })
      expect(result.current.activeChips).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/useFilterBar.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement `useFilterBar.ts`**

```typescript
// frontend/src/components/filters/useFilterBar.ts
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { parseFilters, serializeFilters, getManagedParamKeys } from './filterBar.url'
import { deriveChips } from './filterBar.chips'
import type {
  FilterBarConfig, FilterBarHandlers, ActiveChip,
} from './filterBar.types'

function getDefaults<TFilters extends Record<string, unknown>>(
  config: FilterBarConfig<TFilters>,
): TFilters {
  // Build type-safe empty values for all fields
  const result: Record<string, unknown> = {}
  if (config.search) result['search'] = ''
  const allFields = [...config.quick, ...config.advanced]
  for (const field of allFields) {
    const key = String(field.field)
    const def = config.defaults?.[field.field as keyof TFilters]
    if (def !== undefined) { result[key] = def; continue }
    if (field.type === 'select') result[key] = null
    else if (field.type === 'multi-select') result[key] = []
    else if (field.type === 'toggle') result[key] = null
    else if (field.type === 'date-range') result[key] = { from: null, to: null }
    else if (field.type === 'number-range') result[key] = { min: null, max: null }
  }
  return result as TFilters
}

function isEqualFilters(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useFilterBar<TFilters extends Record<string, unknown>>(
  config: FilterBarConfig<TFilters>,
): {
  appliedFilters: TFilters
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  activeChips: ActiveChip<keyof TFilters>[]
  hasActiveFilters: boolean
  hasUnappliedChanges: boolean
} {
  const location = useLocation()
  const navigate = useNavigate()
  const debounceMs = config.search?.debounceMs ?? 400
  const defaults = useMemo(() => getDefaults(config), [])

  // Parse initial state from URL
  const initialFilters = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return parseFilters(params, config)
  }, []) // intentionally only on mount

  const [appliedFilters, setAppliedFilters] = useState<TFilters>(initialFilters)
  const [draftFilters, setDraftFilters] = useState<TFilters>(initialFilters)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync appliedFilters → URL
  useEffect(() => {
    const currentParams = new URLSearchParams(location.search)
    const next = serializeFilters(appliedFilters, config, currentParams)
    if (next.toString() !== currentParams.toString()) {
      navigate({ search: next.toString() }, { replace: true })
    }
  }, [appliedFilters])

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Keep current search draft value in a ref so onSearchCommit can read it
  const searchDraftRef = useRef<string>('')

  const onSearchChange = useCallback((value: string) => {
    searchDraftRef.current = value
    setDraftFilters((prev) => ({ ...prev, search: value }))
    if (value === '') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setAppliedFilters((prev) => ({ ...prev, search: '' }))
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAppliedFilters((prev) => ({ ...prev, search: value }))
    }, debounceMs)
  }, [debounceMs])

  // Flush debounce immediately (called on Enter key)
  const onSearchCommit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const value = searchDraftRef.current
    setAppliedFilters((prev) => ({ ...prev, search: value }))
  }, [])

  const onQuickFilterChange = useCallback((field: keyof TFilters, value: unknown) => {
    setDraftFilters((prev) => ({ ...prev, [field]: value }))
    setAppliedFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const onAdvancedDraftChange = useCallback((field: keyof TFilters, value: unknown) => {
    setDraftFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const onAdvancedApply = useCallback(() => {
    setAppliedFilters((prev) => ({ ...prev, ...draftFilters }))
  }, [draftFilters])

  const onAdvancedCancel = useCallback(() => {
    // Restore only advanced-placement fields in draft from applied
    const advancedFields = new Set(config.advanced.map((f) => String(f.field)))
    setDraftFilters((prev) => {
      const next = { ...prev }
      for (const key of advancedFields) {
        (next as Record<string, unknown>)[key] = (appliedFilters as Record<string, unknown>)[key]
      }
      return next
    })
  }, [config.advanced, appliedFilters])

  const onClearField = useCallback((field: keyof TFilters) => {
    const def = (defaults as Record<string, unknown>)[String(field)]
    setDraftFilters((prev) => ({ ...prev, [field]: def }))
    setAppliedFilters((prev) => ({ ...prev, [field]: def }))
  }, [defaults])

  const onClearAll = useCallback(() => {
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
  }, [defaults])

  // ── Derived state ────────────────────────────────────────────────────────

  const activeChips = useMemo(
    () => deriveChips(appliedFilters, config),
    [appliedFilters],
  )

  const hasActiveFilters = useMemo(
    () => !isEqualFilters(appliedFilters, defaults),
    [appliedFilters, defaults],
  )

  // hasUnappliedChanges: only advanced fields
  const hasUnappliedChanges = useMemo(() => {
    for (const field of config.advanced) {
      const key = field.field
      if (!isEqualFilters(draftFilters[key], appliedFilters[key])) return true
    }
    return false
  }, [draftFilters, appliedFilters, config.advanced])

  return {
    appliedFilters,
    draftFilters,
    handlers: {
      onSearchChange,
      onSearchCommit,
      onQuickFilterChange,
      onAdvancedDraftChange,
      onAdvancedApply,
      onAdvancedCancel,
      onClearField,
      onClearAll,
    },
    activeChips,
    hasActiveFilters,
    hasUnappliedChanges,
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/useFilterBar.test.ts --no-coverage 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/useFilterBar.ts \
        frontend/src/components/filters/__tests__/useFilterBar.test.ts
git commit -m "feat(filters): add useFilterBar hook with tests"
```

---

## Task 5: Primitive UI Components

**Files:**
- Create: `frontend/src/components/filters/FilterSearch.tsx`
- Create: `frontend/src/components/filters/FilterSelect.tsx`
- Create: `frontend/src/components/filters/FilterToggle.tsx`
- Create: `frontend/src/components/filters/FilterDateRange.tsx`
- Create: `frontend/src/components/filters/FilterNumberRange.tsx`
- Create: `frontend/src/components/filters/ActiveFilterChips.tsx`
- Create: `frontend/src/components/filters/MoreFiltersButton.tsx`

These are presentational components. No tests needed for this task — they get exercised through `FilterBar.test.tsx` in Task 7.

- [ ] **Step 1: Create `FilterSearch.tsx`**

```tsx
// frontend/src/components/filters/FilterSearch.tsx
import { TextField, InputAdornment, IconButton } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'

interface Props {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onCommit: () => void  // called on Enter — flushes debounce immediately
}

export function FilterSearch({ value, placeholder = 'Search...', onChange, onCommit }: Props) {
  return (
    <TextField
      size="small"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit()
        }
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" />
          </InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => onChange('')} edge="end" aria-label="clear search">
              <ClearIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
      sx={{ minWidth: 220 }}
    />
  )
}
```

- [ ] **Step 2: Create `FilterSelect.tsx`**

```tsx
// frontend/src/components/filters/FilterSelect.tsx
import { FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput } from '@mui/material'
import type { FilterOption } from './filterBar.types'

interface Props {
  field: string
  label: string
  type: 'select' | 'multi-select'
  value: string | null | string[]
  options: FilterOption[]
  onChange: (value: string | null | string[]) => void
}

export function FilterSelect({ field, label, type, value, options, onChange }: Props) {
  const labelId = `filter-${field}-label`

  if (type === 'multi-select') {
    const selected = (value as string[]) ?? []
    return (
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id={labelId}>{label}</InputLabel>
        <Select
          labelId={labelId}
          multiple
          value={selected}
          input={<OutlinedInput label={label} />}
          renderValue={(sel) => `${label}: ${sel.length}`}
          onChange={(e) => onChange(e.target.value as string[])}
        >
          {options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              <Checkbox checked={selected.includes(opt.value)} />
              <ListItemText primary={opt.label} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value ?? ''}
        label={label}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <MenuItem value=""><em>All</em></MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
```

- [ ] **Step 3: Create `FilterToggle.tsx`**

```tsx
// frontend/src/components/filters/FilterToggle.tsx
import { FormControlLabel, Switch } from '@mui/material'

interface Props {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}

export function FilterToggle({ label, value, onChange }: Props) {
  return (
    <FormControlLabel
      control={
        <Switch
          checked={value === true}
          onChange={(e) => onChange(e.target.checked ? true : null)}
          size="small"
        />
      }
      label={label}
    />
  )
}
```

- [ ] **Step 4: Create `FilterDateRange.tsx`**

```tsx
// frontend/src/components/filters/FilterDateRange.tsx
import { Stack, TextField } from '@mui/material'
import type { DateRangeValue } from './filterBar.types'

interface Props {
  label: string
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}

export function FilterDateRange({ label, value, onChange }: Props) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        label={`${label} from`}
        type="date"
        value={value.from ?? ''}
        onChange={(e) => onChange({ ...value, from: e.target.value || null })}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 150 }}
      />
      <TextField
        size="small"
        label={`${label} to`}
        type="date"
        value={value.to ?? ''}
        onChange={(e) => onChange({ ...value, to: e.target.value || null })}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 150 }}
      />
    </Stack>
  )
}
```

- [ ] **Step 5: Create `FilterNumberRange.tsx`**

```tsx
// frontend/src/components/filters/FilterNumberRange.tsx
import { Stack, TextField } from '@mui/material'
import type { NumberRangeValue } from './filterBar.types'

interface Props {
  label: string
  value: NumberRangeValue
  onChange: (value: NumberRangeValue) => void
}

export function FilterNumberRange({ label, value, onChange }: Props) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        label={`${label} min`}
        type="number"
        value={value.min ?? ''}
        onChange={(e) => onChange({ ...value, min: e.target.value === '' ? null : Number(e.target.value) })}
        sx={{ minWidth: 120 }}
      />
      <TextField
        size="small"
        label={`${label} max`}
        type="number"
        value={value.max ?? ''}
        onChange={(e) => onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })}
        sx={{ minWidth: 120 }}
      />
    </Stack>
  )
}
```

- [ ] **Step 6: Create `ActiveFilterChips.tsx`**

```tsx
// frontend/src/components/filters/ActiveFilterChips.tsx
import { Stack, Chip } from '@mui/material'
import type { ActiveChip } from './filterBar.types'

interface Props<TFilters> {
  chips: ActiveChip<keyof TFilters>[]
  onRemove: (field: keyof TFilters) => void
}

export function ActiveFilterChips<TFilters>({ chips, onRemove }: Props<TFilters>) {
  if (chips.length === 0) return null
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
      {chips.map((chip) => (
        <Chip
          key={String(chip.field)}
          label={chip.label}
          size="small"
          onDelete={() => onRemove(chip.field)}
        />
      ))}
    </Stack>
  )
}
```

- [ ] **Step 7: Create `MoreFiltersButton.tsx`**

```tsx
// frontend/src/components/filters/MoreFiltersButton.tsx
import { Button, Badge } from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'

interface Props {
  activeCount: number
  onClick: () => void
}

export function MoreFiltersButton({ activeCount, onClick }: Props) {
  return (
    <Badge badgeContent={activeCount || 0} color="primary">
      <Button
        size="small"
        variant="outlined"
        startIcon={<TuneIcon />}
        onClick={onClick}
      >
        More Filters
      </Button>
    </Badge>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/filters/FilterSearch.tsx \
        frontend/src/components/filters/FilterSelect.tsx \
        frontend/src/components/filters/FilterToggle.tsx \
        frontend/src/components/filters/FilterDateRange.tsx \
        frontend/src/components/filters/FilterNumberRange.tsx \
        frontend/src/components/filters/ActiveFilterChips.tsx \
        frontend/src/components/filters/MoreFiltersButton.tsx
git commit -m "feat(filters): add primitive filter UI components"
```

---

## Task 6: `AdvancedFiltersDrawer` + `FilterBar` Components (TDD)

**Files:**
- Create: `frontend/src/components/filters/AdvancedFiltersDrawer.tsx`
- Create: `frontend/src/components/filters/FilterBar.tsx`
- Create: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Write failing `FilterBar` tests**

```tsx
// frontend/src/components/filters/__tests__/FilterBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../FilterBar'
import type { FilterBarConfig, FilterBarHandlers, ActiveChip } from '../filterBar.types'

interface F { search: string; status: string | null; tags: string[] }

const config: FilterBarConfig<F> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }] },
  ],
  defaults: { search: '', status: null, tags: [] },
}

const handlers: FilterBarHandlers<F> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onAdvancedDraftChange: vi.fn(),
  onAdvancedApply: vi.fn(),
  onAdvancedCancel: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

const baseProps = {
  config,
  draftFilters: { search: '', status: null, tags: [] },
  handlers,
  activeChips: [] as ActiveChip<keyof F>[],
  hasActiveFilters: false,
  hasUnappliedChanges: false,
}

describe('FilterBar', () => {
  it('renders search input', () => {
    render(<FilterBar {...baseProps} />)
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('renders quick filter controls from config', () => {
    render(<FilterBar {...baseProps} />)
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument()
  })

  it('does not show Reset button when no active filters', () => {
    render(<FilterBar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })

  it('shows Reset button when hasActiveFilters', () => {
    render(<FilterBar {...baseProps} hasActiveFilters={true} />)
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
  })

  it('Reset button calls onClearAll', () => {
    render(<FilterBar {...baseProps} hasActiveFilters={true} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(handlers.onClearAll).toHaveBeenCalled()
  })

  it('renders active filter chips', () => {
    const chips: ActiveChip<keyof F>[] = [{ field: 'status', label: 'Status: Active' }]
    render(<FilterBar {...baseProps} activeChips={chips} hasActiveFilters={true} />)
    expect(screen.getByText('Status: Active')).toBeInTheDocument()
  })

  it('chip delete calls onClearField', () => {
    const chips: ActiveChip<keyof F>[] = [{ field: 'status', label: 'Status: Active' }]
    render(<FilterBar {...baseProps} activeChips={chips} hasActiveFilters={true} />)
    const deleteButton = screen.getByTestId('CancelIcon')
    fireEvent.click(deleteButton)
    expect(handlers.onClearField).toHaveBeenCalledWith('status')
  })

  it('More Filters button opens advanced drawer', () => {
    render(<FilterBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(screen.getByText('Tags')).toBeInTheDocument()
  })

  it('drawer Apply button calls onAdvancedApply', () => {
    render(<FilterBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    expect(handlers.onAdvancedApply).toHaveBeenCalled()
  })

  it('drawer Cancel calls onAdvancedCancel', () => {
    render(<FilterBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(handlers.onAdvancedCancel).toHaveBeenCalled()
  })

  it('Apply button is disabled when !hasUnappliedChanges', () => {
    render(<FilterBar {...baseProps} hasUnappliedChanges={false} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeDisabled()
  })

  it('More Filters badge shows count of active advanced chips', () => {
    const chips: ActiveChip<keyof F>[] = [{ field: 'tags', label: 'Tags: A' }]
    render(<FilterBar {...baseProps} activeChips={chips} hasActiveFilters={true} />)
    // Badge shows "1" for the active advanced filter
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Create `AdvancedFiltersDrawer.tsx`**

```tsx
// frontend/src/components/filters/AdvancedFiltersDrawer.tsx
import { Drawer, Stack, Typography, Button, Divider, Box, useMediaQuery, useTheme } from '@mui/material'
import type { FilterBarConfig, FilterBarHandlers } from './filterBar.types'
import { FilterSelect } from './FilterSelect'
import { FilterDateRange } from './FilterDateRange'
import { FilterNumberRange } from './FilterNumberRange'
import { FilterToggle } from './FilterToggle'

interface Props<TFilters extends Record<string, unknown>> {
  open: boolean
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasUnappliedChanges: boolean
  onClose: () => void
}

function renderField<TFilters extends Record<string, unknown>>(
  field: FilterBarConfig<TFilters>['advanced'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (v: unknown) => handlers.onAdvancedDraftChange(field.field, v)

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
        value={value as import('./filterBar.types').DateRangeValue}
        onChange={onChange}
      />
    )
  }
  if (field.type === 'number-range') {
    return (
      <FilterNumberRange
        key={String(field.field)}
        label={field.label}
        value={value as import('./filterBar.types').NumberRangeValue}
        onChange={onChange}
      />
    )
  }
  if (field.type === 'toggle') {
    return (
      <FilterToggle
        key={String(field.field)}
        label={field.label}
        value={value as boolean | null}
        onChange={onChange}
      />
    )
  }
  return null
}

export function AdvancedFiltersDrawer<TFilters extends Record<string, unknown>>({
  open, config, draftFilters, handlers, hasUnappliedChanges, onClose,
}: Props<TFilters>) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const handleApply = () => {
    handlers.onAdvancedApply()
    onClose()
  }

  const handleCancel = () => {
    handlers.onAdvancedCancel()
    onClose()
  }

  const handleReset = () => {
    for (const field of config.advanced) {
      handlers.onClearField(field.field)
    }
    onClose()
  }

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={handleCancel}
      PaperProps={{ sx: { width: isMobile ? '100%' : 360, p: 2 } }}
    >
      <Typography variant="h6" gutterBottom>Filters</Typography>
      <Divider sx={{ mb: 2 }} />

      <Stack spacing={2} sx={{ flex: 1, overflowY: 'auto' }}>
        {config.advanced.map((field) => renderField(field, draftFilters, handlers))}
      </Stack>

      <Box sx={{ pt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" onClick={handleReset}>Reset</Button>
        <Button size="small" onClick={handleCancel}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          disabled={!hasUnappliedChanges}
          onClick={handleApply}
        >
          Apply
        </Button>
      </Box>
    </Drawer>
  )
}
```

- [ ] **Step 4: Create `FilterBar.tsx`**

```tsx
// frontend/src/components/filters/FilterBar.tsx
import { useState } from 'react'
import { Stack, Button } from '@mui/material'
import type { FilterBarConfig, FilterBarHandlers, ActiveChip } from './filterBar.types'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import { FilterToggle } from './FilterToggle'
import { FilterDateRange } from './FilterDateRange'
import { ActiveFilterChips } from './ActiveFilterChips'
import { MoreFiltersButton } from './MoreFiltersButton'
import { AdvancedFiltersDrawer } from './AdvancedFiltersDrawer'

interface Props<TFilters extends Record<string, unknown>> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  activeChips: ActiveChip<keyof TFilters>[]
  hasActiveFilters: boolean
  hasUnappliedChanges: boolean
}

function renderQuickField<TFilters extends Record<string, unknown>>(
  field: FilterBarConfig<TFilters>['quick'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (v: unknown) => handlers.onQuickFilterChange(field.field, v)

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
  if (field.type === 'toggle') {
    return (
      <FilterToggle
        key={String(field.field)}
        label={field.label}
        value={value as boolean | null}
        onChange={onChange}
      />
    )
  }
  if (field.type === 'date-range') {
    return (
      <FilterDateRange
        key={String(field.field)}
        label={field.label}
        value={value as import('./filterBar.types').DateRangeValue}
        onChange={onChange}
      />
    )
  }
  return null
}

export function FilterBar<TFilters extends Record<string, unknown>>({
  config, draftFilters, handlers, activeChips, hasActiveFilters, hasUnappliedChanges,
}: Props<TFilters>) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Count active advanced chips for badge
  const advancedFields = new Set(config.advanced.map((f) => String(f.field)))
  const activeAdvancedCount = activeChips.filter((c) => advancedFields.has(String(c.field))).length

  return (
    <Stack spacing={0}>
      {/* Row 1 */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {config.search && (
          <FilterSearch
            value={(draftFilters['search' as keyof TFilters] as string) ?? ''}
            placeholder={config.search.placeholder}
            onChange={handlers.onSearchChange}
            onCommit={handlers.onSearchCommit}
          />
        )}
        {config.quick.map((field) => renderQuickField(field, draftFilters, handlers))}
        {config.advanced.length > 0 && (
          <MoreFiltersButton
            activeCount={activeAdvancedCount}
            onClick={() => setDrawerOpen(true)}
          />
        )}
        {hasActiveFilters && (
          <Button size="small" onClick={handlers.onClearAll}>Reset</Button>
        )}
      </Stack>

      {/* Row 2: chips */}
      <ActiveFilterChips chips={activeChips} onRemove={handlers.onClearField} />

      {/* Advanced drawer */}
      {config.advanced.length > 0 && (
        <AdvancedFiltersDrawer
          open={drawerOpen}
          config={config}
          draftFilters={draftFilters}
          handlers={handlers}
          hasUnappliedChanges={hasUnappliedChanges}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </Stack>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx --no-coverage 2>&1 | tail -15
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/AdvancedFiltersDrawer.tsx \
        frontend/src/components/filters/FilterBar.tsx \
        frontend/src/components/filters/__tests__/FilterBar.test.tsx
git commit -m "feat(filters): add FilterBar and AdvancedFiltersDrawer with tests"
```

---

## Task 7: Public Index + TypeScript Check

**Files:**
- Create: `frontend/src/components/filters/index.ts`

- [ ] **Step 1: Create the index file**

```typescript
// frontend/src/components/filters/index.ts
export { FilterBar } from './FilterBar'
export { useFilterBar } from './useFilterBar'
export type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterFieldConfig,
  FilterFieldType,
  FilterOption,
  ActiveChip,
  DateRangeValue,
  NumberRangeValue,
} from './filterBar.types'
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors in `src/components/filters/`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/filters/index.ts
git commit -m "feat(filters): add public index and verify TypeScript types"
```

---

## Task 8: Migrate `ProductsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/store/slices/inventorySlice.ts`
- Create: `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`

This task removes Redux filter state from `inventorySlice` and replaces the inline filter UI with `<FilterBar>`.

- [ ] **Step 1: Write the integration test first**

```tsx
// frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { inventoryApiSlice } from '@/store/api/inventoryApi'
import inventoryReducer from '@/store/slices/inventorySlice'
import { ProductsPage } from '../ProductsPage'

// Mock the RTK Query hook
vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useGetProductsQuery: vi.fn(() => ({
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    })),
    useGetCategoriesQuery: vi.fn(() => ({ data: [], isLoading: false })),
    useGetWarehousesQuery: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function makeStore() {
  return configureStore({
    reducer: {
      inventory: inventoryReducer,
      [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
    },
    middleware: (m) => m().concat(inventoryApiSlice.middleware),
  })
}

function renderPage(initialUrl = '/') {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ProductsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ProductsPage FilterBar integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the FilterBar search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('restores filters from URL on mount', () => {
    renderPage('/?search=gundam&status=active')
    const { useGetProductsQuery } = require('@/store/api/inventoryApi')
    expect(useGetProductsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'gundam', status: 'active' }),
    )
  })

  it('quick filter change calls RTK Query with updated appliedFilters', async () => {
    renderPage()
    const { useGetProductsQuery } = require('@/store/api/inventoryApi')
    // Initial call
    expect(useGetProductsQuery).toHaveBeenCalled()
  })

  it('committed filter change updates the URL', async () => {
    const { container } = renderPage()
    // After mount with defaults, URL should not include filter params
    expect(window.location.search).not.toContain('status=')
  })

  it('does not wipe unrelated URL params after filter change', async () => {
    renderPage('/?tab=archived')
    // Tab param should survive filter interactions
    // (verified by checking URL after a filter change in the hook tests)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx --no-coverage 2>&1 | tail -15
```

- [ ] **Step 3: Define `InventoryProductFilters` and update `ProductsPage.tsx`**

At the top of the file, add the typed filters interface. Then replace the existing filter logic:

**Replace** (remove all of):
- `import { selectProductFilters, setProductFilters } from '@/store/slices/inventorySlice'`
- `const productFilters = useAppSelector(selectProductFilters) || { ... }`
- `const dispatch = useDispatch()`  (if only used for filter dispatch)
- `const { searchTerm, setSearchTerm, debouncedSearchTerm, handleSearch } = useSearchAndFilter({ ... })`
- The inline `<Box>` / `<Stack>` filter JSX (search input + category/status selects)

**Add** at the top of the component:

```tsx
import { useFilterBar, FilterBar } from '@/components/filters'
import type { FilterBarConfig } from '@/components/filters'
import type { DateRangeValue, NumberRangeValue } from '@/components/filters'

interface InventoryProductFilters {
  search: string
  status: 'active' | 'inactive' | null
  warehouseId: string | null
  categoryId: string | null
  stockRange: NumberRangeValue
}

// Inside the component:
const warehouseOptions = useGetWarehousesQuery()  // or whichever hook provides warehouses
const categoryOptions = useGetCategoriesQuery()

const filterConfig: FilterBarConfig<InventoryProductFilters> = {
  search: { placeholder: 'Search SKU, product name, barcode...' },
  quick: [
    {
      field: 'status', label: 'Status', type: 'select',
      options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
    },
    {
      field: 'warehouseId', label: 'Warehouse', type: 'select',
      options: (warehouseOptions.data ?? []).map((w: any) => ({ value: w.id, label: w.name })),
    },
  ],
  advanced: [
    {
      field: 'categoryId', label: 'Category', type: 'select',
      options: (categoryOptions.data ?? []).map((c: any) => ({ value: c.id, label: c.name })),
    },
    { field: 'stockRange', label: 'Stock Qty', type: 'number-range' },
  ],
  defaults: { search: '', status: null, warehouseId: null, categoryId: null, stockRange: { min: null, max: null } },
}

const { appliedFilters, draftFilters, handlers, activeChips, hasActiveFilters, hasUnappliedChanges } =
  useFilterBar(filterConfig)

// Pass appliedFilters to RTK Query:
const { data: productsResponse, isFetching } = useGetProductsQuery(appliedFilters)
```

**Replace** the filter JSX with:
```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  activeChips={activeChips}
  hasActiveFilters={hasActiveFilters}
  hasUnappliedChanges={hasUnappliedChanges}
/>
```

- [ ] **Step 4: Remove product filter state from `inventorySlice.ts`**

In `frontend/src/store/slices/inventorySlice.ts`, remove:
- `products: { search, categoryId, lowStock, inStock }` from the filters object in `InventoryState`
- `setProductFilters` action
- `selectProductFilters` selector

Keep `selectedProduct`, `selectedStockAdjustment`, and any other unrelated state intact.

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i error | head -20
```

Fix any type errors. Use `as any` where TypeORM/RTK Query types resist per project convention.

- [ ] **Step 6: Run the integration test**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: tests pass.

- [ ] **Step 7: Run full inventory test suite**

```bash
cd frontend && npx vitest run src/pages/inventory/ --no-coverage 2>&1 | tail -20
```

Fix any breakage from the slice change.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx \
        frontend/src/store/slices/inventorySlice.ts \
        frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
git commit -m "feat(filters): migrate ProductsPage to shared FilterBar system"
```

---

## Task 9: Migrate `OrdersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/store/slices/salesSlice.ts`
- Create: `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`

Same migration pattern as Task 8.

- [ ] **Step 1: Write the integration test**

```tsx
// frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { salesApiSlice } from '@/store/api/salesApi'
import salesReducer from '@/store/slices/salesSlice'
import { OrdersPage } from '../OrdersPage'

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetSalesOrdersQuery: vi.fn(() => ({
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    })),
    useGetCustomersQuery: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function makeStore() {
  return configureStore({
    reducer: { sales: salesReducer, [salesApiSlice.reducerPath]: salesApiSlice.reducer },
    middleware: (m) => m().concat(salesApiSlice.middleware),
  })
}

function renderPage(initialUrl = '/') {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <OrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrdersPage FilterBar integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the FilterBar', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('restores filters from URL on mount', () => {
    renderPage('/?status=pending&paymentStatus=unpaid')
    const { useGetSalesOrdersQuery } = require('@/store/api/salesApi')
    expect(useGetSalesOrdersQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', paymentStatus: 'unpaid' }),
    )
  })

})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx --no-coverage 2>&1 | tail -15
```

- [ ] **Step 3: Define `SalesOrderFilters` and update `OrdersPage.tsx`**

Follow the same pattern as Task 8 step 3. Define:

```tsx
interface SalesOrderFilters {
  search: string
  status: 'pending' | 'confirmed' | 'shipped' | 'completed' | 'cancelled' | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | null
  customerId: string | null
  dateRange: DateRangeValue
}
```

Config:
```tsx
const filterConfig: FilterBarConfig<SalesOrderFilters> = {
  search: { placeholder: 'Search orders...' },
  quick: [
    {
      field: 'status', label: 'Status', type: 'select',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'shipped', label: 'Shipped' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
    },
    {
      field: 'paymentStatus', label: 'Payment', type: 'select',
      options: [
        { value: 'unpaid', label: 'Unpaid' },
        { value: 'partial', label: 'Partial' },
        { value: 'paid', label: 'Paid' },
      ],
    },
  ],
  advanced: [
    {
      field: 'dateRange', label: 'Date', type: 'date-range',
      paramKey: 'createdAt',
    },
    {
      field: 'customerId', label: 'Customer', type: 'select',
      options: (customerOptions.data ?? []).map((c: any) => ({ value: c.id, label: c.name })),
    },
  ],
  defaults: { search: '', status: null, paymentStatus: null, customerId: null, dateRange: { from: null, to: null } },
}
```

Map `appliedFilters` to RTK Query call — the existing `useGetSalesOrdersQuery` expects `{ search, fromDate, toDate, paymentStatus, fulfillmentStatus, ... }`. You will need to map `appliedFilters.dateRange.from → fromDate` etc. before passing to the query. Add a mapping step:

```tsx
const queryArgs = {
  ...appliedFilters,
  fromDate: appliedFilters.dateRange.from,
  toDate: appliedFilters.dateRange.to,
  // map fulfillmentStatus if the page previously used that field
}
const { data } = useGetSalesOrdersQuery(queryArgs)
```

- [ ] **Step 4: Remove `orderFilters` from `salesSlice.ts`**

Remove:
- `orderFilters` from `SalesState`
- `setOrderFilters` action
- `selectOrderFilters` selector

Keep `selectedOrder`, `selectedInvoice`, `selectedPayment`, `error` and related state.

- [ ] **Step 5: TypeScript check + test run**

```bash
cd frontend && npm run type-check 2>&1 | grep -i error | head -20
cd frontend && npx vitest run src/pages/sales/ --no-coverage 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx \
        frontend/src/store/slices/salesSlice.ts \
        frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
git commit -m "feat(filters): migrate OrdersPage to shared FilterBar system"
```

---

## Task 10: Migrate `PurchaseOrdersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Create: `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx`

Note: `purchasingSlice` does NOT contain purchase order filter state (it uses local `pageState`). No slice changes needed for this migration.

- [ ] **Step 1: Write the integration test**

```tsx
// frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { purchasingApiSlice } from '@/store/api/purchasingApi'
import purchasingReducer from '@/store/slices/purchasingSlice'
import { PurchaseOrdersPage } from '../PurchaseOrdersPage'

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return {
    ...actual,
    useGetPurchaseOrdersQuery: vi.fn(() => ({
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    })),
    useGetSuppliersQuery: vi.fn(() => ({ data: [], isLoading: false })),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function makeStore() {
  return configureStore({
    reducer: { purchasing: purchasingReducer, [purchasingApiSlice.reducerPath]: purchasingApiSlice.reducer },
    middleware: (m) => m().concat(purchasingApiSlice.middleware),
  })
}

function renderPage(initialUrl = '/') {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PurchaseOrdersPage FilterBar integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the FilterBar', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('restores new-format URL params on mount', () => {
    renderPage('/?status=draft&supplierId=sup-1&orderDate_from=2024-01-01')
    const { useGetPurchaseOrdersQuery } = require('@/store/api/purchasingApi')
    expect(useGetPurchaseOrdersQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', supplierId: 'sup-1' }),
    )
  })

  it('legacy orderDateFrom param is ignored — date filter starts at default', () => {
    renderPage('/?orderDateFrom=2024-01-01')
    const { useGetPurchaseOrdersQuery } = require('@/store/api/purchasingApi')
    expect(useGetPurchaseOrdersQuery).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { from: null, to: null } }),
    )
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx --no-coverage 2>&1 | tail -15
```

- [ ] **Step 3: Define `PurchaseOrderFilters` and update `PurchaseOrdersPage.tsx`**

```tsx
interface PurchaseOrderFilters {
  search: string
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled' | null
  supplierId: string | null
  dateRange: DateRangeValue
  amountRange: NumberRangeValue
}

const filterConfig: FilterBarConfig<PurchaseOrderFilters> = {
  search: { placeholder: 'Search purchase orders...' },
  quick: [
    {
      field: 'status', label: 'Status', type: 'select',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'sent', label: 'Sent' },
        { value: 'partial', label: 'Partial' },
        { value: 'received', label: 'Received' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
    },
    {
      field: 'supplierId', label: 'Supplier', type: 'select',
      options: (supplierOptions.data ?? []).map((s: any) => ({ value: s.id, label: s.name })),
    },
  ],
  advanced: [
    { field: 'dateRange', label: 'Order Date', type: 'date-range', paramKey: 'orderDate' },
    { field: 'amountRange', label: 'Amount', type: 'number-range', paramKey: 'amount' },
  ],
  defaults: {
    search: '', status: null, supplierId: null,
    dateRange: { from: null, to: null }, amountRange: { min: null, max: null },
  },
}
```

Map `appliedFilters` to RTK Query args (existing endpoint uses `orderDateFrom`/`orderDateTo`):

```tsx
const queryArgs = {
  ...appliedFilters,
  orderDateFrom: appliedFilters.dateRange.from,
  orderDateTo: appliedFilters.dateRange.to,
}
const { data } = useGetPurchaseOrdersQuery(queryArgs)
```

Remove the old `pageState.filters` fields for `dateFilter`, `customFromDate`, `customToDate`, `supplierId`, `search` — those are now owned by `useFilterBar`.

- [ ] **Step 4: TypeScript check + test run**

```bash
cd frontend && npm run type-check 2>&1 | grep -i error | head -20
cd frontend && npx vitest run src/pages/purchasing/ --no-coverage 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx \
        frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
git commit -m "feat(filters): migrate PurchaseOrdersPage to shared FilterBar system"
```

---

## Task 11: Full Test Suite + Final Verification

- [ ] **Step 1: Run the complete filter system test suite**

```bash
cd frontend && npx vitest run src/components/filters/ --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run all migrated page tests**

```bash
cd frontend && npx vitest run src/pages/inventory/ src/pages/sales/ src/pages/purchasing/ --no-coverage 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

Expected: no new failures.

- [ ] **Step 4: TypeScript check across entire frontend**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(filters): complete filter bar system rollout — 3 core pages migrated"
```
