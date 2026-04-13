# Category Workspace & Header Polish — Design Spec

**Issues:** #350 (simplify CategoryWorkspaceCard), #351 (fix CategoryContextHeader)
**Date:** 2026-04-13

---

## Overview

Two focused UI fixes to the inventory categories master-detail view:

1. **#350** — Remove tabs from `CategoryWorkspaceCard`, replacing with a simple products table + notes pattern matching `PurchaseOrderWorkspaceCard`.
2. **#351** — Fix broken "Category Path" and "Parent Category" display in `CategoryContextHeader`, and remove the unused "Status" row.

---

## Issue #350 — Simplify CategoryWorkspaceCard

### Problem

`CategoryWorkspaceCard` currently has a 2-tab layout ("Details" / "Products"). The Details tab only shows `fullPath`, which is redundant with the context header. The tab structure adds unnecessary complexity.

### Design

Rewrite `CategoryWorkspaceCard.tsx` following the `PurchaseOrderWorkspaceCard` pattern:

**Structure:**
```
Paper (flex column, overflow hidden)
  ├── Title bar: "Category Products" (TABLE_STYLES header style)
  ├── TableContainer (flex 1, overflow auto)
  │     Table: Name | Stock | Stock Status
  │     Empty state: "No products in this category."
  └── Notes section (conditional, shown only when description is non-empty)
        Label: "NOTES"
        Content box (grey.50 background, pre-wrap)
```

**Columns:** Name (left-aligned), Stock quantity (right-aligned number), Stock Status chip (Out of Stock / Low Stock / In Stock — colors: error / warning / success).

**Data fetching:** Move the `useGetProductsQuery({ categoryId })` and `useGetRegionalSettingsQuery()` calls inline into `CategoryWorkspaceCard` (currently in `CategoryProductsList`). The stock status logic moves with them.

**Notes:** Use `selectedCategory.description` (the `description` field on the `Category` type). Hidden when empty/null.

**Removed:** All `Tabs`, `Tab`, `tabValue` state, `useEffect` for tab reset, `CategoryProductsList` import.

**`CategoryProductsList`:** Retain the file — it has its own test (`CategoryProductsList.test.tsx`) and may be used elsewhere.

---

## Issue #351 — Fix CategoryContextHeader

### Problem

1. **Category Path** shows only the leaf name (e.g., `CatA12`) or partial path (e.g., `CatA > CatA12`) instead of the full hierarchy from root.
2. **Parent Category** always shows `—` because the API response does not eager-load the `parent` relation.
3. **Status** row is irrelevant for categories and clutters the UI.

### Root Cause

- `fullPath` on the backend entity splits the `path` DB column by `.`, but `path` is built incrementally during category creation and can be incomplete for older/migrated data.
- `toResponseDto` in `category.service.ts` does not include the `parent` relation, so `selectedCategory.parent` is always `undefined` on the frontend.

### Design

**New prop:** `CategoryContextHeader` accepts `allCategories: Category[]` (flat list from the caller's `useGetCategoriesQuery` cache — no extra fetch).

**New helper function** (inline in `CategoryContextHeader.tsx`):
```ts
function buildCategoryHierarchy(categoryId: string, allCategories: Category[]): string {
  const names: string[] = []
  let current = allCategories.find(c => c.id === categoryId)
  while (current) {
    names.unshift(current.name)
    current = current.parentId
      ? allCategories.find(c => c.id === current!.parentId)
      : undefined
  }
  return names.length > 0 ? names.join(' > ') : '—'
}
```

**Changes to rows:**
- "Category Path": replace `selectedCategory.fullPath` with `buildCategoryHierarchy(selectedCategory.id, allCategories)`
- "Parent Category": replace `selectedCategory.parent?.name` with `allCategories.find(c => c.id === selectedCategory.parentId)?.name ?? 'None'`
- "Status": remove row entirely

**Caller update:** Wherever `CategoryContextHeader` is rendered, pass the flat `allCategories` list as a prop. The inventory categories page already calls `useGetCategoriesQuery` so this is a prop pass-through only.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx` | Full rewrite — remove tabs, add inline products table + notes |
| `frontend/src/pages/inventory/components/CategoryContextHeader.tsx` | Add `allCategories` prop, add `buildCategoryHierarchy` helper, fix path + parent rows, remove status row |
| Inventory categories page (caller of `CategoryContextHeader`) | Pass `allCategories` prop |

## Files Not Changed

- `CategoryProductsList.tsx` — retained as-is (has own tests)
- Backend — no changes needed

---

## Testing

- Verify "Category Path" shows full hierarchy for root, mid-level, and leaf categories
- Verify "Parent Category" shows correct name (not `—`) for non-root categories, shows `None` for root
- Verify "Status" row is gone
- Verify workspace card shows products table with Name / Stock / Stock Status columns
- Verify Notes section appears when `description` is set, hidden when empty
- Verify empty state ("No products in this category.") when category has no products
- Run `CategoryProductsList.test.tsx` — should still pass (component untouched)
