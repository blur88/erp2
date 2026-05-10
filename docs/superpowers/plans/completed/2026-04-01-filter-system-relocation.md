# Filter System Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move filter system logic files out of `components/filters/` into their correct directories (`hooks/`, `utils/`, `types/`) following existing project conventions.

**Architecture:** Three files are relocated: `useFilterBar.ts` → `hooks/`, `filterBar.url.ts` → `utils/`, `filterBar.types.ts` → `types/`. UI components stay in `components/filters/`. The barrel `index.ts` is trimmed to UI-only exports. All consumers update their imports.

**Tech Stack:** React 19, TypeScript (strict: false), Vitest, `@/` path alias for `src/`

---

## File Map

| Action | Path |
|--------|------|
| Move (copy + delete) | `components/filters/useFilterBar.ts` → `hooks/useFilterBar.ts` |
| Move (copy + delete) | `components/filters/filterBar.url.ts` → `utils/filterBar.url.ts` |
| Move (copy + delete) | `components/filters/filterBar.types.ts` → `types/filterBar.types.ts` |
| Move test | `components/filters/__tests__/useFilterBar.test.tsx` → `hooks/useFilterBar.test.tsx` |
| Move test | `components/filters/__tests__/filterBar.url.test.ts` → `utils/filterBar.url.test.ts` |
| Modify | `components/filters/index.ts` |
| Modify | `components/filters/FilterBar.tsx` |
| Modify | `components/filters/FilterSelect.tsx` |
| Modify | `components/filters/__tests__/FilterBar.test.tsx` |
| Modify (×8) | All page files listed in Task 4 |

---

### Task 1: Move `filterBar.types.ts` to `types/`

**Files:**
- Create: `frontend/src/types/filterBar.types.ts`
- Delete: `frontend/src/components/filters/filterBar.types.ts`

- [ ] **Step 1: Create `types/filterBar.types.ts` with exact same content**

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

- [ ] **Step 2: Delete the original**

```bash
rm frontend/src/components/filters/filterBar.types.ts
```

- [ ] **Step 3: Run type-check to confirm no errors yet (will fail — that's expected)**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: errors about missing `./filterBar.types` in components/filters files — that's correct, we'll fix them in subsequent tasks.

---

### Task 2: Move `filterBar.url.ts` to `utils/`

**Files:**
- Create: `frontend/src/utils/filterBar.url.ts`
- Create: `frontend/src/utils/filterBar.url.test.ts`
- Delete: `frontend/src/components/filters/filterBar.url.ts`
- Delete: `frontend/src/components/filters/__tests__/filterBar.url.test.ts`

- [ ] **Step 1: Create `utils/filterBar.url.ts` with updated import**

```typescript
import type {
  FilterBarConfig,
  FilterFieldConfig,
} from '@/types/filterBar.types'

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

- [ ] **Step 2: Create `utils/filterBar.url.test.ts` with updated imports**

```typescript
import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '@/types/filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '@/utils/filterBar.url'

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

- [ ] **Step 3: Run the new test to verify it passes**

```bash
cd frontend && npx vitest run src/utils/filterBar.url.test.ts
```

Expected: all tests pass (PASS, 9 tests)

- [ ] **Step 4: Delete the originals**

```bash
rm frontend/src/components/filters/filterBar.url.ts
rm frontend/src/components/filters/__tests__/filterBar.url.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/filterBar.url.ts frontend/src/utils/filterBar.url.test.ts
git add -u frontend/src/components/filters/filterBar.url.ts frontend/src/components/filters/__tests__/filterBar.url.test.ts
git commit -m "refactor: move filterBar.url to utils/ (#245)"
```

---

### Task 3: Move `useFilterBar.ts` to `hooks/`

**Files:**
- Create: `frontend/src/hooks/useFilterBar.ts`
- Create: `frontend/src/hooks/useFilterBar.test.tsx`
- Delete: `frontend/src/components/filters/useFilterBar.ts`
- Delete: `frontend/src/components/filters/__tests__/useFilterBar.test.tsx`

- [ ] **Step 1: Create `hooks/useFilterBar.ts` with updated imports**

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import type { FilterBarConfig, FilterBarHandlers } from '@/types/filterBar.types'
import { parseFilters, serializeFilters } from '@/utils/filterBar.url'

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

- [ ] **Step 2: Create `hooks/useFilterBar.test.tsx` with updated imports**

```typescript
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '@/types/filterBar.types'
import { useFilterBar } from '@/hooks/useFilterBar'

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

- [ ] **Step 3: Run the new test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx
```

Expected: all 5 tests pass

- [ ] **Step 4: Delete the originals**

```bash
rm frontend/src/components/filters/useFilterBar.ts
rm frontend/src/components/filters/__tests__/useFilterBar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFilterBar.ts frontend/src/hooks/useFilterBar.test.tsx
git add -u frontend/src/components/filters/useFilterBar.ts frontend/src/components/filters/__tests__/useFilterBar.test.tsx
git commit -m "refactor: move useFilterBar to hooks/ (#245)"
```

---

### Task 4: Update `components/filters/` internal files

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/FilterSelect.tsx`
- Modify: `frontend/src/components/filters/index.ts`
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Update `FilterBar.tsx` — change type import**

Replace:
```typescript
import type {
  FilterBarConfig,
  FilterBarHandlers,
} from './filterBar.types'
```
With:
```typescript
import type {
  FilterBarConfig,
  FilterBarHandlers,
} from '@/types/filterBar.types'
```

- [ ] **Step 2: Update `FilterSelect.tsx` — change type import**

Replace:
```typescript
import type { FilterOption } from './filterBar.types'
```
With:
```typescript
import type { FilterOption } from '@/types/filterBar.types'
```

- [ ] **Step 3: Update `index.ts` — remove hook and type re-exports**

Replace the entire file content with:
```typescript
export { FilterBar } from './FilterBar'
export { FilterPeriod } from './FilterPeriod'
```

- [ ] **Step 4: Update `__tests__/FilterBar.test.tsx` — change type import**

Replace:
```typescript
import type { FilterBarConfig, FilterBarHandlers } from '../filterBar.types'
```
With:
```typescript
import type { FilterBarConfig, FilterBarHandlers } from '@/types/filterBar.types'
```

- [ ] **Step 5: Run the FilterBar test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: both tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx \
        frontend/src/components/filters/FilterSelect.tsx \
        frontend/src/components/filters/index.ts \
        frontend/src/components/filters/__tests__/FilterBar.test.tsx
git commit -m "refactor: update components/filters internal imports (#245)"
```

---

### Task 5: Update page file imports

**Files (all Modify):**
- `frontend/src/pages/inventory/ProductsPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- `frontend/src/pages/settings/UserManagementPage.tsx`

All 8 files currently have this import pattern (two lines):
```typescript
import { FilterBar, useFilterBar } from '@/components/filters'
import type { FilterBarConfig } from '@/components/filters'
```

- [ ] **Step 1: In each of the 8 files, replace both lines with:**

```typescript
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
```

Apply this to all 8 files:
- `src/pages/inventory/ProductsPage.tsx`
- `src/pages/inventory/StockAdjustmentsPage.tsx`
- `src/pages/sales/OrdersPage.tsx`
- `src/pages/sales/PaymentsPage.tsx`
- `src/pages/sales/CustomersPage.tsx`
- `src/pages/purchasing/SuppliersPage.tsx`
- `src/pages/purchasing/PurchaseOrdersPage.tsx`
- `src/pages/settings/UserManagementPage.tsx`

- [ ] **Step 2: Run type-check — must be clean**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add \
  frontend/src/pages/inventory/ProductsPage.tsx \
  frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
  frontend/src/pages/sales/OrdersPage.tsx \
  frontend/src/pages/sales/PaymentsPage.tsx \
  frontend/src/pages/sales/CustomersPage.tsx \
  frontend/src/pages/purchasing/SuppliersPage.tsx \
  frontend/src/pages/purchasing/PurchaseOrdersPage.tsx \
  frontend/src/pages/settings/UserManagementPage.tsx
git commit -m "refactor: update page imports after filter system relocation (#245)"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run all moved test files**

```bash
cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx src/utils/filterBar.url.test.ts src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: all tests pass

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: zero errors

- [ ] **Step 3: Confirm old paths are gone**

```bash
ls frontend/src/components/filters/
```

Expected output (only UI files remain):
```
DashboardFilterBar.tsx
FilterBar.tsx
FilterPeriod.test.tsx
FilterPeriod.tsx
FilterSearch.tsx
FilterSelect.tsx
__tests__/
index.ts
```

And `__tests__/` should contain only `FilterBar.test.tsx` and `DashboardFilterBar.test.tsx`.
