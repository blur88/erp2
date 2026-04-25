# Issue #434: Sales Page Scroll + sortOrder 500 Fix

## Summary

Two independent bugs on the Sales overview page (`/sales`):

1. Content is clipped at viewport height — the page is not scrollable.
2. `GET /api/sales-orders?sortOrder=desc` returns 500 because `BaseQueryDto` validates `sortOrder` case-sensitively against `['ASC', 'DESC']`.

## Fix 1: Scroll — `SalesPage.tsx`

Call `useLayoutScroll(true)` at the top of the `SalesPage` component body. This is the same pattern used by `DashboardPage`. The hook signals `MainLayout` (via `LayoutScrollContext`) to switch the main container from `overflow: hidden` to `overflow: auto`.

No other changes to the component.

## Fix 2: Frontend API call — `SalesPage.tsx:114`

Change `sortOrder: 'desc'` to `sortOrder: 'DESC'` in the `fetchRecentOrders` params object. Fixes the immediate 500.

## Fix 3: Backend robustness — `BaseQueryDto`

Add a `@Transform` decorator before `@IsIn` on the `sortOrder` field to uppercase the incoming value:

```ts
@IsOptional()
@Transform(({ value }) => value?.toUpperCase())
@IsIn(['ASC', 'DESC'])
sortOrder?: 'ASC' | 'DESC';
```

`@Transform` runs before `@IsIn`, so `'asc'`/`'desc'` are normalized before validation. This prevents any future caller from hitting a 500 due to case mismatch. Scope is limited to `sortOrder` only — no other fields touched.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/sales/SalesPage.tsx` | Add `useLayoutScroll(true)`; change `sortOrder: 'desc'` → `'DESC'` |
| `backend/src/common/dto/base-query.dto.ts` | Add `@Transform` to uppercase `sortOrder` |

## Testing

- Navigate to `/sales` and verify content below the fold is accessible.
- Confirm no 500 in browser console on page load.
- Backend unit: send `sortOrder=desc` (lowercase) to `GET /api/sales-orders` and verify 200.
- Existing `BaseQueryDto` tests should continue to pass.

## Out of Scope

- `sortBy` whitespace normalization (no reported bug, YAGNI).
- Other pages' scroll behavior.
