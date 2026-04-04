# Unified Page Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all outer page margins in `MainLayout.tsx` and remove redundant `p: 3` wrappers from every page inside the layout.

**Architecture:** Change `pt: 8` → `pt: 11` in `MainLayout.tsx` to provide 24px gap below the AppBar. Then mechanically strip the root `<Box sx={{ p: 3 }}>` (or `<Container>` + inner `<Box sy={{ py: 3 }}>`) from every page component that lives inside the layout. No new abstractions.

**Tech Stack:** React 19, Material-UI v7, Vitest

---

## Task 1: Update MainLayout top padding

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx:82-93`

The `<Box component="main">` currently has `pt: 8` (= 64px = AppBar height, zero gap). Change to `pt: 11` (= 88px = 64px AppBar + 24px gap).

- [ ] **Step 1: Open `frontend/src/components/common/MainLayout.tsx` and update the main Box**

Change line 87 from:
```tsx
          pt: 8,
```
to:
```tsx
          pt: 11,
```

The full `<Box component="main">` block after the change:
```tsx
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: 11,
          px: { xs: 2, sm: 3 },
          pb: 3,
          bgcolor: 'background.default',
          minHeight: '100vh',
          overflow: 'hidden',
          maxWidth: '100%',
        }}
      >
        <Outlet />
      </Box>
```

- [ ] **Step 2: Run the MainLayout test**

```bash
cd frontend && npx vitest run src/components/common/__tests__/MainLayout.test.tsx
```

Expected: PASS (test only checks it renders without crashing).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/MainLayout.tsx
git commit -m "fix(layout): set pt:11 in MainLayout for 24px gap below AppBar"
```

---

## Task 2: Strip root padding — accounting pages (Pattern 1)

**Files:**
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx`
- Modify: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx`
- Modify: `frontend/src/pages/accounting/FundTransfersPage.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx`
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/AccountActivityPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/BalanceSheetPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/GeneralLedgerPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/ProfitAndLossPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/TrialBalancePage.tsx`

**Pattern to apply in every file:**

Find the outermost `return (` and its immediate child `<Box sx={{ p: 3 }}>`. Remove that Box wrapper, promoting its children up one level. Remove the matching closing `</Box>` tag.

Before:
```tsx
  return (
    <Box sx={{ p: 3 }}>
      <PageHeader ... />
      ...
    </Box>
  )
```

After:
```tsx
  return (
    <>
      <PageHeader ... />
      ...
    </>
  )
```

> Note: If the children are a single element you can return it directly without `<>...</>`. If there are multiple children, wrap with a Fragment `<>...</>`.

**Special cases in accounting reports:**

`BalanceSheetPage.tsx`, `GeneralLedgerPage.tsx`, `AccountActivityPage.tsx`, and `ProfitAndLossPage.tsx` each have an inner `<Box sx={{ p: 3 }}>` used for the print/expanded content panel. **Do NOT remove those** — only remove the outermost root return wrapper.

- [ ] **Step 1: Strip root `<Box sx={{ p: 3 }}>` from all 17 accounting pages listed above**

For each file: open it, find the outermost `return (` block, remove the `<Box sx={{ p: 3 }}>` wrapper and its closing `</Box>`. Wrap multiple children in `<>...</>` if needed.

- [ ] **Step 2: Run accounting page tests**

```bash
cd frontend && npx vitest run src/pages/accounting/
```

Expected: all PASS.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/
git commit -m "fix(accounting): remove redundant root p:3 wrappers from all accounting pages"
```

---

## Task 3: Strip root padding — accounting pages with multiple return paths (Pattern 3)

**Files:**
- Modify: `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx`

These pages have **multiple return statements** each with `<Box sx={{ p: 3 }}>` — an early return for an error/not-found state, plus the main return. Strip the outer Box from **all** return paths.

`BankReconciliationDetailsPage.tsx` — two return paths:
```tsx
// Early return (error state) — before:
  if (!reconciliation) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Bank reconciliation not found</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>Back</Button>
      </Box>
    );
  }
// After:
  if (!reconciliation) {
    return (
      <>
        <Alert severity="error">Bank reconciliation not found</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>Back</Button>
      </>
    );
  }

// Main return — before:
  return (
    <Box sx={{ p: 3 }}>
      <PageHeader ... />
      ...
    </Box>
  );
// After:
  return (
    <>
      <PageHeader ... />
      ...
    </>
  );
```

`JournalEntryDetailsPage.tsx` — two return paths:
```tsx
// Early return (not found) — before:
  if (!entry) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Journal entry not found</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>Back to List</Button>
      </Box>
    )
  }
// After:
  if (!entry) {
    return (
      <>
        <Alert severity="error">Journal entry not found</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>Back to List</Button>
      </>
    )
  }

// Main return — before:
  return (
    <Box sx={{ p: 3 }}>
      <PageHeader ... />
      ...
    </Box>
  )
// After:
  return (
    <>
      <PageHeader ... />
      ...
    </>
  )
```

- [ ] **Step 1: Apply the changes to both files**

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run src/pages/accounting/BankReconciliationDetailsPage.test.tsx src/pages/accounting/JournalEntryDetailsPage.test.tsx
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx frontend/src/pages/accounting/JournalEntryDetailsPage.tsx
git commit -m "fix(accounting): remove root p:3 from multi-return-path pages"
```

---

## Task 4: Strip root padding — dashboard and audit-logs pages

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/pages/audit-logs/AuditLogsPage.tsx`

Apply Pattern 1 to both: strip the outermost `<Box sx={{ p: 3 }}>` (or `<Box sx={{ display: 'flex', ..., p: 3 }}>`) root wrapper.

For `AuditLogsPage.tsx`, the root Box has multiple sx props: `sx={{ display: 'flex', height: '100%', gap: 2, p: 3 }}`. Remove only the `p: 3` property, keeping the rest:

```tsx
// Before:
    <Box sx={{ display: 'flex', height: '100%', gap: 2, p: 3 }}>
// After:
    <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
```

> Do NOT strip the wrapper entirely here — it carries structural styles. Just remove `p: 3` from the sx object.

- [ ] **Step 1: Strip root `p: 3` from `DashboardPage.tsx` and `AuditLogsPage.tsx`**

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/dashboard/DashboardPage.tsx frontend/src/pages/audit-logs/AuditLogsPage.tsx
git commit -m "fix(dashboard,audit): remove redundant root p:3 wrappers"
```

---

## Task 5: Strip root padding — inventory pages (Pattern 1)

**Files:**
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

Apply Pattern 1 to each: strip outermost `<Box sx={{ p: 3 }}>` wrapper.

`InventoryPage.tsx` has inner `<Paper sx={{ p: 3 }}>` elements — do NOT touch those, only the root.

- [ ] **Step 1: Strip root `<Box sx={{ p: 3 }}>` from all 9 inventory list/report pages**

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/CategoriesPage.tsx \
        frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
        frontend/src/pages/inventory/InventoryPage.tsx \
        frontend/src/pages/inventory/InventorySummaryReport.tsx \
        frontend/src/pages/inventory/MovementSummaryReport.tsx \
        frontend/src/pages/inventory/PriceListReport.tsx \
        frontend/src/pages/inventory/ProductCostReport.tsx \
        frontend/src/pages/inventory/ProductsPage.tsx \
        frontend/src/pages/inventory/StockAdjustmentsPage.tsx
git commit -m "fix(inventory): remove redundant root p:3 wrappers from list and report pages"
```

---

## Task 6: Strip root padding — inventory create/edit pages (Pattern 2)

**Files:**
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`

These use `<Container maxWidth="xl"><Box sx={{ py: 3 }}>`. Remove **both** the Container and the inner Box. Also remove the `Container` import from MUI if it's only used for this.

Before:
```tsx
  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        <PageHeader ... />
        ...
      </Box>
    </Container>
  )
```

After:
```tsx
  return (
    <>
      <PageHeader ... />
      ...
    </>
  )
```

After making the change, check the import line. If `Container` was the only MUI import using it, remove it:
```tsx
// Remove Container from the import list, e.g.:
import { Box, Button, Grid, TextField, ... } from '@mui/material'
// (no Container)
```

- [ ] **Step 1: Remove Container + inner Box from `CreateProductPage.tsx`**

- [ ] **Step 2: Remove Container + inner Box from `CreateStockAdjustmentPage.tsx`**

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/CreateProductPage.tsx \
        frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx
git commit -m "fix(inventory): remove Container+py:3 wrapper from create/edit pages"
```

---

## Task 7: Strip root padding — purchasing pages (Pattern 1)

**Files:**
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`

Apply Pattern 1: strip outermost `<Box sx={{ p: 3 }}>`.

`PurchasingPage.tsx` has an inner `<Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>` — do NOT touch that, only the root wrapper.

- [ ] **Step 1: Strip root `<Box sx={{ p: 3 }}>` from all 10 purchasing list/report pages**

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/
git commit -m "fix(purchasing): remove redundant root p:3 wrappers from list and report pages"
```

---

## Task 8: Strip root padding — purchasing create page (Pattern 2)

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`

Remove `<Container maxWidth="xl">` and its inner `<Box sx={{ py: 3 }}>`. Remove `Container` from the MUI import if no longer used.

Before:
```tsx
  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        ...
      </Box>
    </Container>
  )
```

After:
```tsx
  return (
    <>
      ...
    </>
  )
```

- [ ] **Step 1: Apply the change**

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx
git commit -m "fix(purchasing): remove Container+py:3 wrapper from create purchase order page"
```

---

## Task 9: Strip root padding — sales pages (Pattern 1)

**Files:**
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

Apply Pattern 1: strip outermost `<Box sx={{ p: 3 }}>`.

`SalesByProductSummary.tsx` root wrapper is `<Box sx={{ p: 3, width: '100%' }}>` — remove the entire wrapper (width: 100% is unnecessary at layout level).

`SalesPage.tsx` has an inner `<Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>` — do NOT touch it.

- [ ] **Step 1: Strip root `<Box sx={{ p: 3 }}>` from all 14 sales list/report pages**

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/CustomerOrderHistory.tsx \
        frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
        frontend/src/pages/sales/CustomerPaymentDetails.tsx \
        frontend/src/pages/sales/CustomerPaymentSummary.tsx \
        frontend/src/pages/sales/CustomersPage.tsx \
        frontend/src/pages/sales/InvoicesPage.tsx \
        frontend/src/pages/sales/OrdersPage.tsx \
        frontend/src/pages/sales/PaymentsPage.tsx \
        frontend/src/pages/sales/ProductCustomerReport.tsx \
        frontend/src/pages/sales/SalesByProductDetails.tsx \
        frontend/src/pages/sales/SalesByProductSummary.tsx \
        frontend/src/pages/sales/SalesOrderProfitReport.tsx \
        frontend/src/pages/sales/SalesOrderSummary.tsx \
        frontend/src/pages/sales/SalesPage.tsx
git commit -m "fix(sales): remove redundant root p:3 wrappers from list and report pages"
```

---

## Task 10: Strip root padding — sales create page and multi-return-path page (Patterns 2 & 3)

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- Modify: `frontend/src/pages/sales/CustomerProfilePage.tsx`

**`CreateSalesOrderPage.tsx` (Pattern 2):** Remove `<Container maxWidth="xl">` and inner `<Box sx={{ py: 3 }}>`. Remove `Container` import if unused.

Before:
```tsx
  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        ...
      </Box>
    </Container>
  )
```

After:
```tsx
  return (
    <>
      ...
    </>
  )
```

**`CustomerProfilePage.tsx` (Pattern 3):** Three return paths, all with `<Box sx={{ p: 3 }}>` or `<Box sx={{ p: 3, display: 'flex', ... }}>`. Strip the outer Box from all three:

Loading state — before:
```tsx
  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }
```
After:
```tsx
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }
```
> Keep the inner layout styles (`display: 'flex'`, `justifyContent`, `pt: 10`) — only remove `p: 3`.

Error state — before:
```tsx
  if (error || !customer) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>...</Alert>
        <Button ...>Back to Customers</Button>
      </Box>
    )
  }
```
After:
```tsx
  if (error || !customer) {
    return (
      <>
        <Alert severity="error" sx={{ mb: 2 }}>...</Alert>
        <Button ...>Back to Customers</Button>
      </>
    )
  }
```

Main return — before:
```tsx
  return (
    <Box sx={{ p: 3 }}>
      ...
    </Box>
  )
```
After:
```tsx
  return (
    <>
      ...
    </>
  )
```

- [ ] **Step 1: Apply Pattern 2 to `CreateSalesOrderPage.tsx`**

- [ ] **Step 2: Apply Pattern 3 to `CustomerProfilePage.tsx`** (all 3 return paths)

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/CreateSalesOrderPage.tsx \
        frontend/src/pages/sales/CustomerProfilePage.tsx
git commit -m "fix(sales): remove Container/p:3 wrappers from create order and customer profile pages"
```

---

## Task 11: Strip root padding — settings pages

**Files:**
- Modify: `frontend/src/pages/settings/BackupManagement.tsx`
- Modify: `frontend/src/pages/settings/CompanySettingsPage.tsx`
- Modify: `frontend/src/pages/settings/DocumentNumbersPage.tsx`
- Modify: `frontend/src/pages/settings/InventoryCostingPage.tsx`
- Modify: `frontend/src/pages/settings/PaymentMethodsPage.tsx`
- Modify: `frontend/src/pages/settings/PriceListDetailsPage.tsx`
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx`
- Modify: `frontend/src/pages/settings/PrintSettingsPage.tsx`
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx`
- Modify: `frontend/src/pages/settings/RoleManagementPage.tsx`
- Modify: `frontend/src/pages/settings/SecuritySettingsPage.tsx`
- Modify: `frontend/src/pages/settings/StockLevelSettingsPage.tsx`
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`

Apply Pattern 1 to each: strip outermost `<Box sx={{ p: 3 }}>`.

**Special cases:**

`PrintSettingsPage.tsx` — has two loading/error return paths AND a main return, all with `<Box sx={{ p: 3 }}>`. Strip from all paths. The tab panels `<Box sx={{ py: 3 }}>` inside `TabPanel` are internal — do NOT touch.

`BackupManagement.tsx` — same: strip only the root `<Box sx={{ p: 3 }}>`. The `<Box sy={{ py: 3 }}>` tab panel wrapper is internal — do NOT touch.

- [ ] **Step 1: Strip root `<Box sx={{ p: 3 }}>` from all 13 settings pages (all return paths)**

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/settings/
git commit -m "fix(settings): remove redundant root p:3 wrappers from all settings pages"
```

---

## Task 12: Final verification

- [ ] **Step 1: Confirm no root `p: 3` wrapper remains in any page inside MainLayout**

```bash
grep -rn "^    <Box sx={{ p: 3" frontend/src/pages/ --include="*.tsx" | grep -v "test\|spec\|Paper\|borderBottom"
```

Expected: no output (or only internal panel usages, not root wrappers).

- [ ] **Step 2: Confirm no `Container maxWidth` remains in pages inside MainLayout**

```bash
grep -rn "Container maxWidth" frontend/src/pages/ --include="*.tsx"
```

Expected: only `NotFoundPage.tsx` and `auth/MandatoryPasswordChangePage.tsx` (outside MainLayout).

- [ ] **Step 3: Run full frontend type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all PASS. This takes ~12 minutes — do not assume it is hung.

- [ ] **Step 5: Commit if any last fixes were needed, then open PR**

```bash
gh pr create --title "fix: unified page padding - centralize margins in MainLayout (closes #282)" --body "$(cat <<'EOF'
## Summary
- Sets `pt: 11` in `MainLayout.tsx` to provide 24px gap between AppBar and page content
- Strips redundant `<Box sx={{ p: 3 }}>` root wrappers from all ~60 pages inside MainLayout
- Removes `<Container maxWidth="xl">` + inner `<Box sy={{ py: 3 }}>` from 4 create/edit pages

## Result
MainLayout is now the single source of truth for all outer page margins. New pages automatically get correct spacing without any manual wrapping.

Closes #282

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
