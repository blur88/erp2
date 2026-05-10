# Remove Unused Filter Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `FilterDateRange`, `FilterNumberRange`, `FilterToggle` components and strip the `date-range`, `number-range`, and `toggle` types from the filter bar system.

**Architecture:** Pure deletion — no new code. Remove the three component files, trim the three dead type variants from core types/URL logic/hook, clean up `FilterBar.tsx` render logic, and remove the corresponding dead test cases from the URL test file.

**Tech Stack:** React 19, TypeScript, Vitest

---

## File Map

| Action | File |
|--------|------|
| Delete | `frontend/src/components/filters/FilterDateRange.tsx` |
| Delete | `frontend/src/components/filters/FilterNumberRange.tsx` |
| Delete | `frontend/src/components/filters/FilterToggle.tsx` |
| Modify | `frontend/src/components/filters/filterBar.types.ts` |
| Modify | `frontend/src/components/filters/index.ts` |
| Modify | `frontend/src/components/filters/filterBar.url.ts` |
| Modify | `frontend/src/components/filters/useFilterBar.ts` |
| Modify | `frontend/src/components/filters/FilterBar.tsx` |
| Modify | `frontend/src/components/filters/__tests__/filterBar.url.test.ts` |

---

### Task 1: Delete the three component files

**Files:**
- Delete: `frontend/src/components/filters/FilterDateRange.tsx`
- Delete: `frontend/src/components/filters/FilterNumberRange.tsx`
- Delete: `frontend/src/components/filters/FilterToggle.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/components/filters/FilterDateRange.tsx
rm frontend/src/components/filters/FilterNumberRange.tsx
rm frontend/src/components/filters/FilterToggle.tsx
```

- [ ] **Step 2: Verify they are gone**

```bash
ls frontend/src/components/filters/Filter*.tsx
```

Expected output (only remaining filter components):
```
frontend/src/components/filters/FilterBar.tsx
frontend/src/components/filters/FilterPeriod.tsx
frontend/src/components/filters/FilterSearch.tsx
frontend/src/components/filters/FilterSelect.tsx
```

---

### Task 2: Clean up `filterBar.types.ts`

**Files:**
- Modify: `frontend/src/components/filters/filterBar.types.ts`

- [ ] **Step 1: Replace the entire file with the cleaned version**

```typescript
export type FilterOption = { value: string; label: string }

export type FilterFieldType =
  | 'select'
  | 'multi-select'

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

export type FilterFieldConfig<TFilters> =
  SelectFilterFieldConfig<TFilters, keyof TFilters>

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

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: errors only from files that still import `DateRangeValue`, `NumberRangeValue`, or dead types — those are fixed in the next tasks. The types file itself should be clean.

---

### Task 3: Clean up `index.ts`

**Files:**
- Modify: `frontend/src/components/filters/index.ts`

- [ ] **Step 1: Replace the exports block**

```typescript
export { FilterBar } from './FilterBar'
export { FilterPeriod } from './FilterPeriod'
export { useFilterBar } from './useFilterBar'
export type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterFieldConfig,
  FilterFieldType,
  FilterOption,
} from './filterBar.types'
```

---

### Task 4: Clean up `filterBar.url.ts`

**Files:**
- Modify: `frontend/src/components/filters/filterBar.url.ts`

- [ ] **Step 1: Replace the entire file with the cleaned version**

```typescript
import type {
  FilterBarConfig,
  FilterFieldConfig,
} from './filterBar.types'

function effectiveKey<TFilters>(field: FilterFieldConfig<TFilters>): string {
  return field.paramKey ?? String(field.field)
}

export function getManagedParamKeys<TFilters>(
  config: FilterBarConfig<TFilters>,
): string[] {
  const keys: string[] = []

  if (config.search) {
    keys.push(config.search.paramKey ?? 'search')
  }

  for (const field of config.quick) {
    keys.push(effectiveKey(field))
  }

  return keys
}

export function serializeFilters<TFilters extends object>(
  filters: TFilters,
  config: FilterBarConfig<TFilters>,
  currentSearchParams: URLSearchParams,
): URLSearchParams {
  const result = new URLSearchParams(currentSearchParams)

  for (const key of getManagedParamKeys(config)) {
    result.delete(key)
  }

  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const orderedEntries: Array<[string, string]> = []

  if (config.search) {
    const searchKey = config.search.paramKey ?? 'search'
    const searchValue = ((filters as Record<string, unknown>).search as string | undefined) ?? ''
    const defaultSearch = (defaults.search as string | undefined) ?? ''
    if (searchValue && searchValue !== defaultSearch) {
      orderedEntries.push([searchKey, searchValue])
    }
  }

  for (const field of config.quick) {
    const key = effectiveKey(field)
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
  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if (config.search) {
    const searchKey = config.search.paramKey ?? 'search'
    result.search = searchParams.get(searchKey) ?? (defaults.search ?? '')
  }

  for (const field of config.quick) {
    const key = effectiveKey(field)
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
  }

  return result as TFilters
}
```

---

### Task 5: Clean up `useFilterBar.ts`

**Files:**
- Modify: `frontend/src/components/filters/useFilterBar.ts`

- [ ] **Step 1: Replace the `getDefaults` function**

Find this block in `useFilterBar.ts` (lines 7–29):

```typescript
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
```

Replace with:

```typescript
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
    else defaults[key] = []
  }

  return defaults as TFilters
}
```

---

### Task 6: Clean up `FilterBar.tsx`

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import { Button, Stack } from '@mui/material'

import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import type {
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

---

### Task 7: Clean up `filterBar.url.test.ts`

**Files:**
- Modify: `frontend/src/components/filters/__tests__/filterBar.url.test.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '../filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '../filterBar.url'

interface TestFilters {
  search: string
  status: string | null
  tags: string[]
}

const config: FilterBarConfig<TestFilters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  defaults: {
    search: '',
    status: null,
    tags: [],
  },
}

describe('serializeFilters', () => {
  it('omits default values', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [] },
      config,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })

  it('serializes search', () => {
    const params = serializeFilters(
      { search: 'gundam', status: null, tags: [] },
      config,
      new URLSearchParams(),
    )
    expect(params.get('search')).toBe('gundam')
  })

  it('serializes select value', () => {
    const params = serializeFilters(
      { search: '', status: 'active', tags: [] },
      config,
      new URLSearchParams(),
    )
    expect(params.get('status')).toBe('active')
  })

  it('serializes multi-select as repeated params', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: ['a', 'b'] },
      config,
      new URLSearchParams(),
    )
    expect(params.getAll('tags')).toEqual(['a', 'b'])
  })

  it('preserves unrelated params', () => {
    const params = serializeFilters(
      { search: 'x', status: null, tags: [] },
      config,
      new URLSearchParams('tab=archived&sort=desc'),
    )
    expect(params.get('tab')).toBe('archived')
    expect(params.get('sort')).toBe('desc')
    expect(params.get('search')).toBe('x')
  })
})

describe('parseFilters', () => {
  it('returns defaults when URL is empty', () => {
    expect(parseFilters(new URLSearchParams(), config)).toEqual({
      search: '',
      status: null,
      tags: [],
    })
  })

  it('drops invalid select values', () => {
    expect(parseFilters(new URLSearchParams('status=unknown'), config).status).toBeNull()
  })

  it('parses multi-select repeated params and drops invalid values', () => {
    expect(parseFilters(new URLSearchParams('tags=a&tags=b&tags=nope'), config).tags).toEqual(['a', 'b'])
  })
})

describe('getManagedParamKeys', () => {
  it('returns all managed keys', () => {
    expect(getManagedParamKeys(config)).toEqual(
      expect.arrayContaining(['search', 'status', 'tags']),
    )
  })
})
```

- [ ] **Step 2: Run the URL tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/filterBar.url.test.ts
```

Expected: all tests pass.

---

### Task 8: Run full filter test suite and type-check

**Files:** none

- [ ] **Step 1: Run all filter tests**

```bash
cd frontend && npx vitest run src/components/filters
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Run TypeScript type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend/.. && git add \
  frontend/src/components/filters/filterBar.types.ts \
  frontend/src/components/filters/index.ts \
  frontend/src/components/filters/filterBar.url.ts \
  frontend/src/components/filters/useFilterBar.ts \
  frontend/src/components/filters/FilterBar.tsx \
  frontend/src/components/filters/__tests__/filterBar.url.test.ts
git add -u frontend/src/components/filters/FilterDateRange.tsx \
  frontend/src/components/filters/FilterNumberRange.tsx \
  frontend/src/components/filters/FilterToggle.tsx
git commit -m "refactor: remove FilterDateRange, FilterNumberRange, FilterToggle and dead types (#243)"
```
