# Filter Bar System — Design Spec
**Issue:** #186
**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Build a reusable, config-driven filter bar system and deploy it on three core list pages: Inventory Products, Sales Orders, and Purchase Orders. This is the production foundation for later app-wide rollout.

The deliverable is not just three upgraded pages. It is:
- A shared filter bar component system
- A shared filter state pattern (draft vs. applied)
- URL persistence (applied filters are the source of truth)
- A declarative per-page config pattern
- Migrated implementations on three representative pages

Remaining list pages will be migrated in a follow-up issue after this pattern is validated.

---

## Scope

**In scope:**
- `frontend/src/components/filters/` — complete shared filter component library and hook
- Migration of Inventory Products, Sales Orders, and Purchase Orders
- URL sync for all three pages
- Active filter chips on all three pages
- Advanced filters drawer on all three pages
- Removal of superseded inline filter state on migrated pages

**Out of scope:**
- Other list pages (Customers, Suppliers, Payments, GRN, Audit Logs, etc.)
- Report pages or log pages (different filter UX patterns)
- E2E tests (Playwright/Cypress)
- Pagination URL sync (separate concern)
- Save/preset functionality

---

## Interaction Model

The filter system uses a **mixed interaction model**, consistent across all three pages:

| Filter type | Behavior |
|---|---|
| Search input | Debounced (400ms default); Enter commits immediately; clear resets instantly |
| Dropdown / Select | Instant — updates applied state immediately |
| Toggle | Instant |
| Date range (quick placement) | Instant |
| Advanced drawer fields | Explicit Apply — batch commits on button click |

**UX rules:**
1. Quick filters apply instantly. Advanced filters require explicit Apply.
2. UI state (chips, field values) always reflects current draft immediately. Only the data fetch is gated by applied state.
3. Table loading state is shown for any in-flight fetch.
4. Reset is always instant — clears all filters to defaults, updates URL, triggers refetch.
5. Advanced drawer Cancel discards unapplied edits and restores advanced-placement fields in `draftFilters` to their current `appliedFilters` values. Quick-filter and search draft state is unaffected.
6. Advanced drawer Apply button is disabled when there are no unapplied changes.
7. Behavior is identical across all three migrated pages.

---

## Filter Config Schema

Each page declares its filter configuration as a plain object. Options from async sources are resolved via hooks on the page before being passed into config.

```ts
type FilterFieldType = 'select' | 'multi-select' | 'date-range' | 'number-range' | 'toggle'

type FilterOption = { value: string; label: string }

// Canonical value type aliases — used in TFilters interfaces and filterBar.types.ts
type DateRangeValue = { from: string | null; to: string | null }    // dates as YYYY-MM-DD
type NumberRangeValue = { min: number | null; max: number | null }

// Value shapes by type:
//   select          → string | null
//   multi-select    → string[]
//   toggle          → boolean | null  (null = unset, not false)
//   date-range      → DateRangeValue
//   number-range    → NumberRangeValue

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string        // URL param key; defaults to field name
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

interface SelectFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'select' | 'multi-select'
  options: FilterOption[]
}

interface DateRangeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'date-range'
}

interface NumberRangeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'number-range'
}

interface ToggleFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'toggle'
}

type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | DateRangeFilterFieldConfig<TFilters, keyof TFilters>
  | NumberRangeFilterFieldConfig<TFilters, keyof TFilters>
  | ToggleFilterFieldConfig<TFilters, keyof TFilters>

interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number     // default 400
    paramKey?: string       // default 'search'
  }
  quick: FilterFieldConfig<TFilters>[]
  advanced: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
}
```

**Key rules:**
- `placement` is not a field property — array location (`quick` vs `advanced`) determines placement.
- `optionsQuery` hooks are NOT stored in config. Pages resolve options into plain arrays before building the config object.
- `defaults` lives in config; serialization reads it from there (no separate argument).
- `search` is part of the page's typed filter state managed by `useFilterBar`, with debounced commit behavior.

---

## State Model — `useFilterBar` Hook

The hook owns all filter behavior. Pages call it once and pass results to `<FilterBar />` and their RTK Query call.

```ts
function useFilterBar<TFilters extends Record<string, unknown>>(
  config: FilterBarConfig<TFilters>
): {
  appliedFilters: TFilters          // used for API calls + URL sync
  draftFilters: TFilters            // rendered UI state (may differ from applied)
  handlers: FilterBarHandlers<TFilters>
  activeChips: ActiveChip<keyof TFilters>[]
  hasActiveFilters: boolean
  hasUnappliedChanges: boolean      // true when advanced-placement draft fields differ from applied; quick fields and search are excluded from this check
}
```

**Two-layer state model:**

| Layer | Updated when | Triggers API |
|---|---|---|
| `draftFilters` | Any UI change | No |
| `appliedFilters` | Quick change / search committed / Apply clicked | Yes (via RTK Query) |

`draftFilters` is the rendered UI state. `appliedFilters` is the committed API/URL state. On mount, both layers are initialized from URL-parsed applied state.

**Handlers:**
```ts
interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void         // debounced → appliedFilters
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void  // instant → both layers
  onAdvancedDraftChange: (field: keyof TFilters, value: unknown) => void // draft only; implementations must narrow value by field config type before writing state — unknown here is a public API simplification, not a license for untyped state updates
  onAdvancedApply: () => void                     // draft → appliedFilters + URL
  onAdvancedCancel: () => void                    // discard unapplied edits; restore advanced-placement fields in draftFilters to their appliedFilters values; quick fields are unaffected
  onClearField: (field: keyof TFilters) => void   // clears both layers + URL immediately
  onClearAll: () => void                          // resets all to defaults + URL + refetch
}
```

**`onClearField` semantics:** always clears the committed value — updates both `draftFilters` and `appliedFilters`, triggers URL update and refetch immediately. This is correct because chips represent applied state.

**URL sync behavior:**
- On mount: parse URL params → initialize `appliedFilters` (and clone to `draftFilters`)
- On `appliedFilters` change: serialize to URL using `replaceState` (no new back-stack entry)
- Advanced drawer draft changes never touch URL until Apply
- Parse priority per field: URL value (if valid) → config default → type-appropriate empty value
- Invalid URL param values fall back to default silently

**Page usage:**
```tsx
const inventoryOptions = useGetWarehousesAsOptions()  // resolved before config
const categoryOptions = useGetCategoriesAsOptions()

const config: FilterBarConfig<InventoryProductFilters> = {
  search: { placeholder: 'Search SKU, product name, barcode...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: statusOptions },
    { field: 'warehouseId', label: 'Warehouse', type: 'select', options: inventoryOptions.data ?? [] },
  ],
  advanced: [
    { field: 'categoryId', label: 'Category', type: 'select', options: categoryOptions.data ?? [] },
    { field: 'stockRange', label: 'Stock Qty', type: 'number-range' },
  ],
}

const { appliedFilters, draftFilters, handlers, activeChips, hasActiveFilters, hasUnappliedChanges } =
  useFilterBar(config)

// RTK Query receives only committed filters
const { data } = useGetProductsQuery(appliedFilters)
```

---

## Component Architecture

```
frontend/src/components/filters/
  FilterBar.tsx               — orchestrates layout + drawer open/close state
  FilterSearch.tsx            — debounced search input
  FilterSelect.tsx            — select + multi-select
  FilterToggle.tsx            — boolean toggle
  FilterDateRange.tsx         — date range (two date inputs)
  FilterNumberRange.tsx       — number range (min/max inputs)
  ActiveFilterChips.tsx       — removable chip row
  MoreFiltersButton.tsx       — presentational; badge shows active advanced count
  AdvancedFiltersDrawer.tsx   — renders as right-side MUI Drawer on desktop; bottom-anchored drawer/sheet on mobile. Single component, responsive anchor.
  useFilterBar.ts             — hook (pure behavior, no UI dependency)
  filterBar.types.ts          — all shared types
  filterBar.url.ts            — URL parse/serialize helpers
  filterBar.chips.ts          — active chip derivation/formatting
  index.ts                    — public exports
```

**Ownership boundaries:**
- `FilterBar` owns: layout, drawer open/close UI state, rendering from config, wiring handlers to children
- `useFilterBar` owns: draft/applied state, URL sync, reset logic, chip derivation, dirty-state derivation
- Primitive controls own: field rendering, value display, emitting typed changes

**FilterBar props:**
```tsx
interface FilterBarProps<TFilters> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  activeChips: ActiveChip<keyof TFilters>[]
  hasActiveFilters: boolean
  hasUnappliedChanges: boolean
  // appliedFilters not passed — hook owns comparison logic
}
```

**ActiveChip shape (data-only, no embedded callbacks):**
```ts
interface ActiveChip<TField = string> {
  field: TField
  label: string  // e.g. "Status: Active", "Brand: 3 selected"
}

interface ActiveFilterChipsProps<TFilters> {
  chips: ActiveChip<keyof TFilters>[]
  onRemove: (field: keyof TFilters) => void
}
```

**Layout:**
- Row 1: `[Search] [Quick filters...] [More Filters] [Reset]` — flex row, wraps on tablet
- Row 2: `[Active filter chips]` — rendered only when `activeChips.length > 0`
- Advanced drawer: right-side MUI `<Drawer>` on desktop, bottom-anchored on mobile; same component, `anchor` prop switches responsively; footer has Apply / Cancel / Reset
- Mobile: sticky search + single "Filters (n)" button opens bottom sheet
- Terminology is consistent: "More Filters" on desktop, "Filters (n)" on mobile

**MoreFiltersButton** is purely presentational. Drawer open/close state lives in `FilterBar`.

An internal `FilterFieldRenderer` helper (not page-exposed) handles the `switch` on field type to avoid duplicating that logic in both `FilterQuickControls` and `AdvancedFiltersDrawer`.

---

## URL Serialization

All parse/serialize logic lives in `filterBar.url.ts`. `filterBar.chips.ts` handles chip label derivation separately.

**Serialize rules:**
- Fields equal to their default → omit from URL (keeps URLs clean)
- `null` / `undefined` / `''` → omit
- `string[]` with 0 items → omit
- `{ from: null, to: null }` → omit; partial ranges are valid (`from`-only or `to`-only)
- `{ min: null, max: null }` → omit; partial ranges are valid
- Arrays → repeated params: `?brand=A&brand=B` (not comma-joined)
- DateRange → `?createdAt_from=2024-01-01&createdAt_to=2024-03-31`
- NumberRange → `?price_min=100&price_max=500`
- Toggle `null` → omit; `true` → `"true"`; `false` → `"false"`
- Date format: `YYYY-MM-DD` only. Invalid dates → `null`.
- `paramKey` override respected in both directions. For range fields, range suffixes are appended to the effective key: `{paramKey ?? field}_from`/`_to` for date-range, `{paramKey ?? field}_min`/`_max` for number-range.
- Param ordering is deterministic: search first, then quick fields in config order, then advanced fields in config order; within ranges `_from`/`_to` before `_min`/`_max`

**Parse rules:**
- Missing param → config default → type-appropriate empty value
- Invalid/unrecognized param value → fall back to default silently
- `select`/`multi-select`: only values present in configured options are accepted; unknown values are dropped
- Arrays: `URLSearchParams.getAll()` to collect repeated params
- NumberRange: coerce to number; `NaN` → `null`
- Toggle: `"true"` → `true`, `"false"` → `false`, missing/invalid → `null`

**URL write strategy:**
- Use `replaceState` (not `pushState`) — filter changes don't pollute back stack
- Update only managed param keys (derived from config field names / paramKeys). Unrelated params (`sort`, `tab`, `view`, `page`, etc.) are preserved.
- Clearing all filters: delete managed params; don't leave empty `?`

**Serialize signature:**
```ts
function serializeFilters<TFilters>(
  filters: TFilters,
  config: FilterBarConfig<TFilters>,
  currentSearchParams: URLSearchParams
): URLSearchParams

function parseFilters<TFilters>(
  searchParams: URLSearchParams,
  config: FilterBarConfig<TFilters>
): TFilters
```

**Example URL — Inventory Products:**
```
/inventory/products?search=gundam&status=active&warehouseId=wh-kl&stockRange_min=10
```

---

## Per-Page Migration

### Migration pattern (all 3 pages)

1. Define typed `TFilters` interface
2. Resolve async options via hooks on the page; build `FilterBarConfig<TFilters>` as a plain object
3. Call `useFilterBar(config)` to get state and handlers
4. Replace inline filter JSX with `<FilterBar {...filterBarProps} />`
5. Pass `appliedFilters` to the RTK Query call
6. Remove superseded local filter `useState` calls
7. Remove `useSearchAndFilter` usage (or reduce to keyboard-shortcut-only if those are kept)
8. Remove Redux-managed filter state that is superseded by `useFilterBar` — preserve unrelated page slice state
9. Confirm field-to-param mapping (`paramKey` where needed) and verify existing bookmarked/shared URLs still work or are intentionally migrated

`search` is part of each page's typed filter state, managed by `useFilterBar` with debounced commit behavior.

RTK Query endpoint definitions remain unchanged in most cases. The change is that `appliedFilters` becomes the query input; param normalization before the call may need minor adjustment per page.

### Inventory Products

```ts
interface InventoryProductFilters {
  search: string
  status: 'active' | 'inactive' | null
  categoryId: string | null
  stockRange: NumberRangeValue
}
```

Quick: status
Advanced: categoryId, stockRange

**Backend notes:**
- `status` maps to `isActive: true/false` in the query (backend field name differs)
- `stockRange` maps to `minStock`/`maxStock` query params (backend supports these)
- `warehouseId` deferred: `GET /inventory/products` does not support warehouse filtering. Add to quick filters in a follow-up when backend support is added.

### Sales Orders

```ts
interface SalesOrderFilters {
  search: string
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
  dateRange: DateRangeValue
}
```

Quick: customerId, paymentStatus
Advanced: fulfillmentStatus, dateRange (createdAt)

`dateRange` uses `paramKey: 'createdAt'` → URL keys `createdAt_from`/`createdAt_to`.

**Backend notes:**
- The Sales Orders API has no generic `status` field. Fulfillment state is exposed as `fulfillmentStatus: 'fulfilled'|'unfulfilled'` (maps to `isFulfilled` boolean). The spec's original `status` field was incorrect.
- `paymentStatus` valid values are `unpaid|partial|paid|overpaid` (4 values, not 3 as originally spec'd — `overpaid` is a real backend value).
- `customerId` placed in quick filters (high-frequency triage filter for this page).
- Backend query params: `fromDate`/`toDate` for date range; `paymentStatus`; `fulfillmentStatus`; `customerId`.

### Purchase Orders

```ts
interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
  dateRange: DateRangeValue
}
```

Quick: supplierId
Advanced: dateRange (order date)

**Backend notes:**
- `GET /purchasing/orders` does not support `status` filtering — no status query param exists in `PurchaseOrderQueryDto`. Deferred to a follow-up when backend support is added.
- `amountRange` deferred: no `minAmount`/`maxAmount` params in the backend endpoint.
- `dateRange` maps to backend params `orderDateFrom`/`orderDateTo`.
- `supplierId` is fully supported.

`dateRange` uses `paramKey: 'orderDate'` → URL keys `orderDate_from`/`orderDate_to`.

**URL migration note:** The legacy PurchaseOrdersPage used `orderDateFrom`/`orderDateTo` (camelCase). The new system adopts the shared underscore convention instead. Those legacy params are not preserved — they are treated as unrecognized on parse and fall back to defaults. New params `orderDate_from`/`orderDate_to` are the canonical form going forward. Verify no internal links or external integrations depend on the old format before migrating.

### Acceptance checklist (per migrated page)

- [ ] Filters restore from URL on page reload
- [ ] Back navigation preserves the filtered view
- [ ] Quick filters apply instantly (no Apply button needed)
- [ ] Search is debounced; Enter commits immediately; clear resets instantly
- [ ] Advanced drawer changes do not trigger a fetch until Apply is clicked
- [ ] Advanced drawer Cancel discards edits and restores draft to applied state
- [ ] Chips reflect applied filters only
- [ ] Removing a chip updates URL and results immediately
- [ ] Reset clears all filters to defaults and updates URL
- [ ] Changing any filter does not wipe unrelated URL params
- [ ] URL reflects applied state after every committed change
- [ ] (Purchase Orders only) Legacy `orderDateFrom`/`orderDateTo` params are ignored on mount; date filter starts at default

---

## Testing Strategy

### Level 1 — Pure logic

**`filterBar.url.test.ts`**
- Default values are omitted from serialized URL
- Arrays serialize as repeated params and parse back correctly
- `_from`/`_to`, `_min`/`_max` split/join for partial and full ranges
- `paramKey` override respected in both directions
- Only managed param keys are modified; unrelated params are preserved
- Invalid select/multi-select values dropped on parse
- Toggle: `null` → absent; `"true"` → `true`; invalid → `null`
- Date format validated as `YYYY-MM-DD`; invalid dates → `null`
- Param ordering is stable across repeated calls

**`filterBar.chips.test.ts`** (if separated)
- Chip label derivation for all field types
- Multi-select count formatting ("Brand: 3 selected")
- `chipFormatter` override respected

### Level 2 — Hook behavior

**`useFilterBar.test.ts`** (heaviest layer — most bugs live here)
- URL params restore correctly on mount (all field types, partial ranges)
- Quick filter change updates both `draftFilters` and `appliedFilters` immediately
- Search debounce: `draftFilters` updates instantly; `appliedFilters` updates after delay
- Search Enter key commits immediately
- Search clear resets `appliedFilters` and URL immediately
- Advanced draft changes don't affect `appliedFilters` until `onAdvancedApply()`
- `onAdvancedApply()` copies draft → applied, updates URL
- `onAdvancedCancel()` discards advanced draft edits, restores draft to current applied values
- `hasUnappliedChanges` is true when advanced draft fields differ from applied
- `onClearField()` resets both layers + URL for that field immediately
- `onClearAll()` resets all fields to defaults, clears URL, triggers refetch
- Invalid URL params fall back to defaults silently
- Partial date/number ranges parse and serialize correctly
- Changing a filter does not remove unrelated URL params (regression test)

### Level 3 — Component wiring

**`FilterBar.test.tsx`**
- Renders quick filter controls from config
- "More Filters" badge shows count of active advanced filters
- Reset button only visible when `hasActiveFilters` is true
- Active chips render with correct labels and fire `onRemove`
- Advanced drawer opens on "More Filters" click
- Drawer Apply/Cancel/Reset buttons behave correctly
- Apply button disabled when `!hasUnappliedChanges`
- Cancel discards unapplied drawer edits (dedicated test)

### Level 4 — Page integration

One focused test per migrated page:
- Filters restore from URL params on mount
- RTK Query called with `appliedFilters` (not draft) — assert via `vi.mocked(useGetXxxQuery)` and verify the argument matches the expected `appliedFilters` object after each interaction
- Quick filter change triggers refetch
- Advanced Apply triggers refetch; intermediate changes do not
- Committed filter change updates the URL correctly
- Clear all resets to defaults
- Unrelated URL param preserved after filter change (regression)

**Out of scope:** E2E tests, visual regression tests, testing MUI primitive internals.

---

## File Locations

```
frontend/src/components/filters/
  FilterBar.tsx
  FilterSearch.tsx
  FilterSelect.tsx
  FilterToggle.tsx
  FilterDateRange.tsx
  FilterNumberRange.tsx
  ActiveFilterChips.tsx
  MoreFiltersButton.tsx
  AdvancedFiltersDrawer.tsx
  useFilterBar.ts
  filterBar.types.ts
  filterBar.url.ts
  filterBar.chips.ts
  index.ts
```

Pages affected:
- `frontend/src/pages/inventory/ProductsPage.tsx`
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
