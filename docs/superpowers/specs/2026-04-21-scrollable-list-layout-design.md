# Scrollable List Layout Fix — Design Spec

**Issue:** #403
**Date:** 2026-04-21

## Problem

On pages that use `GenericListPage` (Chart of Accounts, Inventory, Sales, Purchasing, etc.), when the list of records is long the entire browser page scrolls. This causes the top bar, page header, and filter bar to scroll out of view.

## Goal

The list panel (Master side of the Master-Detail layout) should scroll independently. The page header, filter bar, and top bar remain fixed in the viewport at all times.

## Root Cause

`MainLayout.tsx` — the `<main>` Box uses `minHeight: '100vh'`, which allows the content area to grow unboundedly beyond the viewport. All components below it in the flex chain (`GenericListPage`, `MasterDetailWorkspace`, `EntityTable`) already have the correct height-constraining properties (`flex: 1`, `minHeight: 0`, `overflow: auto`) — they simply have nothing to constrain against because their parent can expand infinitely.

## Fix

**File:** `frontend/src/components/common/MainLayout.tsx`

Change the `<main>` Box:

```
// Before
minHeight: '100vh'

// After
height: '100%'
```

The outer `Box` shell retains `minHeight: '100vh'` so the sidebar and top bar always fill the screen. The `<main>` with `height: '100%'` fills its flex parent without growing past the viewport, giving the flex chain below a concrete height to work against.

## Scope

Global — all pages that render through `MainLayout` and use `GenericListPage` get scrollable list panels automatically. No changes required to `GenericListPage`, `MasterDetailWorkspace`, or `EntityTable`.

## Components Not Changed

| Component | Current state | Status |
|---|---|---|
| `GenericListPage` | `flex: 1, minHeight: 0` | Already correct |
| `MasterDetailWorkspace` | `flex: 1, minHeight: 0` on row container | Already correct |
| `EntityTable` | `TableContainer: flex 1, overflow auto` | Already correct |

## Testing Checklist

- [ ] COA page: list scrolls independently, page header and filter bar stay fixed
- [ ] Inventory page: same behaviour
- [ ] Sales page: same behaviour
- [ ] Purchasing page: same behaviour
- [ ] Settings / Dashboard: short pages are not clipped or visually broken
- [ ] Mobile layout: stacked layout on narrow viewports renders correctly
