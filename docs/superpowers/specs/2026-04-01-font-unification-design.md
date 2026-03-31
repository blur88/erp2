# Font Unification Design

**Issue:** #238
**Date:** 2026-04-01

## Problem

Font declarations are scattered across the codebase:
- `global.css` duplicates the font stack already defined in `theme.ts`
- 13 components hardcode `fontFamily: 'monospace'`
- 18 components hardcode `fontFamily: 'inherit'` to work around browser button font defaults
- 17 print report files use `font-family: Arial, sans-serif` instead of Roboto

## Design

### 1. Remove redundant `font-family` from `global.css`

Remove the `font-family` declaration from the `body` rule in `frontend/src/styles/global.css` (line 15).

`CssBaseline` (already mounted in `main.tsx`) applies the MUI theme font to `body`, making this line dead weight.

### 2. Simplify theme font stack + fix button font root cause

In `frontend/src/styles/theme.ts`:

**Simplify `typography.fontFamily`** from the verbose system fallback chain to:
```ts
fontFamily: '"Roboto", sans-serif'
```
Roboto is loaded via CDN in `index.html`; a generic `sans-serif` fallback is sufficient for this internal ERP tool.

**Add `MuiButtonBase` component override** in `baseThemeOptions.components`:
```ts
MuiButtonBase: {
  styleOverrides: {
    root: {
      fontFamily: 'inherit',
    },
  },
},
```
This resets the browser's default button font globally for all MUI button-based components, eliminating the need for per-component `fontFamily: 'inherit'` overrides.

### 3. Remove `fontFamily: 'monospace'` from 13 components

Simply remove the `fontFamily` prop — no replacement. Roboto from the theme handles all these cases (file names, formatted numbers, countdowns, calculator display). The 13 files are:

- `src/pages/settings/RegionalSettingsPage.tsx`
- `src/pages/settings/DocumentNumbersPage.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/components/backup/BackupDetailsDialog.tsx` (4 occurrences)
- `src/components/backup/RestoreConfirmationDialog.tsx`
- `src/components/backup/BackupList.tsx`
- `src/components/common/TopBar.tsx`
- `src/components/auth/IdleWarningDialog.tsx`
- `src/components/calculator/components/CalculatorDisplay.tsx`
- `src/components/calculator/components/CalculatorHistory.tsx`

### 4. Remove `fontFamily: 'inherit'` from 18 components

Remove all per-component `fontFamily: 'inherit'` props — the `MuiButtonBase` theme override (step 2) makes these redundant. The 18 occurrences span:

- `src/pages/purchasing/GoodsReceivedPage.tsx` (3×)
- `src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx` (3×)
- `src/pages/purchasing/VendorPaymentsPage.tsx` (3×)
- `src/pages/sales/PaymentsPage.tsx` (3×)
- `src/pages/sales/components/InvoiceDetailsPanel.tsx` (3×)
- `src/pages/sales/components/OrderDetailsPanel.tsx` (3×)

### 5. Update 19 print report files to use Roboto

Each print report opens a `window.open()` HTML document. Add the Google Fonts Roboto CDN `<link>` to each print window `<head>`, and change `font-family: Arial, sans-serif` to `'Roboto', sans-serif`.

The 17 files are:
- `src/pages/purchasing/VendorProductListReport.tsx`
- `src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `src/pages/purchasing/PurchaseOrderSummary.tsx`
- `src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `src/pages/inventory/MovementSummaryReport.tsx`
- `src/pages/inventory/HistoricalInventoryReport.tsx`
- `src/pages/inventory/PriceListReport.tsx`
- `src/pages/inventory/ProductCostReport.tsx`
- `src/pages/inventory/InventorySummaryReport.tsx`
- `src/pages/sales/CustomerPaymentDetails.tsx`
- `src/pages/sales/SalesOrderSummary.tsx`
- `src/pages/sales/CustomerPaymentByOrder.tsx`
- `src/pages/sales/SalesByProductDetails.tsx`
- `src/pages/sales/SalesByProductSummary.tsx`
- `src/pages/sales/ProductCustomerReport.tsx`
- `src/pages/sales/CustomerOrderHistory.tsx`
- `src/pages/sales/CustomerPaymentSummary.tsx`
- `src/pages/sales/SalesOrderProfitReport.tsx`

## Out of Scope

- `index.html` — Roboto CDN link stays as-is (already correct)
- Print report `font-family` for elements other than `body` — not changed
- Any new typography variants or constants
- `monospace` is removed without replacement (no `monoFontFamily` constant)

## Testing

- Visual review of components that had `monospace` removed (backup dialogs, calculator, idle timer)
- Visual review of `<Typography component="button">` elements (detail panels, payments pages) to confirm font matches surrounding text after `inherit` props removed
- Print a report and confirm Roboto renders correctly
