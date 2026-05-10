# Typography Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all typography styling into a single source of truth in `theme.ts`, delete `constants/typography.ts`, move `TABLE_STYLES` to its own file, create a shared print stylesheet, and remove hardcoded `sx` font props from Typography components.

**Architecture:** Extend `theme.ts` with two custom MUI variants (`tableHeader`, `tableCaption`). Create `frontend/src/styles/printStyles.ts` exporting a shared CSS string used by all 11 report print templates. Move `TABLE_STYLES` to `frontend/src/constants/tableStyles.ts`. Migrate all 62 files using `TYPOGRAPHY_STYLES` to use theme variants or inline props. Clean up `global.css` and hardcoded `sx` fontSize props on `<Typography>` components.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vite, Vitest

---

## File Map

### New files
- `frontend/src/styles/printStyles.ts` — shared CSS string for print templates
- `frontend/src/constants/tableStyles.ts` — `TABLE_STYLES` relocated here

### Modified files
- `frontend/src/styles/theme.ts` — add `tableHeader`/`tableCaption` custom variants + TS declarations
- `frontend/src/styles/global.css` — remove redundant body/button overrides
- `frontend/src/constants/typography.ts` — **deleted** at end of Task 5

### Component files (TYPOGRAPHY_STYLES migration — 62 files)
See Tasks 3–5 for exact file lists by module.

### Report files (print template migration — 11 files)
See Task 2 for exact file list.

### Typography sx cleanup — 36 files
See Task 6 for exact file list.

---

## Task 1: Extend theme.ts with custom variants

**Files:**
- Modify: `frontend/src/styles/theme.ts`

- [ ] **Step 1: Add TypeScript module augmentation**

Open `frontend/src/styles/theme.ts`. The file starts with two imports and a `declare module` block for `TypeBackground`. Add the following declarations immediately after the existing `declare module '@mui/material/styles'` block (after line 8):

```ts
declare module '@mui/material/styles' {
  interface TypographyVariants {
    tableHeader: React.CSSProperties
    tableCaption: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    tableHeader?: React.CSSProperties
    tableCaption?: React.CSSProperties
  }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    tableHeader: true
    tableCaption: true
  }
}
```

- [ ] **Step 2: Add new variants to baseThemeOptions.typography**

In `baseThemeOptions.typography` (after the `overline` block, before the closing `},`), add:

```ts
    tableHeader: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      lineHeight: 1.5,
    },
    tableCaption: {
      fontSize: '0.7rem',
      fontWeight: 400,
      lineHeight: 1.2,
    },
```

- [ ] **Step 3: Verify TypeScript accepts the new variants**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: zero errors related to `tableHeader` or `tableCaption`. (There may be pre-existing errors from other files — ignore those for now, they'll be fixed in later tasks.)

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/styles/theme.ts
git commit -m "feat: add tableHeader and tableCaption custom MUI typography variants"
```

---

## Task 2: Create shared print stylesheet and migrate all 11 report files

**Files:**
- Create: `frontend/src/styles/printStyles.ts`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`

- [ ] **Step 1: Create printStyles.ts**

Create `frontend/src/styles/printStyles.ts` with this exact content:

```ts
import { printColors } from '@/styles/printTokens'

export const PRINT_STYLES = `
  body { font-family: 'Roboto', sans-serif; margin: 20px; }
  h1 { text-align: center; margin-bottom: 10px; }
  .header-info { text-align: center; margin-bottom: 20px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid ${printColors.tableBorder}; padding: 6px; text-align: left; }
  th { background-color: ${printColors.tableHeaderBg}; color: ${printColors.background}; font-weight: bold; }
  tr:nth-child(even) { background-color: ${printColors.tableRowAlt}; }
  .text-right { text-align: right; }
  @media print {
    body { margin: 0; padding: 20px 20px 40px 20px; }
    @page { margin: 0; }
  }
`
```

- [ ] **Step 2: Migrate the 9 standard-style-block reports**

For each of these 9 files, make two changes:

1. Add import at top: `import { PRINT_STYLES } from '@/styles/printStyles'`
2. Replace the inline `<style>` block content with `${PRINT_STYLES}`

The files and their current style block pattern (replace the content between `<style>` and `</style>` tags):

**Before (in each file):**
```
          <style>
            body { font-family: 'Roboto', sans-serif; margin: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            .header-info { text-align: center; margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid ${printColors.tableBorder}; padding: 6px; text-align: left; }
            th { background-color: ${printColors.tableHeaderBg}; color: ${printColors.background}; font-weight: bold; }
            tr:nth-child(even) { background-color: ${printColors.tableRowAlt}; }
            .text-right { text-align: right; }
            @media print {
              body { margin: 0; padding: 20px 20px 40px 20px; }
              @page { margin: 0; }
            }
          </style>
```

**After:**
```
          <style>${PRINT_STYLES}</style>
```

Files to update:
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`

- [ ] **Step 3: Migrate the 2 extended-style-block reports**

`ProductCustomerReport.tsx` and `SalesOrderProfitReport.tsx` have an extra footer + page numbering section after the standard block. Add the import and replace only the standard portion, keeping the extra rules.

Add import: `import { PRINT_STYLES } from '@/styles/printStyles'`

Replace the standard style block portion **in both files**:

**Before:**
```
          <style>
            body { font-family: 'Roboto', sans-serif; margin: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            .header-info { text-align: center; margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid ${printColors.tableBorder}; padding: 6px; text-align: left; }
            th { background-color: ${printColors.tableHeaderBg}; color: ${printColors.background}; font-weight: bold; }
            tr:nth-child(even) { background-color: ${printColors.tableRowAlt}; }
            .text-right { text-align: right; }
            @media print {
              body { margin: 0; padding: 20px 20px 40px 20px; }
              @page {
```

**After:**
```
          <style>${PRINT_STYLES}
            @media print {
              @page {
```

(The closing `}` of `@media print` and the rest of the footer CSS stays unchanged.)

- [ ] **Step 4: Verify type-check passes**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "printStyles\|printTokens" | head -10
```

Expected: no errors referencing printStyles or printTokens.

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/styles/printStyles.ts \
  frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
  frontend/src/pages/inventory/InventorySummaryReport.tsx \
  frontend/src/pages/inventory/MovementSummaryReport.tsx \
  frontend/src/pages/inventory/PriceListReport.tsx \
  frontend/src/pages/inventory/ProductCostReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx \
  frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx \
  frontend/src/pages/purchasing/VendorProductListReport.tsx \
  frontend/src/pages/sales/ProductCustomerReport.tsx \
  frontend/src/pages/sales/SalesOrderProfitReport.tsx
git commit -m "feat: extract shared print stylesheet, migrate all 11 report files"
```

---

## Task 3: Create tableStyles.ts and migrate TABLE_STYLES imports

**Files:**
- Create: `frontend/src/constants/tableStyles.ts`
- Modify: 52 files (listed in step 2)

- [ ] **Step 1: Create tableStyles.ts**

Create `frontend/src/constants/tableStyles.ts` with this exact content (copied from the `TABLE_STYLES` export in `constants/typography.ts`):

```ts
// Table layout and spacing constants.
// Typography constants are in the MUI theme (frontend/src/styles/theme.ts).
export const TABLE_STYLES = {
  size: 'small' as const,
  cell: {
    padding: {
      py: 0.75,
      px: 1.5
    },
    border: '1px solid rgba(224, 224, 224, 0.4)'
  },
  row: {
    height: 36
  },
  header: {
    backgroundColor: 'grey.50',
    padding: { py: 1 }
  }
} as const
```

- [ ] **Step 2: Update TABLE_STYLES import path in all 52 files**

In each file below, change:
```ts
import { TABLE_STYLES } from '@/constants/typography'
```
to:
```ts
import { TABLE_STYLES } from '@/constants/tableStyles'
```

If a file imports both `TABLE_STYLES` and `TYPOGRAPHY_STYLES` from `@/constants/typography`, only update the `TABLE_STYLES` portion — leave `TYPOGRAPHY_STYLES` for Tasks 4–5.

Files to update:
- `frontend/src/components/inventory/MovementHistoryTab.tsx`
- `frontend/src/components/inventory/OrderHistoryTab.tsx`
- `frontend/src/components/inventory/ProductDetailsTab.tsx`
- `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- `frontend/src/pages/accounting/BankReconciliationsPage.tsx`
- `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- `frontend/src/pages/accounting/FiscalPeriodsPage.tsx`
- `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- `frontend/src/pages/dashboard/components/RecentPurchasesTable.tsx`
- `frontend/src/pages/dashboard/components/RecentSalesTable.tsx`
- `frontend/src/pages/inventory/CategoriesPage.tsx`
- `frontend/src/pages/inventory/components/ProductDetailsPanel.tsx`
- `frontend/src/pages/inventory/components/ProductsTable.tsx`
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/InventoryPage.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx`
- `frontend/src/pages/purchasing/components/PurchaseOrdersTable.tsx`
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- `frontend/src/pages/purchasing/PurchasingPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- `frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx`
- `frontend/src/pages/sales/components/InvoicesTable.tsx`
- `frontend/src/pages/sales/components/OrderDetailsPanel.tsx`
- `frontend/src/pages/sales/components/OrdersDialogs.tsx`
- `frontend/src/pages/sales/components/OrdersTable.tsx`
- `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- `frontend/src/pages/sales/CustomerProfilePage.tsx`
- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/sales/ProductCustomerReport.tsx`
- `frontend/src/pages/sales/SalesByProductDetails.tsx`
- `frontend/src/pages/sales/SalesByProductSummary.tsx`
- `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- `frontend/src/pages/sales/SalesOrderSummary.tsx`
- `frontend/src/pages/sales/SalesPage.tsx`
- `frontend/src/pages/settings/PriceListDetailsPage.tsx`
- `frontend/src/pages/settings/PriceListsPage.tsx`
- `frontend/src/pages/settings/UserManagementPage.tsx`

- [ ] **Step 3: Verify no remaining TABLE_STYLES imports from typography**

```bash
cd frontend && grep -r "TABLE_STYLES.*typography\|typography.*TABLE_STYLES" src/ --include="*.tsx" --include="*.ts"
```

Expected: no output.

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "tableStyles\|TABLE_STYLES" | head -10
```

Expected: no errors referencing TABLE_STYLES.

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/constants/tableStyles.ts
git add frontend/src/components/inventory/MovementHistoryTab.tsx \
  frontend/src/components/inventory/OrderHistoryTab.tsx \
  frontend/src/components/inventory/ProductDetailsTab.tsx \
  frontend/src/pages/accounting/AccountMappingsPage.tsx \
  frontend/src/pages/accounting/BankReconciliationsPage.tsx \
  frontend/src/pages/accounting/ChartOfAccountsPage.tsx \
  frontend/src/pages/accounting/FiscalPeriodsPage.tsx \
  frontend/src/pages/accounting/JournalEntriesPage.tsx \
  frontend/src/pages/dashboard/components/RecentPurchasesTable.tsx \
  frontend/src/pages/dashboard/components/RecentSalesTable.tsx \
  frontend/src/pages/inventory/CategoriesPage.tsx \
  frontend/src/pages/inventory/components/ProductDetailsPanel.tsx \
  frontend/src/pages/inventory/components/ProductsTable.tsx \
  frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
  frontend/src/pages/inventory/InventoryPage.tsx \
  frontend/src/pages/inventory/InventorySummaryReport.tsx \
  frontend/src/pages/inventory/MovementSummaryReport.tsx \
  frontend/src/pages/inventory/PriceListReport.tsx \
  frontend/src/pages/inventory/ProductCostReport.tsx \
  frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
  frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx \
  frontend/src/pages/purchasing/components/PurchaseOrdersTable.tsx \
  frontend/src/pages/purchasing/GoodsReceivedPage.tsx \
  frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderSummary.tsx \
  frontend/src/pages/purchasing/PurchasingPage.tsx \
  frontend/src/pages/purchasing/SuppliersPage.tsx \
  frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx \
  frontend/src/pages/purchasing/VendorPaymentsPage.tsx \
  frontend/src/pages/purchasing/VendorProductListReport.tsx \
  frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx \
  frontend/src/pages/sales/components/InvoicesTable.tsx \
  frontend/src/pages/sales/components/OrderDetailsPanel.tsx \
  frontend/src/pages/sales/components/OrdersDialogs.tsx \
  frontend/src/pages/sales/components/OrdersTable.tsx \
  frontend/src/pages/sales/CustomerOrderHistory.tsx \
  frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
  frontend/src/pages/sales/CustomerPaymentDetails.tsx \
  frontend/src/pages/sales/CustomerPaymentSummary.tsx \
  frontend/src/pages/sales/CustomerProfilePage.tsx \
  frontend/src/pages/sales/CustomersPage.tsx \
  frontend/src/pages/sales/PaymentsPage.tsx \
  frontend/src/pages/sales/ProductCustomerReport.tsx \
  frontend/src/pages/sales/SalesByProductDetails.tsx \
  frontend/src/pages/sales/SalesByProductSummary.tsx \
  frontend/src/pages/sales/SalesOrderProfitReport.tsx \
  frontend/src/pages/sales/SalesOrderSummary.tsx \
  frontend/src/pages/sales/SalesPage.tsx \
  frontend/src/pages/settings/PriceListDetailsPage.tsx \
  frontend/src/pages/settings/PriceListsPage.tsx \
  frontend/src/pages/settings/UserManagementPage.tsx
git commit -m "refactor: move TABLE_STYLES to constants/tableStyles.ts, update 52 import paths"
```

---

## Task 4: Migrate TYPOGRAPHY_STYLES usages — Dashboard, Inventory, Accounting modules

**Files:**
- Modify: `frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx`
- Modify: `frontend/src/pages/dashboard/components/QuickActions.tsx`
- Modify: `frontend/src/pages/dashboard/components/TopPerformers.tsx`
- Modify: `frontend/src/pages/dashboard/components/InventoryOverview.tsx`
- Modify: `frontend/src/pages/dashboard/components/RecentPurchasesTable.tsx`
- Modify: `frontend/src/pages/dashboard/components/RecentSalesTable.tsx`
- Modify: `frontend/src/pages/dashboard/components/DashboardStats.tsx`
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductsTable.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductDetailsPanel.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductsDialogs.tsx`
- Modify: `frontend/src/components/inventory/OrderHistoryTab.tsx`
- Modify: `frontend/src/components/inventory/MovementHistoryTab.tsx`
- Modify: `frontend/src/components/inventory/ProductDetailsTab.tsx`
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx`

- [ ] **Step 1: Apply the replacement mapping**

For every file listed above, apply the following substitutions. Read each file first to confirm the exact usage, then replace:

**Mapping:**

| Remove from import | Add/change usage |
|---|---|
| `TYPOGRAPHY_STYLES.pageHeader` spread into Typography props | Replace spread with `variant="h4" fontWeight={700}` |
| `TYPOGRAPHY_STYLES.pageSubtitle` spread | Replace spread with `variant="body1" color="text.secondary"` |
| `TYPOGRAPHY_STYLES.tableHeader` spread | Replace spread with `variant="tableHeader"` |
| `TYPOGRAPHY_STYLES.tableCell.primary` spread | Replace spread with `variant="body2" fontWeight={600}` |
| `TYPOGRAPHY_STYLES.tableCell.secondary` spread | Replace spread with `variant="body2"` |
| `TYPOGRAPHY_STYLES.tableCell.caption` spread | Replace spread with `variant="tableCaption"` |
| `TYPOGRAPHY_STYLES.chip.small` spread on `<Chip>` | Replace spread with `sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}` |
| `TYPOGRAPHY_STYLES.chip.extraSmall` spread on `<Chip>` | Replace spread with `sx={{ fontSize: '0.65rem', height: 18 }}` |
| `TYPOGRAPHY_STYLES.searchField` usage | Keep as-is (it's on TextField/InputAdornment, no Typography equivalent) |
| `TYPOGRAPHY_STYLES.mobile.caption` | Replace with `sx={{ fontSize: '0.65rem' }}` |

After replacing all usages in a file, remove the `TYPOGRAPHY_STYLES` from the import line. If the import was `import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'` and TABLE_STYLES was already moved in Task 3, the entire import line should now be removed.

> **Note on spreads:** `TYPOGRAPHY_STYLES.tableHeader` is used as `{...TYPOGRAPHY_STYLES.tableHeader}` spread into `<Typography>` props. The object contains `{ variant: 'body2', fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.2 }` — the replacement drops the fontSize (accepts body2's 0.875rem) and expresses fontWeight inline.

- [ ] **Step 2: Verify no remaining TYPOGRAPHY_STYLES references in these files**

```bash
cd frontend && grep -l "TYPOGRAPHY_STYLES" \
  src/pages/dashboard/components/BusinessPerformanceChart.tsx \
  src/pages/dashboard/components/QuickActions.tsx \
  src/pages/dashboard/components/TopPerformers.tsx \
  src/pages/dashboard/components/InventoryOverview.tsx \
  src/pages/dashboard/components/RecentPurchasesTable.tsx \
  src/pages/dashboard/components/RecentSalesTable.tsx \
  src/pages/dashboard/components/DashboardStats.tsx \
  src/pages/inventory/InventoryPage.tsx \
  src/pages/inventory/CategoriesPage.tsx \
  src/pages/inventory/StockAdjustmentsPage.tsx \
  src/pages/inventory/components/ProductsTable.tsx \
  src/pages/inventory/components/ProductDetailsPanel.tsx \
  src/pages/inventory/components/ProductsDialogs.tsx \
  src/components/inventory/OrderHistoryTab.tsx \
  src/components/inventory/MovementHistoryTab.tsx \
  src/components/inventory/ProductDetailsTab.tsx \
  src/pages/accounting/ChartOfAccountsPage.tsx \
  src/pages/accounting/FiscalPeriodsPage.tsx 2>/dev/null
```

Expected: no output (no files still reference TYPOGRAPHY_STYLES).

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no new errors. Ignore pre-existing errors from files not yet migrated.

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2
git add \
  frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx \
  frontend/src/pages/dashboard/components/QuickActions.tsx \
  frontend/src/pages/dashboard/components/TopPerformers.tsx \
  frontend/src/pages/dashboard/components/InventoryOverview.tsx \
  frontend/src/pages/dashboard/components/RecentPurchasesTable.tsx \
  frontend/src/pages/dashboard/components/RecentSalesTable.tsx \
  frontend/src/pages/dashboard/components/DashboardStats.tsx \
  frontend/src/pages/inventory/InventoryPage.tsx \
  frontend/src/pages/inventory/CategoriesPage.tsx \
  frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
  frontend/src/pages/inventory/components/ProductsTable.tsx \
  frontend/src/pages/inventory/components/ProductDetailsPanel.tsx \
  frontend/src/pages/inventory/components/ProductsDialogs.tsx \
  frontend/src/components/inventory/OrderHistoryTab.tsx \
  frontend/src/components/inventory/MovementHistoryTab.tsx \
  frontend/src/components/inventory/ProductDetailsTab.tsx \
  frontend/src/pages/accounting/ChartOfAccountsPage.tsx \
  frontend/src/pages/accounting/FiscalPeriodsPage.tsx
git commit -m "refactor: migrate TYPOGRAPHY_STYLES to theme variants — dashboard, inventory, accounting"
```

---

## Task 5: Migrate TYPOGRAPHY_STYLES usages — Purchasing, Sales, Settings modules + delete constants/typography.ts

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrdersTable.tsx`
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx`
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- Modify: `frontend/src/pages/sales/SalesPage.tsx`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- Modify: `frontend/src/pages/sales/components/OrdersTable.tsx`
- Modify: `frontend/src/pages/sales/components/OrderDetailsPanel.tsx`
- Modify: `frontend/src/pages/sales/components/OrdersDialogs.tsx`
- Modify: `frontend/src/pages/sales/components/SalesCharts.tsx`
- Modify: `frontend/src/pages/sales/components/InvoicesTable.tsx`
- Modify: `frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx`
- Modify: `frontend/src/pages/sales/components/InvoicesToolbar.tsx`
- Modify: `frontend/src/pages/sales/components/OrdersToolbar.tsx`
- Modify: `frontend/src/pages/sales/components/SalesStatsCards.tsx`
- Modify: `frontend/src/pages/settings/PriceListDetailsPage.tsx`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductsToolbar.tsx`
- Delete: `frontend/src/constants/typography.ts`

- [ ] **Step 1: Apply the same replacement mapping as Task 4**

For every file listed above, apply the same substitutions from Task 4's mapping table. Read each file to confirm exact usage before replacing.

After replacing all usages, remove the `TYPOGRAPHY_STYLES` import from each file. If the import line also had `TABLE_STYLES` (already migrated in Task 3), the entire line should be gone. If it only had `TYPOGRAPHY_STYLES`, remove the line.

The 4 files that imported but didn't use `TYPOGRAPHY_STYLES` (`AccountingDashboardPage.tsx`, `DashboardPage.tsx`, `CreateSalesOrderPage.tsx`, `UserManagementPage.tsx`) — just remove the unused import line.

- [ ] **Step 2: Verify zero remaining TYPOGRAPHY_STYLES references**

```bash
cd frontend && grep -r "TYPOGRAPHY_STYLES" src/ --include="*.tsx" --include="*.ts"
```

Expected: no output.

- [ ] **Step 3: Verify zero remaining imports from constants/typography**

```bash
cd frontend && grep -r "constants/typography" src/ --include="*.tsx" --include="*.ts"
```

Expected: no output.

- [ ] **Step 4: Delete constants/typography.ts**

```bash
rm frontend/src/constants/typography.ts
```

- [ ] **Step 5: Run type-check — expect clean**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: no errors. The file is deleted and all imports removed, so TypeScript should be clean.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add -A frontend/src/
git commit -m "refactor: migrate TYPOGRAPHY_STYLES to theme variants — purchasing, sales, settings; delete constants/typography.ts"
```

---

## Task 6: Clean up hardcoded sx fontSize on Typography components

**Files (36 files):**
- `frontend/src/components/common/TopBar.tsx`
- `frontend/src/components/inventory/DeletedCategoriesDialog.tsx`
- `frontend/src/components/inventory/DeletedProductsDialog.tsx`
- `frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx`
- `frontend/src/components/purchasing/DeletedGRNsDialog.tsx`
- `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx`
- `frontend/src/components/purchasing/DeletedSuppliersDialog.tsx`
- `frontend/src/components/purchasing/DeletedVendorPaymentsDialog.tsx`
- `frontend/src/components/sales/DeletedCustomersDialog.tsx`
- `frontend/src/components/sales/DeletedInvoicesDialog.tsx`
- `frontend/src/components/sales/DeletedOrdersDialog.tsx`
- `frontend/src/components/sales/DeletedPaymentsDialog.tsx`
- `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- `frontend/src/pages/sales/ProductCustomerReport.tsx`
- `frontend/src/pages/sales/SalesByProductDetails.tsx`
- `frontend/src/pages/sales/SalesByProductSummary.tsx`
- `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- `frontend/src/pages/sales/SalesOrderSummary.tsx`
- `frontend/src/pages/settings/PriceListDetailsPage.tsx`

- [ ] **Step 1: Apply Typography-only sx fontSize replacements**

For each file, find `<Typography` elements that have `sx={{ fontSize: '0.875rem' }}` or `sx={{ fontSize: '0.75rem' }}` (alone or combined with other sx props).

Rules:
- `<Typography ... sx={{ fontSize: '0.875rem' }}>` → add `variant="body2"`, remove the fontSize from sx. If sx becomes empty `{}`, remove the sx prop entirely.
- `<Typography ... sx={{ fontSize: '0.75rem' }}>` → add `variant="caption"`, remove the fontSize from sx. If sx becomes empty, remove sx.
- If the Typography already has a `variant` prop, just remove the `fontSize` from sx (the variant already controls size).
- Do NOT touch `fontSize` on `<TableCell>`, `<Box>`, `<Chip>`, or any non-Typography element.
- Do NOT touch `fontWeight` — leave all fontWeight sx props as-is.

- [ ] **Step 2: Verify no Typography components with 0.875rem or 0.75rem fontSize**

```bash
cd frontend && grep -rn "Typography[^>]*sx.*fontSize.*0\.875rem\|Typography[^>]*sx.*fontSize.*0\.75rem" src/ --include="*.tsx" | head -20
```

Expected: no output (or only results where fontSize is on a non-Typography element on the same line — inspect manually if any appear).

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/
git commit -m "refactor: replace hardcoded sx fontSize with Typography variants (body2/caption)"
```

---

## Task 7: Clean up global.css

**Files:**
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Remove redundant body typography properties**

In `frontend/src/styles/global.css`, find the `body` rule (around line 12–18):

```css
body {
  margin: 0;
  padding: 0;
  line-height: 1.5;
  color: #ffffff;
  background-color: #121212;
}
```

Replace with:

```css
body {
  margin: 0;
  padding: 0;
}
```

(MUI CssBaseline + theme handles color, background, and line-height.)

- [ ] **Step 2: Remove the button reset block**

Find and delete the entire button reset block (around lines 46–60):

```css
/* Remove default button styles */
button {
  border: none;
  margin: 0;
  padding: 0;
  width: auto;
  overflow: visible;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: normal;
  -webkit-font-smoothing: inherit;
  -moz-osx-font-smoothing: inherit;
  -webkit-appearance: none;
  appearance: none;
}
```

MUI CssBaseline handles button resets.

- [ ] **Step 3: Run type-check and lint**

```bash
cd frontend && npm run type-check 2>&1 && npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/styles/global.css
git commit -m "style: remove redundant body/button overrides from global.css, defer to CssBaseline"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full lint**

```bash
cd frontend && npm run lint 2>&1
```

Expected: no errors. In particular, no unused import warnings for `TYPOGRAPHY_STYLES`.

- [ ] **Step 2: Run type-check clean**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Verify constants/typography.ts is gone**

```bash
ls frontend/src/constants/
```

Expected: `tableStyles.ts` present, `typography.ts` absent.

- [ ] **Step 4: Verify no remaining TYPOGRAPHY_STYLES references anywhere**

```bash
cd frontend && grep -r "TYPOGRAPHY_STYLES\|constants/typography" src/ --include="*.tsx" --include="*.ts"
```

Expected: no output.

- [ ] **Step 5: Visual smoke test checklist**

Start the frontend dev server: `cd frontend && npm run dev`

Open each of these pages and confirm table headers, cell text, and page headers render correctly (no obviously broken sizes or missing text):
- [ ] Dashboard (`/`)
- [ ] Inventory (`/inventory`)
- [ ] Sales (`/sales`)
- [ ] Purchasing (`/purchasing`)
- [ ] Accounting (`/accounting`)

- [ ] **Step 6: Print smoke test**

On one report from each module (e.g., Inventory Summary Report, Purchase Order Status Report, Sales Order Profit Report), click the print/export button and verify:
- Font renders as Roboto
- Table headers are bold and styled
- Filter text is legible
- Page title (h1) is centered and larger than body text

- [ ] **Step 7: Final commit if any fixes needed**

If the smoke tests revealed any issues, fix them and commit:

```bash
cd /home/blur/erp2
git add frontend/src/
git commit -m "fix: correct typography regressions found in smoke test"
```
