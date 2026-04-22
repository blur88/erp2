# Journal Entries Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `JournalEntriesPage` with the UI and architectural patterns established in `OrdersPage` and `ProductsPage`.

**Architecture:** All changes are confined to a single file (`JournalEntriesPage.tsx`). The changes are: add named export, make subtitle static, move `filterConfig` inside the component wrapped in `useMemo`, add a `filterHandlers` memo that preserves search focus, and reorder hooks to match the standard sequence.

**Tech Stack:** React 19, TypeScript, Vitest

---

## File Map

- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Test: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

---

### Task 1: Named export + static subtitle

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Update the component declaration and subtitle**

In `frontend/src/pages/accounting/JournalEntriesPage.tsx`, make two changes:

Change line 43:
```ts
const JournalEntriesPage: React.FC = () => {
```
to:
```ts
export const JournalEntriesPage: React.FC = () => {
```

Change line 92:
```ts
subtitle={`Manage and post accounting journal entries (${pagination?.total ?? 0} total)`}
```
to:
```ts
subtitle="Manage and post accounting journal entries"
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors

- [ ] **Step 3: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```
Expected: all 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(accounting): add named export and static subtitle to JournalEntriesPage (issue #414)"
```

---

### Task 2: Move filterConfig inside component with useMemo

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Remove module-level filterConfig and add it inside the component**

Delete lines 28–41 (the module-level `const filterConfig: FilterBarConfig<JEFilters> = { ... }` block).

Inside the component body, add `filterConfig` as the first `useMemo` after the `useState` hooks (before `useFilterBar`):

```ts
const filterConfig = useMemo<FilterBarConfig<JEFilters>>(
  () => ({
    search: { placeholder: 'Search by reference or description...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      { field: 'status', label: 'Status', type: 'journal-entry-status' },
      { field: 'entryType', label: 'Entry Type', type: 'journal-entry-type' },
    ],
    defaults: {
      search: '',
      status: null,
      entryType: null,
      period: { key: null, from: null, to: null },
    },
  }),
  [],
)
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors

- [ ] **Step 3: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```
Expected: all 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "refactor(accounting): memoize filterConfig inside JournalEntriesPage (issue #414)"
```

---

### Task 3: Add filterHandlers with search focus preservation + reorder hooks

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Add filterHandlers memo after workspace is initialised**

After the `workspace` variable assignment (currently around line 78), add:

```ts
const filterHandlers = useMemo(() => ({
  ...handlers,
  onSearchChange: (value: string) => {
    workspace.setShouldPreserveSearchFocus(true)
    handlers.onSearchChange(value)
  },
}), [handlers, workspace])
```

- [ ] **Step 2: Pass filterHandlers to GenericListPage instead of handlers**

In the `<GenericListPage>` JSX, change:
```ts
handlers={handlers}
```
to:
```ts
handlers={filterHandlers}
```

- [ ] **Step 3: Reorder hooks to standard sequence**

The standard order is: React hooks → router hooks → Redux hooks → custom hooks.

Current order inside the component:
1. `useLocation`, `useNavigate` (router)
2. `useState` ×2 (React)
3. `useFilterBar` (custom)
4. `useMemo` for `weekStartsOn` / `dateRange` (React)
5. `useMemo` for `urlParams` (React)
6. `useMemo` for `queryArgs` (React)
7. `useGetJournalEntriesQuery` (RTK Query)
8. `useJournalEntriesWorkspace` (custom)

Reorder to:
1. `useState` ×2 (React)
2. `useLocation`, `useNavigate` (router)
3. `useGetJournalEntriesQuery` (RTK/Redux)
4. `useJournalEntriesWorkspace` (custom workspace)
5. `useFilterBar` (custom)
6. All `useMemo` hooks (React derived state)
7. `useCallback` for `handleSort`

The full reordered component body (between the opening `{` and the `return`) should read:

```ts
const [sortBy, setSortBy] = useState('createdAt')
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

const location = useLocation()
const navigate = useNavigate()

const filterConfig = useMemo<FilterBarConfig<JEFilters>>(
  () => ({
    search: { placeholder: 'Search by reference or description...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      { field: 'status', label: 'Status', type: 'journal-entry-status' },
      { field: 'entryType', label: 'Entry Type', type: 'journal-entry-type' },
    ],
    defaults: {
      search: '',
      status: null,
      entryType: null,
      period: { key: null, from: null, to: null },
    },
  }),
  [],
)

const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

const weekStartsOn = getStartOfWeek()
const dateRange = useMemo(() => {
  const period = appliedFilters.period
  if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
  if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
  const resolved = getPeriodDateRange(period.key, weekStartsOn)
  return { fromDate: resolved.from, toDate: resolved.to }
}, [appliedFilters.period, weekStartsOn])

const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search])
const sourceTypeParam = urlParams.get('sourceType')
const sourceIdParam = urlParams.get('sourceId')

const queryArgs = useMemo(() => ({
  search: appliedFilters.search || undefined,
  status: appliedFilters.status ? appliedFilters.status.toUpperCase() : undefined,
  sourceType: sourceIdParam ? sourceTypeParam ?? undefined : appliedFilters.entryType || undefined,
  sourceId: sourceIdParam ?? undefined,
  startDate: dateRange.fromDate,
  endDate: dateRange.toDate,
  sortBy,
  sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
}), [appliedFilters, dateRange, sortBy, sortOrder, sourceTypeParam, sourceIdParam])

const { data, isLoading, refetch } = useGetJournalEntriesQuery(queryArgs)
const entries = data?.data ?? []
const pagination = data?.meta
const workspace = useJournalEntriesWorkspace(() => {
  void refetch()
})

const filterHandlers = useMemo(() => ({
  ...handlers,
  onSearchChange: (value: string) => {
    workspace.setShouldPreserveSearchFocus(true)
    handlers.onSearchChange(value)
  },
}), [handlers, workspace])

const handleSort = useCallback((field: string) => {
  setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
  setSortBy(field)
}, [sortBy])
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors

- [ ] **Step 5: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```
Expected: all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "refactor(accounting): add filterHandlers, preserve search focus, reorder hooks (issue #414)"
```

---

### Task 4: Open PR

- [ ] **Step 1: Push branch and open PR**

```bash
git push origin main
gh pr create --title "refactor(accounting): align JournalEntriesPage with standard page format (issue #414)" --body "$(cat <<'EOF'
## Summary
- Added named export `export const JournalEntriesPage` (keeps default export for router compatibility)
- Made subtitle static: "Manage and post accounting journal entries"
- Moved `filterConfig` inside component body, wrapped in `useMemo`
- Added `filterHandlers` memo to call `setShouldPreserveSearchFocus(true)` on search change
- Reordered hooks to standard sequence: React → router → RTK Query → custom

Closes #414

## Test plan
- [ ] All 3 existing `JournalEntriesPage` tests pass
- [ ] TypeScript check passes
- [ ] Journal Entries page loads and filters correctly in the browser
- [ ] Typing in the search box keeps focus after filtering

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
