# Design: Remove Unused Filter Types (Issue #243)

## Summary

Remove `FilterDateRange`, `FilterNumberRange`, and `FilterToggle` components and their associated types (`date-range`, `number-range`, `toggle`) from the filter bar system. These are dead code — no pages use them.

## Files to Delete

- `frontend/src/components/filters/FilterDateRange.tsx`
- `frontend/src/components/filters/FilterNumberRange.tsx`
- `frontend/src/components/filters/FilterToggle.tsx`

## Files to Modify

### `filterBar.types.ts`
- Remove `DateRangeValue` and `NumberRangeValue` types
- Remove `'date-range'`, `'number-range'`, `'toggle'` from `FilterFieldType` union
- Remove `DateRangeFilterFieldConfig`, `NumberRangeFilterFieldConfig`, `ToggleFilterFieldConfig` interfaces
- Remove them from the `FilterFieldConfig` union

### `index.ts`
- Remove `DateRangeValue` and `NumberRangeValue` from re-exports

### `filterBar.url.ts`
- Remove `DateRangeValue` and `NumberRangeValue` imports
- Remove `date-range` branches (`_from`/`_to` params) from `getManagedParamKeys`, `serializeFilters`, `parseFilters`
- Remove `number-range` branches (`_min`/`_max` params) from all three functions
- Remove `toggle` branches from `serializeFilters` and `parseFilters`

### `useFilterBar.ts`
- Remove `toggle`, `date-range`, and `number-range` (`else`) branches from `getDefaults`

### `FilterBar.tsx`
- Remove imports for `FilterDateRange`, `FilterToggle`, `DateRangeValue`
- Remove `date-range` and `number-range` render branches from `renderQuickField`
- Replace default `FilterToggle` return with `null`

### `filterBar.url.test.ts`
- Remove `DateRangeValue` and `NumberRangeValue` imports
- Remove `toggle`, `dateRange`, `amountRange` fields from `TestFilters` interface and config
- Remove all test cases for toggle, date-range, and number-range serialization/parsing

## Verification

- TypeScript type-check passes (`npm run type-check`)
- Affected tests pass (`npx vitest run src/components/filters/__tests__/filterBar.url.test.ts`)
- No regressions in remaining filter types (select, multi-select, search)
