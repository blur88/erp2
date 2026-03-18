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
- `flyoutExpandedIds` state — retained because it is structurally wired into `renderFlyoutItem` (used at lines 798 and 810 for any flyout item that has nested children). After this change, no current flyout item has nested children, so it is dormant but not dead code. Remove it only if confirmed nothing uses it after the change; otherwise keep it.

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
2. Inside `openFlyout`, after the existing `setFlyoutExpandedIds(autoExpanded)` call, add a call to `setFlyoutExpandedGroup(activeGroup)` — where `activeGroup` is derived from the auto-expand logic described in the Auto-Expand on Open section below
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
   - `selected` styling: a category header is `selected` when any of its children is active, determined via the existing `isItemActive` helper — i.e. `groupChildren.some(child => isItemActive(child))`. This is independent of `flyoutExpandedGroup`: a user can expand a non-active category without it becoming `selected`, and the active category header stays `selected` even when collapsed. Use `isItemActive` (which uses exact `===` path matching) rather than duplicating pathname logic inline.
   - **`data-flyout-first="true"`** on the first category header (i.e. the one at index 0). This attribute is used by the existing keyboard handler in `renderMenuItem` to move focus into the flyout when the user presses Enter/Space on the collapsed Reports rail icon. Without it, keyboard users can open the flyout but focus will not move into it.

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

When `openFlyout` is called for the Reports item, determine the active group by matching `location.pathname` against each child's path. Use an **exact segment match** rather than a bare `startsWith` to avoid the Accounting path collision: Accounting reports live under `/accounting/reports/...` while the Accounting module (journal entries, chart of accounts, etc.) lives under `/accounting/...`. A bare `startsWith('/accounting/')` would spuriously match non-report pages.

Use `isItemActive` (exact `===` match) for consistency with the rest of the sidebar:

```ts
const activeChild = flyoutItem.children?.find(child => isItemActive(child))
const activeGroup = activeChild?.group?.toLowerCase() ?? null
setFlyoutExpandedGroup(activeGroup)
```

`isItemActive` uses `location.pathname === item.path` for leaf nodes, which is exact and safe. Prefer this over `startsWith` unless report detail subroutes are intentionally added later.

If the user is not on any report route, `flyoutExpandedGroup` starts as `null` (all categories collapsed).

---

## State Reset

`flyoutExpandedGroup` must be reset in the same places as `flyoutItemId` and `flyoutAnchorEl`:

- **`closeFlyout` delayed cleanup** (80ms after `flyoutOpen` → false): add `setFlyoutExpandedGroup(null)` alongside the existing state clears
- **`useEffect` watching `location.pathname`**: add `setFlyoutExpandedGroup(null)` alongside the existing clears (this effect resets state on navigation)
- **The unmount cleanup `useEffect`** (lines 766–772): this effect only cancels timers — it does NOT reset state, and the existing code does not do so either. No state reset is needed here.

---

## Test Coverage

The following new test cases should be added to the Sidebar test file:

1. **Category-first initial render** — when `collapsed={true}` and the Reports flyout is open, assert that only the 4 category header labels are visible (Sales, Purchasing, Inventory, Accounting) and no leaf report items are visible
2. **Category expand** — clicking a category header renders that category's report items inline
3. **Accordion** — expanding a second category collapses the first
4. **Toggle collapse** — clicking the same open category collapses it
5. **Leaf navigation** — clicking a report item calls navigate and closes the flyout
6. **Auto-expand** — when `location.pathname` is a Sales report path, opening the Reports flyout shows Sales expanded by default
7. **Keyboard focus** — pressing Enter on the rail Reports button with `collapsed={true}` moves focus to the first category header (`data-flyout-first`)
8. **Non-Reports flyout unchanged** — collapsed Settings flyout still renders the existing flat list, not the category-first view

---

## Acceptance Criteria

- [ ] Reports flyout in collapsed mode shows only 4 category headers initially
- [ ] Clicking a category expands its report items inline
- [ ] Only one category is expanded at a time (accordion)
- [ ] Clicking the active category collapses it
- [ ] Clicking a report item navigates and closes the flyout
- [ ] If the user is on a report page, that category auto-expands on flyout open
- [ ] Flyout Paper uses widened bounds (`minWidth: 240`, `maxWidth: 280`) and is viewport-bounded with scroll fallback
- [ ] Escape and mouse-leave close behavior is unchanged
- [ ] Expanded sidebar is unchanged
- [ ] Settings flyout and other flyouts are unchanged
- [ ] All existing Sidebar tests pass
- [ ] New tests from Test Coverage section are written and pass
