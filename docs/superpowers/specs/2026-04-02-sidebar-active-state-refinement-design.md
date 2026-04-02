# Sidebar Active State Refinement — Design Spec

**Issue:** #256  
**Date:** 2026-04-02  
**Scope:** Visual polish only — no logic changes, no new components.

---

## Goal

Improve the visual clarity, consistency, and interaction feel of the sidebar pill highlight across the expanded sidebar, collapsed rail flyout, footer, and user menu trigger.

---

## Changes

### 1. `useSidebarColors` — Active Background Opacity

**File:** `frontend/src/components/common/Sidebar.tsx:43`

Change `activeBg` from `theme.palette.action.selected` (≈8% opacity) to `alpha(theme.palette.primary.main, 0.13)` (13% opacity).

This is the single source of truth for pill background color. The change propagates automatically to all pill instances in `renderMenuItem` and `renderFlyoutItem`.

---

### 2. `renderMenuItem` — Expanded Sidebar Pills

**File:** `frontend/src/components/common/Sidebar.tsx:416`

- `borderRadius`: `2` → `1` (matches app-wide 8px token)
- Hover/active `transform`: add `translateX(4px)` on hover and active states; add `translateX(0)` as the baseline to ensure smooth CSS transition

---

### 3. `renderFlyoutItem` — Collapsed Rail Flyout Pills

**File:** `frontend/src/components/common/Sidebar.tsx:276`

Sync flyout item dimensions with main menu items to eliminate the inconsistency table from the issue:

| Property | Before | After |
|---|---|---|
| Height | 36px | 40px |
| Font size | 0.8125rem | 0.875rem |
| Horizontal margin (`mx`) | 0.5 (4px) | 1 (8px) |
| Border radius | 2 | 1 |

Also add `translateX(4px)` on hover, same as `renderMenuItem`.

---

### 4. `SidebarFooter` — Background Token

**File:** `frontend/src/components/common/SidebarFooter.tsx`

Change `backgroundColor` from `theme.palette.background.default` to `theme.palette.background.sidebar` so the footer column matches the rest of the sidebar. The `borderTop` already uses `theme.palette.divider` — no change needed there.

---

### 5. `SidebarUserMenu` — Pill-Style Trigger

**File:** `frontend/src/components/common/SidebarUserMenu.tsx`

The expanded trigger currently uses a raw `<Box component="button">` with no pill shape and `translateX(1px)` on hover. Changes:

- Wrap with `borderRadius: 1`, `mx: 1`, `mb: 0.5` to match nav item pill geometry
- Change hover `transform`: `translateX(1px)` → `translateX(4px)`
- Add explicit `bgcolor` on hover using `theme.palette.action.hover` (consistent with nav items)

Collapsed avatar button is icon-only — no `translateX` shift applied (same reasoning as collapsed rail icons: centered in fixed-width column, shift would misalign).

---

## Out of Scope

- No changes to flyout panel positioning, animation, or open/close logic
- No changes to collapsed rail icon buttons (horizontal shift doesn't apply to centered icons)
- No changes to the `category-first` flyout mode group headers
- No TypeScript type changes

---

## Files Changed

1. `frontend/src/components/common/Sidebar.tsx`
2. `frontend/src/components/common/SidebarFooter.tsx`
3. `frontend/src/components/common/SidebarUserMenu.tsx`
