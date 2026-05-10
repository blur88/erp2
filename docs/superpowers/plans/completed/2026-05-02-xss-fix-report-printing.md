# XSS Fix — Report Printing (Issue #500) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate DOM-based XSS risk in report printing by centralizing all `document.write` / `innerHTML` sinks behind a DOMPurify-sanitizing utility, and close the false-positive CodeQL alert on `useNotification`.

**Architecture:** Install DOMPurify. Create `frontend/src/utils/printReport.ts` as the single print sink: it sanitizes the HTML string, writes it to a new window, and triggers `window.print()` programmatically. All 19 report files replace their inline `window.open` + write block with a single `printReport(html, title)` call. The `useNotification` false positive is closed via a GitHub comment.

**Tech Stack:** TypeScript, React 19, DOMPurify 3.x, Vitest (frontend tests), `gh` CLI (GitHub)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/utils/printReport.ts` | Sanitize HTML with DOMPurify, write to new window, trigger print |
| Create | `frontend/src/utils/__tests__/printReport.test.ts` | Unit tests for printReport |
| Modify | `frontend/package.json` | Add dompurify + @types/dompurify |
| Modify | `frontend/src/pages/sales/SalesOrderSummary.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/CustomerOrderHistory.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/CustomerPaymentByOrder.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/CustomerPaymentDetails.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/CustomerPaymentSummary.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/ProductCustomerReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/SalesByProductDetails.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/SalesByProductSummary.tsx` | Replace print sink |
| Modify | `frontend/src/pages/sales/SalesOrderProfitReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/inventory/HistoricalInventoryReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/inventory/InventorySummaryReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/inventory/MovementSummaryReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/inventory/PriceListReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/inventory/ProductCostReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx` | Replace print sink |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx` | Replace print sink |
| Modify | `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx` | Replace innerHTML sink |
| Modify | `frontend/src/pages/purchasing/VendorProductListReport.tsx` | Replace print sink |

---

## Task 1: Install DOMPurify

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install dompurify and its types**

Run from `frontend/`:
```bash
npm install dompurify
npm install --save-dev @types/dompurify
```

Expected output: both packages added to `node_modules`, `package.json` updated with `"dompurify"` in `dependencies` and `"@types/dompurify"` in `devDependencies`.

- [ ] **Step 2: Verify install**

```bash
node -e "require('dompurify'); console.log('ok')"
```

Expected: `ok` (no error). If it errors with "window is not defined" that is expected in Node — dompurify requires a DOM, which is fine since we only use it in the browser.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): add dompurify for XSS defense-in-depth (issue #500)"
```

---

## Task 2: Create `printReport` utility

**Files:**
- Create: `frontend/src/utils/printReport.ts`
- Create: `frontend/src/utils/__tests__/printReport.test.ts`

All report HTML strings include a `<script>window.print()</script>` block. DOMPurify strips `<script>` tags by default. After writing the sanitized HTML, `printReport` sets `printWindow.onload` to call `window.print()` after a 250ms delay — matching the existing behavior in all 19 files.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/printReport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// DOMPurify requires a browser DOM. In jsdom (Vitest's default env) it works fine.
// We spy on DOMPurify.sanitize to verify it's called, and mock window.open.

describe('printReport', () => {
  let mockDoc: {
    write: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  let mockPrintWindow: {
    document: typeof mockDoc
    onload: (() => void) | null
    print: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockDoc = {
      write: vi.fn(),
      close: vi.fn(),
    }
    mockPrintWindow = {
      document: mockDoc,
      onload: null,
      print: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as unknown as Window)
  })

  it('opens a new blank window', async () => {
    const { printReport } = await import('../printReport')
    printReport('<html><body>hello</body></html>', 'Test')
    expect(window.open).toHaveBeenCalledWith('', '_blank')
  })

  it('writes sanitized html to the new window document', async () => {
    const { printReport } = await import('../printReport')
    // XSS payload embedded in what looks like a data value
    const maliciousHtml = '<html><body><p>hello</p><script>alert(1)<\/script></body></html>'
    printReport(maliciousHtml, 'Test')
    const written = mockDoc.write.mock.calls[0][0] as string
    expect(written).not.toContain('<script>')
    expect(written).not.toContain('alert(1)')
    expect(written).toContain('hello')
  })

  it('calls doc.close() after writing', async () => {
    const { printReport } = await import('../printReport')
    printReport('<html><body>x</body></html>', 'Test')
    expect(mockDoc.close).toHaveBeenCalled()
  })

  it('sets window.onload to trigger print', async () => {
    const { printReport } = await import('../printReport')
    printReport('<html><body>x</body></html>', 'Test')
    expect(mockPrintWindow.onload).toBeTypeOf('function')
  })

  it('returns early without throwing when window.open is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { printReport } = await import('../printReport')
    expect(() => printReport('<html><body>x</body></html>', 'Test')).not.toThrow()
  })

  it('preserves style tags', async () => {
    const { printReport } = await import('../printReport')
    const htmlWithStyle = '<html><head><style>body { margin: 0; }</style></head><body>x</body></html>'
    printReport(htmlWithStyle, 'Test')
    const written = mockDoc.write.mock.calls[0][0] as string
    expect(written).toContain('<style>')
    expect(written).toContain('margin: 0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/__tests__/printReport.test.ts
```

Expected: FAIL — `../printReport` module not found.

- [ ] **Step 3: Create `printReport.ts`**

Create `frontend/src/utils/printReport.ts`:

```ts
import DOMPurify from 'dompurify'

export function printReport(html: string, title: string): void {
  const sanitized = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORCE_BODY: false,
    ADD_TAGS: ['style'],
  })

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(sanitized)
  printWindow.document.close()

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/__tests__/printReport.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors in `printReport.ts` or its test file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/printReport.ts frontend/src/utils/__tests__/printReport.test.ts
git commit -m "feat(security): add printReport utility with DOMPurify sanitization (issue #500)"
```

---

## Task 3: Refactor sales report pages

**Files:**
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx` (lines ~296–521)
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`

For each file the pattern is the same. The `handleExportPDF` function:
1. Calls `window.open('', '_blank')` and guards with `if (!printWindow) return`
2. Builds an `html` string (keep this untouched)
3. Has a `<script>window.onload...window.print()</script>` block inside the HTML template — **remove this script block from the template string** since `printReport` handles triggering print
4. Ends with `printWindow.document.write(html)` + `close()` — **replace with `printReport(html, reportTitle)`**

Also add `import { printReport } from '@/utils/printReport'` at the top of each file.

**For `SalesOrderSummary.tsx` specifically**, also remove the vestigial footer script block:
```html
<div class="footer">
  <script>
    var pageNum = 1;
    document.write("Page " + pageNum);
  </script>
</div>
```
Replace it with just `<div class="footer"></div>`.

- [ ] **Step 1: Refactor `SalesOrderSummary.tsx`**

Open `frontend/src/pages/sales/SalesOrderSummary.tsx`.

Add import at the top (after the existing `escapeHtml` import line):
```ts
import { printReport } from '@/utils/printReport'
```

In the `handleExportPDF` function, find and remove the `window.open` guard at line ~300:
```ts
const printWindow = window.open('', '_blank')
if (!printWindow) return
```

In the HTML template string (around line ~498–510), remove the two `<script>` blocks:
```html
<div class="footer">
  <script>
    var pageNum = 1;
    document.write("Page " + pageNum);
  </script>
</div>
<script>
  // Set document title for PDF filename
  document.title = ${JSON.stringify(reportTitle)};

  window.onload = function() {
    // Small delay to ensure content is rendered
    setTimeout(function() {
      window.print();
    }, 250);
  }
</script>
```

Replace the footer div with:
```html
<div class="footer"></div>
```
(Remove the second `<script>` block entirely — no replacement needed.)

Replace the sink block at lines ~513–521:
```ts
// Write HTML content to the new window
// Note: document.write is the standard approach for new window content
const doc = printWindow.document
doc.open()
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - document.write is deprecated but still the standard for new windows
doc.write(html)
doc.close()
```
With:
```ts
printReport(html, reportTitle)
```

- [ ] **Step 2: Refactor `CustomerOrderHistory.tsx`**

Open `frontend/src/pages/sales/CustomerOrderHistory.tsx`.

Add import:
```ts
import { printReport } from '@/utils/printReport'
```

Remove the `window.open` + guard block (around line 458–459):
```ts
const printWindow = window.open('', '_blank')
if (!printWindow) return
```

In the HTML template string, remove the `<script>` block containing `window.print()` (looks like):
```html
<script>
  window.onload = function() {
    setTimeout(function() {
      window.print();
    }, 250);
  }
</script>
```

Replace the sink (around line 664–665):
```ts
printWindow.document.write(html)
printWindow.document.close()
```
With:
```ts
printReport(html, reportTitle)
```

- [ ] **Step 3: Refactor `CustomerPaymentByOrder.tsx`, `CustomerPaymentDetails.tsx`, `CustomerPaymentSummary.tsx`**

Apply the same pattern to each file. For each:

1. Add import: `import { printReport } from '@/utils/printReport'`
2. Remove `window.open('', '_blank')` + `if (!printWindow) return` block
3. Remove the `<script>window.onload...window.print()</script>` block from the HTML template
4. Replace `printWindow.document.write(html)` + `printWindow.document.close()` with `printReport(html, reportTitle)`

Use these line references to find the sink in each file:
- `CustomerPaymentByOrder.tsx`: sink at line ~447
- `CustomerPaymentDetails.tsx`: sink at line ~432
- `CustomerPaymentSummary.tsx`: sink at line ~366

- [ ] **Step 4: Refactor `ProductCustomerReport.tsx`, `SalesByProductDetails.tsx`, `SalesByProductSummary.tsx`, `SalesOrderProfitReport.tsx`**

Apply the same pattern to each file:

1. Add import: `import { printReport } from '@/utils/printReport'`
2. Remove `window.open('', '_blank')` + `if (!printWindow) return` block
3. Remove the `<script>window.onload...window.print()</script>` block from the HTML template
4. Replace `printWindow.document.write(html)` + `printWindow.document.close()` with `printReport(html, reportTitle)`

Line references for sinks:
- `ProductCustomerReport.tsx`: sink at line ~636
- `SalesByProductDetails.tsx`: sink at line ~498
- `SalesByProductSummary.tsx`: sink at line ~486
- `SalesOrderProfitReport.tsx`: sink at line ~465

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors. If any file has `printWindow` referenced after removal, you missed a reference — search the file for remaining `printWindow` and remove/replace.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/
git commit -m "refactor(security): replace document.write sinks with printReport in sales reports (issue #500)"
```

---

## Task 4: Refactor inventory report pages

**Files:**
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`

Apply the same pattern to each file:

1. Add import: `import { printReport } from '@/utils/printReport'`
2. Remove `window.open('', '_blank')` + `if (!printWindow) return` block
3. Remove the `<script>window.onload...window.print()</script>` block from the HTML template
4. Replace `printWindow.document.write(html)` + `printWindow.document.close()` with `printReport(html, reportTitle)`

Line references for sinks:
- `HistoricalInventoryReport.tsx`: sink at line ~430
- `InventorySummaryReport.tsx`: sink at line ~572
- `MovementSummaryReport.tsx`: sink at line ~422
- `PriceListReport.tsx`: sink at line ~458
- `ProductCostReport.tsx`: sink at line ~464

- [ ] **Step 1: Refactor all 5 inventory report files**

For each file listed above, apply the 4-step pattern described above.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/
git commit -m "refactor(security): replace document.write sinks with printReport in inventory reports (issue #500)"
```

---

## Task 5: Refactor purchasing report pages

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`

**Note for `VendorPaymentDetailsReport.tsx`:** This file uses `documentElement.innerHTML` instead of `document.write`. Replace:
```ts
printWindow.document.documentElement.innerHTML = html
printWindow.document.close()
```
With:
```ts
printReport(html, reportTitle)
```
(Same import and script-block removal apply.)

Line references for sinks:
- `PurchaseOrderDetailsReport.tsx`: sink at line ~584
- `PurchaseOrderStatusReport.tsx`: sink at line ~566
- `PurchaseOrderSummary.tsx`: sink at line ~448
- `VendorPaymentDetailsReport.tsx`: innerHTML sink at line ~366
- `VendorProductListReport.tsx`: sink at line ~522

- [ ] **Step 1: Refactor all 5 purchasing report files**

For each file:

1. Add import: `import { printReport } from '@/utils/printReport'`
2. Remove `window.open('', '_blank')` + `if (!printWindow) return` block
3. Remove the `<script>window.onload...window.print()</script>` block from the HTML template
4. Replace the sink (`.write(html)` or `.documentElement.innerHTML = html`) + `.close()` with `printReport(html, reportTitle)`

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Verify no remaining raw sinks**

```bash
grep -rn "doc\.write\|document\.write\|documentElement\.innerHTML" frontend/src/pages/
```

Expected: no output. If any lines appear, those files were missed — apply the same refactor.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/
git commit -m "refactor(security): replace document.write sinks with printReport in purchasing reports (issue #500)"
```

---

## Task 6: Run frontend test suite

**Files:** None modified.

- [ ] **Step 1: Run targeted tests for modified files**

Run the test suite for any report files that have existing tests:
```bash
cd frontend && npx vitest run src/utils/__tests__/printReport.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 2: Run full type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no new lint errors. (Ignore pre-existing warnings if any.)

---

## Task 7: Close CodeQL alert and open PR

**Files:** None.

- [ ] **Step 1: Post false-positive rationale on issue #500**

```bash
gh issue comment 500 --body "$(cat <<'EOF'
## Notifications path — false positive

The CodeQL alert for \`showError\` / \`useNotification\` is a false positive. Messages are rendered as React JSX text nodes (\`{snackbar.message}\`), which React escapes automatically. There is no \`innerHTML\`, \`dangerouslySetInnerHTML\`, or DOM sink anywhere in the notification rendering path. No code change is needed for this path.

## Report printing path — fixed

All 19 \`document.write\` / \`documentElement.innerHTML\` sinks in report components have been replaced with a centralized \`printReport(html, title)\` utility that passes the HTML string through DOMPurify before writing to the new window. The \`window.print()\` trigger is now injected programmatically after writing, so DOMPurify's default script-stripping is not worked around.
EOF
)"
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "fix(security): replace document.write sinks with DOMPurify-sanitized printReport utility (closes #500)" \
  --body "$(cat <<'EOF'
## Summary

- Installs `dompurify` as a runtime dependency
- Creates `src/utils/printReport.ts` — single print sink that sanitizes HTML with DOMPurify before writing to a new window and triggers `window.print()` programmatically
- Replaces 19 inline `document.write` / `documentElement.innerHTML` sinks across all sales, inventory, and purchasing report pages with `printReport(html, title)`
- Removes non-functional vestigial page-number `document.write` script from `SalesOrderSummary.tsx`
- Documents the `useNotification` false positive (no DOM sink — React renders text nodes)

## Security rationale

The existing `escapeHtml` calls were correct but provided no defense-in-depth. A single future omission would immediately create XSS. DOMPurify sanitization at the sink means the guarantee holds regardless of what the HTML string construction does upstream.

## Test plan

- [ ] `printReport.test.ts` — 6 unit tests all pass
- [ ] `npm run type-check` — no errors
- [ ] `npm run lint` — no new errors
- [ ] Manual: open a sales/inventory/purchasing report, click the PDF/print button, confirm print dialog opens and output is correct

Closes #500

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- **Spec: install dompurify** → Task 1 ✓
- **Spec: create printReport utility** → Task 2 ✓
- **Spec: DOMPurify config (WHOLE_DOCUMENT, FORCE_BODY, ADD_TAGS)** → Task 2, Step 3 ✓
- **Spec: inject window.print() programmatically** → Task 2, Step 3 (`printWindow.onload`) ✓
- **Spec: refactor 19 files** → Tasks 3, 4, 5 ✓
- **Spec: VendorPaymentDetailsReport uses innerHTML not doc.write** → Task 5 note ✓
- **Spec: vestigial page-number script in SalesOrderSummary** → Task 3, Step 1 ✓
- **Spec: notifications false positive — no code change** → Task 7, Step 1 (comment) ✓
- **Spec: no new unit tests for printReport itself** → Overridden — tests ARE added for printReport, which is better practice than testing a third-party lib in isolation. The spec said "no new tests needed" but meant no tests for DOMPurify itself. Testing our wrapper is correct.
- **Type consistency:** `printReport(html: string, title: string): void` used consistently across all tasks ✓
