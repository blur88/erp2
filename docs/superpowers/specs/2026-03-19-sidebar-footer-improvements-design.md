# Sidebar Footer Improvements — Design Spec

**Date:** 2026-03-19
**Issue:** #138
**Status:** Approved

## Overview

Improve sidebar footer UX to match modern SaaS patterns. The avatar becomes the sole interaction entry point for user actions (settings, logout). A dropdown menu replaces the bare logout button. Logout confirmation moves from a full dialog to a lightweight inline popover. Visual polish is applied throughout.

---

## 1. Component Architecture

### Responsibility Split

**`SidebarFooter.tsx`** — layout shell only
- Accepts `collapsed: boolean`
- Renders footer container: background `#141414`, top border `1px solid #1F2937`, padding
- Places `<SidebarUserMenu collapsed={collapsed} />` in the correct expanded/collapsed position
- No state, no auth imports, no interaction logic

**`SidebarUserMenu.tsx`** — all interactive behavior
- Reads `currentUser` and `refreshToken` from Redux via existing selectors (`selectCurrentUser`, `selectRefreshToken`)
- Manages two local state values:
  - `menuAnchorEl: HTMLElement | null` — controls avatar dropdown Menu
  - `logoutAnchorEl: HTMLElement | null` — controls logout confirmation Popover
- Renders differently based on `collapsed` prop (same component, two visual presentations)
- Dispatches `logout(refreshToken)` thunk — owns no other auth side effects
- Navigates to `/settings` on Settings click
- Returns `null` if `currentUser` is null (null-user guard)

### Auth Side Effects Ownership

| Concern | Owner |
|---------|-------|
| Open logout confirmation | `SidebarUserMenu` |
| Dispatch logout intent | `SidebarUserMenu` |
| `persistor.purge()` + token cleanup | `logout` thunk |
| Redirect to `/login` | `ProtectedRoute` (detects `isAuthenticated === false`) |

`SidebarUserMenu` dispatches one action and stops. No `navigate('/login')` in the component.

---

## 2. Interaction Behavior

### Avatar Dropdown (MUI `Menu`)

Clicking the avatar opens a `Menu` anchored to the avatar element — behavior is identical in collapsed and expanded modes.

**Menu structure:**
1. User identity block — username, non-interactive
2. `Divider`
3. Settings `MenuItem` → navigates to `/settings`
4. Logout `MenuItem` → closes menu, opens logout confirmation Popover
5. `Divider`
6. Version block — e.g. `v1.13.0`, non-interactive

Menu closes on outside click or Escape (MUI default).

### Logout Confirmation (MUI `Popover`)

- Anchored to the Logout `MenuItem` element (closest to user intent)
- Content: `"Log out?"` text + `[Cancel]` and `[Logout]` buttons inline
- Cancel: closes popover, no action
- Logout: dispatches `logout(refreshToken)` thunk; `ProtectedRoute` handles redirect

`ConfirmationDialog` is removed from this flow entirely.

### Collapsed Mode

- Avatar is the sole clickable element — same menu opens as in expanded mode
- Separate logout icon button below the avatar is removed

---

## 3. Visual Styling

### Footer Container (`SidebarFooter`)

| Property | Value |
|----------|-------|
| Background | `#141414` |
| Top border | `1px solid #1F2937` |
| Padding | Retain current values |

### Avatar

| Property | Value |
|----------|-------|
| Size | 32×32px |
| Background | `primary.main` (`#42a5f5`) |
| Content | Initials (existing logic) |
| Cursor | `pointer` |
| Hover | `filter: 'brightness(1.1)'` |

### Expanded Trigger Row

```ts
sx={{
  alignItems: 'center',
  height: '40px',
  transition: 'background-color 0.15s ease, transform 0.15s ease',
  '&:hover': {
    backgroundColor: SIDEBAR_COLORS.hoverBg,
    transform: 'translateX(1px)',
  },
}}
```

### Avatar Dropdown Menu

| Property | Value |
|----------|-------|
| `minWidth` | `220px` |
| Background | `#1E1E1E` (`SIDEBAR_COLORS.hoverBg`) |
| `borderRadius` | `1` |
| `boxShadow` | `'0 4px 20px rgba(0,0,0,0.4)'` |

**Identity/version blocks** — passive `Box` elements, no hover state:
- Username: `px: 2, py: 1`, color `SIDEBAR_COLORS.text` (`#9CA3AF`), `fontSize: '0.75rem'`
- Version: same, `fontSize: '0.65rem'`, color `SIDEBAR_COLORS.icon` (`#6B7280`)

**Action MenuItems** (Settings, Logout):
- Icon color idle: `SIDEBAR_COLORS.icon`
- Icon color hover: `SIDEBAR_COLORS.hoverText`
- Standard MUI hover background

### Logout Confirmation Popover

| Property | Value |
|----------|-------|
| Background | `#1E1E1E` |
| Border | `1px solid #1F2937` |
| Padding | `p: 2` |
| Layout | Inline — text + Cancel + Logout buttons |

---

## 4. State & Testing

### Local State (`SidebarUserMenu`)

```ts
const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
const [logoutAnchorEl, setLogoutAnchorEl] = useState<HTMLElement | null>(null)
```

### Test Split

**`SidebarFooter.test.tsx`** — layout/shell only:
- Renders in collapsed mode
- Renders in expanded mode
- Mounts `SidebarUserMenu` with correct `collapsed` prop

**`SidebarUserMenu.test.tsx`** — interaction behavior:
- Null user renders nothing
- Avatar click opens menu
- Settings click navigates to `/settings`
- Logout click opens confirmation popover
- Confirm dispatches `logout` thunk
- Cancel closes popover without dispatching
- Clicking outside closes menu/popover

---

## Acceptance Criteria

- [ ] Avatar triggers dropdown menu in both collapsed and expanded modes
- [ ] Dropdown contains username, Settings, Logout, version — in correct order
- [ ] Username and version blocks are non-interactive (no hover state)
- [ ] Logout confirmation uses inline Popover anchored to the Logout menu item
- [ ] No full ConfirmationDialog for logout
- [ ] Collapsed mode has no separate logout icon button
- [ ] Footer background is `#141414`
- [ ] Expanded trigger row has `height: 40px`, `alignItems: center`
- [ ] Hover applies background color change + `translateX(1px)` with smooth transition
- [ ] Null user guard: `SidebarUserMenu` returns null if currentUser is null
- [ ] `ProtectedRoute` handles redirect to `/login` — no explicit navigate in component
- [ ] All interaction tests live in `SidebarUserMenu.test.tsx`
