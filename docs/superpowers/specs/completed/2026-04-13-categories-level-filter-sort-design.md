# Categories Page: Level Filter + Sort Button

**Issue:** #355
**Date:** 2026-04-13

## Goal

Add a dynamic level filter and sort button to the Categories page FilterBar toolbar, allowing users to narrow the list to a specific depth and control sort order.

## Scope

Frontend-only changes. No backend changes required.

- Backend already supports `sortBy` and `sortOrder` query params in `QueryCategoriesDto`
- All categories are loaded client-side, so level filtering is done by filtering the fetched array
- No changes to FilterBar type system or `filterBar.types.ts`

---

## 1. Level Filter

### Component: `FilterCategoryLevel`

New file: `frontend/src/components/filters/FilterCategoryLevel.tsx`

- Accepts `categories: Category[]`, `value: string | null`, `onChange: (value: string | null) => void`
- Derives unique levels dynamically: `[...new Set(categories.map(c => c.level))].sort()`
- Maps to `FilterOption[]`: level `0` → `"Root"`, level `N` → `"Level N"`
- Renders via existing `FilterSelect` — no new UI primitives needed
- If only one level exists in data, the dropdown still renders (single option + "All")

### Wiring in `CategoriesPage`

- New local state: `const [levelFilter, setLevelFilter] = useState<string | null>(null)`
- Derived array: `const visibleCategories = levelFilter !== null ? categories.filter(c => String(c.level) === levelFilter) : categories`
- `visibleCategories` is passed to `CategoryList` instead of raw `categories`
- `FilterCategoryLevel` rendered in the toolbar alongside `<FilterBar>` (same row, after FilterBar)

---

## 2. Sort Button

### Wiring in `CategoriesPage`

Follows the exact same pattern as `ProductsPage`:

- New state: `const [sortBy, setSortBy] = useState('name')` and `const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')`
- `handleSort` callback: toggles `sortOrder` asc↔desc if same field, else resets to asc
- `sortBy` and `sortOrder` passed into `useGetCategoriesQuery` params (backend already supports `name` and `createdAt`)
- `sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}` prop passed to `<FilterBar>`
- `FilterBar` renders the `AppButton` sort button automatically via existing `sort` prop support

---

## 3. Toolbar Layout

```
[ Search input ] [ Level dropdown ] [ Sort button ] [ Reset (if active) ]
```

`FilterCategoryLevel` sits between `FilterBar` and nothing — it is rendered as a sibling next to `<FilterBar>` in the `toolbar` prop of `PageHeader`.

---

## 4. Files Changed

| File | Change |
|---|---|
| `frontend/src/components/filters/FilterCategoryLevel.tsx` | New component |
| `frontend/src/pages/inventory/CategoriesPage.tsx` | Level state, sort state, visibleCategories, toolbar wiring |

---

## 5. Out of Scope

- No backend changes
- No FilterBar type system changes
- No pagination (categories page loads all records)
- No URL param persistence for level filter (local state only, resets on navigation)
