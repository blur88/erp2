# Top Bar Modernization — Polish Pass Design Spec

**Issue:** #140
**Date:** 2026-03-19
**Status:** Approved
**Depends on:** Issue #136 (TopBar extraction, already complete)

---

## Overview

A targeted polish pass on the existing `TopBar.tsx` and `SystemStatus.tsx` components. No structural changes — only precise value adjustments to breadcrumb hierarchy contrast, right-side spacing, and icon hover treatment.

---

## Decisions

| Topic | Decision |
|---|---|
| Top bar background separation | Border-only (`1px solid #2A2A2A`) — already implemented; no box-shadow added |
| Implementation approach | Option A: single-file targeted edits in `TopBar.tsx` and `SystemStatus.tsx` |
| Shared hover style abstraction | Rejected — hover rule is 3 properties; duplication is acceptable to keep components self-contained |
| Optional breadcrumb hover | Include — adds affordance without noise |

---

## Changes

### `TopBar.tsx`

#### 1. Breadcrumb hierarchy

Strengthen contrast, increase font size for visual balance, and fix vertical alignment.

| Element | Property | Before | After |
|---|---|---|---|
| Ancestor `Link` (navigable) | `color` | `#A0A0A0` | `#8A8A8A` |
| Ancestor `Link` (navigable) | `fontSize` | `12px` | `13px` |
| Ancestor `Link` (navigable) | `fontWeight` | _(absent)_ | `400` |
| Ancestor `Link` (navigable) | `display` | _(absent)_ | `'flex'` |
| Ancestor `Link` (navigable) | `alignItems` | _(absent)_ | `'center'` |
| Ancestor `Link` (navigable) | `lineHeight` | _(absent)_ | `1.4` |
| Ancestor `Typography` (non-navigable) | `color` | `#A0A0A0` | `#8A8A8A` |
| Ancestor `Typography` (non-navigable) | `fontSize` | `12px` | `13px` |
| Ancestor `Typography` (non-navigable) | `fontWeight` | _(absent)_ | `400` |
| Ancestor `Typography` (non-navigable) | `display` | _(absent)_ | `'flex'` |
| Ancestor `Typography` (non-navigable) | `alignItems` | _(absent)_ | `'center'` |
| Ancestor `Typography` (non-navigable) | `lineHeight` | _(absent)_ | `1.4` |
| Separator `NavigateNextIcon` | `color` | `#6B7280` | `#5A5A5A` |
| Separator `NavigateNextIcon` | `mx` | _(absent)_ | `0.5` |
| Current page `Typography` | `color` | `#E0E0E0` | `#E0E0E0` (unchanged) |
| Current page `Typography` | `fontSize` | `12px` | `13px` |
| Current page `Typography` | `fontWeight` | _(absent)_ | `500` |
| Current page `Typography` | `display` | _(absent)_ | `'flex'` |
| Current page `Typography` | `alignItems` | _(absent)_ | `'center'` |
| Current page `Typography` | `lineHeight` | _(absent)_ | `1.4` |
| Ancestor `Link` hover | `color` | _(absent)_ | `#CFCFCF` (navigable `Link` items only — non-navigable `Typography` ancestors have no hover state) |
| Ancestor `Link` hover | `transition` | _(absent)_ | `'color 0.15s ease'` |
| `Breadcrumbs` component | `sx` | minimal | add `display: 'flex', alignItems: 'center'` |
| `Breadcrumbs` separator spacing | `MuiBreadcrumbs-separator mx` | _(absent)_ | `0.75` |
| Breadcrumb outer `Box` | `display` | _(absent)_ | `'flex'` |
| Breadcrumb outer `Box` | `alignItems` | _(absent)_ | `'center'` |
| Breadcrumb outer `Box` | `height` | _(absent)_ | `'100%'` |

#### 2. Right-side action spacing

Change the right-side `Box` `gap` from `0.5` (4px) to `2` (16px via MUI 8px scale).

```tsx
// Before
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>

// After
<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
```

The `gap` applies to all three children: search bar (visible on `lg+`), `SystemStatus`, and the notification button. On desktop the search bar gains 12px of additional separation from the status icon — this is the intended result.

#### 3. Notification `IconButton` hover

Add hover background to unify with `SystemStatus` icon treatment.

```tsx
// Before
<IconButton onClick={(event) => setNotificationAnchorEl(event.currentTarget)} color="inherit">

// After
<IconButton
  onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
  color="inherit"
  sx={{ '&:hover': { bgcolor: '#2A2A2A', borderRadius: '8px' } }}
>
```

---

### `SystemStatus.tsx`

#### 4. Icon button hover

Add hover background matching the notification button.

```tsx
// Before
<IconButton onClick={handleClick} color="inherit" size="small">

// After
<IconButton
  onClick={handleClick}
  color="inherit"
  size="small"
  sx={{ '&:hover': { bgcolor: '#2A2A2A', borderRadius: '8px' } }}
>
```

The dot size (8px), tooltip text, and pulse animation are already correct — no changes needed.

---

## Vertical alignment

The breadcrumb `Box` wrapper needs explicit flex alignment (`display: 'flex', alignItems: 'center', height: '100%'`) and the `Breadcrumbs` component needs `display: 'flex', alignItems: 'center'` in its `sx` to remove the floating-text baseline mismatch. The right-side `Box` already has explicit `alignItems: 'center'`.

---

## Out of scope

- Ellipsis handling for long breadcrumb paths
- Box-shadow on top bar (deferred — border is sufficient)
- Any structural refactoring

---

## Files changed

| File | Changes |
|---|---|
| `frontend/src/components/common/TopBar.tsx` | Breadcrumb colors, fontWeight, hover; right-side gap; notification hover |
| `frontend/src/components/common/SystemStatus.tsx` | IconButton hover style |
