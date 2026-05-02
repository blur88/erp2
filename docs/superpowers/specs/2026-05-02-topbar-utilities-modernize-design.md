# TopBar Utilities Modernization — Design Spec

**Issue:** #506  
**Date:** 2026-05-02  
**Status:** Approved

## Overview

Standardize the three TopBar utility panels (System Status, Notifications, Keyboard Shortcuts) and the search bar around a shared `TopBarUtilityPanel` wrapper. Achieves UI/UX consistency and reduces duplicated Popover boilerplate.

---

## 1. New Component: `TopBarUtilityPanel`

**File:** `frontend/src/components/common/TopBarUtilityPanel.tsx`

A thin wrapper around MUI `Popover` that standardizes positioning, sizing, and header chrome.

### Props

```ts
interface TopBarUtilityPanelProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  title: string
  width?: number          // default: 380
  maxHeight?: number      // default: 600
  headerAction?: ReactNode  // optional action in header (e.g. "Mark all read", loading spinner)
  children: ReactNode
}
```

### Behavior

- `open` derived from `Boolean(anchorEl)`
- `anchorOrigin: { vertical: 'bottom', horizontal: 'right' }`
- `transformOrigin: { vertical: 'top', horizontal: 'right' }`
- `slotProps.paper`: `{ width, maxHeight, mt: 1, borderRadius: '12px' }`
- Header: `Typography variant="subtitle2"` title + optional `headerAction` + close `IconButton`
- Escape key and click-outside both dismiss (default Popover behavior — no extra wiring)
- `children` rendered directly below header

---

## 2. Refactored Panels

### 2a. KeyboardShortcutsModal → KeyboardShortcutsPanel

- **Rename:** `KeyboardShortcutsModal.tsx` → `KeyboardShortcutsPanel.tsx`, component name updated accordingly
- **Props:** `{ open: boolean, onClose: () => void }` → `{ anchorEl: HTMLElement | null, onClose: () => void }`
- **Structure:** Replace `Dialog`/`DialogTitle`/`DialogContent` with `TopBarUtilityPanel`
- **Content:** Shortcut table unchanged
- **Width:** 380 (default), no `headerAction`

### 2b. NotificationPanel

- Replace bare `Popover` with `TopBarUtilityPanel`
- "Mark all read" button moves to `headerAction` prop
- Close button removed from local header (provided by panel)
- Width: 400, maxHeight: 600
- All Redux logic and list content unchanged

### 2c. SystemStatus

- Replace bare `Popover` with `TopBarUtilityPanel`
- Loading spinner moves to `headerAction` prop
- Close button removed from local header (provided by panel)
- Width: 350
- Health-polling, pulse animation, and service list unchanged

---

## 3. TopBar.tsx Changes

### Keyboard Shortcuts anchor state

Replace `shortcutsOpen: boolean` with `shortcutsAnchorEl: HTMLElement | null`:

```ts
// before
const [shortcutsOpen, setShortcutsOpen] = useState(false)
// after
const [shortcutsAnchorEl, setShortcutsAnchorEl] = useState<HTMLElement | null>(null)
```

Update the Keyboard icon button `onClick` to set `shortcutsAnchorEl` (same pattern as SystemStatus and Notifications).

Update `KeyboardShortcutsPanel` usage: pass `anchorEl={shortcutsAnchorEl}` instead of `open={shortcutsOpen}`.

### Icon color standardization

All four utility areas standardized to `sx={{ color: theme.palette.text.secondary }}`:

| Area | Element | Current | Target |
|------|---------|---------|--------|
| SystemStatus | `IconButton` | `color="inherit"` | `sx={{ color: theme.palette.text.secondary }}` |
| Keyboard Shortcuts | `IconButton` | `color="inherit"` | `sx={{ color: theme.palette.text.secondary }}` |
| Notifications | `IconButton` | `color="inherit"` | `sx={{ color: theme.palette.text.secondary }}` |
| Search bar | `SearchIcon`, `Typography`, `kbd Box` | already `text.secondary` | verify, no change expected |

---

## 4. File Changes Summary

| Action | File |
|--------|------|
| Create | `frontend/src/components/common/TopBarUtilityPanel.tsx` |
| Rename + refactor | `KeyboardShortcutsModal.tsx` → `KeyboardShortcutsPanel.tsx` |
| Refactor | `NotificationPanel.tsx` |
| Refactor | `SystemStatus.tsx` |
| Update | `TopBar.tsx` |

---

## 5. Out of Scope

- `SearchModal` component itself (full-screen modal, different UX pattern)
- Any changes to notification Redux logic or health-polling API calls
- New shortcut entries
