# Owner's Equity Transaction Reversal & UI Polish — Design Spec

**Issue:** #64
**Date:** 2026-03-15
**Status:** Approved

---

## Overview

Enhance the Owner's Equity Transaction module with four improvements:

1. Transaction reversal for posted transactions (with journal entry counter-posting)
2. `REVERSED` status chip in the UI
3. Default sort by reference number descending (latest first)
4. Row selection (already implemented — confirmed no changes needed)

---

## 1. Database Migration

Add `reversed` to the `owner_equity_transaction_status_enum` PostgreSQL enum.

```sql
ALTER TYPE owner_equity_transaction_status_enum ADD VALUE IF NOT EXISTS 'reversed';
```

- Safe, non-locking in PostgreSQL
- Migration file generated via `npm run migration:generate --name=AddReversedStatusToOwnerEquity`

---

## 2. Backend

### Entity — `owner-equity-transaction.entity.ts`

Add `REVERSED = 'reversed'` to `OwnerEquityTransactionStatus`:

```ts
export enum OwnerEquityTransactionStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
  REVERSED = 'reversed',
}
```

### Service — `owner-equity.service.ts`

**Sorting change:**
- Add `'referenceNumber'` to `allowedSortFields`
- Change default `sortBy` from `'transactionDate'` to `'referenceNumber'`
- Default `sortOrder` remains `'DESC'`

**New `reverse` method:**

```
reverse(id: string, userId?: string, username?: string): Promise<OwnerEquityResponseDto>
```

Logic:
1. Load transaction; throw `NotFoundException` if not found or soft-deleted
2. Throw `BadRequestException('Transaction is not posted')` if `status !== POSTED`
3. Call `this.accountingService.reverseSourceEntries('owner_equity_transaction', id, userId ?? 'system')`
4. Set `transaction.status = OwnerEquityTransactionStatus.REVERSED`
5. Save transaction
6. Audit log: action `'REVERSE'`, entity `'OwnerEquity'`, message includes `referenceNumber`
7. Return `this.findOne(id)`

The `validStatuses` whitelist in `findAll` uses `Object.values(OwnerEquityTransactionStatus)` — `REVERSED` is automatically included with no changes.

### Controller — `owner-equity.controller.ts`

Add new endpoint **before** `@Get(':id')` (NestJS route-order requirement):

```ts
@Post(':id/reverse')
@Auth(UserRole.ADMIN, UserRole.MANAGER)
reverse(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
) {
  return this.ownerEquityService.reverse(id, currentUserId, currentUsername);
}
```

Role: `ADMIN + MANAGER` (same as `post`).

---

## 3. Frontend

### Types — `frontend/src/types/index.ts`

```ts
status: 'draft' | 'posted' | 'reversed';
```

### API — `frontend/src/store/api/accountingApi.ts`

Add mutation:

```ts
reverseOwnerEquityTransaction: builder.mutation<OwnerEquityTransaction, string>({
  query: (id) => ({ url: `/accounting/owner-equity/${id}/reverse`, method: 'POST' }),
  transformResponse: normalizeSingle<OwnerEquityTransaction>,
  invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
}),
```

Export `useReverseOwnerEquityTransactionMutation`.

### Page — `frontend/src/pages/accounting/OwnerEquityPage.tsx`

**Status filter dropdown:** Add `<MenuItem value="reversed">Reversed</MenuItem>`.

**Status chip:** Add explicit `reversed` case:
```ts
color={row.status === 'posted' ? 'success' : row.status === 'reversed' ? 'error' : 'default'}
```

**Reverse action button:**
- Import `Undo as UndoIcon` from `@mui/icons-material`
- Import `useReverseOwnerEquityTransactionMutation`
- Add `reverseConfirmId` state (`string | null`) for the confirmation dialog
- Render `IconButton` in the actions column when `row.status === 'posted'` (alongside the existing draft actions which are guarded by `isDraft`)
- Confirmation dialog (separate from the create/edit dialog):
  - Title: "Reverse Transaction"
  - Body: "Are you sure you want to reverse this transaction? This will create a reversal journal entry."
  - Actions: Cancel / Confirm (color `error`)
  - On confirm: call `reverseOwnerEquityTransaction(reverseConfirmId)`, show success/error toast, `refetch()`

**Sorting:** Add `sortBy: 'referenceNumber'` and `sortOrder: 'DESC'` to the `filters` memo passed to `useGetOwnerEquityTransactionsQuery`.

---

## 4. Impacted Files

| File | Change |
|------|--------|
| `backend/src/database/entities/owner-equity-transaction.entity.ts` | Add `REVERSED` enum value |
| `backend/src/modules/accounting/services/owner-equity.service.ts` | Add `reverse()`, update sort defaults |
| `backend/src/modules/accounting/controllers/owner-equity.controller.ts` | Add `POST :id/reverse` endpoint |
| `backend/src/database/migrations/<timestamp>-AddReversedStatusToOwnerEquity.ts` | New migration |
| `frontend/src/types/index.ts` | Add `'reversed'` to status union |
| `frontend/src/store/api/accountingApi.ts` | Add `reverseOwnerEquityTransaction` mutation |
| `frontend/src/pages/accounting/OwnerEquityPage.tsx` | Reverse button, dialog, chip, filter, sort |

---

## 5. Out of Scope

- Bulk reversal (not requested)
- Tracking which user performed the reversal beyond the audit log (audit log covers this)
- Linking original ↔ reversal transaction records (overkill for this use case)
