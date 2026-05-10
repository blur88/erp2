# Filter System Architectural Enhancements — Design Spec

**Issue:** #250  
**Date:** 2026-04-02  
**Status:** Approved

---

## Overview

Three targeted improvements to the generic `FilterBar` system:

1. Integrate `FilterPeriod` into the config-driven `FilterBar`
2. Rename `quick` → `fields` in `FilterBarConfig`
3. Add optional URL namespace prefix to `useFilterBar`

---

## 1. Integrate `FilterPeriod` into the Config System

### Types (`filterBar.types.ts`)

Add a `PeriodValue` named type to represent the three-part period state:

```ts
export type PeriodValue = {
  key: PeriodKey
  from: string | null
  to: string | null
}
```

Add `'period'` to `FilterFieldType`:

```ts
export type FilterFieldType = 'select' | 'multi-select' | 'period'
```

Add `PeriodFilterFieldConfig` (no `options` — period options come from `PERIOD_KEYS` constants):

```ts
export interface PeriodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'period'
}
```

Update the `FilterFieldConfig` union:

```ts
export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
```

### URL serialization/parsing (`filterBar.url.ts`)

**Serialize:** a preset period key (e.g. `this_month`) writes one param: `?period=this_month`. A custom range writes three: `?period=custom&period_from=2026-01-01&period_to=2026-03-31`. The from/to param names are `${fieldParamKey}_from` / `${fieldParamKey}_to`.

**Parse:** reads the period key param, validates against `PERIOD_KEYS`. If key is `'custom'`, reads from/to params. Falls back to configured default on invalid/missing values.

**Managed keys:** `getManagedParamKeys` includes the period key param plus its `_from`/`_to` companions so they are properly cleared on reset.

### Hook (`useFilterBar.ts`)

`getDefaults` returns `{ key: 'this_month', from: null, to: null }` for a period field when no default is configured. No other hook changes — `onQuickFilterChange`, `onClearField`, and `onClearAll` all work generically with the `PeriodValue` object.

### Component (`FilterBar.tsx`)

`renderQuickField` gains a `'period'` branch that renders `<FilterPeriod>` using the `PeriodValue` from `draftFilters`. The `onChange` callback from `FilterPeriod` constructs a new `PeriodValue` and calls `onQuickFilterChange`:

```tsx
if (field.type === 'period') {
  const periodValue = value as PeriodValue
  return (
    <FilterPeriod
      key={String(field.field)}
      value={periodValue.key}
      customFrom={periodValue.from}
      customTo={periodValue.to}
      onChange={(key, from, to) =>
        onChange({ key, from: from ?? null, to: to ?? null })
      }
    />
  )
}
```

`FilterPeriod.tsx` itself is unchanged.

---

## 2. Rename `quick` → `fields`

**Hard cutover** — no deprecation shim. All usages are internal to this repo.

- `FilterBarConfig.quick` → `FilterBarConfig.fields`
- All internal references (`config.quick`, `config.quick.map`, etc.) updated
- All 26 page files and test fixtures updated in the same pass

---

## 3. Add URL Namespacing to `useFilterBar`

Add an optional `namespace` property to `FilterBarConfig`:

```ts
export interface FilterBarConfig<TFilters> {
  // ...existing fields...
  namespace?: string
}
```

When `namespace` is set, **all** URL params are prefixed with `${namespace}_` — including `search`. This ensures full isolation when multiple `FilterBar` instances share a route.

**Helper in `filterBar.url.ts`:**

```ts
function prefixed(key: string, namespace?: string): string {
  return namespace ? `${namespace}_${key}` : key
}
```

Applied to every param key in `serializeFilters`, `parseFilters`, and `getManagedParamKeys`.

**Example:** `namespace: 'orders'` produces `?orders_search=foo&orders_status=active&orders_period=this_month`.

When no namespace is set, behaviour is identical to today.

---

## Testing

| File | What's added |
|------|-------------|
| `filterBar.url.test.ts` | Period serialize/parse (preset, custom range, invalid fallback); namespace prefix on all params including search |
| `useFilterBar.test.tsx` | Period default value when no default configured |
| `FilterBar.test.tsx` | `FilterPeriod` renders when `type: 'period'` field in config |
| All 26 page/filterbar test files | `quick:` → `fields:` rename in config fixtures |

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/types/filterBar.types.ts` | Add `PeriodValue`, `PeriodFilterFieldConfig`, extend union, rename `quick`→`fields`, add `namespace` |
| `frontend/src/utils/filterBar.url.ts` | Period serialize/parse, namespace prefix, rename `quick`→`fields` |
| `frontend/src/hooks/useFilterBar.ts` | Period default in `getDefaults`, rename `quick`→`fields` |
| `frontend/src/components/filters/FilterBar.tsx` | Period branch in `renderQuickField`, rename `quick`→`fields` |
| 26 page + test files | `quick:` → `fields:` rename in config objects |

---

## Verification Checklist

- `FilterBar` renders a `FilterPeriod` when a field with `type: 'period'` is configured
- Period URL params serialize and parse correctly for both preset and custom ranges
- `_from`/`_to` params are cleared when period is reset or changed to a preset
- All URL params are namespaced when `namespace` is set, including `search`
- All existing pages continue to work after `quick` → `fields` rename
- No changes to `DashboardFilterBar` or `FilterPeriod` component interfaces
