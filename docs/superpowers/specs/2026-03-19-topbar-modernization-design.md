# Top Bar Modernization — Design Spec

**Issue:** #136
**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Modernize the ERP top bar (`AppBar`) by extracting it into a dedicated `TopBar` component, adding breadcrumb navigation, a command-palette search placeholder, a refined system status indicator, and removing the duplicated user/account controls. The sidebar footer (added in PR #135) becomes the sole home for user identity, account actions, logout, and version info.

---

## Decisions

| Topic | Decision |
|---|---|
| Breadcrumbs vs page title | Keep both — breadcrumbs in top bar for context, page title in content area for clarity |
| Global search | Command-palette modal (B): click or Ctrl+K opens overlay with "coming soon" state |
| User avatar/menu in top bar | Remove entirely — sidebar footer is the single access point |
| System status indicator | Icon + absolute-positioned status dot overlay; pulse on warning/error only |
| Component structure | Option B: extract `TopBar.tsx` + `SearchModal.tsx`, refactor `SystemStatus.tsx` in place |

---

## Architecture

### Files changed

| File | Change |
|---|---|
| `frontend/src/components/common/MainLayout.tsx` | Remove all `AppBar`/`Toolbar` JSX and user menu logic; render `<TopBar>`; become layout shell only |
| `frontend/src/components/common/TopBar.tsx` | **New** — owns all top bar UI and behavior |
| `frontend/src/components/common/SearchModal.tsx` | **New** — command palette modal |
| `frontend/src/components/common/SystemStatus.tsx` | Refactor in place: chip trigger → icon + status dot |

`NotificationPanel.tsx` is unchanged. `TopBar` receives the same anchor/open/close props that `MainLayout` currently manages.

---

## `MainLayout.tsx` — After refactor

Responsibilities after this change:
- Sidebar collapsed/expanded state and localStorage persistence
- Mobile drawer open/close state
- Rendering `<TopBar>`, the sidebar `<Drawer>`, and `<Outlet>`
- Passing sidebar width constants to `TopBar` for AppBar offset

Removed entirely:
- All `AppBar`/`Toolbar` JSX
- Avatar, user menu `<Menu>`, and all user menu handlers (`handleUserMenuOpen/Close`, `handleLogout`, `getUserInitials`, `getUserDisplayName`, `getRoleBadgeColor`)
- Notification anchor state and handlers (moved to `TopBar`)
- `useMatches` import (moved to `TopBar`)

Expected result: ~150 lines (down from ~393).

---

## `TopBar.tsx` — Specification

### Visual spec

| Property | Value |
|---|---|
| Height | 64px |
| Background | `#1E1E1E` (Surface) |
| Border bottom | `1px solid #2A2A2A` |
| Box shadow | none (border separation only) |
| Width | `calc(100% - sidebarWidth)` mirroring current AppBar offset logic |
| Transition | `width 0.22s ease, margin-left 0.22s ease` (matches sidebar animation) |

### Layout — Desktop

```
[Breadcrumbs ──────────────────] [Search trigger] [Status] [Notifications]
```

### Layout — Mobile

```
[☰ Hamburger] [Leaf title (truncated)] [Status] [Notifications]
```

On mobile (below `lg` breakpoint):
- Hamburger button is visible on the left
- Show only the leaf breadcrumb segment (current page title) as plain text, truncated with `noWrap` — no full breadcrumb chain
- Search trigger is hidden on mobile (icon-only variant may be added in a later iteration)
- Status dot and notifications remain visible

### Breadcrumbs

**Data source:** `useMatches()` from `react-router-dom`.

**Filter rule:** include only matched routes where `(match.handle as RouteHandle)?.title` is a non-empty string.

**Rendering rules:**
- Ancestor segments (all except the last): render as MUI `Link` components pointing to `match.pathname`
- Leaf segment (last item): render as plain `Typography`, not a link
- Separator: MUI `NavigateNext` icon

**Fallback rules:**
- If no matched route has a `handle.title`, render nothing (breadcrumb area stays empty)
- Layout-only parent routes (e.g., the root `/` shell) will naturally be skipped because they lack `handle.title` — no special handling needed
- Dynamic segments (e.g., `/products/:id/edit`) already carry an explicit `handle.title` like `'Edit Product'` in `router.tsx`, so they render correctly as-is

**Styling:**
- Font size: `12px`
- Color: `#A0A0A0` for all segments
- Leaf segment: `#E0E0E0` (slightly brighter, still secondary weight — not bold)
- No separator after the leaf

### Search trigger

Styled as a command trigger, not a form input:
- A `Box` (not `TextField`) with search icon on the left and shortcut hint on the right
- Placeholder text: `Search...`
- Shortcut badge on right: `Ctrl+K` (styled as a small `kbd`-like chip)
- `cursor: pointer`
- Background: `#232323`, border: `1px solid #2A2A2A`, border-radius: `8px`
- Width: `~220px` on desktop; hidden on mobile (below `lg`)
- On click: opens `SearchModal`
- No text input affordance (no caret, no editable state)

**Ctrl+K global shortcut (in `TopBar`):**
```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const editable = (e.target as HTMLElement)?.isContentEditable
      if (tag === 'input' || tag === 'textarea' || editable) return
      e.preventDefault()
      setSearchOpen(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

Listener is cleaned up on unmount. Ignored when focus is inside `input`, `textarea`, or `contenteditable`.

### Notifications

Unchanged behavior — same `IconButton` + `Badge` + `NotificationPanel` wiring. Anchor state and handlers move from `MainLayout` into `TopBar`.

---

## `SearchModal.tsx` — Specification

### Trigger / close behavior

| Action | Result |
|---|---|
| Click search trigger | Open modal |
| Ctrl+K / ⌘+K | Open modal |
| Escape key | Close modal |
| Backdrop click | Close modal |

### Visual spec

| Property | Value |
|---|---|
| Overlay | MUI `Modal` with semi-transparent backdrop |
| Paper width | `560px`, max-width `90vw` |
| Background | `#1E1E1E` |
| Border | `1px solid #2A2A2A` |
| Border radius | `12px` |
| Vertical position | Upper-center (~20% from top) |

### Contents

1. **Search input row** (autofocused on open)
   - Search icon on left
   - Placeholder: `Search across the ERP...`
   - Keyboard shortcut hint on right: `Esc to close`
   - Dark-styled, no heavy input border

2. **Divider**

3. **Coming soon body**
   - Icon (e.g., `SearchOff` or `ManageSearch`)
   - Heading: `Global Search Coming Soon`
   - Secondary text: `Will search across Pages, Customers, Products, and Transactions`

4. **Footer hint**
   - `Tip: Press Ctrl+K to open search anytime`
   - Muted color, `12px`

### State

`SearchModal` is stateless regarding search content — it accepts `open: boolean` and `onClose: () => void` props. `TopBar` owns the `searchOpen` boolean.

---

## `SystemStatus.tsx` — Refactor spec

### Replace the chip trigger with icon + dot

**Before:** `<IconButton><Chip label="HEALTHY" /></IconButton>`

**After:**
```tsx
<Tooltip title={tooltipText}>
  <IconButton onClick={handleClick}>
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <DnsRounded sx={{ fontSize: 22, color: '#A0A0A0' }} />
      <Box sx={{
        position: 'absolute',
        top: 2,
        right: 2,
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: dotColor,
        animation: shouldPulse ? 'statusPulse 1.8s ease-in-out infinite' : 'none',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }} />
    </Box>
  </IconButton>
</Tooltip>
```

### Dot color mapping

| Status | Color |
|---|---|
| `healthy` | `#22C55E` |
| `degraded` | `#F59E0B` |
| `unhealthy` | `#EF4444` |
| unknown / no data | `#6B7280` |

### Pulse animation

Applied only when status is `degraded` or `unhealthy`. Keyframe:
```css
@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
}
```
Defined via MUI `GlobalStyles` or inline `keyframes` helper. Respects `prefers-reduced-motion`.

### Tooltip text

- Healthy: `System: Healthy — All services operational`
- Degraded: `System: Degraded — One or more services affected`
- Unhealthy: `System: Unhealthy — Backend may be offline`
- Unknown: `System: Unknown — Checking status...`

### Popover (unchanged)

The existing detail popover with service list (Backend, Database, Redis, Frontend) remains completely intact.

---

## Page title rule (explicit)

**Breadcrumbs do not replace the page title.**

The breadcrumbs in the top bar serve navigation context ("where am I in the system"). The page title (`h6` currently rendered in the `Toolbar`) is intentionally removed from the top bar in this refactor — it belongs in the **page content area**, not the AppBar.

Each page or section component is responsible for rendering its own prominent heading (e.g., `<Typography variant="h5">Create Product</Typography>`) as part of the page content. This is the correct ERP pattern: the AppBar is a navigation frame, not a page header.

> If a page currently relies on `MainLayout`'s `pageTitle` derived from `useMatches()` as its only visible title, a follow-up issue should add explicit page headers to those pages. That work is out of scope for this issue.

---

## What is out of scope

- Backend global search integration
- Mobile search icon trigger (may be added later)
- Per-page explicit title headers (follow-up work)
- Notification panel UI redesign (issue mentions "refine" but panel was recently improved; cosmetic tweaks deferred)
- Route `handle` additions for routes currently missing `title`

---

## Theme compliance

All colors reference the dark theme defined in `docs/ui.md`. No new colors are introduced — only values from the existing palette are used.
