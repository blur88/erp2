---
issue: 211
title: Standardize DashboardFilterBar Reset Button Style and Spacing
date: 2026-03-29
status: approved
---

## Summary

Improve visual hierarchy in `DashboardFilterBar` by differentiating the Reset action from the filter inputs. The current `outlined` button style blends too closely with the `Select` inputs, creating ambiguity in a dense, dark ERP UI.

## Affected File

`frontend/src/components/dashboard/DashboardFilterBar.tsx` — line 221

## Design Decision

**Approach: `variant="text"` + `color="inherit"` + explicit left margin + opacity control**

Rationale:
- `variant="text"` removes the border, placing Reset below filters in visual hierarchy
- `color="inherit"` avoids misusing semantic palette colors (secondary = accent/highlight, not appropriate for a destructive-ish utility action)
- `ml: 2` adds a deliberate 16px left margin on top of the parent's existing `gap: 2`, creating a clear visual break between the last filter and the reset action
- `opacity: 0.8` at rest prevents the button from becoming invisible on dark theme while still de-emphasizing it; full opacity on hover signals interactivity
- `backgroundColor: 'transparent'` on hover suppresses MUI's default ghost hover background, which would look inconsistent on a receding text button

## Change

```tsx
// Before
<Button variant="outlined" color="inherit" size="small" onClick={onReset}>
  Reset
</Button>

// After
<Button
  variant="text"
  color="inherit"
  size="small"
  onClick={onReset}
  sx={{ ml: 2, opacity: 0.8, '&:hover': { opacity: 1, backgroundColor: 'transparent' } }}
>
  Reset
</Button>
```

## What Does Not Change

- Button is still hidden when `isDefault` is true (no behavior change)
- `size="small"` preserved — height stays aligned with filter inputs
- Label stays "Reset" (renaming to "Reset filters" is out of scope)

## Scope

One file, one component, ~8 lines changed. No tests, no migrations, no backend changes required.
