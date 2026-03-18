# Sidebar Colors Update — Design Spec

**Issue:** #121
**Date:** 2026-03-18
**File:** `frontend/src/components/common/Sidebar.tsx`

---

## Overview

Update `SIDEBAR_COLORS` in `Sidebar.tsx` to align with the dark theme palette defined in `docs/ui.md`. Add a dedicated `icon` token and migrate all icon-specific color usages away from the shared `text` token.

---

## Token Changes

| Token | Before | After | Change |
|---|---|---|---|
| `bg` | `#0F172A` | `#0D0D0D` | Sidebar background — deeper per docs/ui.md |
| `hoverBg` | `#1E293B` | `#1E1E1E` | Hover state |
| `activeText` | `#E5E7EB` | `#FFFFFF` | Active item text |
| `activeIcon` | `#FFFFFF` | `#3B82F6` | Active item icon — Primary Blue |
| `icon` | *(new)* | `#6B7280` | Default icon color (new dedicated token) |
| `activeBg` | `#1F2937` | `#1F2937` | No change |
| `text` | `#9CA3AF` | `#9CA3AF` | No change |
| `hoverText` | `#CBD5E1` | `#CBD5E1` | No change — `docs/ui.md` section 8 defines no sidebar hover-text color; intentionally deferred |
| `sectionLabel` | `#6B7280` | `#6B7280` | No change |
| `border` | `#1F2937` | `#1F2937` | No change |
| `accentBar` | `#42a5f5` | `#42a5f5` | No change — `docs/ui.md` defines no sidebar accent-bar color; deferred |

---

## Icon Token Migration

The `text` token (`#9CA3AF`) was used for both text labels and icon colors. With the new `icon` token (`#6B7280`), icon-specific usages are separated.

There are **9 total** `SIDEBAR_COLORS.text` usages in the file. **7 migrate** to `SIDEBAR_COLORS.icon`; **2 are intentionally kept** as `SIDEBAR_COLORS.text` (the `ListItemText` inactive-state label color in `renderFlyoutItem` and `renderMenuItem`).

**7 usages** switch from `SIDEBAR_COLORS.text` → `SIDEBAR_COLORS.icon`:

| Location | Context |
|---|---|
| `renderFlyoutItem` — `ListItemIcon` (line ~841) | Flyout item icon inactive state |
| `renderFlyoutItem` — `ExpandMore` chevron (line ~863) | Flyout expand arrow |
| `renderMenuItem` collapsed+children — `ListItemIcon` (line ~961) | Rail icon inactive state |
| `renderMenuItem` collapsed+leaf — `ListItemIcon` (line ~1003) | Rail leaf icon inactive state |
| `renderMenuItem` expanded — `ListItemIcon` (line ~1047) | Expanded menu icon inactive state |
| `renderMenuItem` expanded — `ExpandMore` chevron (line ~1076) | Sidebar expand arrow |
| Collapse `IconButton` (line ~1149) | Sidebar collapse/expand toggle button |

**2 usages kept as `SIDEBAR_COLORS.text`** (text labels, not icons):
- `renderFlyoutItem` — `ListItemText` inactive color (line ~854)
- `renderMenuItem` expanded — `ListItemText` inactive color (line ~1060)

---

## Approach

**Option A (chosen):** Direct in-place token update. Modify `SIDEBAR_COLORS` and swap icon-specific `.text` usages to `.icon`. No abstraction, no new files.

Rejected alternatives:
- B: `getSidebarColors()` function — overkill for a one-file update
- C: Move colors to shared theme file — beyond issue scope

---

## Testing

No test changes required. Existing tests cover behavior and structure, not color values. All tests pass unchanged.

**Verification checklist (manual):**
- [ ] Sidebar background is `#0D0D0D`
- [ ] Active items have `#3B82F6` icons and `#FFFFFF` text
- [ ] Hover states use `#1E1E1E`
- [ ] Default icons use `#6B7280`
- [ ] All sidebar tests pass (`frontend/src/components/common/__tests__/Sidebar.test.tsx`)
