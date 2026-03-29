# Stock Level Settings — Design Doc

**Date:** 2026-03-30
**Issue:** #220 (scoped down)
**Branch:** feat/stock-level-settings

---

## Scope

Add a configurable global `lowStockThreshold` (integer, default 10) that replaces the hardcoded `10` used throughout the codebase to classify products as "Low Stock". Out-of-stock boundary (`qty <= 0`) remains fixed and non-configurable.

Stock status logic everywhere:
- **Out of Stock**: `qty <= 0`
- **Low Stock**: `qty > 0 AND qty <= lowStockThreshold`
- **In Stock**: `qty > lowStockThreshold`

Automated reordering, per-product overrides, and email notifications are out of scope.

---

## Backend

### 1. Entity — `RegionalSettings`
Add one column:
```ts
@Column({ type: 'int', default: 10 })
lowStockThreshold: number;
```

### 2. DTOs
- `UpdateRegionalSettingsDto`: add `@IsOptional() @IsInt() @Min(0) lowStockThreshold?: number`
- `RegionalSettingsResponseDto`: add `lowStockThreshold: number`

### 3. SettingsService
- Include `lowStockThreshold` in the regional settings read/write mapping (same pattern as existing fields).

### 4. Migration
Generate: `npm run migration:generate --name=AddLowStockThresholdToRegionalSettings`

### 5. Hardcoded replacements
Replace all hardcoded `10` thresholds by injecting `RegionalSettings` (or passing the value as a parameter) in:
- `inventory-analytics.service.ts` lines ~736, ~845, ~938 (3 occurrences)
- `integration.service.ts` line ~370 (1 occurrence)

---

## Frontend

### 1. New page — `StockLevelSettingsPage.tsx`
- Path: `frontend/src/pages/settings/StockLevelSettingsPage.tsx`
- Single number input: **Low Stock Threshold** (integer, min 0)
- Pattern: identical to `InventoryCostingPage` — `react-hook-form` + `yup`, reads via `useGetRegionalSettingsQuery`, writes via `useUpdateRegionalSettingsMutation`
- Helper text: "Products with quantity above 0 and at or below this value are considered Low Stock."

### 2. Router — `router.tsx`
Add route:
```ts
{ path: '/settings/stock-levels', element: <StockLevelSettingsPage />, handle: { title: 'Stock Levels' } }
```

### 3. Navigation — `navigation.tsx`
Add entry under the "Business" group in Settings:
```ts
{
  id: 'stock-level-settings',
  title: 'Stock Levels',
  icon: <WarningAmberIcon />,
  group: 'Business',
  path: '/settings/stock-levels',
}
```

### 4. Hardcoded replacements — frontend
Replace hardcoded `10` with the value from `useGetRegionalSettingsQuery` in:
- `exportUtils.ts` — 3 occurrences (pass `threshold` as a parameter from callers; caller is `useProductsActions.ts`)
- `components/inventory/ProductDetailsTab.tsx` line ~27 — local `getStockStatus` function (read threshold from RTK Query hook)

---

## What is NOT changing

- Per-product reorder levels (`product.reorderLevel`) — used by `stock-movement.service.ts` for low stock alerts and are unrelated to this threshold
- Out-of-stock boundary — always `qty <= 0`
- Email notifications, automated reordering — deferred

---

## Testing

- Backend: update `settings.controller.spec.ts` to cover `lowStockThreshold` read/write
- Frontend: add/update test in `frontend/src/pages/settings/__tests__/` for `StockLevelSettingsPage`
