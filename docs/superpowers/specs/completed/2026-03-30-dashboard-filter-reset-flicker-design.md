# Design: Fix Dashboard Filter Reset Button Flicker (Issue #222)

## Summary

Fix a layout shift in `DashboardFilterBar` where the Reset button briefly jumps to the far right of the screen during data fetches.

## Root Cause

In `frontend/src/components/filters/DashboardFilterBar.tsx`, the `CircularProgress` spinner has `sx={{ ml: 'auto' }}`. Because the parent `Box` is a flex container, `ml: 'auto'` pushes the spinner — and the Reset button that follows it in the DOM — to the far right. When fetching ends and the spinner is removed, the Reset button snaps back left.

## Fix

Wrap both the spinner and the Reset button in a single container `Box` that owns the `ml: 'auto'` positioning:

```tsx
<Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
  {isFetching && <CircularProgress size={16} />}
  {!isDefault && (
    <Button variant="outlined" size="small" onClick={onReset} sx={{ height: 40 }}>
      Reset
    </Button>
  )}
</Box>
```

The wrapper claims the right-side slot permanently. Its contents (spinner, Reset button) appear and disappear without affecting the outer flex layout — the Reset button never moves.

## Scope

- **File:** `frontend/src/components/filters/DashboardFilterBar.tsx` (lines 285–298)
- **Change:** ~8 lines modified, no logic changes
- **Tests:** No new tests needed — this is a pure layout fix with no behavioral change

## Affected Pages

Any dashboard page that renders `DashboardFilterBar` with an active filter: Inventory, Sales, Purchasing dashboards.
