# Remove Data-Fetch Limits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all hardcoded data-fetching caps (100, 1000, 9999) from dropdown/filter/summary fetches across frontend and backend, while leaving all pagination UI controls untouched.

**Architecture:** Two layers to fix — backend (hardcoded `take:` in service methods and `limit:` in controllers) and frontend (hardcoded `limit` params in API calls). Pagination UI (rowsPerPage, TablePagination) is NOT touched. Only fetches that populate dropdowns, filters, and summaries are changed.

**Tech Stack:** NestJS 11 (backend), React 18 + Redux (frontend), TypeORM, Vitest (frontend tests), Jest (backend tests)

---

## What NOT to touch

- `rowsPerPage` state variables and `TablePagination` components — these control the UI pagination
- `limit: 1` checks (journal entry existence checks) — intentional
- `limit: 5` / `limit: 10` dashboard widgets — intentional small previews
- `limit: 20` inside paginated list dispatches like `fetchInvoices({ page: 1, limit: 20 })` — these are normal paginated loads
- Report pages that loop pages (`page=1&limit=100`, `page=2&limit=100` etc.) — these already fetch all data, just in batches; leave as-is
- `Math.min(limit, 100)` in `supplier.service.ts:535` — this is for the paginated list endpoint, not a summary

---

## Backend Changes

### Task 1: Remove hardcoded `take: 100` from invoice summary

**Files:**
- Modify: `backend/src/modules/sales/services/invoice.service.ts:229-233`

**Step 1: Make the change**

In `invoice.service.ts`, find `findSummaries()` at line 228. Remove the `take: 100` line:

```ts
// BEFORE
async findSummaries(): Promise<InvoiceSummaryDto[]> {
  const invoices = await this.invoiceRepository.find({
    relations: ['customer'],
    order: { invoiceDate: 'DESC' },
    take: 100, // Limit to recent invoices
  });

// AFTER
async findSummaries(): Promise<InvoiceSummaryDto[]> {
  const invoices = await this.invoiceRepository.find({
    relations: ['customer'],
    order: { invoiceDate: 'DESC' },
  });
```

**Step 2: Run backend tests**

```bash
cd backend && npx jest src/modules/sales --no-coverage
```
Expected: all pass

**Step 3: Commit**

```bash
git add backend/src/modules/sales/services/invoice.service.ts
git commit -m "fix: remove take:100 cap from invoice findSummaries"
```

---

### Task 2: Remove hardcoded `limit: 100` from sales order summary controller

**Files:**
- Modify: `backend/src/modules/sales/controllers/sales-order.controller.ts:108`

**Step 1: Make the change**

Find the `findSummaries` call at line 108:

```ts
// BEFORE
return this.salesOrderService.findSummaries({ limit: 100 }); // Get top 100 for summary

// AFTER
return this.salesOrderService.findSummaries();
```

**Step 2: Run backend tests**

```bash
cd backend && npx jest src/modules/sales --no-coverage
```
Expected: all pass

**Step 3: Commit**

```bash
git add backend/src/modules/sales/controllers/sales-order.controller.ts
git commit -m "fix: remove limit:100 cap from sales order summary endpoint"
```

---

## Frontend Changes

### Task 3: Fix customer filter dropdowns (6 report pages)

These pages all fetch `/customers?limit=100` for a filter dropdown. Remove the limit.

**Files:**
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx:78`
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx:103`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx:82`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx:80`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx:83`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx:76`

**Step 1: Fix SalesOrderSummary.tsx**

```tsx
// BEFORE
salesApi.getCustomers({ limit: 100 })

// AFTER
salesApi.getCustomers()
```

**Step 2: Fix CustomerOrderHistory.tsx**

```tsx
// BEFORE
ApiService.get<{ data: any[] }>('/customers?limit=100')

// AFTER
ApiService.get<{ data: any[] }>('/customers')
```

**Step 3: Fix CustomerPaymentByOrder.tsx**

```tsx
// BEFORE
ApiService.get<{ data: any[] }>('/customers?limit=100')

// AFTER
ApiService.get<{ data: any[] }>('/customers')
```

**Step 4: Fix CustomerPaymentDetails.tsx**

```tsx
// BEFORE
ApiService.get<{ data: any[] }>('/customers?limit=100')

// AFTER
ApiService.get<{ data: any[] }>('/customers')
```

**Step 5: Fix CustomerPaymentSummary.tsx**

```tsx
// BEFORE
api.get('/customers?limit=100')

// AFTER
api.get('/customers')
```

**Step 6: Fix SalesOrderProfitReport.tsx**

```tsx
// BEFORE
api.get('/customers?limit=100')

// AFTER
api.get('/customers')
```

**Step 7: Run frontend type check**

```bash
cd frontend && npm run type-check
```
Expected: no errors

**Step 8: Commit**

```bash
git add frontend/src/pages/sales/SalesOrderSummary.tsx \
  frontend/src/pages/sales/CustomerOrderHistory.tsx \
  frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
  frontend/src/pages/sales/CustomerPaymentDetails.tsx \
  frontend/src/pages/sales/CustomerPaymentSummary.tsx \
  frontend/src/pages/sales/SalesOrderProfitReport.tsx
git commit -m "fix: remove limit:100 from customer filter dropdowns in report pages"
```

---

### Task 4: Fix product filter dropdowns (5 report/form pages)

**Files:**
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx:121`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx:109`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx:108`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx:105`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx:118`

**Step 1: Fix CustomerOrderHistory.tsx products fetch**

```tsx
// BEFORE
ApiService.get<{ data: any[] }>('/inventory/products?limit=100')

// AFTER
ApiService.get<{ data: any[] }>('/inventory/products')
```

**Step 2: Fix ProductCustomerReport.tsx**

```tsx
// BEFORE
ApiService.get<{ data: any[] }>('/inventory/products?limit=100')

// AFTER
ApiService.get<{ data: any[] }>('/inventory/products')
```

**Step 3: Fix SalesByProductDetails.tsx**

```tsx
// BEFORE
api.get('/inventory/products?limit=100')

// AFTER
api.get('/inventory/products')
```

**Step 4: Fix SalesByProductSummary.tsx**

```tsx
// BEFORE
ApiService.get<{ data: any[] }>('/inventory/products?limit=100')

// AFTER
ApiService.get<{ data: any[] }>('/inventory/products')
```

**Step 5: Fix PurchaseOrderDetailsReport.tsx**

```tsx
// BEFORE (line 109 - suppliers)
api.get('/purchasing/suppliers?limit=100')
// AFTER
api.get('/purchasing/suppliers')

// BEFORE (line 118 - products)
api.get('/inventory/products?limit=100')
// AFTER
api.get('/inventory/products')
```

**Step 6: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 7: Commit**

```bash
git add frontend/src/pages/sales/CustomerOrderHistory.tsx \
  frontend/src/pages/sales/ProductCustomerReport.tsx \
  frontend/src/pages/sales/SalesByProductDetails.tsx \
  frontend/src/pages/sales/SalesByProductSummary.tsx \
  frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx
git commit -m "fix: remove limit:100 from product/supplier filter dropdowns in report pages"
```

---

### Task 5: Fix supplier/product dropdowns in order creation pages

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx:246,255`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx:178`
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx:314`
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx:190`

**Step 1: Fix CreatePurchaseOrderPage.tsx**

```tsx
// BEFORE (line 246)
const response = await purchasingApi.getSuppliers({ limit: 1000 })

// AFTER
const response = await purchasingApi.getSuppliers()

// BEFORE (line 255) - products fetch with isActive filter, remove only limit
const params: any = { limit: 100, isActive: true }

// AFTER
const params: any = { isActive: true }
```

**Step 2: Fix PurchaseOrdersPage.tsx**

```tsx
// BEFORE (line 178)
dispatch(fetchSuppliers({ limit: 1000 }))

// AFTER
dispatch(fetchSuppliers())
```

**Step 3: Fix CreateSalesOrderPage.tsx**

```tsx
// BEFORE (line 314)
const params: any = { limit: 100, isActive: true }

// AFTER
const params: any = { isActive: true }
```

**Step 4: Fix CreateStockAdjustmentPage.tsx**

```tsx
// BEFORE (line 190)
const params: any = { limit: 100, isActive: true }

// AFTER
const params: any = { isActive: true }
```

**Step 5: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx \
  frontend/src/pages/purchasing/PurchaseOrdersPage.tsx \
  frontend/src/pages/sales/CreateSalesOrderPage.tsx \
  frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx
git commit -m "fix: remove limit caps from supplier/product dropdowns in order creation pages"
```

---

### Task 6: Fix accounting pages

**Files:**
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx:95,147,168,182`
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx:87,88,94,141,164`
- Modify: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx:98,150,171,185,206,234`
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx:104,120,128`
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx:118`
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx:206`
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx:99`
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx:56,71,84`
- Modify: `frontend/src/pages/accounting/reports/AccountActivityPage.tsx:208`
- Modify: `frontend/src/pages/accounting/reports/GeneralLedgerPage.tsx:135`
- Modify: `frontend/src/components/accounting/AccountMappingDialog.tsx:86`
- Modify: `frontend/src/components/accounting/BankReconciliationFormDialog.tsx:70,71`
- Modify: `frontend/src/components/accounting/DeletedAccountsDialog.tsx:111,171`

**Pattern:** In all of these, remove `limit: 100`, `limit: 200`, `limit: 50`, `limit: 1000` from dispatch calls and direct API calls. Keep all other params (page, sortBy, sortOrder, isActive, status, etc.)

Examples:
```ts
// BEFORE
dispatch(fetchChartOfAccounts({ page: 1, limit: 100 }))
// AFTER
dispatch(fetchChartOfAccounts({ page: 1 }))

// BEFORE
dispatch(fetchFiscalPeriods({ page: 1, limit: 100, sortBy: 'startDate', sortOrder: 'DESC' }))
// AFTER
dispatch(fetchFiscalPeriods({ page: 1, sortBy: 'startDate', sortOrder: 'DESC' }))

// BEFORE
dispatch(fetchPaymentMethods({ page: 1, limit: 200, isActive: true }))
// AFTER
dispatch(fetchPaymentMethods({ page: 1, isActive: true }))

// BEFORE
dispatch(fetchSettlements({ page: 1, limit: 50 }))
// AFTER
dispatch(fetchSettlements({ page: 1 }))

// BEFORE
dispatch(fetchJournalEntries({ page: 1, limit: 50, ... }))
// AFTER
dispatch(fetchJournalEntries({ page: 1, ... }))
```

**Step 1: Apply all accounting changes** (edit each file)

**Step 2: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/ frontend/src/components/accounting/
git commit -m "fix: remove hardcoded limit caps from accounting pages and dialogs"
```

---

### Task 7: Fix dashboard page

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx:95-100`

**Step 1: Make changes**

```tsx
// BEFORE
ApiService.get<any>('/sales-orders?limit=100&sortBy=orderDate&sortOrder=desc'),
ApiService.get<any>('/purchasing/orders?limit=100&sortBy=orderDate&sortOrder=DESC'),
ApiService.get<any>('/purchasing/suppliers?limit=100'),
ApiService.get<any>('/payments?limit=100')

// AFTER
ApiService.get<any>('/sales-orders?sortBy=orderDate&sortOrder=desc'),
ApiService.get<any>('/purchasing/orders?sortBy=orderDate&sortOrder=DESC'),
ApiService.get<any>('/purchasing/suppliers'),
ApiService.get<any>('/payments')
```

**Step 2: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 3: Commit**

```bash
git add frontend/src/pages/dashboard/DashboardPage.tsx
git commit -m "fix: remove limit:100 caps from dashboard data fetches"
```

---

### Task 8: Fix inventory pages

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx:198,362,1014`
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx:221`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx:101`

**Step 1: Fix ProductsPage.tsx** — remove `limit: 9999` from export/import fetches

```tsx
// BEFORE (lines 198, 362, 1014)
{ limit: 9999, ... }

// AFTER — remove limit, keep other params
{ ... }  // just remove the limit property
```

**Step 2: Fix CreateProductPage.tsx**

```tsx
// BEFORE
const response = await priceListApi.getPriceLists({ isActive: true, limit: 100 })

// AFTER
const response = await priceListApi.getPriceLists({ isActive: true })
```

**Step 3: Fix InventorySummaryReport.tsx**

```tsx
// BEFORE
ApiService.get<any>('/inventory/products?limit=100')

// AFTER
ApiService.get<any>('/inventory/products')
```

**Step 4: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 5: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx \
  frontend/src/pages/inventory/CreateProductPage.tsx \
  frontend/src/pages/inventory/InventorySummaryReport.tsx
git commit -m "fix: remove limit:9999/100 caps from inventory pages"
```

---

### Task 9: Fix purchasing dialogs

**Files:**
- Modify: `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx:71`
- Modify: `frontend/src/components/purchasing/DeletedSuppliersDialog.tsx:76`

**Step 1: Fix DeletedPurchaseOrdersDialog.tsx**

```tsx
// BEFORE
const response = await purchasingApi.getDeletedPurchaseOrders({ limit: 100 })

// AFTER
const response = await purchasingApi.getDeletedPurchaseOrders()
```

**Step 2: Fix DeletedSuppliersDialog.tsx**

```tsx
// BEFORE
const response = await purchasingApi.getDeletedSuppliers({ limit: 100 })

// AFTER
const response = await purchasingApi.getDeletedSuppliers()
```

**Step 3: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 4: Commit**

```bash
git add frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx \
  frontend/src/components/purchasing/DeletedSuppliersDialog.tsx
git commit -m "fix: remove limit:100 from deleted records dialogs"
```

---

### Task 10: Fix SalesPage dashboard widgets

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx:169`

**Note:** Lines 123 and 127 with `limit: 5` are intentional dashboard preview widgets — leave them. Only fix line 169.

**Step 1: Check what line 169 fetches** (read the file first to understand context)

**Step 2: Remove the limit if it's a full data fetch** (not a widget preview)

**Step 3: Run type check**

```bash
cd frontend && npm run type-check
```

**Step 4: Run all frontend tests**

```bash
cd frontend && npm run test
```

**Step 5: Run all backend tests**

```bash
cd backend && npm run test
```

**Step 6: Final commit if any changes**

```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "fix: remove limit cap from sales page data fetch"
```

---

## Final Verification

After all tasks complete:

```bash
# Type check
cd frontend && npm run type-check

# All frontend tests
cd frontend && npm run test

# All backend tests
cd backend && npm run test

# Verify no remaining hardcoded caps (should only show intentional ones)
grep -rn "limit: [0-9]\{3,\}\|limit=[0-9]\{3,\}" frontend/src --include="*.tsx" | grep -v "rowsPerPage\|spec\|test\|// intentional\|// widget\|limit: 1\b"
```

Expected remaining hits (intentional — do NOT remove):
- `limit: 1` — journal entry existence checks
- `limit: 5` — dashboard preview widgets
- `limit: 20` — paginated list page loads
- Report loop fetches (`limit=100` per page in loops) — these are batched, not caps
