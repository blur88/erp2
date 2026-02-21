# Date Format Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change all frontend displayed/read-only dates from mixed formats (e.g. "Feb 20, 2026") to `DD/MM/YYYY` (e.g. `20/02/2026`), and date-times to `DD/MM/YYYY HH:mm`.

**Architecture:** Update the two central formatter functions in `formatters.ts` (Phase 1, propagates to 41+ files automatically), then fix ~66 files that bypass those utilities by calling `toLocaleDateString` directly (Phase 2). HTML `<input type="date">` values, API payloads, and chart adapters are explicitly out of scope.

**Tech Stack:** TypeScript, React 18, `Intl.DateTimeFormat` (browser native — no new dependencies)

---

## Phase 1 — Update Central Formatters

### Task 1: Update `formatDate` and `formatDateTime` in `formatters.ts`

**Files:**
- Modify: `frontend/src/utils/formatters.ts:15-46`

**Step 1: Open the file and locate the two functions**

Read `frontend/src/utils/formatters.ts`. The target functions are:
- `formatDate` at line 15 — currently uses `en-MY` with `month: 'short'`
- `formatDateTime` at line 32 — currently uses `en-MY` toLocaleString

**Step 2: Replace `formatDate`**

Replace the body of `formatDate` (lines 15-27):

```typescript
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  return dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
```

Output example: `"20/02/2026"`

**Step 3: Replace `formatDateTime`**

Replace the body of `formatDateTime` (lines 32-46):

```typescript
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const datePart = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timePart = dateObj.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${datePart} ${timePart}`
}
```

Output example: `"20/02/2026 14:30"`

**Step 4: Verify `getCurrentDate` and `getDateDaysAgo` are unchanged**

These return `YYYY-MM-DD` for form inputs — leave them exactly as-is.

**Step 5: Commit**

```bash
git add frontend/src/utils/formatters.ts
git commit -m "feat: standardize formatDate/formatDateTime to DD/MM/YYYY (en-GB)"
```

---

## Phase 2 — Fix Bypass Files

These files call `toLocaleDateString`/`toLocaleString` directly instead of using the shared utilities. Each task below covers a logical group. The pattern for every fix is the same:

1. Add `formatDate` (and/or `formatDateTime`) to the import from `'@/utils/formatters'` (or `'../../utils/formatters'` — match what's already used in that file)
2. Replace each inline `new Date(x).toLocaleDateString(...)` with `formatDate(x)`
3. Replace each inline `new Date(x).toLocaleString(...)` (date+time) with `formatDateTime(x)`
4. If the file already imports `formatDate`, just convert the remaining direct calls

> **How to check existing import:** Grep the file for `formatDate` or `from.*formatters` before editing.

---

### Task 2: Fix export utilities

**Files:**
- Modify: `frontend/src/utils/exportUtils.ts:21-24` and `:187-188`

**Step 1: Read the file**

Read `frontend/src/utils/exportUtils.ts`. Look for `formatDateForExport` (line 21) and `toLocaleTimeString` (line 187).

**Step 2: Add import for `formatDate` and `formatDateTime`**

At the top of `exportUtils.ts`, add:
```typescript
import { formatDate, formatDateTime } from './formatters'
```

**Step 3: Replace `formatDateForExport` usage**

Find the local `formatDateForExport` function (around line 22). Delete it. Replace all calls to `formatDateForExport(x)` with `formatDate(x)`.

Replace `new Date().toLocaleTimeString()` with the time portion — or simply use `formatDateTime(new Date())` wherever both date and time are shown together.

**Step 4: Commit**

```bash
git add frontend/src/utils/exportUtils.ts
git commit -m "fix: use shared formatDate/formatDateTime in exportUtils"
```

---

### Task 3: Fix accounting report pages (5 files)

**Files:**
- Modify: `frontend/src/pages/accounting/reports/TrialBalancePage.tsx:232`
- Modify: `frontend/src/pages/accounting/reports/BalanceSheetPage.tsx:376`
- Modify: `frontend/src/pages/accounting/reports/ProfitAndLossPage.tsx:387,393`
- Modify: `frontend/src/pages/accounting/reports/GeneralLedgerPage.tsx:67`
- Modify: `frontend/src/pages/accounting/reports/AccountActivityPage.tsx:71`

**Step 1: Read each file**

Read each file. Look for inline `toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })` patterns.

**Step 2: Add `formatDate` import to each file**

If the file already has an import from `'@/utils/formatters'`, add `formatDate` to it. If not, add:
```typescript
import { formatDate } from '@/utils/formatters'
```

**Step 3: Replace inline calls**

For each occurrence, replace:
```typescript
new Date(someDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
// or
new Date(someDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
// or similar
```
With:
```typescript
formatDate(someDate)
```

**Step 4: Commit**

```bash
git add frontend/src/pages/accounting/reports/
git commit -m "fix: use formatDate in accounting report pages"
```

---

### Task 4: Fix `JournalEntryFormPage.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx:290`

**Step 1: Read the file**

Find the `toLocaleDateString` call at line 290.

**Step 2: Add import and replace**

Add `formatDate` to the existing formatters import (or add one), then replace the inline call with `formatDate(...)`.

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntryFormPage.tsx
git commit -m "fix: use formatDate in JournalEntryFormPage"
```

---

### Task 5: Fix purchasing report pages (3 files)

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx:341,457,551,1134`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx:360,452,507`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx:142,161,246,267,320-324,351,787,838`

**Step 1: Read each file**

Note how dates are currently formatted in each. Check for existing formatters imports.

**Step 2: Add import and replace**

For each file, add `formatDate` (and `formatDateTime` if time is shown) to the imports from `'@/utils/formatters'`, then replace all inline `toLocaleDateString` calls.

**Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx \
        frontend/src/pages/purchasing/VendorProductListReport.tsx \
        frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx
git commit -m "fix: use formatDate in purchasing report pages"
```

---

### Task 6: Fix other purchasing pages

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx:363,482,539-543,569,1193`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx:188,302,360-364,413,995`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx:1097`
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx` (date-fns `format()` usage)

**Step 1: Read each file**

For `PurchasingPage.tsx`, find the `import { format } from 'date-fns'` at line 41. Find where `format(...)` is called.

**Step 2: Replace date-fns usage in PurchasingPage.tsx**

Remove the date-fns import line and replace any `format(date, 'MMM dd')` or similar calls with `formatDate(date)`. Add formatters import.

**Step 3: Replace toLocaleDateString in other files**

Same pattern: add import, replace calls.

**Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/
git commit -m "fix: use formatDate in purchasing pages (PurchaseOrderDetailsReport, Summary, Suppliers, PurchasingPage)"
```

---

### Task 7: Fix sales report pages (many files)

**Files:**
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx:189,315,385-389,438,1043`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx:174,243,276-280,329,836,841`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx:1177`
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx:383,512,574-578,627,1288`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx:367,494,556-560,609,1249`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx:396-400,449`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx:225,260,336,374,408-412,461,1216,1336`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx:188,296,357-361,410,1019,1024`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx:207,342,424-428,477,1092`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx:167,176,269,280,342-346,395,861,911`

**Step 1: For each file, read it and check existing formatters import**

Most sales pages likely already import `formatCurrency` or `formatDate` from formatters. Add `formatDate` to the existing import if missing.

**Step 2: Replace all inline toLocaleDateString calls with `formatDate`**

Same pattern throughout.

**Step 3: Commit after each logical sub-group**

```bash
# After report pages
git add frontend/src/pages/sales/SalesOrderProfitReport.tsx \
        frontend/src/pages/sales/CustomerPaymentSummary.tsx \
        frontend/src/pages/sales/CustomerOrderHistory.tsx \
        frontend/src/pages/sales/ProductCustomerReport.tsx \
        frontend/src/pages/sales/SalesByProductSummary.tsx \
        frontend/src/pages/sales/SalesByProductDetails.tsx \
        frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
        frontend/src/pages/sales/SalesOrderSummary.tsx \
        frontend/src/pages/sales/CustomerPaymentDetails.tsx
git commit -m "fix: use formatDate in sales report pages"

# After customer pages
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "fix: use formatDate in CustomersPage"
```

---

### Task 8: Fix inventory pages

**Files:**
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx:583,657`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx:562`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx:501`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx:502`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx:437,464`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx:428,431,458`

**Step 1: Read each file and check existing imports**

**Step 2: Add `formatDate` to imports and replace inline calls**

**Step 3: Commit**

```bash
git add frontend/src/pages/inventory/
git commit -m "fix: use formatDate in inventory pages"
```

---

### Task 9: Fix settings pages

**Files:**
- Modify: `frontend/src/pages/settings/PriceListDetailsPage.tsx:171`
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx:219`
- Modify: `frontend/src/pages/settings/PrintSettings/TemplatePreview.tsx:196`

**Step 1: Read each file**

**Step 2: Add `formatDate` import and replace calls**

**Step 3: Commit**

```bash
git add frontend/src/pages/settings/PriceListDetailsPage.tsx \
        frontend/src/pages/settings/PriceListsPage.tsx \
        frontend/src/pages/settings/PrintSettings/TemplatePreview.tsx
git commit -m "fix: use formatDate in settings pages"
```

---

### Task 10: Fix dialog components

**Files:**
- Modify: `frontend/src/components/sales/DeletedCustomersDialog.tsx:238,525`
- Modify: `frontend/src/components/sales/DeletedPaymentsDialog.tsx:189`
- Modify: `frontend/src/components/sales/DeletedOrdersDialog.tsx:502`
- Modify: `frontend/src/components/inventory/MovementHistoryTab.tsx:94`
- Modify: `frontend/src/components/inventory/DeletedProductsDialog.tsx:239,509`
- Modify: `frontend/src/components/inventory/DeletedCategoriesDialog.tsx:240,486`
- Modify: `frontend/src/components/inventory/OrderHistoryTab.tsx:76`
- Modify: `frontend/src/components/purchasing/DeletedSuppliersDialog.tsx:219,502`
- Modify: `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx:470`
- Modify: `frontend/src/components/backup/RestoreConfirmationDialog.tsx:112`

**Step 1: Read each file and check existing imports**

**Step 2: Add `formatDate` to imports and replace calls**

**Step 3: Commit**

```bash
git add frontend/src/components/
git commit -m "fix: use formatDate in dialog components"
```

---

## Phase 3 — Verify No Remaining Direct Calls

### Task 11: Audit for remaining direct toLocaleDateString calls

**Step 1: Run grep to find any remaining bypasses**

```bash
grep -rn "toLocaleDateString\|toLocaleString" frontend/src/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "formatters.ts" \
  | grep -v "test\|spec\|__tests__"
```

Expected: Zero results (or only chart-related / form-input related usage that is intentionally excluded).

**Step 2: If any remain, fix them**

Follow the same pattern: add `formatDate` import, replace the call.

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: remove remaining direct toLocaleDateString calls"
```

---

## Phase 4 — Final Verification

### Task 12: Run type-check and visual verification

**Step 1: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No new errors. If errors appear, check that `formatDate` receives a compatible argument type (`Date | string | null | undefined`).

**Step 2: Visual inspection checklist**

Navigate to each of these pages and confirm dates show as `DD/MM/YYYY`:

- [ ] Dashboard (`/`)
- [ ] Purchase Orders list (`/purchasing`)
- [ ] Purchase Order detail page
- [ ] Sales Orders list (`/sales`)
- [ ] Invoice detail page
- [ ] Customers list
- [ ] Accounting journal entries
- [ ] Trial Balance report
- [ ] General Ledger report
- [ ] Inventory categories page
- [ ] Any date picker — verify it still works correctly

**Step 3: Final commit if any stragglers fixed**

```bash
git add -A
git commit -m "fix: final date format cleanup after visual verification"
```

---

## Success Criteria

- All read-only/displayed dates show `DD/MM/YYYY` (e.g., `20/02/2026`)
- All displayed date-times show `DD/MM/YYYY HH:mm` (e.g., `20/02/2026 14:30`)
- `<input type="date">` fields still work correctly (value remains `YYYY-MM-DD`)
- `npm run type-check` passes with no new errors
- No console errors related to date formatting
