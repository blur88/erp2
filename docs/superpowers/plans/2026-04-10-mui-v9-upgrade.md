# MUI v9 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `@mui/material`, `@mui/icons-material`, and `@mui/x-date-pickers` from v7 to v9, migrating all `GridLegacy` usages to the new Grid v2 API.

**Architecture:** Bump three packages in `package.json`, run `npm install`, then manually migrate 9 files that use the removed `GridLegacy` component to the new `Grid` with the `size` prop API. No theme changes are required.

**Tech Stack:** React 19, MUI v9, Emotion v11, TypeScript 6, Vitest

---

## Files Modified

| File | Change |
|---|---|
| `frontend/package.json` | Bump `@mui/material`, `@mui/icons-material`, `@mui/x-date-pickers` |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | GridLegacy → Grid |
| `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx` | GridLegacy → Grid |
| `frontend/src/pages/sales/components/OrderContextHeader.tsx` | GridLegacy → Grid |
| `frontend/src/pages/sales/components/InvoiceContextHeader.tsx` | GridLegacy → Grid |
| `frontend/src/pages/sales/components/OrdersDialogs.tsx` | GridLegacy → Grid |
| `frontend/src/pages/sales/components/CustomerContextHeader.tsx` | GridLegacy → Grid |
| `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx` | GridLegacy → Grid |
| `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx` | GridLegacy → Grid |
| `frontend/src/pages/inventory/ProductsPage.tsx` | GridLegacy → Grid |

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

Expected: installs without errors. There may be deprecation warnings — ignore them. Watch for any `ERESOLVE` peer dependency errors — there should be none since React 19 and Emotion v11 are already compatible with MUI v9.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: passes (or shows only pre-existing errors, not new MUI API errors). If you see new type errors referencing MUI APIs, note them — they will be fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore(deps): upgrade @mui/material, icons, x-date-pickers to v9"
```

---

## Task 2: Migrate JournalEntriesPage

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Test: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all tests pass (this is your baseline — if they fail before your changes, note it but continue).

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

Replace the filter bar Grid block. The current code is:

```tsx
<GridLegacy container spacing={2} alignItems="center">
  <GridLegacy item xs={12} md={3}>
    {/* ... */}
  </GridLegacy>
  <GridLegacy item xs={12} md={2}>
    {/* ... */}
  </GridLegacy>
  <GridLegacy item xs={12} md={2}>
    {/* ... */}
  </GridLegacy>
  <GridLegacy item xs={12} md={2.5}>
    {/* ... */}
  </GridLegacy>
  <GridLegacy item xs={12} md={2.5}>
    {/* ... */}
  </GridLegacy>
</GridLegacy>
```

Replace all `GridLegacy` with `Grid`, remove all `item` props, and replace breakpoint props with the `size` prop:

```tsx
<Grid container spacing={2} alignItems="center">
  <Grid size={{ xs: 12, md: 3 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 2 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 2 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 2.5 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 2.5 }}>
    {/* ... */}
  </Grid>
</Grid>
```

Keep all children (form controls, date pickers, etc.) unchanged inside each Grid cell.

- [ ] **Step 4: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(accounting): migrate JournalEntriesPage GridLegacy → Grid v2 (closes part of #330)"
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

- [ ] **Step 3: Migrate all Grid usages**

The file uses `GridLegacy` in one block (lines ~257–339). Replace every occurrence following this pattern:

- `<GridLegacy container ...>` → `<Grid container ...>`
- `<GridLegacy item xs={N} md={N}>` → `<Grid size={{ xs: N, md: N }}>`
- `<GridLegacy item xs={N}>` → `<Grid size={{ xs: N }}>`
- `</GridLegacy>` → `</Grid>`

The full set of replacements:

```tsx
// Before → After
<GridLegacy container spacing={3}>     →  <Grid container spacing={3}>
<GridLegacy item xs={12} md={3}>       →  <Grid size={{ xs: 12, md: 3 }}>
<GridLegacy item xs={12} md={3}>       →  <Grid size={{ xs: 12, md: 3 }}>
<GridLegacy item xs={12} md={3}>       →  <Grid size={{ xs: 12, md: 3 }}>
<GridLegacy item xs={12} md={3}>       →  <Grid size={{ xs: 12, md: 3 }}>
<GridLegacy item xs={12}>              →  <Grid size={{ xs: 12 }}>
<GridLegacy item xs={12} md={6}>       →  <Grid size={{ xs: 12, md: 6 }}>
<GridLegacy item xs={12} md={6}>       →  <Grid size={{ xs: 12, md: 6 }}>
<GridLegacy item xs={12} md={6}>       →  <Grid size={{ xs: 12, md: 6 }}>
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

These four files all follow the same pattern: `import Grid from '@mui/material/GridLegacy'` (already aliased as `Grid`, so no rename needed) with `item xs={N} md={N}` props.

- [ ] **Step 1: Run the existing test to establish baseline**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Fix the import in all four files**

In each of the four files, change line 1 of the import (exact line numbers: OrderContextHeader line 20, InvoiceContextHeader line 16, OrdersDialogs line 21, CustomerContextHeader line 17):

```tsx
import Grid from '@mui/material/GridLegacy'
```

to:

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 3: Migrate Grid props in OrderContextHeader.tsx**

File: `src/pages/sales/components/OrderContextHeader.tsx`

There is one container (line 153) with two items. Change:

```tsx
<Grid container spacing={3}>
  <Grid item xs={12} md={6}>
    {/* ... */}
  </Grid>
  <Grid item xs={12} md={6}>
    {/* ... */}
  </Grid>
</Grid>
```

to:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
</Grid>
```

- [ ] **Step 4: Migrate Grid props in InvoiceContextHeader.tsx**

File: `src/pages/sales/components/InvoiceContextHeader.tsx`

One container (line 139) with two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
</Grid>
```

- [ ] **Step 5: Migrate Grid props in OrdersDialogs.tsx**

File: `src/pages/sales/components/OrdersDialogs.tsx`

One container (line 92) with five items. Change all `item xs={N} md={N}` and `item xs={N}` to use `size`:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12 }}>
    {/* ... */}
  </Grid>
</Grid>
```

- [ ] **Step 6: Migrate Grid props in CustomerContextHeader.tsx**

File: `src/pages/sales/components/CustomerContextHeader.tsx`

One container (line 117) with two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
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

Both files have `import Grid from '@mui/material/GridLegacy'` and one container with two `xs={12} md={6}` items.

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

One container (line 135) with two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
</Grid>
```

- [ ] **Step 4: Fix import in SupplierContextHeader.tsx (line 17)**

```tsx
import Grid from '@mui/material/Grid'
```

- [ ] **Step 5: Migrate Grid props in SupplierContextHeader.tsx**

One container (line 118) with two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    {/* ... */}
  </Grid>
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

One container (line 160) with two items:

```tsx
<Grid container spacing={3}>
  <Grid size={{ xs: 12, md: 3 }}>
    {/* ... */}
  </Grid>
  <Grid size={{ xs: 12, md: 9 }}>
    {/* ... */}
  </Grid>
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

## Task 7: Full verification

- [ ] **Step 1: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors compared to before the upgrade. If you see errors, they will be MUI API changes — check the MUI v9 migration guide for the affected component.

- [ ] **Step 2: Full test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass. This takes ~12 minutes — do not assume it is hung. Note any failures and fix them.

- [ ] **Step 3: Lint check**

```bash
cd frontend && npm run lint
```

Expected: no new lint errors.

- [ ] **Step 4: Open the app in a browser and smoke test**

Start the dev server:
```bash
cd frontend && npm run dev
```

Visit these pages and confirm they render correctly (no layout breakage, dark theme intact):
- Accounting > Journal Entries (filter bar uses Grid)
- Accounting > Journal Entry detail page
- Sales > Orders (order context header uses Grid)
- Sales > Invoices (invoice context header uses Grid)
- Sales > Customers (customer context header uses Grid)
- Purchasing > Purchase Orders (PO context header uses Grid)
- Purchasing > Suppliers (supplier context header uses Grid)
- Inventory > Products (product filter bar uses Grid)

- [ ] **Step 5: Final commit and close issue**

```bash
git commit --allow-empty -m "chore: MUI v7→v9 upgrade complete

- Upgraded @mui/material, @mui/icons-material to ^9.0.0
- Upgraded @mui/x-date-pickers to 9.0.0
- Migrated 9 files from GridLegacy to Grid v2 API

Closes #330"
```
