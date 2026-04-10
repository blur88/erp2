# MUI v9 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `@mui/material`, `@mui/icons-material`, and `@mui/x-date-pickers` from v7 to v9, fixing all resulting TypeScript errors across 103 files.

**Architecture:** Four categories of breaking changes to fix after bumping packages: (1) `GridLegacy` removed — 9 files, migrate to Grid v2 `size` prop; (2) legacy TextField slot props (`InputProps`, `inputProps`, `InputLabelProps`) — 50+ files, migrate to `slotProps`; (3) `PaperProps` on Dialog/Menu/Popover — 42 files, migrate to `slotProps`; (4) `primaryTypographyProps`/`secondaryTypographyProps` on ListItemText — 4 files, migrate to `slotProps`. One icon rename. The codebase starts with zero type errors on v7; must return to zero on v9.

**Tech Stack:** React 19, MUI v9, Emotion v11, TypeScript 6, Vitest

---

## Migration Reference

MUI v9 replaces component-specific prop APIs with a unified `slotProps` API. The mapping for every pattern used in this codebase:

### TextField

```tsx
// Before (v7)
<TextField
  InputProps={{ startAdornment: <SearchIcon />, readOnly: true }}
  inputProps={{ min: 0, max: 100, 'aria-label': 'amount' }}
  InputLabelProps={{ shrink: true }}
/>

// After (v9)
<TextField
  slotProps={{
    input: { startAdornment: <SearchIcon />, readOnly: true },
    htmlInput: { min: 0, max: 100, 'aria-label': 'amount' },
    inputLabel: { shrink: true },
  }}
/>
```

Note: `InputProps` (capital I) → `slotProps.input`; `inputProps` (lowercase i) → `slotProps.htmlInput`; `InputLabelProps` → `slotProps.inputLabel`. These are separate slots — do not merge them.

### Checkbox / other inputs with `inputProps`

```tsx
// Before (v7)
<Checkbox inputProps={{ 'aria-label': 'select row' }} />

// After (v9)
<Checkbox slotProps={{ input: { 'aria-label': 'select row' } }} />
```

Note: for Checkbox/Radio/Switch, `inputProps` → `slotProps.input` (not `htmlInput`).

### Dialog

```tsx
// Before (v7)
<Dialog PaperProps={{ sx: { borderRadius: 2, height: '80vh' } }} />

// After (v9)
<Dialog slotProps={{ paper: { sx: { borderRadius: 2, height: '80vh' } } }} />
```

### Menu

```tsx
// Before (v7)
<Menu PaperProps={{ sx: { minWidth: 200 } }} />

// After (v9)
<Menu slotProps={{ paper: { sx: { minWidth: 200 } } }} />
```

### Popover

```tsx
// Before (v7)
<Popover PaperProps={{ sx: { p: 2 } }} />

// After (v9)
<Popover slotProps={{ paper: { sx: { p: 2 } } }} />
```

### ListItemText

```tsx
// Before (v7)
<ListItemText
  primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
  secondaryTypographyProps={{ component: 'div' }}
/>

// After (v9)
<ListItemText
  slotProps={{
    primary: { variant: 'body2', fontWeight: 600 },
    secondary: { component: 'div' },
  }}
/>
```

### ErrorOutline icon (renamed)

```tsx
// Before (v7) — wrong name, was a v7 bug
import { ErrorOutline as OutOfStockIcon } from '@mui/icons-material'

// After (v9)
import { ErrorOutlined as OutOfStockIcon } from '@mui/icons-material'
```

---

## Files Modified

**Package:**
- `frontend/package.json`

**GridLegacy → Grid (9 files):**
- `src/pages/accounting/JournalEntriesPage.tsx`
- `src/pages/accounting/JournalEntryDetailsPage.tsx`
- `src/pages/sales/components/OrderContextHeader.tsx`
- `src/pages/sales/components/InvoiceContextHeader.tsx`
- `src/pages/sales/components/OrdersDialogs.tsx`
- `src/pages/sales/components/CustomerContextHeader.tsx`
- `src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- `src/pages/purchasing/components/SupplierContextHeader.tsx`
- `src/pages/inventory/ProductsPage.tsx`

**slotProps migration — PaperProps (42 files):**
- `src/components/auth/IdleWarningDialog.tsx`
- `src/components/common/ConfirmationDialog.tsx`
- `src/components/common/NotificationPanel.tsx`
- `src/components/common/SidebarUserMenu.tsx`
- `src/components/common/SystemStatus.tsx`
- `src/components/inventory/CategorySelector.tsx`
- `src/components/inventory/DeletedCategoriesDialog.tsx`
- `src/components/inventory/DeletedProductsDialog.tsx`
- `src/components/inventory/DeletedStockAdjustmentsDialog.tsx`
- `src/components/inventory/ProductImportDialog.tsx`
- `src/components/purchasing/BlockedPurchaseOrderDialog.tsx`
- `src/components/purchasing/DeletedGRNsDialog.tsx`
- `src/components/purchasing/DeletedPurchaseOrdersDialog.tsx`
- `src/components/purchasing/DeletedSuppliersDialog.tsx`
- `src/components/purchasing/DeletedVendorPaymentsDialog.tsx`
- `src/components/sales/BlockedSalesOrderDialog.tsx`
- `src/components/sales/DeletedCustomersDialog.tsx`
- `src/components/sales/DeletedInvoicesDialog.tsx`
- `src/components/sales/DeletedOrdersDialog.tsx`
- `src/components/sales/DeletedPaymentsDialog.tsx`
- `src/components/settings/DeletedPaymentMethodsDialog.tsx`
- `src/pages/dashboard/components/BusinessPerformanceChart.tsx`
- `src/pages/inventory/HistoricalInventoryReport.tsx`
- `src/pages/inventory/InventorySummaryReport.tsx`
- `src/pages/inventory/MovementSummaryReport.tsx`
- `src/pages/inventory/ProductCostReport.tsx`
- `src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- `src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `src/pages/purchasing/PurchaseOrderSummary.tsx`
- `src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `src/pages/purchasing/VendorProductListReport.tsx`
- `src/pages/sales/CreateSalesOrderPage.tsx`
- `src/pages/sales/CustomerOrderHistory.tsx`
- `src/pages/sales/CustomerPaymentByOrder.tsx`
- `src/pages/sales/CustomerPaymentDetails.tsx`
- `src/pages/sales/CustomerPaymentSummary.tsx`
- `src/pages/sales/ProductCustomerReport.tsx`
- `src/pages/sales/SalesByProductDetails.tsx`
- `src/pages/sales/SalesByProductSummary.tsx`
- `src/pages/sales/SalesOrderProfitReport.tsx`
- `src/pages/sales/SalesOrderSummary.tsx`

**slotProps migration — TextField InputProps/inputProps/InputLabelProps (50 files):**
- `src/components/accounting/BankReconciliationFormDialog.tsx`
- `src/components/accounting/CreateSettlementDialog.tsx`
- `src/components/accounting/DeletedAccountsDialog.tsx`
- `src/components/accounting/FiscalPeriodFormDialog.tsx`
- `src/components/accounting/GeneratePeriodsDialog.tsx`
- `src/components/backup/BackupScheduleList.tsx`
- `src/components/backup/BackupSettingsPanel.tsx`
- `src/components/backup/RestoreConfirmationDialog.tsx`
- `src/components/calculator/components/CalculatorDisplay.tsx`
- `src/components/filters/FilterBar.tsx`
- `src/components/filters/FilterPeriod.tsx`
- `src/components/inventory/DeletedCategoriesDialog.tsx`
- `src/components/inventory/DeletedProductsDialog.tsx`
- `src/components/inventory/DeletedStockAdjustmentsDialog.tsx`
- `src/components/inventory/SmartCategoryDeleteDialog.tsx`
- `src/components/print/BasePrintTemplate.tsx`
- `src/components/purchasing/DeletedGRNsDialog.tsx`
- `src/components/purchasing/DeletedPurchaseOrdersDialog.tsx`
- `src/components/purchasing/DeletedSuppliersDialog.tsx`
- `src/components/purchasing/DeletedVendorPaymentsDialog.tsx`
- `src/components/purchasing/VendorPaymentDialog.tsx`
- `src/components/sales/DeletedCustomersDialog.tsx`
- `src/components/sales/DeletedInvoicesDialog.tsx`
- `src/components/sales/DeletedOrdersDialog.tsx`
- `src/components/sales/DeletedPaymentsDialog.tsx`
- `src/components/sales/PaymentDialog.tsx`
- `src/components/settings/PaymentMethodFormDialog.tsx`
- `src/components/settings/PriceListFormDialog.tsx`
- `src/pages/accounting/AccountMappingsPage.tsx`
- `src/pages/accounting/BankReconciliationDetailsPage.tsx`
- `src/pages/accounting/ChartOfAccountsPage.tsx`
- `src/pages/accounting/ExpensesPage.tsx`
- `src/pages/accounting/FiscalPeriodsPage.tsx`
- `src/pages/accounting/FundTransfersPage.tsx`
- `src/pages/accounting/JournalEntryFormPage.tsx`
- `src/pages/accounting/OwnerEquityPage.tsx`
- `src/pages/accounting/reports/AccountActivityPage.tsx`
- `src/pages/accounting/reports/BalanceSheetPage.tsx`
- `src/pages/accounting/reports/GeneralLedgerPage.tsx`
- `src/pages/accounting/reports/ProfitAndLossPage.tsx`
- `src/pages/accounting/reports/TrialBalancePage.tsx`
- `src/pages/audit-logs/components/FilterSidebar.tsx`
- `src/pages/audit-logs/components/LogRow.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/MandatoryPasswordChangePage.tsx`
- `src/pages/inventory/CategoriesPage.tsx`
- `src/pages/inventory/CreateStockAdjustmentPage.tsx`
- `src/pages/inventory/StockAdjustmentsPage.tsx`
- `src/pages/purchasing/GoodsReceivedPage.tsx`
- `src/pages/purchasing/SupplierFormPage.tsx`
- `src/pages/purchasing/VendorPaymentsPage.tsx`
- `src/pages/settings/DocumentNumbersPage.tsx`
- `src/pages/settings/StockLevelSettingsPage.tsx`
- `src/pages/settings/UserManagementPage.tsx`

**slotProps migration — ListItemText (4 files):**
- `src/components/common/NotificationPanel.tsx`
- `src/components/common/Sidebar.tsx`
- `src/pages/dashboard/components/BusinessPerformanceChart.tsx`
- `src/pages/settings/RoleManagementPage.tsx`

**Icon rename (1 file):**
- `src/pages/inventory/InventoryPage.tsx`

---

## Task 1: Bump package versions

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Update the three MUI package versions**

In `frontend/package.json`, change:

```json
"@mui/icons-material": "^7.3.6",
"@mui/material": "^7.3.6",
"@mui/x-date-pickers": "8.27.2",
```

to:

```json
"@mui/icons-material": "^9.0.0",
"@mui/material": "^9.0.0",
"@mui/x-date-pickers": "9.0.0",
```

- [ ] **Step 2: Install**

```bash
cd frontend && npm install
```

Expected: installs without errors. There may be deprecation warnings — ignore them. Watch for `ERESOLVE` peer dependency errors — there should be none since React 19 and Emotion v11 are already compatible with MUI v9.

- [ ] **Step 3: Confirm type errors exist**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS" | wc -l
```

Expected: approximately 270–280 errors. This is the baseline you are working down to zero. Do NOT commit until Task 11.

---

## Task 2: Migrate JournalEntriesPage

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Test: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Migrate the import**

On line 29 of `src/pages/accounting/JournalEntriesPage.tsx`, change:

```tsx
import GridLegacy from '@mui/material/GridLegacy'
```

to:

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 3: Migrate the Grid usage (lines 398–474)**

Replace all `GridLegacy` with `Grid`, remove all `item` props, and replace breakpoint props with the `size` prop:

```tsx
<Grid container spacing={2} alignItems="center">
  <Grid size={{ xs: 12, md: 3 }}>
    {/* keep all children unchanged */}
  </Grid>
  <Grid size={{ xs: 12, md: 2 }}>
    {/* keep all children unchanged */}
  </Grid>
  <Grid size={{ xs: 12, md: 2 }}>
    {/* keep all children unchanged */}
  </Grid>
  <Grid size={{ xs: 12, md: 2.5 }}>
    {/* keep all children unchanged */}
  </Grid>
  <Grid size={{ xs: 12, md: 2.5 }}>
    {/* keep all children unchanged */}
  </Grid>
</Grid>
```

- [ ] **Step 4: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(accounting): migrate JournalEntriesPage GridLegacy → Grid v2"
```

---

## Task 3: Migrate JournalEntryDetailsPage

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx`
- Test: `frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx`

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Migrate the import**

On line 26 of `src/pages/accounting/JournalEntryDetailsPage.tsx`, change:

```tsx
import GridLegacy from '@mui/material/GridLegacy'
```

to:

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 3: Migrate all Grid usages (lines ~257–339)**

Replace every `GridLegacy` element. Rule: `<GridLegacy container ...>` → `<Grid container ...>`; `<GridLegacy item xs={N} md={N}>` → `<Grid size={{ xs: N, md: N }}>`;  `<GridLegacy item xs={N}>` → `<Grid size={{ xs: N }}>`.

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 3 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 3 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 3 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 3 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 4: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntryDetailsPage.tsx
git commit -m "feat(accounting): migrate JournalEntryDetailsPage GridLegacy → Grid v2"
```

---

## Task 4: Migrate Sales context headers and dialogs

**Files:**
- Modify: `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/OrdersDialogs.tsx`
- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`
- Test: `frontend/src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx`

All four files have `import Grid from '@mui/material/GridLegacy'` — the import alias is already `Grid`, only the path changes.

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Fix the import path in all four files**

In each file change:

```tsx
import Grid from '@mui/material/GridLegacy'
```

to:

```tsx
import Grid from '@mui/material/Grid'
```

Line numbers: OrderContextHeader:20, InvoiceContextHeader:16, OrdersDialogs:21, CustomerContextHeader:17.

- [ ] **Step 3: Migrate Grid props in OrderContextHeader.tsx**

One container (line 153), two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 4: Migrate Grid props in InvoiceContextHeader.tsx**

One container (line 139), two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 5: Migrate Grid props in OrdersDialogs.tsx**

One container (line 92), five items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 6: Migrate Grid props in CustomerContextHeader.tsx**

One container (line 117), two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 7: Run the test**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/pages/sales/components/OrderContextHeader.tsx \
  frontend/src/pages/sales/components/InvoiceContextHeader.tsx \
  frontend/src/pages/sales/components/OrdersDialogs.tsx \
  frontend/src/pages/sales/components/CustomerContextHeader.tsx
git commit -m "feat(sales): migrate GridLegacy → Grid v2 in sales context components"
```

---

## Task 5: Migrate Purchasing context headers

**Files:**
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- Modify: `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`
- Test: `frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx`

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Fix import in PurchaseOrderContextHeader.tsx (line 20)**

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 3: Migrate Grid props in PurchaseOrderContextHeader.tsx**

One container (line 135), two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 4: Fix import in SupplierContextHeader.tsx (line 17)**

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 5: Migrate Grid props in SupplierContextHeader.tsx**

One container (line 118), two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 6 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 6: Run the test**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add \
  frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx \
  frontend/src/pages/purchasing/components/SupplierContextHeader.tsx
git commit -m "feat(purchasing): migrate GridLegacy → Grid v2 in purchasing context components"
```

---

## Task 6: Migrate ProductsPage

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Test: `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Fix import (line 3)**

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 3: Migrate Grid props**

One container (line 160), two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 3 }}>{/* ... */}</Grid>
  <Grid size={{ xs: 12, md: 9 }}>{/* ... */}</Grid>
</Grid>
```

- [ ] **Step 4: Run the test**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "feat(inventory): migrate ProductsPage GridLegacy → Grid v2"
```

---

## Task 7: Migrate PaperProps → slotProps.paper (Dialog/Menu/Popover components)

**Files:** 42 files listed in the PaperProps section of the Files Modified table above.

MUI v9 removes `PaperProps` from Dialog, Menu, and Popover. Replace with `slotProps={{ paper: ... }}`.

- [ ] **Step 1: Search all PaperProps usages**

```bash
cd frontend && grep -rn "PaperProps=" src/ --include="*.tsx" | grep -v "node_modules"
```

Note the output — this is the complete list of locations to fix.

- [ ] **Step 2: Replace each PaperProps usage**

For each location found, apply this transformation. The value moves unchanged:

```tsx
// Before
<Dialog PaperProps={{ sx: { borderRadius: 2, p: 1 } }}>

// After
<Dialog slotProps={{ paper: { sx: { borderRadius: 2, p: 1 } } }}>
```

```tsx
// Before
<Menu PaperProps={{ sx: { minWidth: 200, bgcolor: 'background.paper' } }}>

// After
<Menu slotProps={{ paper: { sx: { minWidth: 200, bgcolor: 'background.paper' } } }}>
```

```tsx
// Before
<Popover PaperProps={{ sx: { p: 2 } }}>

// After
<Popover slotProps={{ paper: { sx: { p: 2 } } }}>
```

If a component already has a `slotProps` prop, merge `paper` into the existing object:

```tsx
// Before
<Dialog slotProps={{ backdrop: { ... } }} PaperProps={{ sx: { ... } }}>

// After
<Dialog slotProps={{ backdrop: { ... }, paper: { sx: { ... } } }}>
```

Work through all 42 files. Use the grep output from Step 1 to track your progress.

- [ ] **Step 3: Verify count drops to zero**

```bash
cd frontend && grep -rn "PaperProps=" src/ --include="*.tsx" | grep -v "node_modules" | wc -l
```

Expected: 0.

- [ ] **Step 4: Run type-check and confirm PaperProps errors are gone**

```bash
cd frontend && npm run type-check 2>&1 | grep "PaperProps" | wc -l
```

Expected: 0.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add -p  # stage all changed files
git commit -m "feat: migrate PaperProps → slotProps.paper for Dialog/Menu/Popover (MUI v9)"
```

---

## Task 8: Migrate InputLabelProps → slotProps.inputLabel (TextField)

**Files:** 36 files listed in the InputLabelProps section of the Files Modified table above.

- [ ] **Step 1: Search all InputLabelProps usages on TextField**

```bash
cd frontend && grep -rn "InputLabelProps=" src/ --include="*.tsx" | grep -v "node_modules"
```

- [ ] **Step 2: Replace each usage**

```tsx
// Before
<TextField InputLabelProps={{ shrink: true }} />

// After
<TextField slotProps={{ inputLabel: { shrink: true } }} />
```

If the TextField already has `slotProps` with other slots (from the `InputProps` or `inputProps` migrations in Task 9 — do Task 9 first if you want to merge them in one pass), merge:

```tsx
// Before
<TextField
  InputProps={{ startAdornment: <SearchIcon /> }}
  InputLabelProps={{ shrink: true }}
/>

// After
<TextField
  slotProps={{
    input: { startAdornment: <SearchIcon /> },
    inputLabel: { shrink: true },
  }}
/>
```

- [ ] **Step 3: Verify count drops to zero**

```bash
cd frontend && grep -rn "InputLabelProps=" src/ --include="*.tsx" | grep -v "node_modules" | wc -l
```

Expected: 0.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add -p
git commit -m "feat: migrate InputLabelProps → slotProps.inputLabel (MUI v9)"
```

---

## Task 9: Migrate InputProps / inputProps → slotProps (TextField and Checkbox)

**Files:** 49 files listed in the InputProps/inputProps section of the Files Modified table above.

This is the most common migration — two different props (`InputProps` and `inputProps`) go to two different slots.

- [ ] **Step 1: Search all usages**

```bash
cd frontend && grep -rn "InputProps=\|inputProps=" src/ --include="*.tsx" | grep -v "node_modules"
```

- [ ] **Step 2: Replace TextField InputProps (capital I)**

`InputProps` contains MUI Input component props — adornments, readOnly, etc.

```tsx
// Before
<TextField InputProps={{ startAdornment: <SearchIcon />, readOnly: true }} />

// After
<TextField slotProps={{ input: { startAdornment: <SearchIcon />, readOnly: true } }} />
```

Common pattern with nested `inputProps` inside `InputProps` — split them:

```tsx
// Before
<TextField InputProps={{ inputProps: { min: 0, max: 100 }, startAdornment: <X /> }} />

// After
<TextField
  slotProps={{
    input: { startAdornment: <X /> },
    htmlInput: { min: 0, max: 100 },
  }}
/>
```

- [ ] **Step 3: Replace TextField inputProps (lowercase i)**

`inputProps` passes attributes to the underlying `<input>` HTML element.

```tsx
// Before
<TextField inputProps={{ min: 0, step: 0.01, 'aria-label': 'amount' }} />

// After
<TextField slotProps={{ htmlInput: { min: 0, step: 0.01, 'aria-label': 'amount' } }} />
```

- [ ] **Step 4: Replace Checkbox/Radio/Switch inputProps**

For Checkbox (and Radio, Switch), `inputProps` → `slotProps.input` (not `htmlInput`):

```tsx
// Before
<Checkbox inputProps={{ 'aria-label': 'select all' }} />

// After
<Checkbox slotProps={{ input: { 'aria-label': 'select all' } }} />
```

- [ ] **Step 5: Verify counts drop to zero**

```bash
cd frontend && grep -rn "InputProps=\|inputProps=" src/ --include="*.tsx" | grep -v "node_modules" | wc -l
```

Expected: 0.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add -p
git commit -m "feat: migrate InputProps/inputProps → slotProps (MUI v9)"
```

---

## Task 10: Migrate primaryTypographyProps / secondaryTypographyProps → slotProps (ListItemText)

**Files:**
- `src/components/common/NotificationPanel.tsx`
- `src/components/common/Sidebar.tsx`
- `src/pages/dashboard/components/BusinessPerformanceChart.tsx`
- `src/pages/settings/RoleManagementPage.tsx`

And fix the ErrorOutline icon rename in InventoryPage.tsx.

- [ ] **Step 1: Fix ListItemText props in all 4 files**

```tsx
// Before
<ListItemText
  primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
  secondaryTypographyProps={{ component: 'div' }}
/>

// After
<ListItemText
  slotProps={{
    primary: { variant: 'body2', fontWeight: 600 },
    secondary: { component: 'div' },
  }}
/>
```

Search the exact usages:

```bash
cd frontend && grep -n "primaryTypographyProps\|secondaryTypographyProps" \
  src/components/common/NotificationPanel.tsx \
  src/components/common/Sidebar.tsx \
  src/pages/dashboard/components/BusinessPerformanceChart.tsx \
  src/pages/settings/RoleManagementPage.tsx
```

Apply the transformation at each location found.

- [ ] **Step 2: Fix ErrorOutline icon rename in InventoryPage.tsx**

In `src/pages/inventory/InventoryPage.tsx` (line 24), change:

```tsx
import { ErrorOutline as OutOfStockIcon } from '@mui/icons-material'
```

to:

```tsx
import { ErrorOutlined as OutOfStockIcon } from '@mui/icons-material'
```

- [ ] **Step 3: Verify counts drop to zero**

```bash
cd frontend && grep -rn "primaryTypographyProps\|secondaryTypographyProps\|ErrorOutline[^d]" src/ --include="*.tsx" | grep -v "node_modules" | wc -l
```

Expected: 0.

- [ ] **Step 4: Commit**

```bash
git add \
  frontend/src/components/common/NotificationPanel.tsx \
  frontend/src/components/common/Sidebar.tsx \
  frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx \
  frontend/src/pages/settings/RoleManagementPage.tsx \
  frontend/src/pages/inventory/InventoryPage.tsx
git commit -m "feat: migrate ListItemText slotProps and fix ErrorOutlined icon rename (MUI v9)"
```

---

## Task 11: Full verification

- [ ] **Step 1: TypeScript check — must reach zero errors**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS" | wc -l
```

Expected: **0**. This codebase had zero type errors on MUI v7. If errors remain, grep for the specific prop names in the error messages and apply the migration reference at the top of this plan. Do not proceed until this is zero.

- [ ] **Step 2: Full test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass. This takes ~12 minutes — do not assume it is hung.

- [ ] **Step 3: Lint check**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Visual smoke test**

Start the dev server:

```bash
cd frontend && npm run dev
```

Visit these pages and confirm they render correctly (no layout breakage, dark theme intact):
- Accounting > Journal Entries
- Accounting > Journal Entry detail page
- Sales > Orders, Invoices, Customers
- Purchasing > Purchase Orders, Suppliers
- Inventory > Products (Grid), InventoryPage (ErrorOutlined icon)
- Any Dialog with a custom Paper style (e.g., ConfirmationDialog, any Deleted* dialog)
- Sidebar user menu (Menu with PaperProps)

- [ ] **Step 5: Final commit**

```bash
git commit --allow-empty -m "chore: MUI v7→v9 upgrade complete

- Upgraded @mui/material, @mui/icons-material to ^9.0.0
- Upgraded @mui/x-date-pickers to 9.0.0
- Migrated 9 files: GridLegacy → Grid v2 API
- Migrated 103 files: PaperProps/InputProps/inputProps/InputLabelProps/
  primaryTypographyProps/secondaryTypographyProps → slotProps
- Fixed ErrorOutline → ErrorOutlined icon rename

Closes #330"
```
