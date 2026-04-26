# Keyboard Navigation Guide — Design Spec
**Issue:** #452
**Date:** 2026-04-26

## Overview

Add a discoverable keyboard shortcuts reference to the TopBar. Users can open it via a new `KeyboardIcon` button or by pressing `?`. The feature also standardizes how all four TopBar overlays manage their open/close state.

---

## 1. TopBar State Consolidation

All overlay open/close state moves into `TopBar.tsx`:

| Overlay | State type | Current owner | After |
|---|---|---|---|
| Search | `boolean` | TopBar | TopBar (no change) |
| Notifications | `anchorEl: HTMLElement \| null` | TopBar | TopBar (no change) |
| SystemStatus | `anchorEl: HTMLElement \| null` | SystemStatus itself | **Move to TopBar** |
| Shortcuts | `boolean` | — | TopBar (new) |

**Why `anchorEl` vs `boolean`:** Popovers (SystemStatus, Notifications) need a DOM anchor to position relative to the trigger element. Modals/Dialogs (Search, Shortcuts) are centered on screen and only need open/closed state.

New state variables added to TopBar:
```ts
const [systemStatusAnchorEl, setSystemStatusAnchorEl] = useState<HTMLElement | null>(null)
const [shortcutsOpen, setShortcutsOpen] = useState(false)
```

---

## 2. SystemStatus Refactor

`SystemStatus.tsx` currently owns its own `anchorEl` state. Move it to TopBar.

**New props interface:**
```ts
interface SystemStatusProps {
  anchorEl: HTMLElement | null
  open: boolean
  onOpen: (event: React.MouseEvent<HTMLElement>) => void
  onClose: () => void
}
```

The IconButton's `onClick` calls `onOpen`. The Popover receives `anchorEl`, `open`, and `onClose`. All health polling logic stays internal — no change to that behavior.

---

## 3. KeyboardShortcutsModal (new component)

**File:** `src/components/common/KeyboardShortcutsModal.tsx`

**Props:**
```ts
interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}
```

Uses MUI `Dialog` (not bare `Modal`) for built-in `DialogTitle` / `DialogContent` / `DialogActions` structure. Width: ~480px. Closes via Escape (Dialog native), X button, or backdrop click.

**Content — two labeled groups:**

*List Navigation*
| Key | Action |
|---|---|
| ↑ / ↓ | Navigate between items |
| Page Up / Page Down | Jump 20 items |
| Home / End | First / last item |
| Enter | Edit selected item |
| Escape | Clear selection or close dialog |

*Global*
| Key | Action |
|---|---|
| Ctrl+K | Open global search |
| ? | Show keyboard shortcuts |

**Footer note** (DialogActions area, muted text):
> "List navigation shortcuts apply on list and table pages only."

---

## 4. TopBar Changes

### Keyboard listener (`useEffect`)

Extend the existing Ctrl+K `useEffect` to also handle `?`:

```ts
if (event.key === '?') {
  // same input/textarea/contentEditable guard as Ctrl+K
  event.preventDefault()
  setShortcutsOpen(true)
}
```

Single `useEffect`, single `window.addEventListener` call — both keys handled together.

### Right-side icon order (left → right)

```
[Search box]  [SystemStatus]  [KeyboardIcon]  [NotificationsIcon]
```

### New IconButton

```tsx
<Tooltip title="Keyboard Shortcuts">
  <IconButton
    onClick={() => setShortcutsOpen(true)}
    color="inherit"
    sx={{ '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' } }}
  >
    <KeyboardIcon />
  </IconButton>
</Tooltip>
```

Icon: `@mui/icons-material/Keyboard`

### Rendered overlays (bottom of TopBar return)

The existing `<SystemStatus />` call inside the Toolbar icon cluster is replaced with the prop-passing form. It moves to the bottom of the return alongside the other overlays:

```tsx
{/* inside Toolbar icon cluster — remove bare <SystemStatus /> */}

{/* bottom of TopBar return, alongside NotificationPanel and SearchModal */}
<SystemStatus
  anchorEl={systemStatusAnchorEl}
  open={Boolean(systemStatusAnchorEl)}
  onOpen={(e) => setSystemStatusAnchorEl(e.currentTarget)}
  onClose={() => setSystemStatusAnchorEl(null)}
/>
<KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
```

Note: the SystemStatus IconButton (the trigger) stays inside the Toolbar icon cluster in TopBar — only the Popover overlay moves out to the bottom fragment.

---

## 5. Testing

**`TopBar.test.tsx`**
- `?` key opens shortcuts modal
- KeyboardIcon click opens shortcuts modal
- Ctrl+K still opens search (no regression)
- `?` key suppressed when focus is inside an input
- SystemStatus receives correct props (anchorEl, open, onOpen, onClose)

**`KeyboardShortcutsModal.test.tsx`** (new)
- Renders both shortcut group headings
- All shortcut rows present
- Footer note present
- Closes on Escape
- onClose called on backdrop click

**`SystemStatus.test.tsx`**
- Update to pass required props rather than relying on internal state
- Health polling behavior tests unchanged

---

## 6. Files Touched

| File | Change |
|---|---|
| `src/components/common/TopBar.tsx` | Add state, listener, icon button, pass props |
| `src/components/common/SystemStatus.tsx` | Accept open/anchorEl/onOpen/onClose props |
| `src/components/common/KeyboardShortcutsModal.tsx` | New file |
| `src/components/common/__tests__/TopBar.test.tsx` | New test cases |
| `src/components/common/__tests__/KeyboardShortcutsModal.test.tsx` | New file |
| `src/components/common/__tests__/SystemStatus.test.tsx` | Update props |
