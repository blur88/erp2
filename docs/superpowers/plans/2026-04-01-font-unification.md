# Font Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all hardcoded font declarations from components and centralise font management in the MUI theme.

**Architecture:** Four surgical changes — strip the redundant `global.css` body font, tighten the theme font stack + add a `MuiButtonBase` override, then bulk-remove per-component `fontFamily` props from 31 components (13 `monospace`, 18 `inherit`), and finally update 19 print report windows to load and use Roboto.

**Tech Stack:** React 19, Material UI v7, TypeScript, Vitest

---

## Files Modified

| File | Change |
|---|---|
| `frontend/src/styles/global.css` | Remove `font-family` from `body` |
| `frontend/src/styles/theme.ts` | Simplify font stack; add `MuiButtonBase` override |
| `frontend/src/pages/settings/RegionalSettingsPage.tsx` | Remove `fontFamily="monospace"` |
| `frontend/src/pages/settings/DocumentNumbersPage.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/pages/auth/LoginPage.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/components/backup/BackupDetailsDialog.tsx` | Remove 4× `fontFamily: 'monospace'` |
| `frontend/src/components/backup/RestoreConfirmationDialog.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/components/backup/BackupList.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/components/common/TopBar.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/components/auth/IdleWarningDialog.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/components/calculator/components/CalculatorDisplay.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/components/calculator/components/CalculatorHistory.tsx` | Remove `fontFamily: 'monospace'` |
| `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` | Remove 3× `fontFamily: 'inherit'` |
| `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx` | Remove 3× `fontFamily: 'inherit'` |
| `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` | Remove 3× `fontFamily: 'inherit'` |
| `frontend/src/pages/sales/PaymentsPage.tsx` | Remove 3× `fontFamily: 'inherit'` |
| `frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx` | Remove 3× `fontFamily: 'inherit'` |
| `frontend/src/pages/sales/components/OrderDetailsPanel.tsx` | Remove 3× `fontFamily: 'inherit'` |
| 19× `frontend/src/pages/{purchasing,inventory,sales}/*Report*.tsx` + `*Summary.tsx` + `*Details*.tsx` | Add Roboto CDN link; change `Arial` → `Roboto` |

---

### Task 1: Remove redundant font-family from global.css

**Files:**
- Modify: `frontend/src/styles/global.css:15`

- [ ] **Step 1: Remove the font-family declaration from body**

Open `frontend/src/styles/global.css`. The `body` rule currently reads:

```css
body {
  margin: 0;
  padding: 0;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.5;
  color: #ffffff;
  background-color: #121212;
}
```

Remove only the `font-family` line. Result:

```css
body {
  margin: 0;
  padding: 0;
  line-height: 1.5;
  color: #ffffff;
  background-color: #121212;
}
```

- [ ] **Step 2: Verify no other font-family in global.css**

```bash
grep "font-family" frontend/src/styles/global.css
```

Expected: no output (the only occurrence was line 15).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/global.css
git commit -m "style: remove redundant font-family from global.css body rule"
```

---

### Task 2: Update theme.ts — simplify font stack + add MuiButtonBase override

**Files:**
- Modify: `frontend/src/styles/theme.ts`

- [ ] **Step 1: Simplify the typography.fontFamily**

In `frontend/src/styles/theme.ts`, the `baseThemeOptions` object has a `typography.fontFamily` array join (lines 89–97). Replace the entire array join with a single string:

```ts
typography: {
  fontFamily: '"Roboto", sans-serif',
  // ... rest of typography unchanged
```

- [ ] **Step 2: Add MuiButtonBase override**

In `baseThemeOptions.components`, after the existing `MuiDrawer` entry (around line 258), add:

```ts
MuiButtonBase: {
  styleOverrides: {
    root: {
      fontFamily: 'inherit',
    },
  },
},
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/theme.ts
git commit -m "style: simplify theme font stack and add MuiButtonBase font override"
```

---

### Task 3: Remove fontFamily: 'monospace' from settings pages

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx:392`
- Modify: `frontend/src/pages/settings/DocumentNumbersPage.tsx:193`

- [ ] **Step 1: Remove from RegionalSettingsPage**

In `frontend/src/pages/settings/RegionalSettingsPage.tsx` line 392, change:

```tsx
<Typography variant="body1" fontFamily="monospace">
```

to:

```tsx
<Typography variant="body1">
```

- [ ] **Step 2: Remove from DocumentNumbersPage**

In `frontend/src/pages/settings/DocumentNumbersPage.tsx` around line 193, the `sx` object contains:

```ts
sx={{
  fontFamily: 'monospace',
  color: 'primary.main',
  fontWeight: 600,
  backgroundColor: 'action.hover',
```

Remove the `fontFamily: 'monospace',` line:

```ts
sx={{
  color: 'primary.main',
  fontWeight: 600,
  backgroundColor: 'action.hover',
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/RegionalSettingsPage.tsx frontend/src/pages/settings/DocumentNumbersPage.tsx
git commit -m "style: remove hardcoded monospace font from settings pages"
```

---

### Task 4: Remove fontFamily: 'monospace' from auth components

**Files:**
- Modify: `frontend/src/pages/auth/LoginPage.tsx:248`
- Modify: `frontend/src/components/auth/IdleWarningDialog.tsx:112`

- [ ] **Step 1: Remove from LoginPage**

In `frontend/src/pages/auth/LoginPage.tsx` around line 248, the `Box` sx prop contains `fontFamily: 'monospace'` among other props. Remove only that property:

```tsx
<Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'background.paper', borderRadius: 1 }}>
```

- [ ] **Step 2: Remove from IdleWarningDialog**

In `frontend/src/components/auth/IdleWarningDialog.tsx` around line 112, the sx object contains:

```ts
sx={{
  fontWeight: 700,
  color: `${getColor()}.main`,
  fontFamily: 'monospace',
}}
```

Remove the `fontFamily: 'monospace',` line:

```ts
sx={{
  fontWeight: 700,
  color: `${getColor()}.main`,
}}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/auth/LoginPage.tsx frontend/src/components/auth/IdleWarningDialog.tsx
git commit -m "style: remove hardcoded monospace font from auth components"
```

---

### Task 5: Remove fontFamily: 'monospace' from backup components

**Files:**
- Modify: `frontend/src/components/backup/BackupDetailsDialog.tsx` (4 occurrences)
- Modify: `frontend/src/components/backup/RestoreConfirmationDialog.tsx:102`
- Modify: `frontend/src/components/backup/BackupList.tsx:138`

- [ ] **Step 1: Remove from BackupDetailsDialog (4 occurrences)**

In `frontend/src/components/backup/BackupDetailsDialog.tsx`, remove `fontFamily: 'monospace'` from all 4 locations:

- Line ~77: `sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}` → `sx={{ wordBreak: 'break-all' }}`
- Line ~171: `sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}` → `sx={{ wordBreak: 'break-all' }}`
- Line ~186: remove `fontFamily: 'monospace',` from the sx object (keep other properties)
- Line ~215: remove `fontFamily: 'monospace',` from the sx object (keep other properties)

- [ ] **Step 2: Remove from RestoreConfirmationDialog**

In `frontend/src/components/backup/RestoreConfirmationDialog.tsx` around line 102:

```tsx
secondaryTypographyProps={{ sx: { fontFamily: 'monospace' } }}
```

→

```tsx
secondaryTypographyProps={{}}
```

Or if `secondaryTypographyProps` has no other props, remove it entirely. Check the full prop first:

```bash
grep -n "secondaryTypographyProps" frontend/src/components/backup/RestoreConfirmationDialog.tsx
```

If it only has `fontFamily: 'monospace'`, remove the entire `secondaryTypographyProps` prop.

- [ ] **Step 3: Remove from BackupList**

In `frontend/src/components/backup/BackupList.tsx` around line 138:

```tsx
<Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
```

→

```tsx
<Typography variant="body2">
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/backup/BackupDetailsDialog.tsx frontend/src/components/backup/RestoreConfirmationDialog.tsx frontend/src/components/backup/BackupList.tsx
git commit -m "style: remove hardcoded monospace font from backup components"
```

---

### Task 6: Remove fontFamily: 'monospace' from TopBar and Calculator

**Files:**
- Modify: `frontend/src/components/common/TopBar.tsx:352`
- Modify: `frontend/src/components/calculator/components/CalculatorDisplay.tsx:45`
- Modify: `frontend/src/components/calculator/components/CalculatorHistory.tsx:30`

- [ ] **Step 1: Remove from TopBar**

In `frontend/src/components/common/TopBar.tsx` around line 352, the sx object includes:

```ts
borderRadius: '4px',
px: 0.75,
py: 0.25,
fontFamily: 'monospace',
fontSize: '11px',
color: theme.palette.text.secondary,
flexShrink: 0,
```

Remove the `fontFamily: 'monospace',` line.

- [ ] **Step 2: Remove from CalculatorDisplay**

In `frontend/src/components/calculator/components/CalculatorDisplay.tsx` around line 45, the sx object includes:

```ts
fontSize: compact ? '1.2rem' : '1.5rem',
fontWeight: 600,
color: 'text.primary',
fontFamily: 'monospace',
```

Remove the `fontFamily: 'monospace',` line.

- [ ] **Step 3: Remove from CalculatorHistory**

In `frontend/src/components/calculator/components/CalculatorHistory.tsx` around line 30:

```ts
sx={{
  display: 'block',
  fontFamily: 'monospace',
  color: 'text.secondary',
  py: 0.25,
}}
```

Remove the `fontFamily: 'monospace',` line.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/TopBar.tsx frontend/src/components/calculator/components/CalculatorDisplay.tsx frontend/src/components/calculator/components/CalculatorHistory.tsx
git commit -m "style: remove hardcoded monospace font from TopBar and Calculator"
```

---

### Task 7: Remove fontFamily: 'inherit' from purchasing pages

**Files:**
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` (3 occurrences at lines ~704, ~731, ~765)
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx` (3 occurrences at lines ~127, ~142, ~156)
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` (3 occurrences at lines ~782, ~810, ~838)

- [ ] **Step 1: Remove from GoodsReceivedPage**

```bash
grep -n "fontFamily: 'inherit'" frontend/src/pages/purchasing/GoodsReceivedPage.tsx
```

Remove `fontFamily: 'inherit',` from all 3 sx objects found. Each is a standalone property in an `sx` object — remove the line, leave the rest of the object intact.

- [ ] **Step 2: Remove from PurchaseOrderDetailsPanel**

```bash
grep -n "fontFamily: 'inherit'" frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx
```

Each occurrence is on a `<Typography component="button">` with a long `sx` prop. Remove only `fontFamily: 'inherit'` from each.

- [ ] **Step 3: Remove from VendorPaymentsPage**

```bash
grep -n "fontFamily: 'inherit'" frontend/src/pages/purchasing/VendorPaymentsPage.tsx
```

Remove `fontFamily: 'inherit',` from all 3 sx objects.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/GoodsReceivedPage.tsx frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx frontend/src/pages/purchasing/VendorPaymentsPage.tsx
git commit -m "style: remove redundant fontFamily inherit from purchasing pages"
```

---

### Task 8: Remove fontFamily: 'inherit' from sales pages

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx` (3 occurrences at lines ~806, ~838, ~880)
- Modify: `frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx` (3 occurrences at lines ~160, ~188, ~229)
- Modify: `frontend/src/pages/sales/components/OrderDetailsPanel.tsx` (3 occurrences at lines ~168, ~192, ~209)

- [ ] **Step 1: Remove from PaymentsPage**

```bash
grep -n "fontFamily: 'inherit'" frontend/src/pages/sales/PaymentsPage.tsx
```

Remove `fontFamily: 'inherit',` from all 3 sx objects.

- [ ] **Step 2: Remove from InvoiceDetailsPanel**

```bash
grep -n "fontFamily: 'inherit'" frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx
```

Remove `fontFamily: 'inherit',` from all 3 sx objects.

- [ ] **Step 3: Remove from OrderDetailsPanel**

```bash
grep -n "fontFamily: 'inherit'" frontend/src/pages/sales/components/OrderDetailsPanel.tsx
```

Each occurrence is on a `<Typography component="button">` with a long `sx` prop. Remove only `fontFamily: 'inherit'` from each.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/PaymentsPage.tsx frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx frontend/src/pages/sales/components/OrderDetailsPanel.tsx
git commit -m "style: remove redundant fontFamily inherit from sales pages"
```

---

### Task 9: Update print report windows to use Roboto

**Files:**
- Modify: all 19 print report files

The pattern is identical across all 19 files. Each has a `<head>` block like:

```html
<head>
  <title>${reportTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
```

Change it to:

```html
<head>
  <title>${reportTitle}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" />
  <style>
    body { font-family: 'Roboto', sans-serif; margin: 20px; }
```

- [ ] **Step 1: Update purchasing report files (5 files)**

Files:
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`

In each file, find the `<head>` block in the HTML template string and:
1. Add the Roboto CDN `<link>` tag after `<title>...</title>`
2. Change `font-family: Arial, sans-serif` to `font-family: 'Roboto', sans-serif`

Verify each file has exactly one occurrence:

```bash
grep -c "font-family" frontend/src/pages/purchasing/VendorProductListReport.tsx
grep -c "font-family" frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx
grep -c "font-family" frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx
grep -c "font-family" frontend/src/pages/purchasing/PurchaseOrderSummary.tsx
grep -c "font-family" frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx
```

Expected: `1` for each.

- [ ] **Step 2: Update inventory report files (5 files)**

Files:
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`

Same pattern: add CDN link, change `Arial` → `'Roboto'`.

```bash
grep -c "font-family" frontend/src/pages/inventory/MovementSummaryReport.tsx
grep -c "font-family" frontend/src/pages/inventory/HistoricalInventoryReport.tsx
grep -c "font-family" frontend/src/pages/inventory/PriceListReport.tsx
grep -c "font-family" frontend/src/pages/inventory/ProductCostReport.tsx
grep -c "font-family" frontend/src/pages/inventory/InventorySummaryReport.tsx
```

Expected: `1` for each.

- [ ] **Step 3: Update sales report files (9 files)**

Files:
- `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- `frontend/src/pages/sales/SalesOrderSummary.tsx`
- `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- `frontend/src/pages/sales/SalesByProductDetails.tsx`
- `frontend/src/pages/sales/SalesByProductSummary.tsx`
- `frontend/src/pages/sales/ProductCustomerReport.tsx`
- `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- `frontend/src/pages/sales/SalesOrderProfitReport.tsx`

Same pattern: add CDN link, change `Arial` → `'Roboto'`.

- [ ] **Step 4: Verify all Arial references are gone**

```bash
grep -rn "font-family: Arial" frontend/src/
```

Expected: no output.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/ frontend/src/pages/inventory/ frontend/src/pages/sales/
git commit -m "style: use Roboto font in all print report windows"
```

---

### Task 10: Final verification

- [ ] **Step 1: Confirm no fontFamily overrides remain in components**

```bash
grep -rn "fontFamily.*monospace\|fontFamily.*inherit\|font-family: Arial" frontend/src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

Expected: no output.

- [ ] **Step 2: Confirm theme font stack is correct**

```bash
grep -A3 "fontFamily" frontend/src/styles/theme.ts | head -10
```

Expected: shows `'"Roboto", sans-serif'` and the `MuiButtonBase` override with `fontFamily: 'inherit'`.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run targeted tests for changed components**

```bash
cd frontend && npx vitest run src/components/backup/ src/components/calculator/ src/components/auth/ src/components/common/
```

Expected: all pass.

- [ ] **Step 5: Final commit if any loose files**

```bash
git status
```

If clean, done. If any modified files remain, stage and commit them.
