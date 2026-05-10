# XSS Prevention in Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate XSS vulnerabilities in all 19 report pages by creating a centralized `escapeHtml` utility and applying it to every dynamic value injected into print HTML strings.

**Architecture:** A single `escapeHtml` function in `frontend/src/utils/security.ts` accepts `string | number | boolean | null | undefined` and returns a safely escaped string. Every report page imports this function and wraps all dynamic values passed into the print HTML template — titles, group labels, cell values, date range text, and filter text. `RegionalSettingsPage.tsx` is hardened by coercing error messages to `String()` before rendering.

**Tech Stack:** TypeScript, React 19, Vitest (frontend tests)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/utils/security.ts` | `escapeHtml` utility |
| Create | `frontend/src/utils/__tests__/security.test.ts` | Unit tests for `escapeHtml` |
| Modify | `frontend/src/pages/inventory/HistoricalInventoryReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/inventory/InventorySummaryReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/inventory/MovementSummaryReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/inventory/PriceListReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/inventory/ProductCostReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/purchasing/VendorProductListReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/CustomerOrderHistory.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/CustomerPaymentByOrder.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/CustomerPaymentDetails.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/CustomerPaymentSummary.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/ProductCustomerReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/SalesByProductDetails.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/SalesByProductSummary.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/SalesOrderProfitReport.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/sales/SalesOrderSummary.tsx` | Escape print HTML |
| Modify | `frontend/src/pages/settings/RegionalSettingsPage.tsx` | Harden error message handling |

---

## What needs escaping (pattern reference)

Every report page follows the same structure inside `handleExportPDF`:

1. **`reportTitle`** — user-visible report name; injected into `<title>` and `<h1>`
2. **`groupLabel`** — constructed from row field values (e.g. customer name, category name); injected into a `<td>`
3. **`displayValue`** — computed cell value (strings from API data); injected into `<td>`
4. **`dateRangeText` / `filterText` / `filtersText`** — constructed HTML snippets containing date strings and category names from API data; injected directly into the template body
5. **`columnHeaders[col] || col`** — column header labels; injected into `<th>`

Numeric/currency values (`formatCurrency(...)`, `toLocaleString()`, `Math.round(...)`) are safe — they produce only digits, commas, currency symbols, and decimals. Do **not** wrap those.

`formatDate(dateFrom)` / `formatDate(dateTo)` produce locale-formatted date strings (e.g. `"01 May 2026"`) — escape these too since the underlying value comes from user input or API data.

---

### Task 1: Create `escapeHtml` utility with tests

**Files:**
- Create: `frontend/src/utils/security.ts`
- Create: `frontend/src/utils/__tests__/security.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/security.test.ts`:

```typescript
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { escapeHtml } from '../security'

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('fish & chips')).toBe('fish &amp; chips')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#039;Brien')
  })

  it('handles numbers', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  it('handles null', () => {
    expect(escapeHtml(null)).toBe('')
  })

  it('handles undefined', () => {
    expect(escapeHtml(undefined)).toBe('')
  })

  it('handles boolean', () => {
    expect(escapeHtml(true)).toBe('true')
  })

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
  })

  it('escapes a full XSS payload', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/utils/__tests__/security.test.ts
```

Expected: FAIL — `Cannot find module '../security'`

- [ ] **Step 3: Create the utility**

Create `frontend/src/utils/security.ts`:

```typescript
export const escapeHtml = (unsafe: string | number | boolean | null | undefined): string => {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/utils/__tests__/security.test.ts
```

Expected: PASS — 10 tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/security.ts frontend/src/utils/__tests__/security.test.ts
git commit -m "feat: add escapeHtml utility for XSS prevention (issue #488)"
```

---

### Task 2: Harden `RegionalSettingsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx:196-204`

This file renders error messages via MUI `<Alert>` (React-rendered, not raw HTML), so there is no `innerHTML` injection. The hardening goal is to ensure network-provided values are coerced to plain strings before use, satisfying CodeQL's taint-tracking analysis.

- [ ] **Step 1: Open the file and locate the error handling**

Read `frontend/src/pages/settings/RegionalSettingsPage.tsx` lines 196–204. You will see:

```typescript
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save settings'
      showError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const error = fetchError ? ((fetchError as any)?.message || 'Failed to load settings') : null
```

- [ ] **Step 2: Apply the fix**

Replace the two lines that extract error messages to explicitly coerce to `String`:

```typescript
    } catch (err: any) {
      const msg = String(err.response?.data?.message || err.message || 'Failed to save settings')
      showError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const error = fetchError ? String((fetchError as any)?.message || 'Failed to load settings') : null
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors related to `RegionalSettingsPage.tsx`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/RegionalSettingsPage.tsx
git commit -m "fix: coerce error messages to string in RegionalSettingsPage (issue #488)"
```

---

### Task 3: Escape `SalesOrderSummary.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`

- [ ] **Step 1: Add the import**

At the top of the file, after existing imports, add:

```typescript
import { escapeHtml } from '@/utils/security'
```

- [ ] **Step 2: Locate the `handleExportPDF` function and apply escaping**

Find the `handleExportPDF` function. Apply `escapeHtml` to all dynamic string values injected into the HTML template.

**Group label** (around line 330–333) — change:
```typescript
        const groupLabel = groupBy === 'customerName' ? `Customer: ${currentGroupValue}` :
                          groupBy === 'inventoryStatus' ? `Inventory: ${currentGroupValue}` :
                          groupBy === 'paymentStatus' ? `Payment: ${currentGroupValue}` : currentGroupValue
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
```
to:
```typescript
        const groupLabel = groupBy === 'customerName' ? `Customer: ${escapeHtml(currentGroupValue)}` :
                          groupBy === 'inventoryStatus' ? `Inventory: ${escapeHtml(currentGroupValue)}` :
                          groupBy === 'paymentStatus' ? `Payment: ${escapeHtml(currentGroupValue)}` : escapeHtml(currentGroupValue)
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
```

**Cell values** (around line 352) — change:
```typescript
        tableRows += `<td>${displayValue || ''}</td>`
```
to:
```typescript
        tableRows += `<td>${escapeHtml(displayValue)}</td>`
```

**Date range text** (around lines 424–428) — change:
```typescript
      dateRangeText = `<p><strong>Date Range:</strong> ${formatDate(dateFrom)} - ${formatDate(dateTo)}</p>`
    } else if (dateFrom) {
      dateRangeText = `<p><strong>Date From:</strong> ${formatDate(dateFrom)}</p>`
    } else if (dateTo) {
      dateRangeText = `<p><strong>Date To:</strong> ${formatDate(dateTo)}</p>`
```
to:
```typescript
      dateRangeText = `<p><strong>Date Range:</strong> ${escapeHtml(formatDate(dateFrom))} - ${escapeHtml(formatDate(dateTo))}</p>`
    } else if (dateFrom) {
      dateRangeText = `<p><strong>Date From:</strong> ${escapeHtml(formatDate(dateFrom))}</p>`
    } else if (dateTo) {
      dateRangeText = `<p><strong>Date To:</strong> ${escapeHtml(formatDate(dateTo))}</p>`
```

**HTML template title and heading** (around lines 435–476) — change:
```typescript
          <title>${reportTitle}</title>
```
to:
```typescript
          <title>${escapeHtml(reportTitle)}</title>
```
and:
```typescript
          <h1>${reportTitle}</h1>
```
to:
```typescript
          <h1>${escapeHtml(reportTitle)}</h1>
```

Also escape the inline `document.title` assignment (around line 499):
```typescript
            document.title = '${reportTitle.replace(/'/g, "\\'")}';
```
to:
```typescript
            document.title = '${escapeHtml(reportTitle)}';
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/SalesOrderSummary.tsx
git commit -m "fix: escape dynamic HTML in SalesOrderSummary print template (issue #488)"
```

---

### Task 4: Escape inventory reports (5 files)

**Files:**
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`

Apply the same pattern to each file. Steps are identical for all five — work through them one at a time.

**For each file:**

- [ ] **Step 1: Add the import**

```typescript
import { escapeHtml } from '@/utils/security'
```

- [ ] **Step 2: Escape `reportTitle` in `<title>` and `<h1>`**

Find the HTML template string. Change:
```typescript
          <title>${reportTitle}</title>
```
to:
```typescript
          <title>${escapeHtml(reportTitle)}</title>
```
and:
```typescript
          <h1>${reportTitle}</h1>
```
to:
```typescript
          <h1>${escapeHtml(reportTitle)}</h1>
```

- [ ] **Step 3: Escape group labels**

Find where `groupLabel` is injected into `tableRows`. The pattern looks like:
```typescript
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
```

The variable `groupLabel` is already assembled in the line above it (e.g. `` `Category: ${r.categoryName}` `` or `` `Customer: ${currentGroupValue}` ``). Escape the dynamic parts inside `groupLabel`'s construction — not `groupLabel` itself (since it may include literal HTML like `Category: `).

Example for `HistoricalInventoryReport.tsx` (`getPdfGroupLabel`):
```typescript
  const getPdfGroupLabel = (r: any) => {
    if (groupBy === 'categoryName') {
      return `Category: ${escapeHtml(r.categoryName)}`
    }
    return escapeHtml(r[groupBy])
  }
```

For files where `groupLabel` is inline (not a helper function), escape the dynamic parts inline:
```typescript
        const groupLabel = groupBy === 'categoryName'
          ? `Category: ${escapeHtml(currentGroupValue)}`
          : escapeHtml(currentGroupValue)
```

- [ ] **Step 4: Escape cell `displayValue`**

Find the line that appends cell content to `tableRows`. The pattern is:
```typescript
        tableRows += `<td style="${align}">${displayValue || ''}</td>`
```
or:
```typescript
        tableRows += `<td>${displayValue || ''}</td>`
```

Change to:
```typescript
        tableRows += `<td style="${align}">${escapeHtml(displayValue)}</td>`
```
or:
```typescript
        tableRows += `<td>${escapeHtml(displayValue)}</td>`
```

Note: `escapeHtml` already handles `null`/`undefined` by returning `''`, so the `|| ''` is no longer needed but is harmless to leave.

- [ ] **Step 5: Escape `dateRangeText` / `filterText` / `filtersText`**

Some inventory files use `filterText` (an array) assembled like:
```typescript
    if (selectedCategory) {
      const category = categories.find(c => c.id === selectedCategory)
      if (category) {
        filterText.push(`<p><strong>Category:</strong> ${category.name}</p>`)
      }
    }
```

Escape the dynamic value:
```typescript
        filterText.push(`<p><strong>Category:</strong> ${escapeHtml(category.name)}</p>`)
```

For files using `dateRangeText` with date strings:
```typescript
      dateRangeText = `<p><strong>Date Range:</strong> ${formatDate(dateFrom)} - ${formatDate(dateTo)}</p>`
```
Change to:
```typescript
      dateRangeText = `<p><strong>Date Range:</strong> ${escapeHtml(formatDate(dateFrom))} - ${escapeHtml(formatDate(dateTo))}</p>`
```

- [ ] **Step 6: Escape column headers**

Find:
```typescript
                ${selectedColumns.map(col => `<th>${columnHeaders[col] || col}</th>`).join('')}
```
Change to:
```typescript
                ${selectedColumns.map(col => `<th>${escapeHtml(columnHeaders[col] || col)}</th>`).join('')}
```

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No new type errors

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
  frontend/src/pages/inventory/InventorySummaryReport.tsx \
  frontend/src/pages/inventory/MovementSummaryReport.tsx \
  frontend/src/pages/inventory/PriceListReport.tsx \
  frontend/src/pages/inventory/ProductCostReport.tsx
git commit -m "fix: escape dynamic HTML in inventory report print templates (issue #488)"
```

---

### Task 5: Escape purchasing reports (5 files)

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`

Apply the same pattern as Task 4. For each file:

- [ ] **Step 1: Add the import**

```typescript
import { escapeHtml } from '@/utils/security'
```

- [ ] **Step 2: Escape `reportTitle` in `<title>` and `<h1>`**

```typescript
          <title>${escapeHtml(reportTitle)}</title>
          ...
          <h1>${escapeHtml(reportTitle)}</h1>
```

`PurchaseOrderSummary.tsx` has an additional inline script setting `document.title` (around line 435):
```typescript
            document.title = '${reportTitle.replace(/'/g, "\\'")}';
```
Change to:
```typescript
            document.title = '${escapeHtml(reportTitle)}';
```

- [ ] **Step 3: Escape group labels**

Same pattern as Task 4 Step 3. Escape dynamic values inside the `groupLabel` construction, not the surrounding literal HTML.

- [ ] **Step 4: Escape cell `displayValue`**

Same pattern as Task 4 Step 4.

- [ ] **Step 5: Escape `dateRangeText` / `filterText`**

Same pattern as Task 4 Step 5.

`VendorPaymentDetailsReport.tsx` uses `documentElement.innerHTML` instead of `document.write` — same template literal approach, so the same escaping applies.

- [ ] **Step 6: Escape column headers**

Same pattern as Task 4 Step 6.

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No new type errors

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderSummary.tsx \
  frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx \
  frontend/src/pages/purchasing/VendorProductListReport.tsx
git commit -m "fix: escape dynamic HTML in purchasing report print templates (issue #488)"
```

---

### Task 6: Escape remaining sales reports (8 files)

**Files:**
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`

Apply the same pattern as Tasks 4 and 5. For each file:

- [ ] **Step 1: Add the import**

```typescript
import { escapeHtml } from '@/utils/security'
```

- [ ] **Step 2: Escape `reportTitle` in `<title>` and `<h1>`**

```typescript
          <title>${escapeHtml(reportTitle)}</title>
          ...
          <h1>${escapeHtml(reportTitle)}</h1>
```

Each of these sales files also has an inline script setting `document.title`. For each occurrence of:
```typescript
            document.title = '${reportTitle.replace(/'/g, "\\'")}';
```
Change to:
```typescript
            document.title = '${escapeHtml(reportTitle)}';
```

- [ ] **Step 3: Escape group labels**

Same pattern as Task 4 Step 3.

- [ ] **Step 4: Escape cell `displayValue`**

Same pattern as Task 4 Step 4.

- [ ] **Step 5: Escape `dateRangeText`**

Same pattern as Task 4 Step 5.

- [ ] **Step 6: Escape column headers**

Same pattern as Task 4 Step 6.

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No new type errors

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/pages/sales/CustomerOrderHistory.tsx \
  frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
  frontend/src/pages/sales/CustomerPaymentDetails.tsx \
  frontend/src/pages/sales/CustomerPaymentSummary.tsx \
  frontend/src/pages/sales/ProductCustomerReport.tsx \
  frontend/src/pages/sales/SalesByProductDetails.tsx \
  frontend/src/pages/sales/SalesByProductSummary.tsx \
  frontend/src/pages/sales/SalesOrderProfitReport.tsx
git commit -m "fix: escape dynamic HTML in sales report print templates (issue #488)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run the security utility tests**

```bash
cd frontend && npx vitest run src/utils/__tests__/security.test.ts
```

Expected: 10 tests pass

- [ ] **Step 2: Run a broader test sweep to check for regressions**

```bash
cd frontend && npx vitest run src/pages/sales src/pages/inventory src/pages/purchasing src/pages/settings
```

Expected: All existing tests pass (no regressions)

- [ ] **Step 3: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors

- [ ] **Step 4: Confirm all 19 report files import `escapeHtml`**

```bash
grep -rL "escapeHtml" \
  frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
  frontend/src/pages/inventory/InventorySummaryReport.tsx \
  frontend/src/pages/inventory/MovementSummaryReport.tsx \
  frontend/src/pages/inventory/PriceListReport.tsx \
  frontend/src/pages/inventory/ProductCostReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderSummary.tsx \
  frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx \
  frontend/src/pages/purchasing/VendorProductListReport.tsx \
  frontend/src/pages/sales/CustomerOrderHistory.tsx \
  frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
  frontend/src/pages/sales/CustomerPaymentDetails.tsx \
  frontend/src/pages/sales/CustomerPaymentSummary.tsx \
  frontend/src/pages/sales/ProductCustomerReport.tsx \
  frontend/src/pages/sales/SalesByProductDetails.tsx \
  frontend/src/pages/sales/SalesByProductSummary.tsx \
  frontend/src/pages/sales/SalesOrderProfitReport.tsx \
  frontend/src/pages/sales/SalesOrderSummary.tsx
```

Expected: No output (all files contain `escapeHtml`)

- [ ] **Step 5: Confirm no unescaped `reportTitle` in HTML templates**

```bash
grep -rn "title>\${reportTitle}\|<h1>\${reportTitle}" \
  frontend/src/pages/inventory/ \
  frontend/src/pages/purchasing/ \
  frontend/src/pages/sales/
```

Expected: No output

- [ ] **Step 6: Close the issue via PR**

Create a PR that references `Closes #488`. Title: `fix: systemic XSS prevention in report print templates (#488)`.
