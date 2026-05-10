# Categories Master-Detail Polish — Design Spec

**Issues:** #348, #349
**Date:** 2026-04-13

---

## Overview

Two focused UI improvements to the Categories page (recently rewritten with the Master-Detail pattern). Issue #348 removes redundant columns from the list panel. Issue #349 fills out the detail panel with a proper info grid and a usable Related Products tab.

---

## Issue #348 — Clean up CategoryList

### Problem

`CategoryList.tsx` shows a product count Chip and a creation date on every row. Now that the detail panel (`CategoryContextHeader`) will show this information, these columns are redundant and clutter the tree view, especially for nested items.

### Changes to `CategoryList.tsx`

**`CategoryRow`:**
- Remove the `TableCell` containing the product count `Chip`.
- Remove the `TableCell` containing the `createdAt` `Typography` (and the `{!isMobile && ...}` conditional wrapping it).
- Remove `isMobile` from `CategoryRowProps` and the `CategoryRow` component signature — it is no longer needed.
- The name cell expands to fill the full row width naturally (no explicit width needed).

**`CategoryList` (container):**
- Remove `useMediaQuery` and `useTheme` — no longer needed.
- Remove `isMobile` prop drilling to `CategoryRow`.
- Update `colSpan` on skeleton rows and the empty-state row from `3`/`2` to `1`.

**Imports to remove:** `Chip`, `formatDate`, `useMediaQuery`, `useTheme`.

---

## Issue #349 — CategoryContextHeader info grid + WorkspaceCard improvements

### Problem

`CategoryContextHeader` is a title bar with no detail content. `CategoryWorkspaceCard` has a Details tab with a basic key/value grid and a Products tab with a plain text list. Neither matches the pattern established by `CustomerContextHeader` / `CustomerWorkspaceCard`.

### `CategoryContextHeader.tsx`

Rewrite the body below the title bar to use the `CustomerContextHeader` table pattern:

- Two-column `Grid` (each column contains a `Table` with alternating `grey.50` rows, `0.8rem` font, `TABLE_STYLES` sizing).
- Extract shared styles into `detailTableSx`, `labelCellSx`, `valueCellSx` constants (same as `CustomerContextHeader`).

**Left column — "Category Info":**
| Field | Value |
|---|---|
| Category Path | `selectedCategory.fullPath` |
| Level | `"Root"` if level 0, else `"Level N"` |
| Parent | `selectedCategory.parent?.name` or `"None"` if root |

**Right column — "Summary":**
| Field | Value |
|---|---|
| Product Count | `Chip` — label `"N items"`, color `primary` if > 0, `default` if 0 |
| Created | `formatDate(selectedCategory.createdAt)` |
| Status | `"Active"` (green) / `"Inactive"` (disabled), based on `selectedCategory.isActive` |

Title bar (name + Edit/Delete buttons) is unchanged.

The "Select a category to view details" empty state is unchanged.

### `CategoryWorkspaceCard.tsx`

- Remove the inline `Grid` of key/value pairs from the Details tab — this info now lives in `CategoryContextHeader`.
- **Details tab** — show a single read-only field: `Full Path`, using the same label/value table style. This keeps the tab as a placeholder for future fields without leaving it empty.
- **Products tab** — remove the inline product list and replace with `<CategoryProductsList categoryId={selectedCategory.id} />`.

### New file: `CategoryProductsList.tsx`

Location: `frontend/src/pages/inventory/components/CategoryProductsList.tsx`

Follows the `CustomerWorkspaceCard` Orders tab pattern exactly.

**Props:**
```ts
interface CategoryProductsListProps {
  categoryId: string
}
```

**Data:** `useGetProductsQuery({ categoryId })` — already used in the existing workspace card, no new API endpoints needed. Products are in `response.data`.

**States:**
- Loading: centered `CircularProgress`
- Error: `"Failed to load products."` (error.main, centered)
- Empty: `"No products in this category."` (text.secondary, centered)

**Table columns:**
| Column | Source | Notes |
|---|---|---|
| Name | `product.name` | Bold, `color: primary.main` |
| Barcode | `product.barcode` | `"—"` if absent |
| Stock | `product.stockQuantity` + status Chip | Chip: Out of Stock (error), Low Stock (warning), In Stock (success) |

**Stock thresholds:** Use `useGetRegionalSettingsQuery` for `lowStockThreshold` (same as `ProductDetailsTab`) — stock ≤ 0 → Out of Stock, stock ≤ threshold → Low Stock, else In Stock.

**Table styling:** `TABLE_STYLES.size`, `grey.50` header background, `fontWeight: 600` on header cells, `hover` on rows, no row click navigation.

---

## Files Changed

| File | Change |
|---|---|
| `CategoryList.tsx` | Remove product count Chip, date cell, isMobile logic |
| `CategoryContextHeader.tsx` | Add two-column info grid below title bar |
| `CategoryWorkspaceCard.tsx` | Simplify Details tab; replace Products tab with `CategoryProductsList` |
| `CategoryProductsList.tsx` | **New** — proper product table with loading/error/empty states |

## Files Unchanged

- `CategoriesPage.tsx` — no changes needed
- `useCategoriesPageState.ts`, `useCategoriesActions.ts`, `useCategoriesSelection.ts` — no changes needed
- All backend files — no new endpoints needed
