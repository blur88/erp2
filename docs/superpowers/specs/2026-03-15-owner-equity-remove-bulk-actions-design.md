# Design: Remove Bulk Actions from Owner's Equity Page

**Date:** 2026-03-15
**Issue:** #107
**Status:** Approved

## Overview

Remove the checkbox column and bulk actions (Bulk Post, Bulk Delete) from the Owner's Equity page to simplify the UI and focus on individual transaction management. The removal is full-stack: frontend UI, frontend API layer, backend endpoints, backend service methods, DTO, and tests.

## Motivation

- Owner equity transactions are low-volume; bulk operations add UI complexity without meaningful benefit
- Removing the checkbox column frees table space for transaction details
- Reduces cognitive load by focusing on individual workflows (Create, Edit, Post, Reverse, Delete)

## Changes

### Frontend — `OwnerEquityPage.tsx`

- Remove `selectedIds` state (`useState<Set<string>>`)
- Remove `allSelected` and `draftRows` derived variables
- Remove `useBulkPostOwnerEquityTransactionsMutation` and `useBulkDeleteOwnerEquityTransactionsMutation` imports and hook calls
- Remove `onBulkPost` and `onBulkDelete` handler functions
- Remove conditional bulk action buttons from the header `Stack`
- Remove header checkbox `<TableCell>` from `TableHead`
- Remove per-row checkbox `<TableCell>` from `TableBody`
- Remove `setSelectedIds` calls inside `onDelete` and `onPost` (dead code)
- Remove `setSelectedIds(new Set())` from `useKeyboardShortcuts` escape handler
- Remove `Checkbox` from MUI imports
- Fix empty-state row `colSpan` from 9 → 8

### Frontend — `accountingApi.ts`

- Remove `bulkPostOwnerEquityTransactions` builder mutation definition
- Remove `bulkDeleteOwnerEquityTransactions` builder mutation definition
- Remove both from the named exports destructure

### Frontend — `OwnerEquityPage.test.tsx`

- Remove `useBulkPostOwnerEquityTransactionsMutation` and `useBulkDeleteOwnerEquityTransactionsMutation` from `mockedApi` object
- Remove them from the `vi.mock('@/store/api/accountingApi', ...)` block
- Remove their `mockReturnValue` calls in `beforeEach`

### Backend — `owner-equity.controller.ts`

- Remove `BulkOwnerEquityDto` import
- Remove `bulkPost` POST route handler (`/bulk-post`)
- Remove `bulkDelete` POST route handler (`/bulk-delete`)

### Backend — `owner-equity.service.ts`

- Remove `BulkOwnerEquityDto` import
- Remove `bulkPost` method
- Remove `bulkDelete` method

### Backend — `owner-equity.dto.ts`

- Remove `BulkOwnerEquityDto` class

### Backend — `owner-equity.service.spec.ts`

- Remove `bulkPost posts multiple transactions and returns count` test
- Remove `bulkDelete deletes multiple transactions and returns count` test

## Acceptance Criteria

- No checkbox column in the Owner's Equity table
- No "Bulk Post" or "Bulk Delete" buttons visible under any conditions
- Individual transaction actions (Create, Edit, Post, Reverse, Delete) remain fully functional
- All frontend and backend tests pass
- No dead code referencing selection state or bulk mutations remains
