# Overview Page Independent Scroll — Design Spec

**Issue:** #446
**Date:** 2026-04-26

## Problem

`MainLayout` sets `overflow: 'hidden'` on the main content area, clipping content that exceeds the viewport. The 5 overview/dashboard pages render a plain React fragment as their root, so they inherit this clipping and offer no scroll mechanism. Content is inaccessible on smaller screens or when data density is high.

**Affected pages:**
- `DashboardPage` (`/dashboard`)
- `SalesPage` (`/sales`)
- `PurchasingPage` (`/purchasing`)
- `InventoryPage` (`/inventory`)
- `AccountingDashboardPage` (`/accounting/dashboard`)

## Approach

Create `GenericOverviewPage` — a thin scroll-container wrapper component. Each affected page replaces its root `<>...</>` fragment with `<GenericOverviewPage>`. The entire page content (including `PageHeader`) scrolls as one unit.

No changes to `MainLayout`. The existing `overflow: 'hidden'` stays; `GenericOverviewPage` opts into scrolling from inside, using the same flex pattern `GenericListPage` already uses.

## Component Design

**`frontend/src/components/common/GenericOverviewPage.tsx`**

```tsx
import { Box } from '@mui/material'
import type { ReactNode } from 'react'

export default function GenericOverviewPage({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {children}
    </Box>
  )
}
```

The key CSS properties:
- `flex: 1` — takes up remaining height in the flex column established by `MainLayout`
- `minHeight: 0` — allows the flex child to shrink below its natural content height (required for overflow to work in a flex context)
- `overflow: 'auto'` — enables scrolling when content exceeds the container

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/common/GenericOverviewPage.tsx` | New file |
| `frontend/src/pages/dashboard/DashboardPage.tsx` | Wrap root fragment with `GenericOverviewPage` |
| `frontend/src/pages/sales/SalesPage.tsx` | Wrap root fragment with `GenericOverviewPage` |
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Wrap root fragment with `GenericOverviewPage` |
| `frontend/src/pages/inventory/InventoryPage.tsx` | Wrap root fragment with `GenericOverviewPage` |
| `frontend/src/pages/accounting/AccountingDashboardPage.tsx` | Wrap root fragment with `GenericOverviewPage` |

## What Does Not Change

- `MainLayout` — no modifications
- `GenericListPage` — no modifications
- All existing page logic, data fetching, and state — untouched
- Existing tests — no logic changes, structural only

## Testing

- Existing unit/component tests pass unchanged (no logic touched)
- Manual verification: each page scrolls on a small viewport, `TopBar` stays fixed (it lives outside `<main>` in `MainLayout`)
