# Design: DOM-based XSS Fix — Report Printing & Notifications (Issue #500)

**Date:** 2026-05-02  
**Issue:** [#500](https://github.com/blur88/erp2/issues/500) — security: fix DOM-based XSS in report generation and notifications (Alert #36)  
**CWE:** CWE-79 — Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')

---

## Problem

CodeQL flagged `js/xss-through-dom` in two areas:

1. **Report generation:** 18 report components build HTML strings and write them to a new window via `document.write`. All user-controlled data is escaped with the custom `escapeHtml()` utility before insertion, but `document.write` is a high-risk sink and the pattern provides no defense-in-depth — a future change that introduces unescaped data would immediately result in XSS.

2. **Notifications:** `showError(msg)` was flagged as potentially reinterpreting HTML. This is a **false positive** — messages are rendered as React JSX text nodes (`{snackbar.message}`), which React escapes automatically. There is no `innerHTML`, `dangerouslySetInnerHTML`, or DOM sink in the notification path.

---

## Decision

Apply defense-in-depth to the report printing path using **DOMPurify** as a final sanitization layer at the `document.write` sink. This is the OWASP-recommended approach and what CodeQL expects to see at a DOM sink.

The notification path requires no code change. The false positive will be documented for audit purposes.

---

## Architecture

### New utility: `src/utils/printReport.ts`

Single exported function:

```ts
printReport(html: string, title: string): void
```

Responsibilities:
1. Sanitize `html` with `DOMPurify.sanitize()` — strips any injected scripts from user-supplied data
2. Open `window.open('', '_blank')` — return early if blocked
3. Write sanitized HTML to the new window via `doc.write(sanitized)` + `doc.close()`
4. Inject `window.print()` programmatically on the document object after writing — this keeps the intentional print-trigger script separate from the sanitized HTML content, so DOMPurify never needs to pass `<script>` tags through

### DOMPurify configuration

```ts
DOMPurify.sanitize(html, {
  WHOLE_DOCUMENT: true,
  FORCE_BODY: false,
  ADD_TAGS: ['style'],
})
```

- `WHOLE_DOCUMENT: true` — preserves `<html>`, `<head>`, `<body>` structure needed for print
- `FORCE_BODY: false` — don't wrap content in a `<body>` tag
- `ADD_TAGS: ['style']` — preserve `<style>` blocks for print CSS
- Scripts are stripped by default — intentional, since `window.print()` is injected programmatically after sanitization

### Package additions

Add to `frontend/package.json` dependencies:
- `dompurify`
- `@types/dompurify`

### Per-report change (19 files)

Replace the inline block:
```ts
const printWindow = window.open('', '_blank')
if (!printWindow) return
// ... build html string ...
const doc = printWindow.document
doc.open()
doc.write(html)
doc.close()
```

With:
```ts
printReport(html, reportTitle)
```

The HTML string construction (data formatting, `escapeHtml` calls, table building) remains unchanged in each component. Only the sink is centralized.

**Files affected:**
- `src/pages/sales/SalesOrderSummary.tsx`
- `src/pages/sales/CustomerOrderHistory.tsx`
- `src/pages/sales/CustomerPaymentByOrder.tsx`
- `src/pages/sales/CustomerPaymentDetails.tsx`
- `src/pages/sales/CustomerPaymentSummary.tsx`
- `src/pages/sales/ProductCustomerReport.tsx`
- `src/pages/sales/SalesByProductDetails.tsx`
- `src/pages/sales/SalesByProductSummary.tsx`
- `src/pages/sales/SalesOrderProfitReport.tsx`
- `src/pages/inventory/HistoricalInventoryReport.tsx`
- `src/pages/inventory/InventorySummaryReport.tsx`
- `src/pages/inventory/MovementSummaryReport.tsx`
- `src/pages/inventory/PriceListReport.tsx`
- `src/pages/inventory/ProductCostReport.tsx`
- `src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `src/pages/purchasing/PurchaseOrderSummary.tsx`
- `src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `src/pages/purchasing/VendorProductListReport.tsx`

---

## Edge Cases

**DOMPurify in non-browser environment:** Not applicable — this is a browser-only React app with no SSR. Import directly from `dompurify`.

**`window.open` blocked:** All 18 files already guard with `if (!printWindow) return`. No change needed.

**Sanitization stripping legitimate content:** All user data is `escapeHtml`-encoded before entering the HTML string. DOMPurify sees only safe encoded text and structural HTML. No legitimate content is stripped. The `<style>` block is explicitly allowed via `ADD_TAGS`.

**Vestigial page-number script in `SalesOrderSummary.tsx`:** A `<script>document.write("Page " + pageNum)</script>` in the footer div is non-functional (the variable is never in scope at that point). DOMPurify strips it — no behavioral regression.

---

## Notifications Audit

`useNotification.tsx` is **not vulnerable**.

- Messages render as React JSX text nodes: `{snackbar.message}` — React escapes text content automatically
- No `dangerouslySetInnerHTML`, no `innerHTML`, no DOM sink exists in the notification path
- Error messages from API responses pass through `getErrorMessage()` in `errorMessage.ts`, which extracts a plain string with no HTML interpretation

**Action:** No code change. CodeQL alert for notifications is a false positive. Close with this rationale.

---

## Testing

- No new unit tests needed for `printReport.ts` — DOMPurify is a well-tested library; the utility has no logic to test beyond the DOMPurify call
- Existing report component tests mock `window.open` and do not test the print path — no test changes required
- Manual verification: open each report type, trigger print, confirm the print dialog appears and the output looks correct

---

## Out of Scope

- Replacing `document.write` with an iframe `srcdoc` approach — unnecessary complexity, doesn't improve the security guarantee
- Refactoring HTML string construction in report components — the building logic is correct and data-specific; centralizing it would not improve security
- Adding DOMPurify to the notification path — confirmed false positive, no DOM sink exists
