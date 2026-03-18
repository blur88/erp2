# Reports Flyout: Category-First Design

**Date:** 2026-03-18
**Issue:** #130 — Reports flyout overflows viewport in collapsed sidebar mode
**Scope:** Collapsed sidebar flyout only

---

## Problem

The consolidated Reports section has ~24 items across 4 groups. In collapsed sidebar mode, the flyout renders all items at once with no height constraint, causing overflow and making some reports unreachable.

A scrollable-only fix (Option A from issue) is a patch. The better fix is to redesign the flyout interaction model.

---

## Decision: Category-First Flyout (collapsed mode only)

The expanded sidebar is unchanged. Routes, menu IA, and all non-Reports flyouts are unchanged.

In collapsed mode, hovering Reports opens a compact flyout that shows only the 4 report categories first. The user clicks a category to expand its reports inline. Only one category is open at a time.

---

## Scope

### What changes

- `MenuItem` type: add optional `flyoutMode?: 'category-first'`
- Reports menu item definition: set `flyoutMode: 'category-first'`
- `Sidebar` component state: add `flyoutExpandedGroup: string | null`
- `Sidebar` component rendering: category-first flyout rendering path for items with `flyoutMode === 'category-first'`
- Flyout `Paper` sizing: `minWidth: 240`, `maxWidth: 280`, `maxHeight: 'calc(100vh - 24px)'`, `overflowY: 'auto'`

### What does not change

- Expanded sidebar rendering (full grouped tree, all reports visible)
- All other flyout items (Settings, etc.)
- Routing and menu data structure (paths, ids, groups, titles)
- Hover-to-open / close timer logic
- Escape key and mouse-leave close behavior
- `flyoutExpandedIds` state (used by Settings flyout and any future multi-level flyouts)

---

## Data Model

### MenuItem type addition

```ts
interface MenuItem {
  // ... existing fields ...
  flyoutMode?: 'category-first'
}
```

Set only on the Reports menu item. No other items use this flag.

### New Sidebar state

```ts
const [flyoutExpandedGroup, setFlyoutExpandedGroup] = React.useState<string | null>(null)
```

This is separate from `flyoutExpandedIds`. It tracks which report category is currently expanded in the flyout. Only one can be open at a time (accordion).

The key is a lowercase slug derived from `child.group`:

| Display label | Key        |
|---------------|------------|
| Sales         | `sales`    |
| Purchasing    | `purchasing` |
| Inventory     | `inventory` |
| Accounting    | `accounting` |

Slugs are derived via `group.toLowerCase()`. These group names are stable and controlled in the codebase.

---

## Interaction Model

### Flyout open

1. User hovers the Reports rail icon → existing hover timer fires → `openFlyout` called
2. `flyoutExpandedGroup` is set to the slug of the currently active route's group (auto-expand), or `null` if the user is not on a report page
3. Flyout opens showing 4 category headers only

### Within the flyout

4. User clicks a category header → toggle: if that group is already expanded, collapse it (`setFlyoutExpandedGroup(null)`); otherwise expand it (`setFlyoutExpandedGroup(slug)`)
5. Expanded category shows its report items inline below the header
6. Only one category is open at a time — clicking a new category implicitly collapses the previous one
7. User clicks a leaf report item → navigate + close flyout (existing behavior)

### Flyout close

8. Mouse leaves flyout or rail → existing 150ms debounce close
9. Escape key → existing close + focus trigger
10. Route change → existing `useEffect` clears all flyout state including `flyoutExpandedGroup`

---

## Rendering Architecture

The special-case rendering is applied at the **flyout root entry point**, not inside the recursive `renderFlyoutItem` path.

In the Popper render block (currently `Sidebar.tsx:1287–1336`), after resolving `flyoutItem`:

```
if flyoutItem.flyoutMode === 'category-first':
  render <CategoryFirstFlyout> (new internal component or inline render)
else:
  render existing <List> with renderFlyoutItem children (unchanged)
```

### CategoryFirstFlyout rendering

For each unique group in `flyoutItem.children` (in order of first appearance):

1. Render a **category header** `ListItemButton`:
   - Label: group display name (e.g. "Sales")
   - Right-side chevron: rotated down when expanded
   - `onClick`: toggle `flyoutExpandedGroup`
   - `selected` styling when this group matches the active route's group

2. If `flyoutExpandedGroup === slug`:
   - Render the group's report children as `ListItemButton` items below the header
   - Same click behavior as today (navigate + close)
   - Same active styling as today

### Settings flyout and other flyouts

Unaffected. They continue to use `renderFlyoutItem` recursively as today.

---

## Flyout Paper Sizing

```ts
sx={{
  bgcolor: SIDEBAR_COLORS.hoverBg,
  minWidth: 240,   // increased from 200
  maxWidth: 280,   // increased from 240
  maxHeight: 'calc(100vh - 24px)',  // viewport-bounded
  overflowY: 'auto',               // scroll fallback
  py: 1,
  borderRadius: 1,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  '@keyframes flyoutEnter': {
    from: { transform: 'translateX(-4px)' },
    to: { transform: 'translateX(0)' },
  },
  animation: 'flyoutEnter 0.12s ease-out',
}}
```

The `maxHeight` + `overflowY` are a safeguard for the category-first view and any future flyouts that might grow large.

---

## Auto-Expand on Open

When `openFlyout` is called for the Reports item, determine the active group:

```ts
const activeGroup = flyoutItem.children
  ?.find(child => child.path && location.pathname.startsWith(child.path))
  ?.group?.toLowerCase() ?? null

setFlyoutExpandedGroup(activeGroup)
```

If the user is not on any report route, `flyoutExpandedGroup` starts as `null` (all categories collapsed).

---

## State Reset

`flyoutExpandedGroup` is reset alongside `flyoutItemId` and `flyoutAnchorEl` in:

- The `closeFlyout` delayed cleanup (after 80ms fade)
- The `useEffect` that watches `location.pathname`
- The cleanup `useEffect` on unmount

---

## Acceptance Criteria

- [ ] Reports flyout in collapsed mode shows only 4 category headers initially
- [ ] Clicking a category expands its report items inline
- [ ] Only one category is expanded at a time (accordion)
- [ ] Clicking the active category collapses it
- [ ] Clicking a report item navigates and closes the flyout
- [ ] If the user is on a report page, that category auto-expands on flyout open
- [ ] Flyout Paper is `280px` wide and viewport-bounded with scroll fallback
- [ ] Escape and mouse-leave close behavior is unchanged
- [ ] Expanded sidebar is unchanged
- [ ] Settings flyout and other flyouts are unchanged
- [ ] All existing Sidebar tests pass
