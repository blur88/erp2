# Issue #276 — Auto-Expand MasterDetailWorkspace to Fill Available Height

**Date:** 2026-04-04  
**Issue:** blur88/erp2#276  
**Scope:** `MainLayout`, `MasterDetailWorkspace`, and these four pages only:
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- `frontend/src/pages/inventory/ProductsPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

---

## Objective

Replace the brittle viewport-based height calculation used by the master-detail layouts with a flex-based height chain so the workspace expands naturally to the bottom of the available page area.

The desired result is:
- no large empty gap under the workspace
- no browser scrollbar plus inner panel scrollbar for the same region
- independent scrolling preserved inside the list/detail panels where intended
- only the standard `MainLayout` padding remains below the content

This spec is intentionally limited to the pages named in issue `#276`. Other pages that still use fixed-height cards remain out of scope.

---

## Recommended Approach

Use a route-level flex chain.

`MainLayout` will define the available vertical space for routed content. Each target page will opt into filling that space with `flex: 1`, `display: 'flex'`, `flexDirection: 'column'`, and `minHeight: 0`. `MasterDetailWorkspace` will stop computing its own viewport height and instead consume the remaining height with `flex: 1`.

This is preferred over a local patch inside `MasterDetailWorkspace` because the problem is structural: the workspace is compensating for missing layout constraints from its parents. Fixing the flex chain at the layout and page level is more robust than moving the hardcoded height elsewhere.

---

## Architecture

### `MainLayout`

**File:** `frontend/src/components/common/MainLayout.tsx`

The routed content area currently uses `minHeight: '100vh'` and `overflow: 'hidden'`, but it does not behave as a column flex container for its child route content. For this issue:

- Keep the outer app shell layout unchanged
- Update the `main` content container to:
  - `display: 'flex'`
  - `flexDirection: 'column'`
  - `minHeight: '100vh'`
  - `overflow: 'hidden'`
- Wrap or style the routed content region so the active page can participate in a flex height chain:
  - `flex: 1`
  - `minHeight: 0`
  - `display: 'flex'`
  - `flexDirection: 'column'`

The important design constraint is that the page rendered by `<Outlet />` must receive bounded vertical space from `MainLayout`, not just width and padding.

### `MasterDetailWorkspace`

**File:** `frontend/src/components/common/MasterDetailWorkspace.tsx`

This component remains a layout shell with the same slot API:

```tsx
interface MasterDetailWorkspaceProps {
  listSlot: React.ReactNode
  headerSlot: React.ReactNode
  workspaceSlot: React.ReactNode
  isMobile: boolean
}
```

Desktop layout changes:
- Replace `height: 'calc(100vh - 300px)'` with `flex: 1`
- Add `minHeight: 0` to the outer desktop container
- Add `minHeight: 0` to the left list column
- Add `minHeight: 0` to the right column and the nested workspace wrapper

Desktop behavior remains:
- left column is a fixed-width navigation/list region
- right column stacks the context header above the main workspace
- lower workspace region fills the remaining height

Mobile behavior remains stacked and content-driven. No attempt is made to force a viewport-height layout on mobile.

---

## Page Responsibilities

### `OrdersPage.tsx`

`OrdersPage` already uses `MasterDetailWorkspace`, so this page should be converted to a column flex page shell:

- Root page container becomes:
  - `display: 'flex'`
  - `flexDirection: 'column'`
  - `flex: 1`
  - `minHeight: 0`
- `PageHeader`, `FilterBar`, and any error `Alert` remain natural-height siblings above the workspace
- `MasterDetailWorkspace` becomes the single expanding child:
  - `flex: 1`
  - `minHeight: 0`

No changes to selection logic, data fetching, actions, or dialogs.

### `PurchaseOrdersPage.tsx`

Apply the same page-shell pattern as `OrdersPage`:

- root container becomes a column flex container with `flex: 1` and `minHeight: 0`
- header, filters, and alerts remain natural-height
- `MasterDetailWorkspace` becomes the height-filling child

No behavior changes to actions, selection, mutation flows, or dialogs.

### `ProductsPage.tsx`

`ProductsPage` does not use `MasterDetailWorkspace`, but it implements the same master-detail pattern with `Grid` plus fixed-height internal cards. For this issue:

- Convert the page root to a column flex shell with `flex: 1` and `minHeight: 0`
- Keep the existing page header and filter bar as natural-height blocks
- Convert the content area containing the `Grid` into the single expanding region
- Ensure the grid container and the two grid items can shrink inside the available height:
  - parent wrapper uses `flex: 1` and `minHeight: 0`
  - grid container uses `height: '100%'` or equivalent flex fill behavior plus `minHeight: 0`
  - relevant child wrappers use `minHeight: 0`

This page is in scope because the issue explicitly names it, even though it does not literally render `MasterDetailWorkspace`.

### `StockAdjustmentsPage.tsx`

`StockAdjustmentsPage` is also in scope as a master-detail page with fixed-height cards but no `MasterDetailWorkspace` component.

For this issue:
- convert the page root to a column flex shell with `flex: 1` and `minHeight: 0`
- keep page header, filter bar, and alerts/content above the workspace at natural height
- make the main two-column content region the single expanding child
- ensure the master list panel and detail panel wrappers participate in the shrinkable flex chain with `minHeight: 0`

As with `ProductsPage`, this is a targeted migration of layout structure, not a functional refactor.

---

## Scroll and Overflow Rules

This issue succeeds or fails on scroll behavior more than on raw sizing.

### Required principle

Any flex child that must shrink below its content height needs `minHeight: 0`. Without that, nested scroll containers will overflow and reintroduce double scrollbars even if `flex: 1` is present.

### Required scroll behavior on desktop

- The browser page should not scroll because the workspace cards exceed their available height
- The left list panel should keep its own internal scroll behavior
- The right detail/workspace region should keep its own internal scroll behavior
- Context headers above the lower workspace should remain visible while the lower workspace consumes remaining height

### Expected placement of `minHeight: 0`

At minimum, expect it on:
- the routed content wrapper in `MainLayout`
- the root container in each target page
- the outer desktop container in `MasterDetailWorkspace`
- the right column wrapper in `MasterDetailWorkspace`
- any nested wrapper that owns an internally scrolling `Paper`, `TableContainer`, or list region

---

## Data Flow and Behavior

- No new state
- No new hooks
- No API contract changes
- No route changes
- No changes to filter behavior, selection behavior, dialog behavior, or action handlers

This is a layout-only refactor. The pages should render the same content and keep the same user interactions.

---

## Error Handling

Existing alert placement remains unchanged:
- page-level fetch errors stay above the workspace region
- empty states inside list/detail panels remain inside those panels

The layout must still behave correctly when:
- no row is selected
- the list is empty
- the detail pane renders an empty or loading state
- an error alert is present above the workspace

---

## Testing Strategy

### Automated

No new business-logic tests are required, but existing page tests should continue to pass after structural wrapper changes.

Affected verification will primarily come from:
- frontend lint
- frontend type-check
- existing frontend test suite for touched pages/components

### Manual

Manual verification is required because the issue is visual and responsive:

- confirm no bottom gap below the workspace except standard `MainLayout` padding
- confirm no double-scroll behavior on the target pages
- confirm the list and detail/workspace regions scroll independently where intended
- confirm behavior on at least:
  - a smaller laptop-height viewport
  - a larger desktop monitor-height viewport
- confirm mobile layout still stacks naturally and does not inherit desktop height constraints

---

## Out of Scope

- repo-wide replacement of all `calc(100vh - 300px)` occurrences
- sales invoices, payments, vendor payments, goods received, or other similar pages not named in issue `#276`
- visual redesign of the master-detail pages
- changes to widths, breakpoints, or card content structure unrelated to height filling
- generic reusable abstractions beyond what already exists in `MainLayout` and `MasterDetailWorkspace`
