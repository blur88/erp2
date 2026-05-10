# Sidebar Active State Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the sidebar pill highlight — opacity, border radius, hover shift, flyout consistency, footer background, and user menu trigger shape — per issue #256.

**Architecture:** Pure style changes across three existing files. `useSidebarColors` is the single token source in `Sidebar.tsx`; updating `activeBg` there propagates automatically. All other changes are targeted `sx` prop edits. No new components, no logic changes.

**Tech Stack:** React 19, MUI v7, `alpha()` from `@mui/material/styles`

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/components/common/Sidebar.tsx` | `useSidebarColors.activeBg` opacity; `renderMenuItem` borderRadius + transform; `renderFlyoutItem` height/font/margin/borderRadius + transform |
| `frontend/src/components/common/SidebarFooter.tsx` | Background token `default` → `sidebar` |
| `frontend/src/components/common/SidebarUserMenu.tsx` | Expanded trigger: borderRadius, margin, hover transform `1px` → `4px` |

---

### Task 1: Sidebar.tsx — colors, renderMenuItem, renderFlyoutItem

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Update `useSidebarColors` — active background opacity**

In `useSidebarColors` (line ~48), change `activeBg`:

```tsx
// Before
activeBg: theme.palette.action.selected,

// After
activeBg: alpha(theme.palette.primary.main, 0.13),
```

`alpha` is already imported at the top of the file: `import { alpha, useTheme } from '@mui/material/styles'`

- [ ] **Step 2: Update `renderMenuItem` — borderRadius and translateX**

The expanded `ListItemButton` inside `renderMenuItem` (line ~555) currently has:

```tsx
height: 40,
borderRadius: 2,
mx: 1,
mb: 0.5,
position: 'relative',
transition: 'background-color 0.18s ease',
```

Change to:

```tsx
height: 40,
borderRadius: 1,
mx: 1,
mb: 0.5,
position: 'relative',
transform: 'translateX(0)',
transition: 'background-color 0.18s ease, transform 0.18s ease',
```

Then update the `'&:hover'` block in that same `sx`:

```tsx
'&:hover': { bgcolor: colors.hoverBg, transform: 'translateX(4px)' },
```

Also add `transform` to the active leaf style (`activeLeafSx`):

```tsx
const activeLeafSx =
  isActive && !hasChildren
    ? {
        bgcolor: colors.activeBg,
        boxShadow: `inset 0 0 0 1px ${colors.outline}`,
        transform: 'translateX(4px)',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: '60%',
          borderRadius: '0 2px 2px 0',
          bgcolor: colors.accentBar,
        },
      }
    : {}
```

- [ ] **Step 3: Update `renderFlyoutItem` — sync dimensions and add translateX**

The `ListItemButton` inside `renderFlyoutItem` (line ~287) currently has:

```tsx
pl: 1.5 + level * 2,
pr: 1.5,
py: 0,
height: 36,
borderRadius: 2,
mx: 0.5,
mb: 0.25,
position: 'relative',
transition: 'background-color 0.18s ease',
```

Change to:

```tsx
pl: 1.5 + level * 2,
pr: 1.5,
py: 0,
height: 40,
borderRadius: 1,
mx: 1,
mb: 0.25,
position: 'relative',
transform: 'translateX(0)',
transition: 'background-color 0.18s ease, transform 0.18s ease',
```

Update the `'&:hover'` line in that same `sx`:

```tsx
'&:hover': { bgcolor: colors.hoverBg, transform: 'translateX(4px)' },
```

Update the font size in `ListItemText` inside `renderFlyoutItem` (line ~354):

```tsx
// Before
fontSize: '0.8125rem',

// After
fontSize: '0.875rem',
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "fix(sidebar): refine pill — opacity 13%, radius 8px, translateX hover, sync flyout dimensions"
```

---

### Task 2: SidebarFooter + SidebarUserMenu

**Files:**
- Modify: `frontend/src/components/common/SidebarFooter.tsx`
- Modify: `frontend/src/components/common/SidebarUserMenu.tsx`

- [ ] **Step 1: Fix SidebarFooter background token**

In `SidebarFooter.tsx` (line ~16), change:

```tsx
// Before
backgroundColor: theme.palette.background.default,

// After
backgroundColor: theme.palette.background.sidebar,
```

- [ ] **Step 2: Update SidebarUserMenu expanded trigger**

The expanded trigger `<Box component="button">` (line ~127) currently has:

```tsx
sx={{
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '40px',
  px: 2,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  transition: 'background-color 0.15s ease, transform 0.15s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    transform: 'translateX(1px)',
  },
}}
```

Change to:

```tsx
sx={{
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '40px',
  px: 2,
  mx: 1,
  mb: 0.5,
  borderRadius: 1,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  boxSizing: 'border-box',
  transform: 'translateX(0)',
  transition: 'background-color 0.15s ease, transform 0.15s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    transform: 'translateX(4px)',
  },
}}
```

Note: `width: '100%'` with `mx: 1` will cause overflow. Change `width: '100%'` to `width: 'calc(100% - 16px)'` or remove it and rely on `alignItems: 'stretch'` from the parent. The parent `SidebarFooter` renders `alignItems: collapsed ? 'center' : 'stretch'`, so removing `width: '100%'` and adding `alignSelf: 'stretch'` is cleaner:

```tsx
sx={{
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'stretch',
  height: '40px',
  px: 2,
  mx: 1,
  mb: 0.5,
  borderRadius: 1,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  transform: 'translateX(0)',
  transition: 'background-color 0.15s ease, transform 0.15s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    transform: 'translateX(4px)',
  },
}}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/SidebarFooter.tsx frontend/src/components/common/SidebarUserMenu.tsx
git commit -m "fix(sidebar): footer background token + user menu pill shape and hover shift

Closes #256"
```
