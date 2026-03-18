# Sidebar Colors Update Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `SIDEBAR_COLORS` in `Sidebar.tsx` to match `docs/ui.md` and add a dedicated `icon` token to replace icon-specific uses of the `text` token.

**Architecture:** Single-file change — update the `SIDEBAR_COLORS` constant values and add the `icon` token, then replace the 7 `SIDEBAR_COLORS.text` usages that color icons with `SIDEBAR_COLORS.icon`. No new files. No test changes needed.

**Tech Stack:** React 19, TypeScript, Material-UI v7, Vitest

---

## Chunk 1: Update SIDEBAR_COLORS and migrate icon usages

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx:97-108` (token values + new token)
- Modify: `frontend/src/components/common/Sidebar.tsx:841,863,961,1003,1047,1076,1149` (icon color usages)
- Test: `frontend/src/components/common/__tests__/Sidebar.test.tsx` (run only, no changes)

---

### Task 1: Update SIDEBAR_COLORS constant

- [ ] **Step 1: Open `frontend/src/components/common/Sidebar.tsx` and locate `SIDEBAR_COLORS` (lines 97–108)**

Current:
```ts
const SIDEBAR_COLORS = {
  bg: '#0F172A',
  activeBg: '#1F2937',
  hoverBg: '#1E293B',
  text: '#9CA3AF',
  activeText: '#E5E7EB',
  hoverText: '#CBD5E1',
  activeIcon: '#FFFFFF',
  sectionLabel: '#6B7280',
  border: '#1F2937',
  accentBar: '#42a5f5',
} as const
```

- [ ] **Step 2: Replace the constant with the updated values and new `icon` token**

```ts
const SIDEBAR_COLORS = {
  bg: '#0D0D0D',
  activeBg: '#1F2937',
  hoverBg: '#1E1E1E',
  text: '#9CA3AF',
  activeText: '#FFFFFF',
  hoverText: '#CBD5E1',
  activeIcon: '#3B82F6',
  icon: '#6B7280',
  sectionLabel: '#6B7280',
  border: '#1F2937',
  accentBar: '#42a5f5',
} as const
```

Changes:
- `bg`: `#0F172A` → `#0D0D0D`
- `hoverBg`: `#1E293B` → `#1E1E1E`
- `activeText`: `#E5E7EB` → `#FFFFFF`
- `activeIcon`: `#FFFFFF` → `#3B82F6`
- `icon`: *(new)* `#6B7280`

---

### Task 2: Migrate icon-specific `.text` usages to `.icon`

There are 9 total `SIDEBAR_COLORS.text` usages. Migrate 7 (icons); leave 2 (`ListItemText` labels) unchanged.

- [ ] **Step 3: In `renderFlyoutItem` — update `ListItemIcon` color (line ~841)**

Find:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.text,
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```
This is inside a `ListItemIcon` `sx` prop in `renderFlyoutItem`. Change to:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```

- [ ] **Step 4: In `renderFlyoutItem` — update `ExpandMore` chevron color (line ~863)**

Find:
```ts
color: SIDEBAR_COLORS.text,
display: 'flex',
alignItems: 'center',
transition: 'transform 0.2s',
transform: isExpanded ? 'rotate(180deg)' : 'none',
```
This is the `Box` wrapping the `ExpandMore` in `renderFlyoutItem`. Change `SIDEBAR_COLORS.text` to `SIDEBAR_COLORS.icon`.

- [ ] **Step 5: In `renderMenuItem` (collapsed+children) — update `ListItemIcon` color (line ~961)**

Find the `ListItemIcon` inside the `collapsed && hasChildren` branch:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.text,
justifyContent: 'center',
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```
Change to:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
justifyContent: 'center',
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```

- [ ] **Step 6: In `renderMenuItem` (collapsed+leaf) — update `ListItemIcon` color (line ~1003)**

Find the `ListItemIcon` inside the `collapsed && !hasChildren` branch:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.text,
justifyContent: 'center',
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```
Change to:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
justifyContent: 'center',
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```

- [ ] **Step 7: In `renderMenuItem` (expanded) — update `ListItemIcon` color (line ~1047)**

Find the `ListItemIcon` in the expanded (non-collapsed) branch of `renderMenuItem`:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.text,
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```
Note: this `ListItemIcon` has `minWidth: 40` (distinguishes it from the collapsed ones). Change to:
```ts
color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
'& .MuiSvgIcon-root': { fontSize: '1.25rem' },
transition: 'color 0.18s ease',
```

- [ ] **Step 8: In `renderMenuItem` (expanded) — update `ExpandMore` chevron color (line ~1076)**

Find the `Box` wrapping `ExpandMore` in the expanded branch of `renderMenuItem`:
```ts
color: SIDEBAR_COLORS.text,
display: 'flex',
alignItems: 'center',
transition: 'transform 0.2s',
transform: isExpanded ? 'rotate(180deg)' : 'none',
```
Change `SIDEBAR_COLORS.text` to `SIDEBAR_COLORS.icon`.

- [ ] **Step 9: Update sidebar collapse `IconButton` color (line ~1149)**

Find the `IconButton` for sidebar collapse/expand (has `aria-label` for "expand sidebar" / "collapse sidebar"):
```ts
color: SIDEBAR_COLORS.text,
width: 28,
height: 28,
'&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
```
Change `SIDEBAR_COLORS.text` to `SIDEBAR_COLORS.icon`.

---

### Task 3: Verify no regressions

- [ ] **Step 10: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors

- [ ] **Step 11: Run sidebar tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx
```
Expected: all tests pass (14 tests, no failures)

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: update SIDEBAR_COLORS to align with docs/ui.md (issue #121)"
```
