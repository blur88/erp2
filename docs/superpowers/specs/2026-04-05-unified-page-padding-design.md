# Design: Unified Page Padding (Issue #282)

## Summary

Centralize all outer page margins in `MainLayout.tsx`. Remove redundant padding wrappers from every page inside the layout. Result: a single source of truth, no double-padding, and new pages automatically get correct spacing.

## Problem

`MainLayout.tsx` applies `pt: 8, px: { xs: 2, sm: 3 }, pb: 3` to the main content area. Almost every page also wraps its content in `<Box sx={{ p: 3 }}>`, producing ~48px double padding on all sides and ~48px double padding top.

## Solution

### 1. MainLayout.tsx

Change `pt: 8` → `pt: 11` on the `<Box component="main">`:

- `pt: 11` = 88px = 64px (AppBar height) + 24px (gap)
- `px: { xs: 2, sm: 3 }` and `pb: 3` unchanged

### 2. Page cleanup — three patterns

**Pattern 1: Root `<Box sx={{ p: 3 }}>` wrapper (~60 pages)**
Strip the outer Box. Its children become the direct return value.

**Pattern 2: `<Container maxWidth="xl"><Box sx={{ py: 3 }}>` (4 pages)**
Remove both the Container and the inner Box. Children returned directly.
- `inventory/CreateProductPage.tsx`
- `inventory/CreateStockAdjustmentPage.tsx`
- `sales/CreateSalesOrderPage.tsx`
- `purchasing/CreatePurchaseOrderPage.tsx`

**Pattern 3: Multiple return paths with `<Box sx={{ p: 3 }}>` (3 pages)**
Strip the outer `p: 3` from all return paths (including loading/error states).
- `accounting/BankReconciliationDetailsPage.tsx`
- `accounting/JournalEntryDetailsPage.tsx`
- `sales/CustomerProfilePage.tsx`

### 3. Full list of affected files (70 files)

All files are under `frontend/src/pages/`:

```
accounting/AccountingDashboardPage.tsx
accounting/AccountMappingsPage.tsx
accounting/BankReconciliationDetailsPage.tsx
accounting/BankReconciliationsPage.tsx
accounting/ChartOfAccountsPage.tsx
accounting/ExpensesPage.tsx
accounting/FiscalPeriodsPage.tsx
accounting/FundTransfersPage.tsx
accounting/JournalEntriesPage.tsx
accounting/JournalEntryDetailsPage.tsx
accounting/JournalEntryFormPage.tsx
accounting/OwnerEquityPage.tsx
accounting/reports/AccountActivityPage.tsx
accounting/reports/BalanceSheetPage.tsx
accounting/reports/GeneralLedgerPage.tsx
accounting/reports/ProfitAndLossPage.tsx
accounting/reports/TrialBalancePage.tsx
accounting/SettlementsPage.tsx
audit-logs/AuditLogsPage.tsx
dashboard/DashboardPage.tsx
inventory/CategoriesPage.tsx
inventory/CreateProductPage.tsx
inventory/CreateStockAdjustmentPage.tsx
inventory/HistoricalInventoryReport.tsx
inventory/InventoryPage.tsx
inventory/InventorySummaryReport.tsx
inventory/MovementSummaryReport.tsx
inventory/PriceListReport.tsx
inventory/ProductCostReport.tsx
inventory/ProductsPage.tsx
inventory/StockAdjustmentsPage.tsx
purchasing/CreatePurchaseOrderPage.tsx
purchasing/GoodsReceivedPage.tsx
purchasing/PurchaseOrderDetailsReport.tsx
purchasing/PurchaseOrdersPage.tsx
purchasing/PurchaseOrderStatusReport.tsx
purchasing/PurchaseOrderSummary.tsx
purchasing/PurchasingPage.tsx
purchasing/SuppliersPage.tsx
purchasing/VendorPaymentDetailsReport.tsx
purchasing/VendorPaymentsPage.tsx
purchasing/VendorProductListReport.tsx
sales/CreateSalesOrderPage.tsx
sales/CustomerOrderHistory.tsx
sales/CustomerPaymentByOrder.tsx
sales/CustomerPaymentDetails.tsx
sales/CustomerPaymentSummary.tsx
sales/CustomerProfilePage.tsx
sales/CustomersPage.tsx
sales/InvoicesPage.tsx
sales/OrdersPage.tsx
sales/PaymentsPage.tsx
sales/ProductCustomerReport.tsx
sales/SalesByProductDetails.tsx
sales/SalesByProductSummary.tsx
sales/SalesOrderProfitReport.tsx
sales/SalesOrderSummary.tsx
sales/SalesPage.tsx
settings/BackupManagement.tsx
settings/CompanySettingsPage.tsx
settings/DocumentNumbersPage.tsx
settings/InventoryCostingPage.tsx
settings/PaymentMethodsPage.tsx
settings/PriceListDetailsPage.tsx
settings/PriceListsPage.tsx
settings/PrintSettingsPage.tsx
settings/RegionalSettingsPage.tsx
settings/RoleManagementPage.tsx
settings/SecuritySettingsPage.tsx
settings/StockLevelSettingsPage.tsx
settings/UserManagementPage.tsx
```

### 4. Not touched

| File | Reason |
|------|--------|
| `auth/LoginPage.tsx` | Outside MainLayout (auth route) |
| `auth/MandatoryPasswordChangePage.tsx` | Outside MainLayout |
| `NotFoundPage.tsx` | Outside MainLayout |
| `Paper sx={{ p: 3 }}` instances | Internal card/section padding |
| Tab panel `py: 3` boxes | Internal tab content spacing |
| `SalesPage` / `PurchasingPage` inner `<Box sx={{ p: 3, borderBottom: 1 }}>`  | Internal panel header, not root wrapper |

## Acceptance Criteria

- `MainLayout.tsx` is the single source of truth for page margins (24px horizontal, 24px bottom, 24px gap below AppBar)
- No page inside MainLayout has a redundant outer padding wrapper
- All create/edit form pages have the same 24px margins as list pages
- New pages added in future automatically get correct margins without any manual wrapping
