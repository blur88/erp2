# Color Palette Unification — Design Spec

**Issue:** #236
**Date:** 2026-03-31
**Status:** Approved

## Problem

Two hardcoded color exceptions exist outside the MUI theme system:

1. `Sidebar.tsx` — `useSidebarColors()` returns `bg: '#0D0D0D'` as a literal string
2. `LoginPage.tsx` and `MandatoryPasswordChangePage.tsx` — outer `Box` uses `background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'`

Both violate the rule in `docs/COLOR_PALETTE.md` that all UI colors must be governed by `theme.ts`.

## Solution

### 1. Theme augmentation (`frontend/src/styles/theme.ts`)

Add a TypeScript module augmentation block extending MUI's `TypeBackground` interface to include a `sidebar` property:

```ts
declare module '@mui/material/styles' {
  interface TypeBackground {
    sidebar: string
  }
}
```

Add `sidebar: '#0D0D0D'` to the `background` key of the dark theme palette:

```ts
background: {
  default: '#121212',
  paper: '#1e1e1e',
  sidebar: '#0D0D0D',
},
```

### 2. Sidebar component (`frontend/src/components/common/Sidebar.tsx`)

In `useSidebarColors()`, replace:

```ts
bg: '#0D0D0D',
```

with:

```ts
bg: theme.palette.background.sidebar,
```

No other changes to the component.

### 3. Auth pages

In both `frontend/src/pages/auth/LoginPage.tsx` and `frontend/src/pages/auth/MandatoryPasswordChangePage.tsx`, replace the outer `Box` background:

```ts
// Before
background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',

// After
bgcolor: theme.palette.background.default,
```

Both files already import `useTheme` and have a `theme` variable available.

### 4. Documentation (`docs/COLOR_PALETTE.md`)

- Remove the "documented exceptions" line at the bottom of the Rules section
- Add `theme.palette.background.sidebar` to the semantic tokens table as: sidebar/navigation background

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/styles/theme.ts` | Add module augmentation + `sidebar` palette entry |
| `frontend/src/components/common/Sidebar.tsx` | Use `theme.palette.background.sidebar` |
| `frontend/src/pages/auth/LoginPage.tsx` | Replace gradient with `background.default` |
| `frontend/src/pages/auth/MandatoryPasswordChangePage.tsx` | Replace gradient with `background.default` |
| `docs/COLOR_PALETTE.md` | Remove exceptions note, add `background.sidebar` token |

## Out of Scope

- Light theme support (app is dark-only)
- Any other hardcoded colors not listed above
- Visual changes beyond removing the gradient and unifying to theme tokens
