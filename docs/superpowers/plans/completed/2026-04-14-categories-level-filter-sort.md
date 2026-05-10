# Categories Level Filter + Sort Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic level filter dropdown and sort button to the Categories page toolbar.

**Architecture:** `FilterCategoryLevel` is a new standalone component that wraps the existing `FilterSelect` and derives level options from the loaded `categories` array. The sort button reuses the existing `sort` prop on `FilterBar` (same as `ProductsPage`). Level filtering is frontend-only (filters the already-fetched array). Sort goes through the API query params (backend already supports `sortBy`/`sortOrder`).

**Tech Stack:** React 19, MUI v7, RTK Query, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/components/filters/FilterCategoryLevel.tsx` | Create | New component — derives level options from categories, renders via FilterSelect |
| `frontend/src/components/filters/__tests__/FilterCategoryLevel.test.tsx` | Create | Unit tests for FilterCategoryLevel |
| `frontend/src/pages/inventory/CategoriesPage.tsx` | Modify | Add level state, sort state, visibleCategories, wire both into toolbar |

---

## Task 1: Create `FilterCategoryLevel` component

**Files:**
- Create: `frontend/src/components/filters/FilterCategoryLevel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/filters/FilterCategoryLevel.tsx`:

```tsx
import { useMemo } from 'react'

import type { Category } from '@/types'
import type { FilterOption } from '@/types/filterBar.types'
import { FilterSelect } from './FilterSelect'

interface Props {
  categories: Category[]
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCategoryLevel({ categories, value, onChange }: Props) {
  const options = useMemo<FilterOption[]>(() => {
    const levels = [...new Set(categories.map((c) => c.level))].sort((a, b) => a - b)
    return levels.map((level) => ({
      value: String(level),
      label: level === 0 ? 'Root' : `Level ${level}`,
    }))
  }, [categories])

  return (
    <FilterSelect
      field="level"
      label="Level"
      value={value}
      options={options}
      onChange={onChange}
      minWidth={120}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/filters/FilterCategoryLevel.tsx
git commit -m "feat(inventory): add FilterCategoryLevel component (#355)"
```

---

## Task 2: Test `FilterCategoryLevel`

**Files:**
- Create: `frontend/src/components/filters/__tests__/FilterCategoryLevel.test.tsx`

- [ ] **Step 1: Write the tests**

Create `frontend/src/components/filters/__tests__/FilterCategoryLevel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '@/types'
import { FilterCategoryLevel } from '../FilterCategoryLevel'

const makeCategory = (id: string, level: number): Category =>
  ({
    id,
    name: `Cat ${id}`,
    level,
    isRoot: level === 0,
    hasChildren: false,
    fullPath: `Cat ${id}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Category

describe('FilterCategoryLevel', () => {
  it('renders "All" option by default with no value', () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 1)]
    render(<FilterCategoryLevel categories={categories} value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/level/i)).toBeInTheDocument()
  })

  it('derives unique sorted level options from categories', async () => {
    const categories = [
      makeCategory('1', 0),
      makeCategory('2', 2),
      makeCategory('3', 1),
      makeCategory('4', 0), // duplicate level — should only appear once
    ]
    const user = userEvent.setup()
    render(<FilterCategoryLevel categories={categories} value={null} onChange={vi.fn()} />)
    await user.click(screen.getByLabelText(/level/i))
    expect(screen.getByText('Root')).toBeInTheDocument()
    expect(screen.getByText('Level 1')).toBeInTheDocument()
    expect(screen.getByText('Level 2')).toBeInTheDocument()
    expect(screen.queryAllByText('Root')).toHaveLength(1) // no duplicates
  })

  it('labels level 0 as "Root" and other levels as "Level N"', async () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 3)]
    const user = userEvent.setup()
    render(<FilterCategoryLevel categories={categories} value={null} onChange={vi.fn()} />)
    await user.click(screen.getByLabelText(/level/i))
    expect(screen.getByText('Root')).toBeInTheDocument()
    expect(screen.getByText('Level 3')).toBeInTheDocument()
  })

  it('calls onChange with string level value when option selected', async () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 1)]
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<FilterCategoryLevel categories={categories} value={null} onChange={onChange} />)
    await user.click(screen.getByLabelText(/level/i))
    await user.click(screen.getByText('Root'))
    expect(onChange).toHaveBeenCalledWith('0')
  })

  it('calls onChange with null when "All" selected', async () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 1)]
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<FilterCategoryLevel categories={categories} value="0" onChange={onChange} />)
    await user.click(screen.getByLabelText(/level/i))
    await user.click(screen.getByText('All'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders empty dropdown when categories array is empty', async () => {
    const user = userEvent.setup()
    render(<FilterCategoryLevel categories={[]} value={null} onChange={vi.fn()} />)
    await user.click(screen.getByLabelText(/level/i))
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.queryByText('Root')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterCategoryLevel.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/filters/__tests__/FilterCategoryLevel.test.tsx
git commit -m "test(inventory): add FilterCategoryLevel tests (#355)"
```

---

## Task 3: Wire level filter and sort into `CategoriesPage`

**Files:**
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`

- [ ] **Step 1: Add imports, state, and derived array**

At the top of `CategoriesPage.tsx`, add the import for `FilterCategoryLevel`:

```tsx
import { FilterCategoryLevel } from '@/components/filters/FilterCategoryLevel'
```

Update the `CategoryFilters` interface (no change needed — level filter is local state, not in FilterBar).

Inside the component, after the existing `useFilterBar` call, add sort state and level state:

```tsx
const [sortBy, setSortBy] = useState('name')
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
const [levelFilter, setLevelFilter] = useState<string | null>(null)

const handleSort = useCallback((field: string) => {
  setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
  setSortBy(field)
}, [sortBy])
```

- [ ] **Step 2: Pass sort params to the query**

Replace the existing `useGetCategoriesQuery` call:

```tsx
const {
  data: categories = [],
  isFetching,
  refetch: refetchCategories,
} = useGetCategoriesQuery({
  includeProductCount: true,
  search: appliedFilters.search || undefined,
  sortBy,
  sortOrder: sortOrder.toUpperCase(),
})
```

- [ ] **Step 3: Add visibleCategories derived array**

After the `useGetCategoriesQuery` call, add:

```tsx
const visibleCategories = levelFilter !== null
  ? categories.filter((c) => String(c.level) === levelFilter)
  : categories
```

- [ ] **Step 4: Update toolbar to include both FilterBar (with sort) and FilterCategoryLevel**

Replace the existing `toolbar` prop in `<PageHeader>`:

```tsx
toolbar={(
  <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
    <FilterBar
      config={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
    />
    <FilterCategoryLevel
      categories={categories}
      value={levelFilter}
      onChange={setLevelFilter}
    />
  </Stack>
)}
```

Note: `Stack` is already imported from `@mui/material` in this file — verify with a quick check. If not, add it to the MUI import line.

- [ ] **Step 5: Pass `visibleCategories` to `CategoryList` instead of `categories`**

In the `listSlot` prop of `<MasterDetailWorkspace>`, replace `categories` with `visibleCategories`:

```tsx
listSlot={(
  <CategoryList
    categories={visibleCategories}
    loading={isFetching}
    selectedCategoryId={selectedCategory?.id}
    focusedIndex={pageState.focusedCategoryIndex}
    onSelect={selection.handleCategorySelect}
    categoryListRef={pageState.categoryListRef}
  />
)}
```

Also update the subtitle in `PageHeader` to reflect `visibleCategories.length`:

```tsx
subtitle={`Organize your products with categories (${visibleCategories.length} ${appliedFilters.search || levelFilter ? 'found' : 'total'})`}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/inventory/CategoriesPage.tsx
git commit -m "feat(inventory): add level filter and sort button to CategoriesPage (#355)"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Start the frontend dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify sort button**

- Navigate to Inventory → Categories
- Click the Sort button → list re-fetches in descending order, arrow icon points down
- Click again → ascending order, arrow points up

- [ ] **Step 3: Verify level filter**

- Open the Level dropdown — it shows only levels that exist in your data (Root, Level 1, etc.)
- Select "Root" → list shows only root categories (level 0), indented children disappear
- Select "All" → full list returns
- With search active + level filter active, both work together correctly

- [ ] **Step 4: Open a PR**

```bash
gh pr create --title "feat(inventory): add level filter and sort button to categories page" --body "$(cat <<'EOF'
## Summary
- Adds dynamic level filter dropdown to Categories page — options derived from loaded data, no hardcoding
- Adds sort button (name A→Z / Z→A) following the same pattern as ProductsPage
- Level filtering is frontend-only (no backend changes)
- Sort uses existing backend `sortBy`/`sortOrder` query params

Closes #355

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
