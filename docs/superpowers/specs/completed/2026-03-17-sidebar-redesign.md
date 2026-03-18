# Sidebar Redesign Spec
**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Redesign the ERP sidebar with a custom dark color palette, collapsible rail mode (256px / 64px), and a flyout Popper for nested navigation in collapsed mode. Changes are confined to `Sidebar.tsx` and `MainLayout.tsx`.

---

## 1. Colors & Visual Style

The sidebar uses a fixed dark background independent of MUI theme mode, so it looks identical in both light and dark themes.

| Element | Color |
|---|---|
| Sidebar background | `#0F172A` |
| Active item background | `#1F2937` |
| Hover item background | `#1E293B` |
| Default text | `#9CA3AF` |
| Active text | `#E5E7EB` |
| Default icon | `#9CA3AF` |
| Active icon | `#E5E7EB` |
| Section label | `#6B7280` |
| Border / divider | `#1F2937` |

**Active item indicator:** Filled pill — full row background `#1F2937` with a `3px` left accent bar in `primary.main` (`#42a5f5`). No solid primary-blue fill on the entire row.

The MUI `Drawer` paper `backgroundColor` is overridden inline to `#0F172A`. The rest of the app theme is unaffected.

**Important:** The `selected` prop on `ListItemButton` must **not** be used. MUI's `Mui-selected` class applies its own background overrides that are hard to suppress cleanly. Active state must be applied via a conditional `sx` prop only.

---

## 2. Layout & Collapse Behavior

### Dimensions
- Expanded: `256px` (changing from current `280px`)
- Collapsed: `64px`
- Width transition: `0.22s ease` on the Drawer paper `width`, and on the AppBar `width` and `marginLeft`

Exact transition strings:
```
// Drawer paper
transition: 'width 0.22s ease'

// AppBar
sx={{
  transition: 'width 0.22s ease, margin-left 0.22s ease',
  width: collapsed ? `calc(100% - 64px)` : `calc(100% - 256px)`,
  ml: collapsed ? '64px' : '256px',
}}
```

The `DRAWER_WIDTH` constant in `MainLayout.tsx` is replaced by two constants: `DRAWER_WIDTH_EXPANDED = 256` and `DRAWER_WIDTH_COLLAPSED = 64`.

The `<Box component="nav">` wrapper also tracks `collapsed` state — its `width` switches between the two constants (no CSS transition needed; the Drawer paper transition handles the visual movement):
```
sx={{ width: { lg: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED }, flexShrink: { lg: 0 } }}
```

### Collapse state
- Managed in `MainLayout.tsx` as `collapsed: boolean`, default `false`
- Persisted to `localStorage` as `sidebar-collapsed`
- Passed to `Sidebar` as a `collapsed?: boolean` prop, default `false`
- The mobile `Sidebar` instance (inside the `temporary` Drawer) is always passed `collapsed={false}` — the collapse toggle only applies to desktop (`lg+`)

### Updated `SidebarProps` interface
```ts
interface SidebarProps {
  onItemClick?: () => void
  collapsed?: boolean        // default false
  onToggleCollapse?: () => void
}
```

`MainLayout.tsx` passes `onToggleCollapse={() => setCollapsed(c => !c)}` to the desktop `Sidebar` instance. The mobile instance does not receive this prop.

### Toggle button
- Placed in the sidebar header, right-aligned next to the logo
- Icon: `ChevronLeft` when expanded, `ChevronRight` when collapsed
- Icon color: `#9CA3AF`; hover background: `#1E293B`; size: `28px`
- Visually recessive — does not compete with the logo
- Hidden on mobile (below `lg` breakpoint)

### Row heights and icon columns
- **Expanded row height:** `44px` (consistent with collapsed mode)
- **Expanded icon column:** `40px` wide (`minWidth: 40` on `ListItemIcon`) — matches current code, keeps icon/text alignment consistent
- **Collapsed row height:** `44px`; icon centered in the full `64px` column hit area

### Collapsed mode rendering
- All item text hidden
- Section labels hidden
- Expand/collapse chevrons hidden
- Icons only, centered in a `64px` column with fixed `44px` row height
- `Tooltip` (placement `"right"`, `enterDelay={400}`, `enterNextDelay={200}`) on leaf items only (no tooltip on parent items — flyout takes over)

### Badges in collapsed mode
- Badges are **hidden** in collapsed mode
- They render only in expanded mode, same as today

### Section grouping
- **Expanded:** section labels render as uppercase overline text in `#6B7280`
- **Collapsed:** section labels hidden; grouping conveyed by `8px` extra top padding before the first icon of each new section; faint dividers (`#1F2937`) only between the most distinct groups (System from Analytics)

### Accordion state persistence
- The `sidebar-expanded` localStorage key (list of expanded accordion IDs) is **retained** for expanded mode only
- The existing `useEffect` auto-expand behavior (which **replaces** `expandedItems` with only the ancestors of the active route on route change) is **preserved as-is**. This means manually opened accordions that are not ancestors of the active route will collapse on navigation — matching the current behavior.
- In collapsed mode, the flyout accordion state is **in-memory only** (not persisted to `localStorage`) and resets on navigation
- When the user expands the sidebar again, the accordion state is restored from `sidebar-expanded` (which will reflect the active-route ancestors from the last navigation)

---

## 3. Logo / Header Area

- **Expanded:** logo box + "ERP System" text, header height `56–64px`
- **Collapsed:** logo box only, centered
- Version label (`ERP System v1.0.0`) **removed** from the sidebar footer entirely
- The footer `<Box>` element (currently renders the version label with a top border and `bgcolor: background.default`) is **removed entirely** — no empty box, no bottom border artifact in collapsed mode

---

## 4. Flyout Popper (Collapsed Mode — Parent Items)

### Open / close trigger
- Opens on `mouseenter` of the icon row after an `80ms` delay (via `setTimeout`, cleared on `mouseleave`) — prevents accidental hover flicker when cursor moves vertically past the rail
- Clicking the icon row also opens the flyout (touch / keyboard fallback)
- Closes on `mouseleave` with a single shared `closeTimerRef` (not separate timers per element):
  - `mouseenter` on **either** the icon row or the flyout panel cancels the close timer
  - `mouseleave` of **either** element, when the cursor is not inside the other, starts the `150ms` close timer
  - This allows the cursor to travel from the rail to the flyout panel without the panel snapping shut
- Only one flyout open at a time; opening a new one closes the previous

### Placement & appearance
- MUI `Popper`, placement `"right-start"`, offset `[0, 8]`
  - Offset semantics: `[skidding, distance]` — skidding `0` (no vertical shift), distance `8` (horizontal gap from rail)
- Background: `#1E293B`; border-radius: `4px`; subtle box shadow; `padding: 8px 0` (vertical padding inside the panel so item edges don't feel cramped)
- Min-width `200px`, max-width `240px`
- The flyout panel must accept pointer events — do not set `pointerEvents: 'none'` on the panel or its container during animation
- Enter animation: `opacity 0→1` + `translateX(-4px → 0)`, `120ms ease-out`
- Exit animation: `opacity 1→0`, `80ms ease-in`
- Implementation: wrap the Popper's inner content in MUI `Fade` with `in={flyoutOpen}` and `timeout={{ enter: 120, exit: 80 }}`. The Popper itself uses `keepMounted={false}` (conditionally rendered, not toggled via CSS visibility).
- `z-index`: `1400` (above MUI AppBar at `1100` and Drawer at `1200`)

### 3-level menu handling (Reports → Sales Reports → individual report)
- The flyout opens directly on the level-1 group rows (e.g. "Sales Reports", "Purchasing Reports") — there is no repeated "Reports" title header inside the panel
- When the flyout first opens, level-1 groups are **collapsed by default**, unless a descendant is the active route — in that case the relevant level-1 group is **auto-expanded**
- Level-2 items (individual reports) receive `16px` additional left padding inside the flyout
- Level-1 parent rows ("Sales Reports") show a chevron; clicking toggles inline accordion; flyout stays open
- Level-1 parent rows are highlighted as active if any descendant is the current route

### Active item styling inside flyout
- Same pill style as the main sidebar: `#1F2937` background, left accent bar, `#E5E7EB` text/icon
- Icons at `20px`

### Tooltip vs flyout conflict
- Leaf items (no children): `Tooltip` only — no flyout
- Parent items (have children): flyout takes over — no `Tooltip` rendered
- Mutually exclusive; no double overlays

### Keyboard interaction (collapsed mode flyout)
- `Enter` or `Space` on a focused icon row (parent item) opens the flyout and moves focus to the first item inside it
- `Escape` closes the flyout and returns focus to the triggering icon row
- `Tab` navigates within the flyout items
- `Escape` from within the flyout closes it and returns focus to the triggering icon

---

## 5. Click Behavior & Navigation Contract

**Rule:** parents organize, leaves navigate.

| Context | Item type | Click action |
|---|---|---|
| Expanded | Parent (has children) | Toggle accordion expand/collapse |
| Expanded | Leaf (no children) | Navigate to `item.path` |
| Collapsed rail | Parent | Open flyout (also opens on hover) |
| Collapsed rail | Leaf | Navigate to `item.path` |
| Flyout | Parent with children | Toggle inline accordion; flyout stays open |
| Flyout | Leaf | Navigate to `item.path`; close flyout immediately |

Parent items have no `path` and are never navigable.

### Active state
- A parent item is styled active if any descendant is the current route (recursive `isItemActive` check — same logic as today)
- In collapsed mode the rail icon shows active even when the flyout is closed
- **Auto-expand active ancestors in expanded mode:** on route change, all ancestor containers of the active leaf are automatically expanded so the active page is never hidden

### State separation
Three distinct states tracked and styled independently:

| State | Styling |
|---|---|
| Active route | Pill background `#1F2937` + `3px` left accent bar + `#E5E7EB` text/icon |
| Expanded accordion | Chevron rotated + children visible |
| Open flyout | Floating panel visible |

### Transient state cleanup
After a leaf-click navigation:
- Flyout closes immediately
- Hover timers cleared
- Flyout in-memory accordion state reset

### Accessibility
- Parent rows are focusable; `Enter`/`Space` toggles accordion (expanded mode) or opens flyout (collapsed mode)
- `aria-expanded` updates on accordion parents
- `aria-haspopup="true"` on collapsed-mode flyout parents
- See Section 4 for full collapsed-mode keyboard model

---

## 6. Mobile Behavior

Below the `lg` breakpoint the sidebar behavior is **unchanged** from the current implementation:
- `temporary` Drawer (overlay), full width (`256px`)
- Opened via hamburger `MenuIcon` in the AppBar (existing behavior retained)
- `collapsed` prop is always `false` for the mobile drawer instance
- The collapse toggle button in the sidebar header is hidden on mobile (`display: { xs: 'none', lg: 'flex' }`)
- `mobileOpen` state in `MainLayout.tsx` is retained as-is

---

## 7. Files Changed

| File | Change |
|---|---|
| `frontend/src/components/common/Sidebar.tsx` | Color overrides, `collapsed` prop, toggle button, flyout Popper + shared close timer, tooltip/flyout mutual exclusion, section label hide/show, logo collapse, version label removal, badge hide in collapsed mode, `selected` prop replaced with conditional `sx` |
| `frontend/src/components/common/MainLayout.tsx` | `collapsed` state + localStorage, `DRAWER_WIDTH` replaced with two constants, drawer width transition, AppBar offset transition, pass `collapsed` prop to Sidebar, mobile drawer always passes `collapsed={false}` |

No new files. No changes to routing, backend, or theme.
