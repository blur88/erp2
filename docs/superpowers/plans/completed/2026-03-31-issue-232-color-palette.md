# Color Palette Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all hardcoded hex colors from non-print code, eliminate light-mode remnants, and establish `theme.ts` as the single color token source across all 41 affected files.

**Architecture:** `theme.ts` already contains the full `colors` palette object used by `darkTheme`. Components access colors via `useTheme()` + `theme.palette.*`. A new `printTokens.ts` makes print-specific black-on-white colors explicit. `global.css` is simplified to dark-only defaults with no `[data-theme]` conditionals.

**Tech Stack:** React 19, MUI v7, TypeScript (`strict: false`), Vitest (frontend tests)

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `frontend/src/styles/global.css` | Remove `[data-theme='dark']` blocks, promote dark values to defaults, fix status class colors |
| Modify | `frontend/src/RootLayout.tsx` | Remove `data-theme` attribute setter |
| Modify | `frontend/src/styles/theme.ts` | Remove grey.50 override comment |
| Create | `frontend/src/styles/printTokens.ts` | Print-specific color constants |
| Modify | `frontend/src/components/common/LoadingSpinner.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/MainLayout.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/SearchModal.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/SidebarFooter.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/Sidebar.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/SidebarUserMenu.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/SystemStatus.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/common/TopBar.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/components/print/BasePrintTemplate.tsx` | Import from printTokens |
| Modify | `frontend/src/pages/auth/LoginPage.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/auth/MandatoryPasswordChangePage.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/inventory/CreateProductPage.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/sales/CreateSalesOrderPage.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/inventory/HistoricalInventoryReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/inventory/InventorySummaryReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/inventory/MovementSummaryReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/inventory/PriceListReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/inventory/ProductCostReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/purchasing/VendorProductListReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/CustomerOrderHistory.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/CustomerPaymentByOrder.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/CustomerPaymentDetails.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/CustomerPaymentSummary.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/ProductCustomerReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/SalesByProductDetails.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/SalesByProductSummary.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/SalesOrderProfitReport.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/sales/SalesOrderSummary.tsx` | Import from printTokens for print colors |
| Modify | `frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/audit-logs/components/AnalyticsTab.tsx` | Replace hardcoded colors |
| Modify | `frontend/src/pages/settings/PrintSettings/TemplatePreview.tsx` | Import from printTokens |
| Create | `docs/COLOR_PALETTE.md` | Color usage guideline |

---

## Task 1: Clean up `global.css` — remove light-mode conditionals

**Files:**
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Read the current file**

Run: `cat -n frontend/src/styles/global.css`

Note all `[data-theme='dark']` blocks and the default `body` styles.

- [ ] **Step 2: Replace the body and dark-mode body rules**

Find:
```css
body {
  margin: 0;
  padding: 0;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.5;
  color: #333;
  background-color: #fafafa;
}

/* Dark theme support */
[data-theme='dark'] body {
  color: #ffffff;
  background-color: #121212;
}
```

Replace with:
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

- [ ] **Step 3: Replace scrollbar rules — promote dark values to defaults**

Find:
```css
::-webkit-scrollbar-thumb {
  background: #bdbdbd;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #9e9e9e;
}

[data-theme='dark'] ::-webkit-scrollbar-thumb {
  background: #616161;
}

[data-theme='dark'] ::-webkit-scrollbar-thumb:hover {
  background: #757575;
}
```

Replace with:
```css
::-webkit-scrollbar-thumb {
  background: #616161;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #757575;
}
```

- [ ] **Step 4: Replace Firefox scrollbar rule**

Find:
```css
html {
  scrollbar-width: thin;
  scrollbar-color: #bdbdbd transparent;
}

[data-theme='dark'] html {
  scrollbar-color: #616161 transparent;
}
```

Replace with:
```css
html {
  scrollbar-width: thin;
  scrollbar-color: #616161 transparent;
}
```

- [ ] **Step 5: Replace skeleton animation — promote dark values to defaults**

Find:
```css
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

[data-theme='dark'] .skeleton {
  background: linear-gradient(90deg, #2c2c2c 25%, #3c3c3c 50%, #2c2c2c 75%);
  background-size: 200% 100%;
}
```

Replace with:
```css
.skeleton {
  background: linear-gradient(90deg, #2c2c2c 25%, #3c3c3c 50%, #2c2c2c 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}
```

- [ ] **Step 6: Fix status class colors to match theme.ts**

Find:
```css
.status-active {
  color: #4caf50;
  font-weight: 500;
}

.status-inactive {
  color: #9e9e9e;
  font-weight: 500;
}

.status-pending {
  color: #ff9800;
  font-weight: 500;
}

.status-error {
  color: #f44336;
  font-weight: 500;
}
```

Replace with:
```css
.status-active {
  color: #66bb6a;
  font-weight: 500;
}

.status-inactive {
  color: #9e9e9e;
  font-weight: 500;
}

.status-pending {
  color: #ffca28;
  font-weight: 500;
}

.status-error {
  color: #ef5350;
  font-weight: 500;
}
```

(These now match `theme.palette.success[400]`, `theme.palette.warning[400]`, and `theme.palette.error[400]` exactly.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/global.css
git commit -m "style: remove light-mode conditionals from global.css, fix status colors"
```

---

## Task 2: Remove `data-theme` from `RootLayout.tsx` and minor `theme.ts` cleanup

**Files:**
- Modify: `frontend/src/RootLayout.tsx`
- Modify: `frontend/src/styles/theme.ts`

- [ ] **Step 1: Read RootLayout.tsx**

Run: `cat -n frontend/src/RootLayout.tsx`

Find the `useEffect` that sets `data-theme`.

- [ ] **Step 2: Remove the data-theme setter**

Find the effect that looks like:
```ts
useEffect(() => {
  document.documentElement.setAttribute('data-theme', 'dark')
}, [])
```

Delete it entirely (including the `useEffect` import if it's only used for this — check first).

- [ ] **Step 3: Read theme.ts and remove grey.50 override comment**

In `frontend/src/styles/theme.ts`, find:
```ts
grey: {
  ...colors.grey,
  // Override grey.50 for dark mode to use a darker shade
  50: colors.grey[800], // Map grey.50 to grey.800 for dark mode
},
```

Replace with:
```ts
grey: {
  ...colors.grey,
  50: colors.grey[800],
},
```

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/RootLayout.tsx frontend/src/styles/theme.ts
git commit -m "style: remove data-theme attribute, clean up theme.ts comment"
```

---

## Task 3: Create `printTokens.ts`

**Files:**
- Create: `frontend/src/styles/printTokens.ts`

- [ ] **Step 1: Create the file**

```ts
// frontend/src/styles/printTokens.ts

// Colors for print/PDF output — intentionally NOT dark theme colors.
// These produce black-on-white output suitable for printing and PDF generation.
export const printColors = {
  background: '#ffffff',
  text: '#000000',
  border: '#000000',
  tableBorder: '#ddd',
  tableHeaderBg: '#1976d2',
  tableRowAlt: '#f9f9f9',
  successRow: 'rgba(76, 175, 80, 0.2)',
  infoRow: 'rgba(33, 150, 243, 0.1)',
  groupRow: '#d3d3d3',
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/printTokens.ts
git commit -m "style: add printTokens.ts for explicit print color constants"
```

---

## Task 4: Replace hardcoded colors in shared components

**Files:**
- Modify: `frontend/src/components/common/LoadingSpinner.tsx`
- Modify: `frontend/src/components/common/MainLayout.tsx`
- Modify: `frontend/src/components/common/SidebarFooter.tsx`
- Modify: `frontend/src/components/common/SidebarUserMenu.tsx`
- Modify: `frontend/src/components/common/SystemStatus.tsx`

- [ ] **Step 1: Fix LoadingSpinner.tsx**

Read the file: `cat -n frontend/src/components/common/LoadingSpinner.tsx`

Replace `color: '#fff'` with `color: theme.palette.text.primary` and `bgcolor: 'rgba(255, 255, 255, 0.8)'` with `bgcolor: alpha(theme.palette.common.white, 0.8)`.

Add `useTheme` import if not present:
```ts
import { useTheme } from '@mui/material/styles'
```

Add inside the component function:
```ts
const theme = useTheme()
```

- [ ] **Step 2: Fix MainLayout.tsx**

Read the file: `cat -n frontend/src/components/common/MainLayout.tsx`

Replace `bgcolor: '#0F172A'` with `bgcolor: theme.palette.background.default`.

Add `useTheme` import and `const theme = useTheme()` if not present.

- [ ] **Step 3: Fix SidebarFooter.tsx**

Read the file: `cat -n frontend/src/components/common/SidebarFooter.tsx`

Replace all hardcoded hex values with appropriate `theme.palette.*` equivalents. Common mappings:
- `#1E1E1E` / `#1e1e1e` → `theme.palette.background.paper`
- `#2A2A2A` / `#232323` → `theme.palette.divider`
- `#E0E0E0` / `#e0e0e0` → `theme.palette.text.primary`
- `#6B7280` / `#8A8A8A` / `#9CA3AF` / `#A0A0A0` → `theme.palette.text.secondary`
- `#FFFFFF` / `#ffffff` → `theme.palette.common.white`
- `rgba(255, 255, 255, 0.04)` → `theme.palette.action.hover`
- `rgba(255, 255, 255, 0.08)` → `theme.palette.action.selected`

Add `useTheme` import and `const theme = useTheme()` if not present. Also import `alpha` from `@mui/material/styles` if needed for rgba values.

- [ ] **Step 4: Fix SidebarUserMenu.tsx**

Read the file: `cat -n frontend/src/components/common/SidebarUserMenu.tsx`

Apply the same color mapping as Step 3.

- [ ] **Step 5: Fix SystemStatus.tsx**

Read the file: `cat -n frontend/src/components/common/SystemStatus.tsx`

Apply the same color mapping as Step 3.

- [ ] **Step 6: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/LoadingSpinner.tsx \
  frontend/src/components/common/MainLayout.tsx \
  frontend/src/components/common/SidebarFooter.tsx \
  frontend/src/components/common/SidebarUserMenu.tsx \
  frontend/src/components/common/SystemStatus.tsx
git commit -m "style: replace hardcoded colors in shared utility components"
```

---

## Task 5: Replace hardcoded colors in Sidebar and TopBar

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`
- Modify: `frontend/src/components/common/TopBar.tsx`
- Modify: `frontend/src/components/common/SearchModal.tsx`

These files have more hardcoded colors than the others. Read each file carefully before editing.

- [ ] **Step 1: Fix Sidebar.tsx**

Read the file: `cat -n frontend/src/components/common/Sidebar.tsx`

The file has a local `SIDEBAR_COLORS` or similar constant block at the top with values like:
```ts
bg: '#0D0D0D',
activeBg: '#1F2937',
hoverBg: '#1E1E1E',
text: '#9CA3AF',
activeText: '#FFFFFF',
hoverText: '#CBD5E1',
activeIcon: '#3B82F6',
icon: '#6B7280',
sectionLabel: '#6B7280',
border: '#1F2937',
accentBar: '#42a5f5',
```

Replace this block with a function that derives values from the theme:
```ts
const useSidebarColors = () => {
  const theme = useTheme()
  return {
    bg: '#0D0D0D',                              // deeper than background.default — intentional
    activeBg: theme.palette.action.selected,    // rgba(255,255,255,0.08)
    hoverBg: theme.palette.action.hover,        // rgba(255,255,255,0.04)
    text: theme.palette.text.secondary,
    activeText: theme.palette.text.primary,
    hoverText: theme.palette.grey[300],
    activeIcon: theme.palette.primary.main,
    icon: theme.palette.text.secondary,
    sectionLabel: theme.palette.text.secondary,
    border: theme.palette.divider,
    accentBar: theme.palette.primary.main,
  }
}
```

Call `const colors = useSidebarColors()` inside the component.

Also replace any remaining inline hardcoded values (e.g. `#2A2A2A`, `rgba(255,255,255,0.03)`, `rgba(0,0,0,0.4)`) with appropriate theme values or `alpha(theme.palette.common.white, 0.03)`.

- [ ] **Step 2: Fix TopBar.tsx**

Read the file: `cat -n frontend/src/components/common/TopBar.tsx`

`useTheme` is already imported. Replace all hardcoded hex values using the same mapping:
- `#1E1E1E` → `theme.palette.background.paper`
- `#2A2A2A` / `#232323` / `#3A3A3A` → `theme.palette.divider`
- `#E0E0E0` / `#CFCFCF` → `theme.palette.text.primary`
- `#8A8A8A` / `#6B7280` / `#5A5A5A` → `theme.palette.text.secondary`
- `#1A1A1A` → `theme.palette.background.default`

- [ ] **Step 3: Fix SearchModal.tsx**

Read the file: `cat -n frontend/src/components/common/SearchModal.tsx`

Apply the same mapping. For error color `#F87171` → `theme.palette.error.light`.

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 5: Run targeted tests**

Run: `cd frontend && npx vitest run src/components/common`
Expected: all pass (or same as before this task)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx \
  frontend/src/components/common/TopBar.tsx \
  frontend/src/components/common/SearchModal.tsx
git commit -m "style: replace hardcoded colors in Sidebar, TopBar, SearchModal"
```

---

## Task 6: Replace hardcoded colors in interactive pages

**Files:**
- Modify: `frontend/src/pages/auth/LoginPage.tsx`
- Modify: `frontend/src/pages/auth/MandatoryPasswordChangePage.tsx`
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`

- [ ] **Step 1: Fix auth pages**

Read each file: `cat -n frontend/src/pages/auth/LoginPage.tsx`

`useTheme` is already imported in both. Replace hardcoded hex values using:
- `#121212` / `#1e1e1e` / `#0F172A` → `theme.palette.background.default` / `.paper`
- `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` — this is a decorative login gradient, keep it or map to `theme.palette.primary.dark` / `theme.palette.secondary.dark` (your call — if unsure, keep it)
- `#E0E0E0` / `#bdbdbd` → `theme.palette.text.primary` / `.secondary`
- Other greys → use closest `theme.palette.grey[N]` or text variants

- [ ] **Step 2: Fix inventory create pages**

Read: `cat -n frontend/src/pages/inventory/CreateProductPage.tsx`
Read: `cat -n frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`

Apply same mapping. Add `useTheme` import if not present.

- [ ] **Step 3: Fix purchasing and sales create pages**

Read: `cat -n frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
Read: `cat -n frontend/src/pages/sales/CreateSalesOrderPage.tsx`

Apply same mapping.

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/auth/LoginPage.tsx \
  frontend/src/pages/auth/MandatoryPasswordChangePage.tsx \
  frontend/src/pages/inventory/CreateProductPage.tsx \
  frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx \
  frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx \
  frontend/src/pages/sales/CreateSalesOrderPage.tsx
git commit -m "style: replace hardcoded colors in interactive pages"
```

---

## Task 7: Update print template and report pages — inventory

**Files:**
- Modify: `frontend/src/components/print/BasePrintTemplate.tsx`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`

- [ ] **Step 1: Fix BasePrintTemplate.tsx**

Read: `cat -n frontend/src/components/print/BasePrintTemplate.tsx`

Add import:
```ts
import { printColors } from '@/styles/printTokens'
```

Replace all print-context hardcoded values (`#000000`, `#ffffff`, `#1976d2`, `#ddd`, `#f9f9f9`, `rgba(76, 175, 80, 0.2)`, `rgba(33, 150, 243, 0.1)`, `#d3d3d3`) with `printColors.*` equivalents.

- [ ] **Step 2: Fix inventory report pages**

For each file, read it first, then:
1. Add import: `import { printColors } from '@/styles/printTokens'`
2. Replace print-context colors with `printColors.*`
3. For any non-print UI colors (status badges in the page UI, not in the generated HTML string), use `useTheme()` + `theme.palette.*`

The pattern to watch for: colors inside template literal strings like `` `<tr style="background-color: ${printColors.successRow}">` `` vs colors in `sx={{ color: ... }}` props (use theme for those).

- [ ] **Step 3: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/print/BasePrintTemplate.tsx \
  frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
  frontend/src/pages/inventory/InventorySummaryReport.tsx \
  frontend/src/pages/inventory/MovementSummaryReport.tsx \
  frontend/src/pages/inventory/PriceListReport.tsx \
  frontend/src/pages/inventory/ProductCostReport.tsx
git commit -m "style: use printTokens in BasePrintTemplate and inventory reports"
```

---

## Task 8: Update report pages — purchasing

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`

- [ ] **Step 1: Fix each purchasing report**

For each file, read it first, then:
1. Add import: `import { printColors } from '@/styles/printTokens'`
2. Replace print-context colors (`#000000`, `#ffffff`, `#1976d2`, `#ddd`, `#f9f9f9`, `rgba(76, 175, 80, 0.2)`, `rgba(33, 150, 243, 0.1)`, `#d3d3d3`) with `printColors.*`
3. For any non-print UI colors in `sx` props, use `useTheme()` + `theme.palette.*`

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx \
  frontend/src/pages/purchasing/PurchaseOrderSummary.tsx \
  frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx \
  frontend/src/pages/purchasing/VendorProductListReport.tsx
git commit -m "style: use printTokens in purchasing report pages"
```

---

## Task 9: Update report pages — sales

**Files:**
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`

- [ ] **Step 1: Fix each sales report**

For each file, read it first, then:
1. Add import: `import { printColors } from '@/styles/printTokens'`
2. Replace print-context colors with `printColors.*`
3. For any non-print UI colors in `sx` props, use `useTheme()` + `theme.palette.*`

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/CustomerOrderHistory.tsx \
  frontend/src/pages/sales/CustomerPaymentByOrder.tsx \
  frontend/src/pages/sales/CustomerPaymentDetails.tsx \
  frontend/src/pages/sales/CustomerPaymentSummary.tsx \
  frontend/src/pages/sales/ProductCustomerReport.tsx \
  frontend/src/pages/sales/SalesByProductDetails.tsx \
  frontend/src/pages/sales/SalesByProductSummary.tsx \
  frontend/src/pages/sales/SalesOrderProfitReport.tsx \
  frontend/src/pages/sales/SalesOrderSummary.tsx
git commit -m "style: use printTokens in sales report pages"
```

---

## Task 10: Update remaining pages and components

**Files:**
- Modify: `frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx`
- Modify: `frontend/src/pages/audit-logs/components/AnalyticsTab.tsx`
- Modify: `frontend/src/pages/settings/PrintSettings/TemplatePreview.tsx`

- [ ] **Step 1: Fix BusinessPerformanceChart.tsx**

Read: `cat -n frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx`

This is a chart component. Replace hardcoded colors with `theme.palette.*`. Add `useTheme` if not present.

- [ ] **Step 2: Fix AnalyticsTab.tsx**

Read: `cat -n frontend/src/pages/audit-logs/components/AnalyticsTab.tsx`

Replace hardcoded colors with `theme.palette.*`. Add `useTheme` if not present.

- [ ] **Step 3: Fix TemplatePreview.tsx**

Read: `cat -n frontend/src/pages/settings/PrintSettings/TemplatePreview.tsx`

This is a print preview — import `printColors` for any black-on-white values. Use `useTheme()` for UI chrome colors.

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/components/BusinessPerformanceChart.tsx \
  frontend/src/pages/audit-logs/components/AnalyticsTab.tsx \
  frontend/src/pages/settings/PrintSettings/TemplatePreview.tsx
git commit -m "style: replace hardcoded colors in dashboard, audit, and print preview"
```

---

## Task 11: Final verification — no hardcoded colors remain

**Files:** All frontend source files

- [ ] **Step 1: Check for remaining hardcoded hex colors in non-print files**

Run:
```bash
grep -rn "#[0-9a-fA-F]\{3,6\}" frontend/src \
  --include="*.tsx" --include="*.ts" \
  | grep -v "styles/theme.ts" \
  | grep -v "styles/global.css" \
  | grep -v "styles/printTokens.ts" \
  | grep -v "__tests__" \
  | grep -v "\.test\."
```

Expected: only matches inside `printColors` import lines or zero matches

- [ ] **Step 2: Run TypeScript check**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run src/components/common src/pages/auth`
Expected: all pass

- [ ] **Step 4: Commit if any final fixes were needed**

```bash
git add -p  # stage only the fix files
git commit -m "style: fix remaining hardcoded colors found in final audit"
```

---

## Task 12: Write `docs/COLOR_PALETTE.md`

**Files:**
- Create: `docs/COLOR_PALETTE.md`

- [ ] **Step 1: Create the file**

```markdown
# ERP Color Palette

This document is the authoritative reference for colors in the ERP frontend. All colors come from one of two sources:

1. **`frontend/src/styles/theme.ts`** — the MUI dark theme (UI components)
2. **`frontend/src/styles/printTokens.ts`** — print/PDF output (black on white)

Never use hardcoded hex values in component code.

---

## How to Use Colors

**In React components (always preferred):**
```tsx
import { useTheme } from '@mui/material/styles'
import { alpha } from '@mui/material/styles'

const theme = useTheme()

// In sx prop:
<Box sx={{ color: theme.palette.primary.main }} />

// For transparency:
<Box sx={{ bgcolor: alpha(theme.palette.common.white, 0.08) }} />
```

**In print/report templates:**
```ts
import { printColors } from '@/styles/printTokens'

// In generated HTML strings:
`<tr style="background-color: ${printColors.tableHeaderBg};">`

// In sx props inside report UI chrome:
<Box sx={{ color: theme.palette.text.secondary }} />
```

---

## Semantic Palette

| Token | Value | Use |
|-------|-------|-----|
| `theme.palette.primary.main` | `#42a5f5` | Primary actions, links, active states |
| `theme.palette.primary.light` | `#64b5f6` | Hover states on primary |
| `theme.palette.primary.dark` | `#1e88e5` | Pressed states on primary |
| `theme.palette.secondary.main` | `#ec407a` | Secondary actions |
| `theme.palette.success.main` | `#66bb6a` | Success states, positive values |
| `theme.palette.warning.main` | `#ffca28` | Warning states, pending |
| `theme.palette.error.main` | `#ef5350` | Error states, negative values |
| `theme.palette.error.light` | `#e57373` | Softer error (e.g. error text in UI) |

---

## Surface & Elevation

| Token | Value | Use |
|-------|-------|-----|
| `theme.palette.background.default` | `#121212` | Page background, deepest layer |
| `theme.palette.background.paper` | `#1e1e1e` | Cards, dialogs, dropdowns, elevated surfaces |

**Rule:** Use `background.default` for the page canvas. Use `background.paper` for anything that "floats" above it (cards, modals, sidebars, tooltips).

---

## Text

| Token | Value | Use |
|-------|-------|-----|
| `theme.palette.text.primary` | `#ffffff` | Main content, headings, labels |
| `theme.palette.text.secondary` | `#bdbdbd` | Supporting text, metadata, placeholders |
| `theme.palette.text.disabled` | `#757575` | Disabled controls |

---

## Status Indicator Classes

Use these CSS classes for inline status text when `useTheme()` is unavailable (e.g. plain HTML, print templates):

```css
.status-active   { color: #66bb6a; }  /* = theme.palette.success.main */
.status-error    { color: #ef5350; }  /* = theme.palette.error.main */
.status-pending  { color: #ffca28; }  /* = theme.palette.warning.main */
.status-inactive { color: #9e9e9e; }  /* = theme.palette.grey[500] */
```

In React components, prefer `theme.palette.success.main` etc. directly.

---

## Interactive States

| Token | Value | Use |
|-------|-------|-----|
| `theme.palette.action.hover` | `rgba(255,255,255,0.04)` | Hover background on list items, rows |
| `theme.palette.action.selected` | `rgba(255,255,255,0.08)` | Selected/active background |
| `theme.palette.divider` | `#424242` | Borders, separators, dividers |

---

## Print Colors

Print and PDF output uses black-on-white. These values live in `frontend/src/styles/printTokens.ts` and must not be used in UI components.

| Token | Value | Use |
|-------|-------|-----|
| `printColors.background` | `#ffffff` | Print page background |
| `printColors.text` | `#000000` | Print body text |
| `printColors.border` | `#000000` | Print borders |
| `printColors.tableHeaderBg` | `#1976d2` | Table header background in print |
| `printColors.tableRowAlt` | `#f9f9f9` | Alternating row in print tables |
| `printColors.successRow` | `rgba(76,175,80,0.2)` | Positive total rows in print |
| `printColors.infoRow` | `rgba(33,150,243,0.1)` | Subtotal rows in print |
| `printColors.groupRow` | `#d3d3d3` | Group header rows in print |

---

## WCAG Contrast

- White (`#ffffff`) on `#121212`: **contrast 18.1:1** — passes AAA
- White on `#1e1e1e`: **contrast 14.7:1** — passes AAA
- `#bdbdbd` on `#121212`: **contrast 9.0:1** — passes AAA
- `#42a5f5` on `#121212`: **contrast 5.1:1** — passes AA (do not use as background for white text)
- `#ffca28` on `#121212`: **contrast 9.3:1** — passes AAA (do not use as background for white text without checking)

**Warning:** Never use semantic palette colors (`success.main`, `warning.main`, etc.) as backgrounds for white text — they do not have sufficient contrast.
```

- [ ] **Step 2: Commit**

```bash
git add docs/COLOR_PALETTE.md
git commit -m "docs: add COLOR_PALETTE.md color usage guideline (issue #232)"
```
