# Issue #258: FilterBar Paper Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `<Paper>` wrappers from all `FilterBar` usages across 6 pages and migrate `PriceListsPage` to use the standard `FilterBar` + `useFilterBar` pattern.

**Architecture:** Each of the 5 simple pages swaps `<Paper sx={{ p: 2, mb: 3 }}>` for `<Box sx={{ mb: 3 }}>` around the existing `FilterBar`. `PriceListsPage` additionally replaces its manual `TextField`/`Select` filters with `FilterBar` + `useFilterBar`, and the now-unused Redux `filters` state is removed from `priceListSlice`. `DashboardFilterBar` needs no changes — it already renders a flat `Box`.

**Tech Stack:** React 19, MUI v7, RTK Query, `useFilterBar` hook (`frontend/src/hooks/useFilterBar.ts`), `FilterBar` component (`frontend/src/components/filters/FilterBar.tsx`)

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/sales/CustomersPage.tsx` | `<Paper>` → `<Box>` around FilterBar |
| `frontend/src/pages/sales/PaymentsPage.tsx` | `<Paper>` → `<Box>` around FilterBar |
| `frontend/src/pages/purchasing/SuppliersPage.tsx` | `<Paper>` → `<Box>` around FilterBar |
| `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` | `<Paper>` → `<Box>` around FilterBar |
| `frontend/src/pages/settings/UserManagementPage.tsx` | `<Paper>` → `<Box>` around FilterBar |
| `frontend/src/pages/settings/PriceListsPage.tsx` | Migrate manual filters to `FilterBar` + `useFilterBar` |
| `frontend/src/store/slices/priceListSlice.ts` | Remove `filters` state and `setFilters` action |
| `frontend/src/store/slices/__tests__/priceListSlice.ui.test.ts` | Remove `setFilters` test |

---

### Task 1: Remove Paper from CustomersPage

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx:426-434`

- [ ] **Step 1: Replace Paper wrapper with Box**

In `CustomersPage.tsx`, find the filter section (around line 426):

```tsx
      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Paper>
```

Replace with:

```tsx
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Box>
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep CustomersPage
```

Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "fix(sales): remove Paper wrapper from CustomersPage FilterBar"
```

---

### Task 2: Remove Paper from PaymentsPage

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx:489-526`

- [ ] **Step 1: Replace Paper wrapper with Box**

In `PaymentsPage.tsx`, find the filter section (around line 489). The Paper wraps a `Stack` containing the `FilterBar` and a Sort button:

```tsx
      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          <Box sx={{ flex: 1 }}>
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={filterBarHandlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={searchInputRef}
            />

            {presetCustomerId ? (
              <Stack direction="row" sx={{ mt: '7px' }}>
                <Chip
                  label={`Customer: ${customers.find((customer) => customer.id === presetCustomerId)?.name ?? presetCustomerId}`}
                  size="small"
                  variant="filled"
                />
              </Stack>
            ) : null}
          </Box>

          <Button
            variant={sortState.sortBy === 'paymentNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={sortState.sortBy === 'paymentNumber' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
            onClick={() => handleSort('paymentNumber')}
            sx={{
              height: '40px',
              fontSize: '0.875rem',
              minWidth: 'auto',
              px: 2,
            }}
          >
            Sort
          </Button>
        </Stack>
      </Paper>
```

Change only the outer `<Paper sx={{ p: 2, mb: 3 }}>` → `<Box sx={{ mb: 3 }}>` (and closing tag). Keep the Stack and everything inside unchanged:

```tsx
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          ... (unchanged interior) ...
        </Stack>
      </Box>
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep PaymentsPage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/PaymentsPage.tsx
git commit -m "fix(sales): remove Paper wrapper from PaymentsPage FilterBar"
```

---

### Task 3: Remove Paper from SuppliersPage

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx:372-380`

- [ ] **Step 1: Replace Paper wrapper with Box**

In `SuppliersPage.tsx`, find the filter section (around line 372):

```tsx
      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Paper>
```

Replace with:

```tsx
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Box>
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep SuppliersPage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/SuppliersPage.tsx
git commit -m "fix(purchasing): remove Paper wrapper from SuppliersPage FilterBar"
```

---

### Task 4: Remove Paper from StockAdjustmentsPage

**Files:**
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx:455-482`

- [ ] **Step 1: Replace Paper wrapper with Box**

In `StockAdjustmentsPage.tsx`, find the filter section (around line 455). The Paper wraps a `Stack` containing the `FilterBar` and a Sort button:

```tsx
      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          <Box sx={{ flex: 1 }}>
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={handlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={searchInputRef}
            />
          </Box>

          <Button ... >
            Sort
          </Button>
        </Stack>
      </Paper>
```

Change only the outer `<Paper sx={{ p: 2, mb: 3 }}>` → `<Box sx={{ mb: 3 }}>` (and closing tag):

```tsx
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          ... (unchanged interior) ...
        </Stack>
      </Box>
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep StockAdjustmentsPage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/StockAdjustmentsPage.tsx
git commit -m "fix(inventory): remove Paper wrapper from StockAdjustmentsPage FilterBar"
```

---

### Task 5: Remove Paper from UserManagementPage

**Files:**
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx:322-329`

- [ ] **Step 1: Replace Paper wrapper with Box**

In `UserManagementPage.tsx`, find the filter section (around line 322):

```tsx
      <Paper sx={{ p: 2, mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
        />
      </Paper>
```

Replace with:

```tsx
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
        />
      </Box>
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep UserManagementPage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/settings/UserManagementPage.tsx
git commit -m "fix(settings): remove Paper wrapper from UserManagementPage FilterBar"
```

---

### Task 6: Migrate PriceListsPage filters to FilterBar

**Files:**
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx`

This is the most involved task. The page currently uses manual `TextField` + `Select` driven by Redux state. We replace with `FilterBar` + `useFilterBar`.

- [ ] **Step 1: Update imports**

At the top of `PriceListsPage.tsx`, make these import changes:

Remove from the MUI import block: `TextField`, `FormControl`, `InputLabel`, `Select`, `InputAdornment`, `Stack`

Add after the existing `PageHeader` import:

```tsx
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
```

Remove from the MUI icons import: `Search as SearchIcon`

Remove from the slice import:
```tsx
import {
  setFilters,
  setPagination,
} from '@/store/slices/priceListSlice'
```
Replace with:
```tsx
import { setPagination } from '@/store/slices/priceListSlice'
```

Also add `useMemo` to the React import if not already there:
```tsx
import React, { useMemo, useState } from 'react'
```

- [ ] **Step 2: Add filter types and config**

After the component function declaration (`const PriceListsPage: React.FC = () => {`), add before the existing `const navigate` line:

```tsx
interface PriceListFilters {
  search: string
  status: 'active' | 'inactive' | null
}
```

Then after `const { showSuccess, showError } = useNotification()`, add:

```tsx
  const filterConfig = useMemo<FilterBarConfig<PriceListFilters>>(
    () => ({
      search: { placeholder: 'Search by code or name...' },
      fields: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ],
      defaults: {
        search: '',
        status: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
```

- [ ] **Step 3: Replace Redux filter reads with useFilterBar**

Find and remove these lines:

```tsx
  const filters = useAppSelector((state) => state.priceLists.filters)
```

Update the RTK Query call. Change:

```tsx
  const { data: priceListResponse, isLoading: loading, error, refetch } = useGetPriceListsQuery({
    page: pagination.page,
    limit: pagination.limit,
    search: filters.search || undefined,
    isActive: filters.isActive,
  })
```

To:

```tsx
  const { data: priceListResponse, isLoading: loading, error, refetch } = useGetPriceListsQuery({
    page: pagination.page,
    limit: pagination.limit,
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
  })
```

- [ ] **Step 4: Remove old filter handlers**

Find and delete these two handlers (they'll be around lines 92–98):

```tsx
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setFilters({ search: event.target.value }))
    dispatch(setPagination({ page: 1 }))
  }

  const handleActiveFilterChange = (event: any) => {
    const value = event.target.value
    dispatch(setFilters({ isActive: value === 'all' ? undefined : value === 'true' }))
    dispatch(setPagination({ page: 1 }))
  }
```

- [ ] **Step 5: Replace filter JSX**

Find the filter section in the JSX (around line 214):

```tsx
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            placeholder="Search by code or name..."
            value={filters.search}
            onChange={handleSearch}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flexGrow: 1 }}
          />
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.isActive === undefined ? 'all' : filters.isActive ? 'true' : 'false'}
              onChange={handleActiveFilterChange}
              label="Status"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>
```

Replace with:

```tsx
      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
        />
      </Box>
```

- [ ] **Step 6: Check if dispatch is still used**

`dispatch` is used for `setPagination` calls (`handlePageChange`, `handleRowsPerPageChange`). Verify `useAppDispatch` import stays. Check for any remaining `useAppSelector` usage — if `state.priceLists.filters` was the only one, the `useAppSelector` import can be removed if pagination is still read from state:

```bash
grep -n "useAppSelector\|useAppDispatch" frontend/src/pages/settings/PriceListsPage.tsx
```

Keep `useAppSelector` if `state.priceLists.pagination` is still read (it is — `pagination.page`, `pagination.limit` are used in the query). Keep `useAppDispatch` for `setPagination`.

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep PriceListsPage
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/settings/PriceListsPage.tsx
git commit -m "fix(settings): migrate PriceListsPage filters to FilterBar + useFilterBar"
```

---

### Task 7: Clean up priceListSlice

**Files:**
- Modify: `frontend/src/store/slices/priceListSlice.ts`
- Modify: `frontend/src/store/slices/__tests__/priceListSlice.ui.test.ts`

- [ ] **Step 1: Remove filters from slice**

Replace the entire content of `priceListSlice.ts` with:

```tsx
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface PriceListUIState {
  pagination: {
    page: number
    limit: number
  }
}

const initialState: PriceListUIState = {
  pagination: {
    page: 1,
    limit: 20,
  },
}

const priceListSlice = createSlice({
  name: 'priceLists',
  initialState,
  reducers: {
    setPagination: (state, action: PayloadAction<Partial<PriceListUIState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload }
    },
  },
})

export const { setPagination } = priceListSlice.actions

export default priceListSlice.reducer
```

- [ ] **Step 2: Update slice test**

Replace the content of `frontend/src/store/slices/__tests__/priceListSlice.ui.test.ts` with:

```tsx
import { describe, expect, it } from 'vitest'

import priceListReducer, { setPagination } from '@/store/slices/priceListSlice'

describe('priceListSlice UI state', () => {
  it('updates pagination', () => {
    const state = priceListReducer(undefined, setPagination({ page: 2, limit: 50 }))
    expect(state.pagination.page).toBe(2)
    expect(state.pagination.limit).toBe(50)
  })
})
```

- [ ] **Step 3: Run the slice test**

```bash
cd frontend && npx vitest run src/store/slices/__tests__/priceListSlice.ui.test.ts
```

Expected output:
```
✓ src/store/slices/__tests__/priceListSlice.ui.test.ts (1)
  ✓ priceListSlice UI state (1)
    ✓ updates pagination
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -i "priceList\|setFilters"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/slices/priceListSlice.ts frontend/src/store/slices/__tests__/priceListSlice.ui.test.ts
git commit -m "fix(settings): remove filters from priceListSlice, now handled by useFilterBar"
```

---

### Task 8: Final verification

- [ ] **Step 1: TypeScript check — full frontend**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Run related tests**

```bash
cd frontend && npx vitest run src/store/slices/__tests__/priceListSlice.ui.test.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors or warnings related to changed files.

- [ ] **Step 4: Close issue via PR**

```bash
gh pr create --title "fix: remove Paper wrapper from FilterBars (issue #258)" --body "$(cat <<'EOF'
## Summary

- Replace `<Paper sx={{ p: 2, mb: 3 }}>` with `<Box sx={{ mb: 3 }}>` around FilterBar on 5 pages (CustomersPage, PaymentsPage, SuppliersPage, StockAdjustmentsPage, UserManagementPage)
- Migrate PriceListsPage manual TextField/Select filters to standard FilterBar + useFilterBar
- Remove now-unused `filters` state and `setFilters` action from priceListSlice

Closes #258

## Test plan

- [ ] Visual check: filter bars on all 6 affected pages appear flat/transparent (no grey background)
- [ ] PriceListsPage search and status filter work correctly
- [ ] `npm run type-check` passes
- [ ] `npx vitest run src/store/slices/__tests__/priceListSlice.ui.test.ts` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
