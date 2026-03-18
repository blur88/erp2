# Sidebar Density Adjustment — Design Spec

**Issue:** #132
**Date:** 2026-03-18
**File:** `frontend/src/components/common/Sidebar.tsx`

---

## Goal

Reduce expanded sidebar item heights to improve ERP scanning density without changing typography, icon sizing, or interaction patterns.

---

## Changes

### `renderMenuItem` — expanded sidebar items

Change item height from `44px` to `40px`.

Affects expanded sidebar items rendered through `renderMenuItem`. This is the main render path for all items when the sidebar is not collapsed.

**Line:** the `height: 44` in the `renderMenuItem` return block's `ListItemButton` sx prop.

```ts
// before
height: 44,

// after
height: 40,
```

### `renderFlyoutItem` — nested and flyout panel items

Change item height from `40px` to `36px`.

Affects nested items that use `renderFlyoutItem` — both the flyout panel (collapsed rail mode) and inline children rendered via `renderFlyoutItem` in the expanded sidebar.

**Line:** the `height: 40` in the `renderFlyoutItem` `ListItemButton` sx prop.

```ts
// before
height: 40,

// after
height: 36,
```

---

## Non-Goals

- No changes to typography (top-level 14px / nested 13px stay as-is)
- No changes to icon sizes (20px / 1.25rem unchanged)
- No changes to spacing tokens (`mx`, `px`, `py`, `mb`)
- No changes to hover, active, tooltip, chevron, or transition behavior
- No changes to `SIDEBAR_COLORS`
- No changes to category-first flyout group headers (`py: 0.75, minHeight: 40` stays)
- No changes to collapsed rail items (remain at `44px`)

---

## Expected Outcome

- Expanded top-level items: `44px` → `40px` — noticeably denser
- Nested / flyout items: `40px` → `36px` — more compact, matches brand mark height
- Visual hierarchy preserved: top-level (40px) > nested (36px) > collapsed rail (44px, icon comfort)
- Collapsed rail usability intact
- No cascading visual risk

---

## Test Impact

No test assertions on pixel heights in the sidebar test suite. This is a pure visual change — no test updates required.
