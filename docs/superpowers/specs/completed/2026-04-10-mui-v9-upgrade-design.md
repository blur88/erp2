# MUI v7 → v9 Upgrade Design

**Issue:** #330  
**Date:** 2026-04-10  
**Scope:** Frontend only (`frontend/`)

## Overview

Upgrade Material-UI from v7.3.6 to v9.0.0. MUI skipped v8 entirely, so this is a two-major-version jump. React 19 is already in use — MUI v9 supports it. The emotion packages remain at v11 (already compatible).

---

## Section 1: Package Updates

Update `frontend/package.json`:

| Package | From | To |
|---|---|---|
| `@mui/material` | `^7.3.6` | `^9.0.0` |
| `@mui/icons-material` | `^7.3.6` | `^9.0.0` |
| `@mui/x-date-pickers` | `8.27.2` | `9.0.0` |

`@emotion/react` and `@emotion/styled` stay at `^11` — already compatible with MUI v9.  
`@mui/x-date-pickers` v9 explicitly supports `@mui/material` v7 or v9 as a peer.

Run `npm install` in `frontend/` after updating.

---

## Section 2: Grid Migration

`GridLegacy` is removed in MUI v9. 9 files use it and must be migrated to the new Grid v2 API.

**Affected files:**
- `src/pages/accounting/JournalEntriesPage.tsx`
- `src/pages/accounting/JournalEntryDetailsPage.tsx`
- `src/pages/sales/components/OrderContextHeader.tsx`
- `src/pages/sales/components/OrdersDialogs.tsx`
- `src/pages/sales/components/InvoiceContextHeader.tsx`
- `src/pages/sales/components/CustomerContextHeader.tsx`
- `src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- `src/pages/purchasing/components/SupplierContextHeader.tsx`
- `src/pages/inventory/ProductsPage.tsx`

**Migration pattern:**

```tsx
// Before (v7 GridLegacy)
import GridLegacy from '@mui/material/GridLegacy'
<GridLegacy container spacing={2}>
  <GridLegacy item xs={12} md={3}>...</GridLegacy>
</GridLegacy>

// After (v9 Grid)
import Grid from '@mui/material/Grid'
<Grid container spacing={2}>
  <Grid size={{ xs: 12, md: 3 }}>...</Grid>
</Grid>
```

Changes per file:
1. Replace import: `@mui/material/GridLegacy` → `@mui/material/Grid`, rename `GridLegacy` → `Grid`
2. Remove `item` prop from child Grid elements (no longer needed)
3. Replace breakpoint props (`xs`, `sm`, `md`, `lg`, `xl`) with the `size` prop: `size={{ xs: 12, md: 3 }}`

**Approach:** The codemod targets `Grid` imports from `@mui/material`, not `GridLegacy` imports from `@mui/material/GridLegacy`. Because our files already use the `GridLegacy` alias, the codemod will not match them — do the migration manually for all 9 files. The changes are mechanical and the file count is small enough that manual is faster than adapting the codemod.

---

## Section 3: Theme

No changes required. The custom theme in `src/styles/theme.ts` uses:

- `TypeBackground` augmentation with `sidebar` field — unchanged in v9
- `TypographyVariants` augmentation with `tableHeader` / `tableCaption` — unchanged in v9
- `styleOverrides` using internal CSS class selectors (`.MuiOutlinedInput-notchedOutline`, `.MuiTableCell-head`, etc.) — class names are stable in v9
- `palette.grey` remapping in dark theme — application logic, not an MUI API

Verify visually after upgrade that the dark theme renders correctly.

---

## Section 4: Testing & Verification

1. `npm install` — confirm no peer dependency errors
2. `npm run type-check` — surface any removed/renamed API types
3. Run tests for the 9 affected Grid files individually first:
   ```bash
   cd frontend
   npx vitest run src/pages/accounting/JournalEntriesPage.tsx
   # repeat for each affected file
   ```
4. Full test suite: `npm run test` (allow ~12 min)
5. Visual smoke test in browser — focus on Grid-heavy pages (Accounting > Journal Entries, Sales orders, Purchase orders, Inventory > Products) and confirm dark theme is intact

No new tests are needed — existing tests cover the components being touched.

---

## Out of Scope

- Pigment CSS / `@mui/material-pigment-css` — MUI v9 introduces this as an optional CSS-in-JS alternative; we stay on Emotion
- Any non-MUI dependency updates
- `makeStyles` / `withStyles` — not used in this codebase
