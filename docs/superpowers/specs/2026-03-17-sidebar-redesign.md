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

---

## 2. Layout & Collapse Behavior

### Dimensions
- Expanded: `256px`
- Collapsed: `64px`
- Width transition: `0.22s ease` on both the `Drawer` paper and the `AppBar` offset

### Collapse state
- Managed in `MainLayout.tsx` as `collapsed: boolean`
- Persisted to `localStorage` as `sidebar-collapsed`
- Passed to `Sidebar` as a `collapsed?: boolean` prop

### Toggle button
- Placed in the sidebar header, right-aligned next to the logo
- Icon: chevron left / chevron right
- Icon color: `#9CA3AF`; hover background: `#1E293B`; size: `28px`
- Visually recessive — does not compete with the logo

### Collapsed mode rendering
- All item text hidden
- Section labels hidden
- Expand/collapse chevrons hidden
- Icons only, centered in a `64px` column with fixed `44px` row height
- `Tooltip` (placement `"right"`, `enterDelay={400}`, `enterNextDelay={200}`) on leaf items only

### Section grouping
- **Expanded:** section labels render as uppercase overline text in `#6B7280`
- **Collapsed:** section labels hidden; grouping conveyed by `8px` extra top padding before the first icon of each new section; faint dividers (`#1F2937`) only between the most distinct groups (e.g. System from Analytics)

---

## 3. Logo / Header Area

- **Expanded:** logo box + "ERP System" text, header height `56–64px`
- **Collapsed:** logo box only, centered
- Version label (`ERP System v1.0.0`) **removed** from the sidebar footer entirely

---

## 4. Flyout Popper (Collapsed Mode — Parent Items)

### Open / close trigger
- Opens on `mouseenter` of the icon row after an `80ms` delay (via `setTimeout`, cleared on `mouseleave`) — prevents accidental hover flicker when cursor moves vertically past the rail
- Clicking the icon row also opens the flyout (touch / keyboard fallback)
- Closes on `mouseleave` of both the icon row and the flyout panel, with a `150ms` close delay to allow cursor travel
- Only one flyout open at a time; opening a new one closes the previous

### Placement & appearance
- MUI `Popper`, placement `"right-start"`, offset `[0, 8]` (8px horizontal gap from the rail)
- Background: `#1E293B`; border-radius: `4px`; subtle box shadow
- Min-width `200px`, max-width `240px`
- Enter animation: `opacity 0→1` + `translateX(-4px → 0)`, `120ms ease-out`
- `z-index` above the AppBar (`1300+`)

### Nested submenus inside the flyout
- Parent items with children render an expand chevron; clicking expands **inline** within the same flyout panel (accordion style) — no second nested Popper
- Max 2 levels inside the flyout (covers the deepest case: Reports → Sales Reports → individual report)
- Flyout stays open while navigating accordion levels

### Active item styling inside flyout
- Same pill style as the main sidebar: `#1F2937` background, left accent bar, `#E5E7EB` text
- Icons at `20px`

### Tooltip vs flyout conflict
- Leaf items (no children): `Tooltip` only — no flyout
- Parent items (have children): flyout takes over — no `Tooltip` rendered
- Mutually exclusive; no double overlays

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

Parent items have no `path` and are never navigable. This eliminates "sometimes navigates, sometimes expands" ambiguity.

### Active state
- A parent item is styled active if any descendant is the current route (recursive `isItemActive` check — same logic as today)
- In collapsed mode the rail icon shows active even when the flyout is closed — clear "you are here" signal
- **Auto-expand active ancestors in expanded mode:** on route change, all ancestor containers of the active leaf are automatically expanded so the active page is never hidden inside a collapsed accordion

### State separation
Three distinct states are tracked and styled independently:

| State | Styling |
|---|---|
| Active route | Pill background + left accent bar + bright text/icon |
| Expanded accordion | Chevron rotated + children visible |
| Open flyout | Floating panel visible |

### Transient state cleanup
After a leaf-click navigation:
- Flyout closes immediately
- Hover timers cleared
- Flyout accordion state reset

### Accessibility
- Parent rows are focusable; `Enter`/`Space` toggles
- `aria-expanded` updates on accordion parents
- `aria-haspopup` on collapsed-mode flyout parents

---

## 6. Files Changed

| File | Change |
|---|---|
| `frontend/src/components/common/Sidebar.tsx` | Color overrides, collapsed prop, toggle button, flyout Popper logic, tooltip/flyout conflict, section label hide/show, logo collapse, version label removal |
| `frontend/src/components/common/MainLayout.tsx` | `collapsed` state + localStorage, drawer width transition, AppBar offset transition, pass `collapsed` prop to `Sidebar` |

No new files. No changes to routing, backend, or theme.
