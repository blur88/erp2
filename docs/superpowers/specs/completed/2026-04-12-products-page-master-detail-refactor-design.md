# ProductsPage Master-Detail Refactor Design

**Issue:** #340
**Date:** 2026-04-12

## Goal

Refactor `ProductsPage.tsx` to follow the standardized Master-Detail pattern used by `SuppliersPage`, `PurchaseOrdersPage`, and `GoodsReceivedPage`. The result should be structurally identical to those pages: `MasterDetailWorkspace` as the layout primitive, a lean page state hook, a clean selection hook, and three focused UI components (`ProductList`, `ProductContextHeader`, `ProductWorkspaceCard`).

## Approach

Incremental by layer — three sequential commits:
1. Hooks
2. Components
3. Page rewrite + test updates

Each commit leaves the app in a working state.

---

## Layer 1: Hooks

### `useProductsPageState`

Remove `currentTab` and `setCurrentTab` — tab state moves into `ProductWorkspaceCard` where it belongs. All other state stays (`deleteConfirmOpen`, `productToDelete`, `focusedProductIndex`, `deletedProductsDialogOpen`, `importDialogOpen`, `calculatorPanelOpen`, `exportMenuAnchor`, `isExporting`, `productListRef`, `searchInputRef`).

### `useProductsSelection`

Changes:
- Drop `selectedCategory` param — it was unused
- Drop `location` from params — read `useLocation()` internally instead
- Replace the 4-effect auto-selection tangle with a single `hasAutoSelected` ref approach (matching `useSuppliersSelection`)
- Keep deep-link handling via `location.state.selectedProductId` — `CreateProductPage` navigates back with this state after save/edit; dropping it would break the "save → return → product highlighted" UX
- Rename `handleNavigateHome` → `handleNavigateToFirst`
- Rename `handleNavigateEnd` → `handleNavigateToLast`

### `useProductsActions`

No changes — already clean and consistent with the pattern.

---

## Layer 2: Components

### `ProductList.tsx` (replaces `ProductsTable.tsx`)

- Extract memo-ized `ProductRow` sub-component (matching `SupplierRow` pattern)
- Skeleton loading rows when `loading && products.length === 0` (replaces spinner)
- Remove `onFocus` prop — focus handled by selection hook via `hasAutoSelected` ref
- Remove `DragIndicatorIcon` — not present in reference implementations
- Change fixed `height: 'calc(100vh - 300px)'` → `height: '100%'` — `MasterDetailWorkspace` controls height
- Props: `products`, `loading`, `selectedProductId`, `focusedIndex`, `onSelect`, `productListRef`

### `ProductContextHeader.tsx` (split from `ProductDetailsPanel`)

- Header bar: product name + Edit / Delete icon buttons
- Empty state: "Select a product to view details" when `selectedProduct` is null
- Props: `selectedProduct`, `onEdit`, `onDelete`
- Matches `SupplierContextHeader` structure exactly

### `ProductWorkspaceCard.tsx` (split from `ProductDetailsPanel`)

- Three tabs: Details (`ProductDetailsTab`), Movement History (`MovementHistoryTab`), Order History (`OrderHistoryTab`)
- Local `tabValue` state (not lifted)
- `useEffect` resets `tabValue` to 0 when `selectedProduct?.id` changes
- Empty state: blank `<Paper sx={{ flex: 1 }} />` when no product selected
- Props: `selectedProduct`

### `ProductsDialogs.tsx`

No structural changes. Update internal import if `ProductsTable` reference exists.

### Delete

`ProductDetailsPanel.tsx` is deleted once `ProductContextHeader` and `ProductWorkspaceCard` are in place.

---

## Layer 3: Page Rewrite

### `ProductsPage.tsx`

- Outer container: `<Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>`
- Remove the two `<Box>` wrappers with `calculatorPanelOpen` margin-right animation — layout handled by `MasterDetailWorkspace`
- Replace `<Grid container>` with `<MasterDetailWorkspace listSlot={...} headerSlot={...} workspaceSlot={...} isMobile={isMobile} />`
- Add `isMobile` via `useMediaQuery(theme.breakpoints.down('md'))`
- Update selection hook call: remove `selectedCategory` and `location` args
- Update keyboard shortcut handlers: `onHome` → `handleNavigateToFirst`, `onEnd` → `handleNavigateToLast`
- Remove `useLocation` import (moves into hook)

---

## Verification

### Test updates

| File | Change |
|------|--------|
| `ProductsPage.filterbar.test.tsx` | Update mocks: `ProductsTable` → `ProductList`, `ProductDetailsPanel` → `ProductContextHeader` + `ProductWorkspaceCard` |
| `ProductsTable.test.tsx` → `ProductList.test.tsx` | Rename file, update import and component name |
| `useProductsSelection.test.tsx` | Drop `selectedCategory` and `location` params from hook calls |

### Manual checks

- Up/Down/PageUp/PageDown/Home/End keyboard navigation works
- Enter navigates to edit page
- Escape clears selection
- All three filters (Category, Type, Stock Status) work correctly
- Save product on edit page → returns to list with that product selected (deep-link)
- Mobile layout renders stacked

---

## What This Refactor Does NOT Change

- Filter configuration and query param mapping — no changes
- Export functionality — no changes
- Deleted products dialog, import dialog, calculator panel — no changes
- Deep-link behavior from `CreateProductPage` — preserved
- Backend API calls — no changes
- `useLazyGetProductQuery` — not used; products are already fully loaded in the list query, no per-selection fetch needed
