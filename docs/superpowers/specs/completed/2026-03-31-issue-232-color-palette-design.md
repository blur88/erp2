# Color Palette Standardization Design
**Issue:** #232
**Date:** 2026-03-31

## Objective

Establish a single source of truth for the ERP system's color palette. Remove light-mode remnants. Replace 41 files' hardcoded hex values with theme palette references. Document color usage conventions.

## Key Decisions

- **Dark-only:** Light mode support is removed entirely. No theme toggle, no `data-theme` conditionals.
- **No CSS variables:** No non-React consumers exist (no SVGs, no workers, no server-side rendering). MUI's `useTheme()` is sufficient.
- **Single token source:** `frontend/src/styles/theme.ts` — the existing `colors` object — remains the source of truth. No new token files except `printTokens.ts`.
- **Print colors are intentional:** Report pages use black-on-white for PDF/print output. These are not mistakes and must not be replaced with dark theme colors.
- **Test files unchanged:** `ProfitAndLossPage.test.tsx` asserts a print color (`#000`) — correct. `highlightText.test.tsx` passes colors as function arguments — correct. Both left as-is.

## Architecture

### Token Source: `theme.ts`
The `colors` object in `theme.ts` already contains the full palette (primary, secondary, success, warning, error, grey with all 10 shades each). `darkTheme` references these values. No changes to the palette values themselves.

Minor cleanup: remove the `grey.50` dark-mode override comment (no longer needed without light mode).

### Print Tokens: `styles/printTokens.ts` (new)
A plain object exporting black-on-white values used by print/report pages. Makes print intent explicit:

```ts
export const printColors = {
  background: '#ffffff',
  text: '#000000',
  border: '#000000',
  tableBorder: '#ddd',
  tableHeaderBg: '#1976d2',
  tableRowAlt: '#f9f9f9',
  successRow: 'rgba(76, 175, 80, 0.2)',
  infoRow: 'rgba(33, 150, 243, 0.1)',
  groupRow: '#d3d3d3',
}
```

### Component Color Access
All non-print components use `useTheme()` + `theme.palette.*`:
```tsx
const theme = useTheme()
<Box sx={{ color: theme.palette.primary.main }}>
```

## Implementation Steps

### 1. `global.css`
- Remove all `[data-theme='dark']` conditional blocks
- Promote dark values to unconditional defaults:
  - `body`: `color: #ffffff`, `background-color: #121212`
  - Scrollbars: use dark values as defaults
  - Skeleton animation: use dark values as defaults
- Fix status class colors to match `theme.ts` exactly:
  - `.status-active`: `#66bb6a` (was `#4caf50` — wrong, should be success[400])
  - `.status-error`: `#ef5350` (was `#f44336` — wrong, should be error[400])
  - `.status-pending`: `#ffca28` (was `#ff9800` — wrong, should be warning[400])
  - `.status-inactive`: `#9e9e9e` — already correct (grey[500])

### 2. `RootLayout.tsx`
- Remove `document.documentElement.setAttribute('data-theme', 'dark')` call

### 3. `theme.ts`
- Remove grey.50 dark-mode override comment (minor cleanup only)

### 4. `styles/printTokens.ts`
- Create new file with print color constants (see above)

### 5. Shared components (8 files)
Replace hardcoded hex values with `useTheme()` + `theme.palette.*`:
- `components/common/LoadingSpinner.tsx`
- `components/common/MainLayout.tsx`
- `components/common/SearchModal.tsx`
- `components/common/SidebarFooter.tsx`
- `components/common/Sidebar.tsx`
- `components/common/SidebarUserMenu.tsx`
- `components/common/SystemStatus.tsx`
- `components/common/TopBar.tsx`

### 6. Print template (1 file)
- `components/print/BasePrintTemplate.tsx` — import from `printTokens.ts`

### 7. Interactive pages (6 files)
Replace hardcoded hex values with `useTheme()` + `theme.palette.*`:
- `pages/auth/LoginPage.tsx`
- `pages/auth/MandatoryPasswordChangePage.tsx`
- `pages/inventory/CreateProductPage.tsx`
- `pages/inventory/CreateStockAdjustmentPage.tsx`
- `pages/purchasing/CreatePurchaseOrderPage.tsx`
- `pages/sales/CreateSalesOrderPage.tsx`

### 8. Report pages (20 files)
- Print-specific colors (`#000000`, `#ffffff`, print table colors) → import from `printTokens.ts`
- Any semantic colors in report UI (status badges, etc.) → `useTheme()` + `theme.palette.*`

Files:
- `pages/inventory/` — HistoricalInventoryReport, InventorySummaryReport, MovementSummaryReport, PriceListReport, ProductCostReport
- `pages/purchasing/` — PurchaseOrderDetailsReport, PurchaseOrderStatusReport, PurchaseOrderSummary, VendorPaymentDetailsReport, VendorProductListReport
- `pages/sales/` — CustomerOrderHistory, CustomerPaymentByOrder, CustomerPaymentDetails, CustomerPaymentSummary, ProductCustomerReport, SalesByProductDetails, SalesByProductSummary, SalesOrderProfitReport, SalesOrderSummary
- `pages/dashboard/components/BusinessPerformanceChart.tsx`
- `pages/audit-logs/components/AnalyticsTab.tsx`
- `pages/settings/PrintSettings/TemplatePreview.tsx`

### 9. Test files (2 files) — no changes
- `pages/accounting/reports/__tests__/ProfitAndLossPage.test.tsx` — asserts print color `#000`, correct
- `utils/highlightText.test.tsx` — passes colors as function arguments, correct

### 10. `docs/COLOR_PALETTE.md`
Create guideline covering:
- Palette reference table (semantic colors with main/light/dark values)
- Surface & elevation (when to use `background.default` vs `background.paper`)
- Text hierarchy (primary, secondary, disabled)
- Status indicator classes and when to use CSS class vs `theme.palette.*`
- Print colors — pointer to `printTokens.ts` and why they diverge
- Usage pattern (`useTheme()`, `sx` prop)
- What NOT to do (no hardcoded hex in non-print code)
- WCAG contrast notes

## Out of Scope
- CSS custom properties / CSS variables (no use case)
- Light mode (intentionally removed)
- Adding new color values to the palette
- Changing any existing color values
