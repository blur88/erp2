# Frontend Knip Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all dead code identified by knip — unused files, packages, Redux slice exports, and dead thunks — to reduce bundle size and improve codebase clarity.

**Architecture:** This is a pure deletion/cleanup pass. No new functionality. Each task targets a discrete set of files. The Redux slice cleanup removes exported symbols that are never imported anywhere — dead thunks left over from a migration to direct API calls. The approach is: delete files, uninstall packages, then strip `export` keywords (or whole dead functions) from slice files.

**Tech Stack:** React 18, Redux Toolkit, TypeScript, Vite, Vitest, npm

---

## Knip False Positives (DO NOT TOUCH)

These were flagged by knip but are actively used:

- `public/env-config.js` — generated at Docker runtime by `docker-entrypoint.sh`, loaded in `index.html`
- `src/components/calculator/index.ts` + `InlineCalculator.tsx` — `SlidingCalculatorPanel` from same folder is used in `ProductsPage`
- `@vitest/coverage-v8` — used by `npm run test:coverage`
- Dual exports on `IdleWarningDialog`, `ProductImportDialog`, `useSearchAndFilter` — intentional named+default pattern
- `exportToCSV`, `exportToExcel`, `exportToPDF` bodies — called internally by `exportProducts()`; only the `export` keyword is removed

---

### Task 1: Delete Unused Files

**Files:**
- Delete: `frontend/src/components/common/CurrencyInput.tsx`
- Delete: `frontend/src/components/common/DataTable.tsx`
- Delete: `frontend/src/components/inventory/CategoryBreadcrumb.tsx`
- Delete: `frontend/src/components/inventory/CategoryTreeView.tsx`
- Delete: `frontend/src/pages/settings/SettingsPage.tsx`
- Delete: `frontend/src/services/activityMonitor.ts`
- Delete: `frontend/src/services/moduleApi.ts`
- Delete: `frontend/src/services/reportsApi.ts`

**Step 1: Verify no hidden imports before deleting**

```bash
cd /home/blur/erp2/frontend
grep -r "CurrencyInput\|DataTable\|CategoryBreadcrumb\|CategoryTreeView\|SettingsPage\|activityMonitor\|moduleApi\|reportsApi" src/ --include="*.ts" --include="*.tsx" -l
```

Expected output: only the files themselves (no other files importing them).

**Step 2: Delete the files**

```bash
rm src/components/common/CurrencyInput.tsx
rm src/components/common/DataTable.tsx
rm src/components/inventory/CategoryBreadcrumb.tsx
rm src/components/inventory/CategoryTreeView.tsx
rm src/pages/settings/SettingsPage.tsx
rm src/services/activityMonitor.ts
rm src/services/moduleApi.ts
rm src/services/reportsApi.ts
```

**Step 3: TypeScript check**

```bash
npm run type-check
```

Expected: No errors related to deleted files.

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add -A frontend/src/components/common/CurrencyInput.tsx \
  frontend/src/components/common/DataTable.tsx \
  frontend/src/components/inventory/CategoryBreadcrumb.tsx \
  frontend/src/components/inventory/CategoryTreeView.tsx \
  frontend/src/pages/settings/SettingsPage.tsx \
  frontend/src/services/activityMonitor.ts \
  frontend/src/services/moduleApi.ts \
  frontend/src/services/reportsApi.ts
git commit -m "chore: delete unused frontend files identified by knip"
```

---

### Task 2: Remove Unused npm Packages

**Files:**
- Modify: `frontend/package.json`

**Step 1: Uninstall unused production dependencies**

```bash
cd /home/blur/erp2/frontend
npm uninstall @mui/lab @mui/x-data-grid @mui/x-tree-view file-saver lodash
```

**Step 2: Uninstall unused dev dependencies**

```bash
npm uninstall --save-dev @types/file-saver @types/lodash
```

**Step 3: Add react-transition-group as devDependency (used in Sidebar.test.tsx)**

```bash
npm install --save-dev react-transition-group @types/react-transition-group
```

**Step 4: Verify app still builds**

```bash
npm run type-check
```

Expected: No errors.

**Step 5: Run tests to confirm nothing broke**

```bash
npm run test -- --run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: remove unused npm packages, add react-transition-group to devDeps"
```

---

### Task 3: Clean Up store/index.ts and Utility Exports

**Files:**
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/utils/exportUtils.ts`
- Modify: `frontend/src/utils/currency.ts`
- Modify: `frontend/src/utils/formatters.ts`
- Modify: `frontend/src/styles/theme.ts`

**Step 1: Remove `export` from `persistor` in store/index.ts**

In `src/store/index.ts`, find the line:
```ts
export const persistor = persistStore(store);
```
Change to:
```ts
const persistor = persistStore(store);
```
(Keep the call — redux-persist needs it internally.)

**Step 2: Remove `export` from dead utility functions**

In `src/utils/exportUtils.ts`:
- Remove `export` from `ExportData` interface (line ~7) — keep the type, just un-export it if unused externally; or delete if only used as a parameter type within the file
- Remove `export` keyword from `exportToCSV`, `exportToExcel`, `exportToPDF` functions — keep the function bodies (called internally by `exportProducts`)

In `src/utils/currency.ts`:
- Remove `export` from `formatCurrencyInput` (line ~59)
- Remove `export` from `formatCurrencyWhole` (line ~66)

In `src/utils/formatters.ts`:
- Remove `export` from `formatPercentage` (line ~131)
- Remove `export` from `APP_TIMEZONE` (line ~144)
- Remove `export` from `getDateDaysAgo` (line ~168)

In `src/styles/theme.ts`:
- Remove `export` from `theme` (line ~427)
- Remove `export` from `createAppTheme` (line ~430)

**Step 3: TypeScript check**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```

Expected: No errors. If removing an export breaks a type somewhere, add it back.

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/store/index.ts \
  frontend/src/utils/exportUtils.ts \
  frontend/src/utils/currency.ts \
  frontend/src/utils/formatters.ts \
  frontend/src/styles/theme.ts
git commit -m "chore: remove unused exports from store, utils, and styles"
```

---

### Task 4: Clean Up Unused Types and Enum Members

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/settingsApi.ts`
- Modify: `frontend/src/components/calculator/constants.ts`
- Modify: `frontend/src/components/calculator/styles/buttonStyles.ts`

**Step 1: Remove unused types from types/index.ts**

Remove these exported items (verify not imported before removing):
- `Permission` interface (line ~27)
- `ProductAttribute` interface (line ~74)
- `PriceLevel` enum (line ~181)
- `Address` interface (line ~521)
- `StockAdjustmentStatus.DRAFT`, `.COMPLETED`, `.CANCELLED` enum members (lines ~124-126) — if the entire enum is only partially used, check which values ARE used before removing

```bash
grep -r "Permission\|ProductAttribute\|PriceLevel\|StockAdjustmentStatus\|Address" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "types/index.ts"
```

Only remove items confirmed to have zero imports.

**Step 2: Remove unused interfaces from settingsApi.ts**

Remove exports of: `CompanySettings`, `UpdateCompanySettingsDto`, `PriceCostingSettings`, `UpdatePriceCostingSettingsDto`, `DocumentNumberSettings`, `UpdateDocumentNumberSettingsDto`

First verify:
```bash
grep -r "CompanySettings\|PriceCostingSettings\|DocumentNumberSettings\|UpdateCompanySettings\|UpdatePriceCosting\|UpdateDocumentNumber" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "settingsApi.ts"
```

Only remove confirmed-unused exports.

**Step 3: Remove unused calculator exports**

In `src/components/calculator/constants.ts`: remove `export` from `MAX_DISPLAY_LENGTH`
In `src/components/calculator/styles/buttonStyles.ts`: remove `export` from `getCompactButtonStyles`
In `src/components/calculator/components/index.ts`: remove export of `CalculatorButton` and `ButtonVariant` if not used externally

**Step 4: TypeScript check**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/types/index.ts \
  frontend/src/services/settingsApi.ts \
  frontend/src/components/calculator/constants.ts \
  frontend/src/components/calculator/styles/buttonStyles.ts \
  frontend/src/components/calculator/components/index.ts
git commit -m "chore: remove unused exported types and enum members"
```

---

### Task 5: Clean Up Dead Redux Thunks — Dashboard, Auth, AuditLog Slices

**Files:**
- Modify: `frontend/src/store/slices/dashboardSlice.ts`
- Modify: `frontend/src/store/slices/authSlice.ts`
- Modify: `frontend/src/store/slices/auditLogSlice.ts`

**Step 1: dashboardSlice.ts — remove all 6 dead thunks and their selectors**

Remove entire thunk bodies for (confirmed never dispatched — DashboardPage uses ApiService.get directly):
- `fetchDashboardStats`
- `fetchSalesChart`
- `fetchRevenueChart`
- `fetchTopProducts`
- `fetchRecentActivities`
- `fetchAlerts`

Remove exported actions from the slice's `actions` spread:
- `clearError`, `dismissAlert`, `addAlert`, `setLastUpdated`

Remove unused selectors:
- `selectDashboardStats`, `selectSalesChart`, `selectRevenueChart`, `selectTopProducts`, `selectRecentActivities`, `selectDashboardAlerts`, `selectDashboardLoading`, `selectDashboardError`, `selectLastUpdated`

Also remove any state slice keys that only existed to support the removed thunks (e.g. `stats`, `salesChart`, `revenueChart`, `topProducts`, `recentActivities`, `alerts`, `lastUpdated`). Check if DashboardPage reads any of these keys from Redux state before removing.

```bash
grep -r "dashboardSlice\|useDashboard\|selectDashboard\|dashboardStats" /home/blur/erp2/frontend/src/pages --include="*.tsx" -n
```

**Step 2: authSlice.ts — remove dead thunks and selectors**

Remove:
- `register` thunk (line ~94)
- `refreshAccessToken` thunk (line ~106)
- Action creators: `updateLastActivity`, `setInactivityTimeout` (line ~309)
- Selectors: `selectAuthLoading`, `selectAuthError` (lines ~316-317)

Verify first:
```bash
grep -r "register\|refreshAccessToken\|updateLastActivity\|setInactivityTimeout\|selectAuthLoading\|selectAuthError" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "authSlice.ts"
```

**Step 3: auditLogSlice.ts — remove dead thunks**

Remove:
- `fetchAuditLogsByEntity` thunk (line ~60)
- `fetchAuditLogsByUser` thunk (line ~73)
- `clearError` action (line ~191)

Verify first:
```bash
grep -r "fetchAuditLogsByEntity\|fetchAuditLogsByUser\|clearError" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "auditLogSlice.ts"
```

**Step 4: TypeScript check**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```

**Step 5: Run tests**

```bash
npm run test -- --run
```

**Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/store/slices/dashboardSlice.ts \
  frontend/src/store/slices/authSlice.ts \
  frontend/src/store/slices/auditLogSlice.ts
git commit -m "chore: remove dead Redux thunks and selectors from dashboard, auth, auditLog slices"
```

---

### Task 6: Clean Up Dead Redux Thunks — Sales, Purchasing, Customer Slices

**Files:**
- Modify: `frontend/src/store/slices/salesSlice.ts`
- Modify: `frontend/src/store/slices/purchasingSlice.ts`
- Modify: `frontend/src/store/slices/customerSlice.ts`

**Step 1: salesSlice.ts — remove dead thunks and actions**

Remove entire thunk bodies (confirmed never dispatched):
- `restoreInvoice`, `bulkRestoreInvoices`
- `fetchPayments`
- `createCustomer`, `createInvoice`, `recordPayment`
- `restorePayment`, `bulkRestorePayments`
- `fetchDeletedCustomers`, `restoreCustomer`, `bulkRestoreCustomers`
- `permanentDeleteCustomer`, `bulkPermanentDeleteCustomers`
- `updateOrder`

Remove actions/selectors:
- `setSelectedCustomer`, `setCustomers` actions
- `selectCustomers`, `selectDeletedCustomers`, `selectInvoices`, `selectPayments`, `selectSelectedCustomer`

Verify each before removing:
```bash
grep -r "restoreInvoice\|bulkRestoreInvoices\|createInvoice\|recordPayment\|fetchDeletedCustomers\|permanentDeleteCustomer\|selectInvoices\|selectPayments\|selectCustomers\|selectDeletedCustomers" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "salesSlice.ts"
```

**Step 2: purchasingSlice.ts — remove dead thunks and actions**

Remove:
- `createSupplier`, `createGoodsReceivedNote`
- `restoreGRN`, `bulkRestoreGRNs`
- `restoreVendorPayment`, `bulkRestoreVendorPayments`
- Actions: `setSelectedSupplier`, `markGRNsForRefetch`, `clearError`
- Selectors: `selectSuppliers`, `selectGoodsReceivedNotes`, `selectVendorPayments`, `selectSelectedSupplier`

Verify first:
```bash
grep -r "createSupplier\|createGoodsReceivedNote\|restoreGRN\|bulkRestoreGRNs\|restoreVendorPayment\|selectSuppliers\|selectGoodsReceivedNotes\|selectVendorPayments" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "purchasingSlice.ts"
```

**Step 3: customerSlice.ts — remove dead exports**

Remove:
- `fetchCustomer` thunk (singular, line ~52) — note: `fetchCustomers` (plural) IS used
- Actions: `clearFilters`, `setCurrentCustomer`
- Selector: `selectCurrentCustomer`

Verify:
```bash
grep -r "fetchCustomer\b\|clearFilters\|setCurrentCustomer\|selectCurrentCustomer" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "customerSlice.ts"
```

**Step 4: TypeScript check**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```

**Step 5: Run tests**

```bash
npm run test -- --run
```

**Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/store/slices/salesSlice.ts \
  frontend/src/store/slices/purchasingSlice.ts \
  frontend/src/store/slices/customerSlice.ts
git commit -m "chore: remove dead Redux thunks and selectors from sales, purchasing, customer slices"
```

---

### Task 7: Clean Up Dead Redux Exports — Inventory, Notification, PriceList Slices

**Files:**
- Modify: `frontend/src/store/slices/inventorySlice.ts`
- Modify: `frontend/src/store/slices/notificationSlice.ts`
- Modify: `frontend/src/store/slices/priceListSlice.ts`

**Step 1: inventorySlice.ts — remove dead thunks and actions**

Remove thunks (confirmed never dispatched):
- `createProduct`, `updateProduct`
- `fetchStockMovements`

Remove actions:
- `setSelectedCategory`, `setSelectedStockMovement`, `resetFilters`, `clearError`, `resetProducts`

Remove selectors:
- `selectStockMovements`, `selectSelectedCategory`, `selectSelectedStockMovement`, `selectInventoryFilters`

Verify each:
```bash
grep -r "createProduct\|updateProduct\|fetchStockMovements\|setSelectedCategory\|selectStockMovements\|selectInventoryFilters" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "inventorySlice.ts"
```

**Step 2: notificationSlice.ts — remove dead actions and selectors**

Remove:
- `clearAllNotifications`, `clearReadNotifications`, `setNotifications` actions
- `selectUnreadNotifications` selector

Verify:
```bash
grep -r "clearAllNotifications\|clearReadNotifications\|setNotifications\|selectUnreadNotifications" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "notificationSlice.ts"
```

**Step 3: priceListSlice.ts — remove dead thunks and actions**

Remove:
- `fetchPriceListByCode`, `fetchDefaultPriceList` thunks
- `setSelectedPriceList` action

Verify:
```bash
grep -r "fetchPriceListByCode\|fetchDefaultPriceList\|setSelectedPriceList" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "priceListSlice.ts"
```

**Step 4: TypeScript check + tests**

```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run test -- --run
```

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/store/slices/inventorySlice.ts \
  frontend/src/store/slices/notificationSlice.ts \
  frontend/src/store/slices/priceListSlice.ts
git commit -m "chore: remove dead Redux exports from inventory, notification, priceList slices"
```

---

### Task 8: Clean Up Remaining Redux Slices

**Files:**
- Modify: `frontend/src/store/slices/bankReconciliationsSlice.ts`
- Modify: `frontend/src/store/slices/chartOfAccountsSlice.ts`
- Modify: `frontend/src/store/slices/themeSlice.ts`
- Modify: `frontend/src/store/slices/supplierSlice.ts`
- Modify: `frontend/src/store/slices/accountingReportsSlice.ts`
- Modify: `frontend/src/store/slices/expenseSlice.ts`
- Modify: `frontend/src/store/slices/ownerEquitySlice.ts`
- Modify: `frontend/src/store/slices/paymentMethodsSlice.ts`
- Modify: `frontend/src/store/slices/settlementsSlice.ts`

**Step 1: bankReconciliationsSlice.ts**

Remove: `setSelectedReconciliation`, `clearError` actions

Verify: `grep -r "setSelectedReconciliation\|clearError" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "bankReconciliationsSlice.ts"`

**Step 2: chartOfAccountsSlice.ts**

Remove: `resetState` action

Verify: `grep -r "resetState" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "chartOfAccountsSlice.ts"`

**Step 3: themeSlice.ts**

Remove actions: `setThemeMode`, `setPrimaryColor`, `setSecondaryColor`, `setThemeConfig`, `resetTheme`
Remove selectors: `selectPrimaryColor`, `selectSecondaryColor`

Verify:
```bash
grep -r "setThemeMode\|setPrimaryColor\|setSecondaryColor\|setThemeConfig\|resetTheme\|selectPrimaryColor\|selectSecondaryColor" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "themeSlice.ts"
```

**Step 4: supplierSlice.ts**

Remove: `restoreSupplier` thunk, `resetSuppliers` action

Verify: `grep -r "restoreSupplier\|resetSuppliers" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "supplierSlice.ts"`

**Step 5: accountingReportsSlice.ts**

Remove: `clearAllReports` action

Verify: `grep -r "clearAllReports" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "accountingReportsSlice.ts"`

**Step 6: expenseSlice.ts**

Remove: `clearExpensesError` action, `selectExpensesError` and `selectExpensesPagination` selectors

Verify: `grep -r "clearExpensesError\|selectExpensesError\|selectExpensesPagination" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "expenseSlice.ts"`

**Step 7: ownerEquitySlice.ts**

Remove: `clearOwnerEquityError` action, `selectOwnerEquityError` and `selectOwnerEquityPagination` selectors

Verify: `grep -r "clearOwnerEquityError\|selectOwnerEquityError\|selectOwnerEquityPagination" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "ownerEquitySlice.ts"`

**Step 8: paymentMethodsSlice.ts**

Remove: `clearPaymentMethodsError` action, `selectPaymentMethodsError` and `selectPaymentMethodsPagination` selectors

Verify: `grep -r "clearPaymentMethodsError\|selectPaymentMethodsError\|selectPaymentMethodsPagination" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "paymentMethodsSlice.ts"`

**Step 9: settlementsSlice.ts**

Remove: `clearSettlementsError` action, `selectSettlementsError` and `selectSettlementsPagination` selectors

Verify: `grep -r "clearSettlementsError\|selectSettlementsError\|selectSettlementsPagination" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "settlementsSlice.ts"`

**Step 10: TypeScript check + tests**

```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run test -- --run
```

**Step 11: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/store/slices/bankReconciliationsSlice.ts \
  frontend/src/store/slices/chartOfAccountsSlice.ts \
  frontend/src/store/slices/themeSlice.ts \
  frontend/src/store/slices/supplierSlice.ts \
  frontend/src/store/slices/accountingReportsSlice.ts \
  frontend/src/store/slices/expenseSlice.ts \
  frontend/src/store/slices/ownerEquitySlice.ts \
  frontend/src/store/slices/paymentMethodsSlice.ts \
  frontend/src/store/slices/settlementsSlice.ts
git commit -m "chore: remove dead Redux exports from remaining slices"
```

---

### Task 9: Clean Up Remaining Unused Exports

**Files:**
- Modify: `frontend/src/components/auth/IdleWarningDialog.tsx` — remove named export `IdleWarningDialog` leaving only default export (or vice versa — check which one App.tsx uses and keep that)
- Modify: `frontend/src/components/common/LoadingSpinner.tsx` — remove `export` from `SkeletonCard` and `SkeletonTable`
- Modify: `frontend/src/components/print/index.ts` — remove `export` of `BasePrintTemplate`
- Modify: `frontend/src/hooks/useCurrency.ts` — remove `export` from `getCachedCurrency` and `refreshCurrencyCache`
- Modify: `frontend/src/hooks/useWebSocket.tsx` — remove `export` from `useWebSocket`, `useRealtimeUpdates`, `useBusinessAlerts` if confirmed unused
- Modify: `frontend/src/pages/sales/components/index.ts` — remove export of `OrderStatusChart`
- Modify: `frontend/src/pages/sales/components/SalesCharts.tsx` — remove `export` from `OrderStatusChart`

**Step 1: Verify each before modifying**

```bash
grep -r "SkeletonCard\|SkeletonTable\|BasePrintTemplate\|getCachedCurrency\|refreshCurrencyCache\|useWebSocket\|useRealtimeUpdates\|useBusinessAlerts\|OrderStatusChart" /home/blur/erp2/frontend/src --include="*.ts" --include="*.tsx" | grep -v "LoadingSpinner.tsx\|print/index.ts\|useCurrency.ts\|useWebSocket.tsx\|SalesCharts.tsx\|sales/components/index.ts"
```

Only remove exports for items with zero hits.

**Step 2: For IdleWarningDialog — keep only the import style used by App.tsx**

```bash
grep "IdleWarningDialog" /home/blur/erp2/frontend/src/App.tsx
```

Keep whichever export form (named or default) App.tsx uses. Remove the other.

**Step 3: TypeScript check + tests**

```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run test -- --run
```

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/components/auth/IdleWarningDialog.tsx \
  frontend/src/components/common/LoadingSpinner.tsx \
  frontend/src/components/print/index.ts \
  frontend/src/hooks/useCurrency.ts \
  frontend/src/hooks/useWebSocket.tsx \
  frontend/src/pages/sales/components/index.ts \
  frontend/src/pages/sales/components/SalesCharts.tsx
git commit -m "chore: remove remaining unused exports from components and hooks"
```

---

### Task 10: Final Verification

**Step 1: Run knip again to confirm reduction**

```bash
cd /home/blur/erp2/frontend
npx knip
```

Expected: Significantly fewer reported items. Any remaining items should be reviewed individually — some may be legitimate false positives.

**Step 2: Full test suite**

```bash
npm run test -- --run
```

Expected: All tests pass.

**Step 3: TypeScript check**

```bash
npm run type-check
```

Expected: Zero errors.

**Step 4: Lint**

```bash
npm run lint
```

Expected: Zero new errors introduced.
