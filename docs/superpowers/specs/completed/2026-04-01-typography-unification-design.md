# Typography Unification Design
**Issue:** #239 — Standardize Typography and Remove Hardcoded Font Styles
**Date:** 2026-04-01
**Approach:** Single PR, full migration (Option A)

---

## Problem

Typography is currently fragmented across three systems:

1. `frontend/src/styles/theme.ts` — MUI theme variants (h1–caption, button, overline)
2. `frontend/src/constants/typography.ts` — `TYPOGRAPHY_STYLES` and `TABLE_STYLES` objects used in 63 files
3. Hardcoded `sx` props — inline `fontSize`/`fontWeight` scattered across 110+ files

All 11 report files build HTML print templates using raw `<h1>`/`<p>` tags with per-file inline font CSS, disconnected from the theme entirely.

`global.css` also contains redundant `body` and `button` overrides that partially duplicate MUI CssBaseline.

---

## Decisions

- **Table cell sizing:** Use standard MUI `body2` (`0.875rem`) instead of the current `0.8rem`. Minor visual change accepted for standards compliance.
- **Custom variants:** Add `tableHeader` and `tableCaption` as named theme variants for cases where standard variants don't fit.
- **Print templates:** Shared `printStyles.ts` file, not per-report inline CSS.
- **TABLE_STYLES:** Move to `frontend/src/constants/tableStyles.ts` — layout/spacing concern, not typography.
- **Rollout:** Single PR, all changes atomic.

---

## Section 1: Theme Extensions (`frontend/src/styles/theme.ts`)

### TypeScript module augmentation

Add at the top of `theme.ts` (alongside the existing `TypeBackground` declaration):

```ts
declare module '@mui/material/styles' {
  interface TypographyVariants {
    tableHeader: React.CSSProperties
    tableCaption: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    tableHeader?: React.CSSProperties
    tableCaption?: React.CSSProperties
  }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    tableHeader: true
    tableCaption: true
  }
}
```

### New variants in `baseThemeOptions.typography`

```ts
tableHeader: {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  lineHeight: 1.5,
},
tableCaption: {
  fontSize: '0.7rem',
  fontWeight: 400,
  lineHeight: 1.2,
},
```

These match the current `TYPOGRAPHY_STYLES.tableHeader` and `TYPOGRAPHY_STYLES.tableCell.caption` values exactly — no visual change for these two.

No changes to existing h1–caption, button, or overline definitions.

---

## Section 2: Shared Print Stylesheet

### New file: `frontend/src/styles/printStyles.ts`

```ts
export const PRINT_STYLES = `
  body { font-family: 'Roboto', sans-serif; font-size: 12pt; color: #000; background: #fff; }
  h1 { font-size: 18pt; font-weight: 600; margin-bottom: 8pt; }
  h2 { font-size: 14pt; font-weight: 600; }
  p { font-size: 10pt; margin: 2pt 0; }
  table { font-size: 9pt; border-collapse: collapse; width: 100%; }
  th { font-weight: 600; text-align: left; border-bottom: 1pt solid #000; padding: 4pt; }
  td { padding: 4pt; border-bottom: 0.5pt solid #ccc; }
  strong { font-weight: 600; }
`
```

### Report file changes (all 11 files)

Each report imports `PRINT_STYLES` and replaces its inline `<style>` font block with `${PRINT_STYLES}`. The raw `<h1>`/`<p>` tags in template strings are kept — they are correct HTML for a print window.

Affected files:
- `HistoricalInventoryReport.tsx`
- `InventorySummaryReport.tsx`
- `MovementSummaryReport.tsx`
- `PriceListReport.tsx`
- `ProductCostReport.tsx`
- `PurchaseOrderDetailsReport.tsx`
- `PurchaseOrderStatusReport.tsx`
- `VendorPaymentDetailsReport.tsx`
- `VendorProductListReport.tsx`
- `ProductCustomerReport.tsx`
- `SalesOrderProfitReport.tsx`

---

## Section 3: TYPOGRAPHY_STYLES Migration

### Replacement mapping

| Current | Replacement |
|---|---|
| `TYPOGRAPHY_STYLES.pageHeader` (`variant: 'h4'`, `fontWeight: 700`) | `variant="h4" fontWeight={700}` on Typography (h4 theme is 600, keep inline weight) |
| `TYPOGRAPHY_STYLES.pageSubtitle` (`variant: 'body1'`, `color: 'text.secondary'`) | `variant="body1" color="text.secondary"` |
| `TYPOGRAPHY_STYLES.tableHeader` | `variant="tableHeader"` |
| `TYPOGRAPHY_STYLES.tableCell.primary` (`body2`, `fontWeight: 600`) | `variant="body2" fontWeight={600}` |
| `TYPOGRAPHY_STYLES.tableCell.secondary` (`body2`, `fontWeight: 400`) | `variant="body2"` |
| `TYPOGRAPHY_STYLES.tableCell.caption` | `variant="tableCaption"` |
| `TYPOGRAPHY_STYLES.chip.small` (`fontSize: '0.7rem'`, `fontWeight: 500`, `height: 20`) | `sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}` — chips don't use Typography |
| `TYPOGRAPHY_STYLES.chip.extraSmall` (`fontSize: '0.65rem'`, `height: 18`) | `sx={{ fontSize: '0.65rem', height: 18 }}` |
| `TYPOGRAPHY_STYLES.searchField` | `sx` props on TextField/InputAdornment — no Typography equivalent, keep inline |
| `TYPOGRAPHY_STYLES.mobile.caption` (`fontSize: '0.65rem'`) | `sx={{ fontSize: '0.65rem' }}` — no theme variant for sub-caption |

### TABLE_STYLES

`TABLE_STYLES` is layout/spacing, not typography. It is moved to a new file:

**New file:** `frontend/src/constants/tableStyles.ts`
**Content:** Identical to the current `TABLE_STYLES` export in `constants/typography.ts`
**Import update:** All 63 files change `from '@/constants/typography'` → `from '@/constants/tableStyles'` for `TABLE_STYLES` imports.

### Deletion

After all usages are migrated, `frontend/src/constants/typography.ts` is deleted.

---

## Section 4: global.css Cleanup

**Remove** from `frontend/src/styles/global.css`:
- `body` properties: `line-height: 1.5`, `color: #ffffff`, `background-color: #121212` — MUI CssBaseline + theme handles these
- The entire `button` reset block (lines 46–60) — CssBaseline handles button resets

**Keep:** `margin: 0`, `padding: 0` on body (belt-and-suspenders, harmless). Keep all scrollbar styling, utility classes, print media queries, animations, and accessibility helpers.

### Hardcoded sx fontSize cleanup

Scope: `<Typography>` components only.

| Pattern | Action |
|---|---|
| `sx={{ fontSize: '0.875rem' }}` on Typography | → `variant="body2"` (drop the sx) |
| `sx={{ fontSize: '0.75rem' }}` on Typography | → `variant="caption"` (drop the sx) |
| `sx={{ fontWeight: 600 }}` paired with a variant | Keep as inline prop — theme doesn't define per-use weights |
| `fontSize` on TableCell, Box, or other non-Typography elements | Leave as-is — layout overrides, not typography |
| Sub-caption sizes (`0.65rem`) | Keep as `sx` — no theme variant exists |

---

## Section 5: Testing & Rollout

### Verification steps

1. `cd frontend && npm run type-check` — catches variant typos and missing `TABLE_STYLES` import updates
2. `cd frontend && npm run lint` — catches unused `TYPOGRAPHY_STYLES` imports
3. Visual smoke test: open Inventory, Sales, Purchasing, Accounting, Dashboard pages — verify table headers and cell text render correctly
4. Print smoke test: trigger print preview on one report per module — verify Roboto font, heading sizes, and filter text render correctly

### Scope

- Frontend-only change
- No backend changes
- No database migrations
- No Docker rebuild required (use `npm run dev` for local verification)

### Only breaking change

`TABLE_STYLES` import path: `@/constants/typography` → `@/constants/tableStyles`. TypeScript will catch any missed updates at type-check time.
