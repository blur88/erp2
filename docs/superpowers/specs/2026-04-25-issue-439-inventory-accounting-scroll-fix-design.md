---
title: Issue #439 — Inventory & Accounting Dashboard Scroll Fix
date: 2026-04-25
issue: https://github.com/blur88/erp2/issues/439
---

## Problem

`InventoryPage` (`/inventory`) and `AccountingDashboardPage` (`/accounting`) do not scroll when content exceeds the viewport height. Content below the fold is inaccessible.

The root cause is not in `MainLayout.tsx` — the scroll infrastructure already exists via `LayoutScrollContext`. These two pages simply never called `useLayoutScroll(true)` to opt in.

## Existing Pattern

`DashboardPage`, `SalesPage`, and `PurchasingPage` all use the same fix:

```ts
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
// inside component:
useLayoutScroll(true)
```

`MainLayout` reads the context value and sets `overflow: auto` vs `overflow: hidden` on the main content box accordingly.

## Design

Apply the identical pattern to the two affected pages:

### 1. `frontend/src/pages/inventory/InventoryPage.tsx`
- Add import: `import { useLayoutScroll } from '@/contexts/LayoutScrollContext'`
- Add hook call inside `InventoryPage` component: `useLayoutScroll(true)`

### 2. `frontend/src/pages/accounting/AccountingDashboardPage.tsx`
- Add import: `import { useLayoutScroll } from '@/contexts/LayoutScrollContext'`
- Add hook call inside the component: `useLayoutScroll(true)`

No changes to `MainLayout.tsx`, `LayoutScrollContext.tsx`, or any other file.

## Testing

- Run the existing test files for both pages to confirm no regressions:
  - `frontend/src/pages/inventory/__tests__/` (if present) or targeted vitest run on `InventoryPage`
  - `frontend/src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx`
- Manual verification: navigate to `/inventory` and `/accounting`, confirm content scrolls.

## Scope

Two files, two lines each (one import + one hook call). No architectural changes.
