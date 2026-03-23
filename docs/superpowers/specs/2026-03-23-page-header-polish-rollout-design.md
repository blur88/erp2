# PageHeader Polish & Phase 2 Rollout — Design Spec

**Date:** 2026-03-23
**Issue:** #164
**Status:** Approved

---

## Overview

`PageHeader` (`frontend/src/components/common/PageHeader.tsx`) has been introduced and validated in the Sales module. This spec covers two things:

1. A focused visual polish of the component itself (6 items from issue #164, refined to a confirmed set)
2. A partial Phase 2 rollout to Inventory, Settings, and Purchasing — replacing legacy `TYPOGRAPHY_STYLES.pageHeader` inline blocks with the standardized component

---

## Decisions

### Typography

- `h5` is the correct variant for ERP page titles — dense, workspace-oriented layout does not benefit from `h4`
- `TYPOGRAPHY_STYLES.pageHeader` (`h4` + weight 700 + icon) is legacy and will be phased out during rollout
- The new standard: `variant="h5"`, `fontWeight: 700`

### Icons

- `PageHeader` is text-only. No `icon` prop will be added.
- Legacy title icons (present on many pages via `TYPOGRAPHY_STYLES.pageHeader.icon`) are **removed** during migration, not modeled in the component.
- Page identity is communicated by sidebar, breadcrumb, and title text — decorative title icons add noise in a dense ERP.

### Subtitle

- Subtitles must be **static descriptive text only** — what the page is for.
- Dynamic counts (e.g. `({pagination?.total || 0} total)`) do not belong in the subtitle.
- During migration, dynamic counts are removed from subtitles. If the count is meaningful to the user, it is relocated near the relevant table or list. If not meaningful, it is omitted.

### Actions

- Max 2 actions: one `primaryAction` (contained), one `secondaryAction` (outlined).
- Order: secondary → primary (left to right).
- Pages with more than 2 actions: defer the page rather than bending the component.

---

## Component Polish (confirmed changes)

File: `frontend/src/components/common/PageHeader.tsx`

| # | Change | Detail |
|---|--------|--------|
| 1 | Title weight | `fontWeight: 600` → `fontWeight: 700` |
| 2 | Subtitle contrast | No change — keep `color: 'text.secondary'`. Do not stack opacity. |
| 3 | Header bottom spacing | Outer `Box` `mb: 3` → `mb: 4` (32px) |
| 4 | Button alignment | Keep current `alignItems: 'center'` on actions row. Add `pt: '2px'` only if visual QA after Inventory batch confirms it is needed. |
| 5 | Divider contrast | Keep `theme.palette.divider`. Apply `alpha(..., 0.7)` only if visual QA after Inventory batch confirms divider is too strong. |
| 6 | Subtitle API | No structural change. Static-text-only enforced by migration audit, not type system. |

---

## Rollout Scope

### Approach: Rollout-driven polish (Approach B)

Apply component changes first, then migrate modules in order. Each module batch validates the component in real context. Adjust component only if an issue appears across multiple pages — never for a single-page edge case.

### Inventory — 4 pages

| Page | Notes |
|------|-------|
| `ProductsPage` | Header is in `components/ProductsToolbar.tsx`, not the page file — migrate the toolbar |
| `StockAdjustmentsPage` | Remove icon, strip `({pagination?.total || 0} total)` from subtitle |
| `InventoryPage` | Migrate if header is applicable; defer if nonstandard |
| `CreateProductPage` | Form page — use `showDivider={false}` |

**Excluded:** `CategoriesPage` (tree structure — deferred)

### Settings — 10 pages

| Page |
|------|
| `UserManagementPage` |
| `RoleManagementPage` |
| `CompanySettingsPage` |
| `RegionalSettingsPage` |
| `SecuritySettingsPage` |
| `PaymentMethodsPage` |
| `DocumentNumbersPage` |
| `PriceCostingPage` |
| `PriceListsPage` |
| `PrintSettingsPage` |

Rule: if any settings page has a nonstandard shell or embedded section-header pattern, defer it rather than bending `PageHeader`.

### Purchasing — 4 pages

| Page | Notes |
|------|-------|
| `SuppliersPage` | Remove icon, strip dynamic count from subtitle |
| `PurchaseOrdersPage` | Remove icon, static subtitle |
| `VendorPaymentsPage` | Remove icon, static subtitle |
| `GoodsReceivedPage` | Remove icon, static subtitle |

### Explicitly excluded from this issue

- `CategoriesPage`, `ChartOfAccountsPage` (tree structures)
- All report pages (Inventory, Sales, Purchasing, Accounting)
- `AuditLogsPage` (custom layout)
- Accounting CRUD pages (`JournalEntriesPage`, `ExpensesPage`, etc.)
- `AccountingDashboardPage`
- `DashboardPage`
- `BackupManagement.tsx` (embedded section-header pattern — nonstandard)
- `PriceListDetailsPage.tsx` (detail page with inline section-header usage — nonstandard)
- `PurchasingPage.tsx` (multi-section overview with multiple sub-headers — defer)

---

## Migration Rules (per page)

Apply these in order for every migrated page:

1. Replace the inline `TYPOGRAPHY_STYLES.pageHeader` block with `<PageHeader title="..." subtitle="..." primaryAction={...} secondaryAction={...} />`
2. Drop the title icon — do not port it
3. Strip dynamic counts from subtitle; relocate near table if meaningful, otherwise omit
4. Map existing actions to `primaryAction` / `secondaryAction` (max 2); if more than 2 actions exist, defer the page
5. Remove now-unused `TYPOGRAPHY_STYLES` import lines if the file no longer references them
6. If a page does not cleanly fit the standard `PageHeader` pattern, defer it — do not expand the component or introduce one-off exceptions

---

## Commit Structure

```
refactor(page-header): bump title weight to 700, increase bottom margin to mb:4
refactor(inventory): migrate ProductsPage, StockAdjustmentsPage, InventoryPage, CreateProductPage to PageHeader
refactor(settings): migrate 10 settings pages to PageHeader
refactor(purchasing): migrate SuppliersPage, PurchaseOrdersPage, VendorPaymentsPage, GoodsReceivedPage to PageHeader
```

---

## Testing

- Confirm the existing `shows divider by default` and `hides divider when showDivider is false` test cases in `PageHeader.test.tsx` still pass after the `fontWeight`/`mb` changes. No new test case needed.
- Do not introduce new brittle CSS-value tests for `fontWeight` or `mb`
- Run full Vitest suite after each module batch before proceeding to the next
- Manual visual QA after each module batch: confirm title hierarchy, subtitle cleanliness, action alignment, divider behavior, and absence of dynamic counts in subtitles
- TypeScript `type-check` pass at the end: `cd frontend && npm run type-check`

---

## What Is Not In Scope

- Adding an `icon` prop to `PageHeader`
- Deprecating or removing `TYPOGRAPHY_STYLES` (still used for table headers, chips, search fields)
- Filter Bar standardization (next system after this rollout)
- Visual regression tooling
- Storybook (not in project)
- Accounting pages, report pages, tree-structure pages (Phase 2C — separate issue)
