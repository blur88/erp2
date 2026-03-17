# Dark Mode Standardization — Design Spec

**Issue:** #117
**Date:** 2026-03-17
**Status:** Approved

## Summary

Remove light mode entirely from the frontend. Standardize on the existing dark theme. Eliminate all toggle logic, Redux theme state, and conditional `palette.mode` styling.

## Goals

- Remove unused light mode styles from the bundle.
- Eliminate the theme toggle UI and associated Redux machinery.
- Clean up all `theme.palette.mode` ternaries, keeping only dark values.
- Leave the existing dark theme palette values unchanged.

## Out of Scope

- Changing any dark theme colors (background, palette, etc.).
- Custom primary color support (not yet in use; can be added later if needed).

---

## Changes by File

### `frontend/src/styles/theme.ts`

- Delete `lightTheme` and the `createAppTheme` function.
- Keep `darkTheme` unchanged (all existing palette values stay as-is).
- Remove the `theme` const alias; consumers import `darkTheme` directly.
- The `colors` object and `baseThemeOptions` remain — they are used by `darkTheme`.

### `frontend/src/store/slices/themeSlice.ts`

- Delete the file entirely.
- Removes: `ThemeState`, `toggleTheme` reducer, `selectTheme`, `selectThemeMode`, `primaryColor`, `secondaryColor`.

### `frontend/src/store/index.ts`

- Remove `import themeSlice` and the `theme: themeSlice` entry from the Redux store.

### `frontend/src/components/common/ThemeWrapper.tsx`

- Remove Redux selector (`useAppSelector`, `selectThemeMode`).
- Remove `useMemo` and conditional theme selection.
- Replace with a static `<ThemeProvider theme={darkTheme}>`.

### `frontend/src/RootLayout.tsx`

- Remove `useAppSelector(selectTheme)`.
- Hardcode `document.documentElement.setAttribute('data-theme', 'dark')` in the existing effect (or move to a one-time call with empty deps array).

### `frontend/src/components/common/MainLayout.tsx`

- Remove `DarkModeIcon` and `LightModeIcon` imports.
- Remove `themeMode` selector, `handleThemeToggle` handler, and the `IconButton` that renders the toggle.
- Remove `dispatch(toggleTheme())` call.

### Conditional Styling Audit (~33 files)

Files containing `theme.palette.mode` ternaries:

**Purchasing:**
- `VendorProductListReport.tsx`
- `VendorPaymentDetailsReport.tsx`
- `PurchaseOrderStatusReport.tsx`
- `PurchaseOrderSummary.tsx`
- `PurchaseOrderDetailsReport.tsx`

**Inventory:**
- `MovementSummaryReport.tsx`
- `HistoricalInventoryReport.tsx`
- `PriceListReport.tsx`
- `ProductCostReport.tsx`
- `InventorySummaryReport.tsx`

**Sales:**
- `CustomerPaymentDetails.tsx`
- `SalesOrderSummary.tsx`
- `CustomerPaymentByOrder.tsx`
- `SalesByProductDetails.tsx`
- `SalesByProductSummary.tsx`
- `ProductCustomerReport.tsx`
- `CustomerOrderHistory.tsx`
- `CustomerPaymentSummary.tsx`
- `SalesOrderProfitReport.tsx`

**Accounting:**
- `BalanceSheetPage.tsx`
- `GeneralLedgerPage.tsx`
- `AccountActivityPage.tsx`
- `ProfitAndLossPage.tsx`
- `AccountingDashboardPage.tsx`
- `AccountMappingsPage.tsx`

**Other:**
- `DiffViewer.tsx` (audit logs)
- `CategoriesPage.tsx`
- `StockAdjustmentsPage.tsx`

**Pattern to apply:** For every ternary of the form:
```ts
theme.palette.mode === 'dark' ? darkValue : lightValue
```
Replace with just `darkValue`. For ternaries in the opposite direction (`=== 'light'`), keep the else branch.

If the entire style property only exists to differ between modes and the dark value is already the MUI default for dark mode, the property can be deleted outright.

### Tests

- `AccountActivityPage.test.tsx`: `renderWithProviders` accepts a `mode` param and creates a theme with `{ palette: { mode } }`. Remove the `mode` param, hardcode `{ palette: { mode: 'dark' } }`, and remove any light-mode test cases.
- `TrialBalancePage.test.tsx`: Already creates `darkTheme` inline — verify it still passes after the slice removal.
- Run full frontend test suite after changes.

---

## Verification Checklist

- [ ] `npm run type-check` passes with no errors.
- [ ] `npm run test` — all frontend tests pass.
- [ ] `grep -r "palette\.mode\|lightTheme\|toggleTheme\|selectThemeMode\|selectTheme" frontend/src` returns zero results (excluding this spec).
- [ ] UI visual spot-check: toggle button is gone from the app bar, dark theme renders correctly throughout.
