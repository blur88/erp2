# Suppliers Sort Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a company-name sort toggle button to the Suppliers page FilterBar, matching the existing pattern from CustomersPage.

**Architecture:** Add `sortBy`/`sortOrder` state and `handleSort` to `SuppliersPage.tsx`, pass them into `supplierQueryParams` and the `FilterBar` `sort` prop. The backend already supports these params. No new files, no component changes.

**Tech Stack:** React 19, RTK Query (`useGetSuppliersQuery`), MUI v7, Vitest

---

## File Map

- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`

---

### Task 1: Add failing tests for sort behaviour

**Files:**
- Modify: `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`

- [ ] **Step 1: Add two failing tests at the end of the `describe` block**

Open `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx` and append inside the `describe('SuppliersPage FilterBar', ...)` block (before the closing `}`):

```tsx
  it('renders a Sort button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /sort/i })).toBeInTheDocument()
  })

  it('passes default sortBy=companyName and sortOrder=ASC to query', () => {
    renderPage()
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'companyName', sortOrder: 'ASC' }),
    )
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
```

Expected: the two new tests FAIL (Sort button not found / sortBy not in params). Existing tests should still pass.

---

### Task 2: Implement sort in SuppliersPage

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`

- [ ] **Step 1: Add `useCallback` to the React import and add sort state + handler**

In `SuppliersPage.tsx`, change the React import line from:

```tsx
import React, { useEffect, useMemo, useState } from 'react'
```

to:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react'
```

Then add sort state and handler directly after `const pageState = useSuppliersPageState()` (around line 39):

```tsx
  const [sortBy, setSortBy] = useState('companyName')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])
```

- [ ] **Step 2: Add sortBy and sortOrder to the query params**

Find the `supplierQueryParams` memo (around line 63) and add the sort params:

```tsx
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
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    }),
    [appliedFilters, sortBy, sortOrder],
  )
```

- [ ] **Step 3: Pass the sort prop to FilterBar**

Find the `<FilterBar ... />` JSX (around line 147) and add the `sort` prop:

```tsx
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'companyName', sortBy, sortOrder, onSort: handleSort }}
          />
```

- [ ] **Step 4: Run the tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/purchasing/SuppliersPage.tsx src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
git commit -m "feat(suppliers): add sort button to SuppliersPage (#325)"
```
