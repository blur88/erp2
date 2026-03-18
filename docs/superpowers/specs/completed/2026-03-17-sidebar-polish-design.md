# Sidebar Polish Spec (Issue #116)

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Polish pass on top of PR #115. Does not change structure, layout, or behavior — only visual token and transition gaps.

---

## Context

PR #115 implemented the full sidebar redesign: dark palette, collapse/rail mode, flyout Popper, active state, spacing, and tooltip behavior. Issue #116 tracks the remaining deltas needed to bring the sidebar from "implemented" to "fully polished."

This spec only covers the unresolved gaps. Do not reopen settled decisions from the PR #115 spec (`2026-03-17-sidebar-redesign.md`).

---

## Gap Audit

| Issue #116 Item | Status After PR #115 | Action |
|---|---|---|
| Visual hierarchy (section labels, weights, colors) | Done | None |
| Active state pill + left accent bar | Done | None |
| Active icon `#FFFFFF` | Gap — currently `#E5E7EB` | Fix |
| Active item border-radius `8–10px` | Gap — currently `borderRadius: 1` (4px) | Fix |
| Active item inset shadow | Missing | Add |
| Hover bg `#1E293B` | Done | None |
| Hover icon/text brightening | Missing | Add |
| Hover + icon/text transitions | Missing | Add |
| Chevron rotation transition | Done | None |
| Collapse animation duration | Unspecified — MUI `auto` | Tighten |
| Reduce divider noise | Done | None |
| Icon default `#9CA3AF` | Done | None |
| Icon scale on hover | Deliberately skipped | None |
| Spacing system (rows, padding) | Done | None |
| Section label spacing 16px top / 8px bottom | Gap — uses `py: 1` globally | Fix |
| Tooltip delay 400ms | Done | None |

---

## 1. Token Changes (`SIDEBAR_COLORS`)

Add two entries to the existing constant:

```ts
const SIDEBAR_COLORS = {
  // existing entries unchanged...
  hoverText: '#CBD5E1',   // icon + text color on non-active hover
  activeIcon: '#FFFFFF',  // icon color on active leaf (text stays #E5E7EB)
} as const
```

### Color hierarchy

| State | Icon | Text |
|---|---|---|
| Default | `#9CA3AF` | `#9CA3AF` |
| Hover (non-active) | `#CBD5E1` | `#CBD5E1` |
| Active | `#FFFFFF` | `#E5E7EB` |

**Rule:** Hover color overrides only apply to non-active rows. Active rows stay visually stable on hover.

---

## 2. Active Item Styling

### 2a. Icon color

Update icon `ListItemIcon` color in all four branches that set it:

```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.text,
```

The four sites to update:
1. `renderMenuItem` — expanded leaf/parent row (line ~1021)
2. `renderFlyoutItem` — flyout row (line ~833)
3. `renderMenuItem` collapsed-with-children branch — icon-only rail parent (line ~946)
4. `renderMenuItem` collapsed-leaf branch — icon-only rail leaf (line ~983)

Previously all four used `SIDEBAR_COLORS.activeText` (`#E5E7EB`) for active icons. Active icon is now `SIDEBAR_COLORS.activeIcon` (`#FFFFFF`).

### 2b. Border-radius

- **Expanded rows** (`renderMenuItem`): `borderRadius: 1` → `borderRadius: 2` (8px)
- **Flyout rows** (`renderFlyoutItem`): `borderRadius: 1` → `borderRadius: 2` (8px)
- **Collapsed rail items**: keep `borderRadius: 1` (icon-only squares, smaller radius is appropriate)

### 2c. Inset shadow (active leaf only)

Add to active leaf styling only (not to parent-active rows). Two targets:

- **`renderMenuItem`**: add to the `activeLeafSx` const
- **`renderFlyoutItem`**: add inline to the `isActive && !hasChildren` spread block (the flyout path has no named `activeLeafSx` — styling is written inline)

```ts
boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
```

This subtle shadow applies only to leaf items with the full pill background, matching the Linear/Stripe aesthetic referenced in the issue.

---

## 3. Hover Transitions and Color Changes

### On each `ListItemButton` sx:

```ts
transition: 'background-color 0.18s ease',
'& .MuiListItemIcon-root': {
  transition: 'color 0.18s ease',
},
'& .MuiListItemText-primary': {
  transition: 'color 0.18s ease',
},
```

Transitions are placed on the nested icon/text elements directly rather than relying on root `color` to cascade through MUI component internals.

### Hover color (non-active rows only):

```ts
...(!isActive && {
  '&:hover .MuiListItemIcon-root': { color: SIDEBAR_COLORS.hoverText },
  '&:hover .MuiListItemText-primary': { color: SIDEBAR_COLORS.hoverText },
}),
```

Active rows do not receive hover color overrides — they stay at `#FFFFFF` icon / `#E5E7EB` text.

### Apply to:
- `renderMenuItem` expanded rows
- `renderFlyoutItem` rows
- Collapsed rail rows (icon-only; only icon transition applies, no text)

---

## 4. Collapse Animation Duration

Add explicit `timeout` to both `<Collapse>` instances:

```tsx
<Collapse in={isExpanded} timeout={200} unmountOnExit>
```

Previously used MUI default (`"auto"`). `200ms` matches the micro-interaction spec from the issue (`0.15–0.2s`).

Applies to:
- `renderMenuItem` Collapse (expanded accordion)
- `renderFlyoutItem` Collapse (flyout inline accordion)

---

## 5. Section Label Spacing

Update the section label `Typography` padding:

```ts
// Before
py: 1,

// After
pt: 2,
pb: 1,
```

This gives `16px` top / `8px` bottom spacing around section labels. Horizontal padding (`px: 3`) is unchanged to avoid layout drift.

---

## 6. Flyout Consistency

All changes in sections 2–3 apply equally to `renderFlyoutItem` for visual consistency between expanded and collapsed modes. The distinction between leaf-active (full pill + shadow) and parent-active (brightened text/icon only) is preserved in both contexts.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/components/common/Sidebar.tsx` | Add `hoverText` + `activeIcon` tokens; update active icon color; increase border-radius on expanded/flyout rows; add inset shadow to active leaves; add background + icon/text transitions; add hover color for non-active rows; set `timeout={200}` on Collapse; adjust section label padding |

No other files. No structural changes, no new abstractions, no behavior changes.

---

## What Is Deliberately Not Included

- Icon scale on hover (skipped — adds jitter in dense lists, color brightening is sufficient)
- `getItemSx()` helper refactor (out of scope for this polish pass)
- Any changes to routing, collapse behavior, flyout logic, or MainLayout
