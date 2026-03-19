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
| `persistor.purge()` | `SidebarUserMenu` (after awaiting thunk — existing behavior preserved) |
| Token cleanup | `logout` thunk |
| Redirect to `/login` | `ProtectedRoute` (detects `isAuthenticated === false`) |

`SidebarUserMenu` dispatches `logout(refreshToken)` then calls `persistor.purge()` — matching the existing `SidebarFooter` logout flow. The `logout` thunk itself does not call `persistor.purge()`. Guard dispatch with `if (refreshToken)` before calling the thunk, as `selectRefreshToken` may return `null`. No `navigate('/login')` in the component.

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

MUI `Popover` is chosen over `Popper` here because `Popover` includes built-in backdrop and outside-click dismissal — appropriate for a modal-style confirmation. The existing flyout uses `Popper` for hover-driven navigation menus where a backdrop would be intrusive; this is a different interaction pattern.

**Anchor lifecycle:** When the user clicks the Logout `MenuItem`, capture `event.currentTarget` into `logoutAnchorEl` *before* closing the Menu. The Popover is rendered as a sibling of the Menu (not inside it), so it remains correctly positioned even after the Menu unmounts.

- Anchored to the captured Logout `MenuItem` element reference
- Content: `"Log out?"` text + `[Cancel]` and `[Logout]` buttons inline
- Cancel: closes popover, no action
- Logout: dispatches `logout(refreshToken)` thunk; `ProtectedRoute` handles redirect

`ConfirmationDialog` is removed from `SidebarFooter`/`SidebarUserMenu` only — the shared `ConfirmationDialog.tsx` component is not deleted (it is used in many other pages).

### Settings Navigation

`SidebarUserMenu` uses the React Router `useNavigate` hook to navigate to `/settings` on Settings click. The menu closes before navigation.

### Version Value

Version is read from `__APP_VERSION__` — a Vite build-time define constant already used in `SidebarFooter.tsx`. Carry the same pattern: `const version = __APP_VERSION__ || '0.0.0'`.

### Collapsed Mode

- Avatar is the sole clickable element — same menu opens as in expanded mode
- Collapsed avatar click target: wrap in a `Box` with `width: 40px, height: 40px` to meet minimum interaction target size (matching expanded row height)
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
    backgroundColor: '#1E1E1E', // SIDEBAR_COLORS.hoverBg equivalent
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
- Icon color idle: `#6B7280` (matching `SIDEBAR_COLORS.icon`)
- Icon color hover: `#CBD5E1` (matching `SIDEBAR_COLORS.hoverText`)
- Standard MUI hover background

Note: `SIDEBAR_COLORS` is a module-private const in `Sidebar.tsx` and is not exported. `SidebarUserMenu` declares its own local color constants using the same values — do not import from `Sidebar.tsx`. If a future refactor moves these to a shared constants file, update both files then.

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
- Menu closes on Escape key (simulate `keyDown` Escape on the Menu); outside-click dismissal is MUI-internal and is not tested directly

---

## Acceptance Criteria

- [ ] Avatar triggers dropdown menu in both collapsed and expanded modes
- [ ] Dropdown contains username, Settings, Logout, version — in correct order
- [ ] Username and version blocks are non-interactive (no hover state)
- [ ] Logout confirmation uses inline Popover anchored to the captured Logout MenuItem reference
- [ ] No ConfirmationDialog import in `SidebarFooter` or `SidebarUserMenu` (shared component not deleted)
- [ ] Collapsed mode has no separate logout icon button
- [ ] Collapsed avatar wrapped in 40×40px click target
- [ ] Footer background is `#141414`
- [ ] Expanded trigger row has `height: 40px`, `alignItems: center`
- [ ] Hover applies background color change + `translateX(1px)` with smooth transition
- [ ] Null user guard: `SidebarUserMenu` returns null if currentUser is null
- [ ] `ProtectedRoute` handles redirect to `/login` — no explicit navigate in component
- [ ] Version read from `__APP_VERSION__`
- [ ] `SidebarFooter.test.tsx` covers: collapsed render, expanded render, correct prop passed to `SidebarUserMenu`
- [ ] All interaction tests live in `SidebarUserMenu.test.tsx`
