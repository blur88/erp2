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

Strengthen contrast between ancestor and current-page segments.

| Element | Property | Before | After |
|---|---|---|---|
| Ancestor `Link` (navigable) | `color` | `#A0A0A0` | `#8A8A8A` |
| Ancestor `Typography` (non-navigable) | `color` | `#A0A0A0` | `#8A8A8A` |
| Separator `NavigateNextIcon` | `color` | `#6B7280` | `#5A5A5A` |
| Current page `Typography` | `color` | `#E0E0E0` | `#E0E0E0` (unchanged) |
| Current page `Typography` | `fontWeight` | _(absent)_ | `500` |
| Ancestor `Link` hover | `color` | _(absent)_ | `#CFCFCF` |

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

Already correct — `Toolbar` centers content by default and the right-side `Box` has explicit `alignItems: 'center'`. No code change needed.

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
