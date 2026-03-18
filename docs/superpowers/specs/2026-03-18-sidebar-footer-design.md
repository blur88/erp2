# Sidebar Footer — Design Spec

**Issue:** #133 — Sidebar Footer: User Avatar, Username, Logout, and Version
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Add a persistent footer to the sidebar that displays the logged-in user's avatar and username, a logout action, and the current software version. The footer adapts its layout for expanded and collapsed sidebar states.

---

## Component Structure

### New file: `frontend/src/components/common/SidebarFooter.tsx`

A self-contained leaf component with a single prop:

```ts
interface SidebarFooterProps {
  collapsed: boolean
}
```

All state is read from Redux internally:
- `selectCurrentUser` — user object (`username`, `firstName`, `lastName`)
- `selectRefreshToken` — for the logout thunk argument
- `useDispatch` — to fire `logout(refreshToken)`

The component owns its own auth concerns; nothing is passed down from `Sidebar.tsx` beyond layout mode.

### Changes to `Sidebar.tsx`

Import and render `<SidebarFooter collapsed={collapsed} />` immediately after the scrollable menu container. The existing root `<Box>` already uses `display: 'flex', flexDirection: 'column', height: '100%'`. The scrollable menu `<Box>` at line ~1254 already has `flexGrow: 1, overflow: 'auto'` — no change is needed to that box; the footer will be bottom-anchored automatically.

---

## Avatar Initials

`AuthUser` fields (`username`, `firstName`, `lastName`) are all typed as `string` — they are never undefined on a logged-in user. However, `selectCurrentUser` returns `AuthUser | null`, so the user object itself can be null. The optional chaining below guards against a null user, not against optional fields:

```ts
const initials = (
  (firstName?.[0] ?? '') + (lastName?.[0] ?? '') ||
  username?.[0] ||
  'U'
).toUpperCase()
```

After destructuring from the selector, `firstName`, `lastName`, and `username` are all `string | undefined` from the developer's perspective (TypeScript does not infer through a null-checked user object automatically), so the optional chaining is also safe defensively.

---

## Logout Flow

1. User clicks the footer row (expanded) or logout icon (collapsed)
2. Guard: only dispatch if `refreshToken` is non-null (`if (refreshToken) { ... }`)
3. After the null check, TypeScript narrows `refreshToken` to `string` — pass it directly to the thunk with no non-null assertion needed: `dispatch(logout(refreshToken))`
4. The thunk handles the server call and clears Redux state regardless of server response
5. No loading/disabled state — the sidebar unmounts when auth state clears

---

## Version Injection

Version is a build-time artifact, not a runtime environment variable.

**`vite.config.ts`** — add `define` as a top-level key inside the `return { ... }` block, at the same level as `plugins` and `resolve` (not nested inside `build` or `test`):
```ts
define: {
  __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
}
```

The `?? '0.0.0'` fallback ensures `__APP_VERSION__` is never `undefined` in the Vitest test environment (where `npm_package_version` may not be set). No additional test setup is required for unit tests rendering `SidebarFooter`.

**`src/vite-env.d.ts`:**
```ts
declare const __APP_VERSION__: string
```

**Usage in footer:**
```ts
const version = __APP_VERSION__
// displayed as `v${version}`
```

`window.__ENV__` remains reserved for runtime deployment config (API URLs, socket URLs) — not used for version.

---

## Visual Layout

### Expanded mode

```
┌─────────────────────────────────┐
│  ─────────────────────────────  │  ← border-top: 1px solid #1F2937
│  [AV]  username          [→|]   │  ← ListItemButton, full-width click target
│        v1.11.0                  │  ← caption, #6B7280, mt: 2px, lineHeight: 1.2
└─────────────────────────────────┘
```

Full row is a `ListItemButton` that triggers logout on click. Logout icon on the right is decorative affordance only (tooltip: "Logout").

### Collapsed mode

```
┌──────┐
│  ──  │  ← border-top
│ [AV] │  ← Avatar, tooltip: username, cursor: default (no action)
│ [→|] │  ← Logout icon in 40×40 IconButton, tooltip: "Logout", hover bg
└──────┘
```

Version is hidden in collapsed mode. Avatar has no click action (cursor: default).

In collapsed mode, the logout icon is rendered as an `IconButton` (not a plain `Box`) to get keyboard accessibility and correct ARIA semantics for free. Size the `IconButton` to `40×40px` to match sidebar item height.

---

## Styling

All tokens from existing `SIDEBAR_COLORS`:

| Element | Token | Value |
|---|---|---|
| Border-top | `SIDEBAR_COLORS.border` | `#1F2937` |
| Row hover bg | `SIDEBAR_COLORS.hoverBg` | `#1E1E1E` |
| Username text | `SIDEBAR_COLORS.activeText` | `#FFFFFF` |
| Version text | `SIDEBAR_COLORS.sectionLabel` | `#6B7280` |
| Logout icon idle | `SIDEBAR_COLORS.icon` | `#6B7280` |
| Logout icon hover | `SIDEBAR_COLORS.hoverText` | `#CBD5E1` |
| Avatar bg | `primary.main` (MUI theme) | — |

Padding: `px: 2, py: 1.5` expanded; `py: 1` collapsed — consistent with sidebar header and menu item density.

Avatar size: `32×32px`. Logout icon: `fontSize: 18` (consistent across both modes).

Hover icon color shift in expanded mode:
```ts
'&:hover svg': { color: SIDEBAR_COLORS.hoverText }
```

---

## File Changes

| File | Change |
|---|---|
| `frontend/src/components/common/SidebarFooter.tsx` | New file |
| `frontend/src/components/common/Sidebar.tsx` | Import + render `<SidebarFooter collapsed={collapsed} />` after menu box |
| `frontend/vite.config.ts` | Add `define: { __APP_VERSION__: ... }` |
| `frontend/src/vite-env.d.ts` | Add `declare const __APP_VERSION__: string` |

---

## Non-Goals

- No navigation logic in the footer
- No additional props beyond `collapsed`
- No profile dropdown (leave room for future, but do not implement)
- No loading state on logout
- No structural changes to `Sidebar.tsx` beyond the import and one render line
