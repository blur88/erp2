---
title: Per-Page Scroll Control
issue: #432
date: 2026-04-25
---

## Problem

`MainLayout.tsx` sets `overflow: 'hidden'` on the `<main>` container, which clips content on long-form pages like the Dashboard. The fix must allow certain pages to scroll while keeping others locked (no scroll).

## Decision

- Default: **no scroll** (`overflow: 'hidden'`)
- Pages opt in to scrolling by calling `useLayoutScroll(true)`
- Only `DashboardPage` opts in for now; all other pages remain non-scrollable until explicitly enabled

## New Files

### `frontend/src/contexts/LayoutScrollContext.tsx`

- Exports `LayoutScrollProvider` — wraps children, holds `scrollEnabled` boolean state
- Exports `useLayoutScrollContext` — internal hook used by `MainLayout` to read the value
- Exports `useLayoutScroll(enabled: boolean)` — public hook for pages; sets value on mount, resets to `false` on unmount

## Modified Files

### `frontend/src/components/common/MainLayout.tsx`

- Wrap `<Outlet />` with `<LayoutScrollProvider>`
- Read `scrollEnabled` from context
- Apply `overflow: scrollEnabled ? 'auto' : 'hidden'` on the `<main>` Box

### `frontend/src/pages/dashboard/DashboardPage.tsx`

- Call `useLayoutScroll(true)` at the top of the component

## Behavior

- Navigating to Dashboard: scroll enabled, page scrolls normally
- Navigating away from Dashboard: hook cleanup resets scroll to `false`
- All other pages: `overflow: 'hidden'`, behavior unchanged
- Adding scroll to a new page in future: one line — `useLayoutScroll(true)`

## Out of Scope

- No route-based logic
- No changes to individual workflow pages (Inventory, Sales, Purchasing, etc.)
