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
- **Important:** TypeORM does not auto-generate `ADD VALUE` SQL for PostgreSQL enum extensions. After generating the file, manually replace the generated SQL with the `ALTER TYPE` statement above.

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
   - **Important:** Do NOT wrap this in try/catch. If it throws (e.g., no open fiscal period), the exception must propagate before step 4, leaving the transaction in `POSTED` state. This is intentional. Adding a try/catch here risks setting status to `REVERSED` even when the journal reversal failed.
   - Note: the `sourceType` must be `'owner_equity_transaction'` — do not use `'owner_equity'` which appears in audit-log metadata of `postOwnerEquityEntry` and is a different string.
4. Set `transaction.status = OwnerEquityTransactionStatus.REVERSED`
5. Save transaction
6. Audit log: action `'REVERSE'`, entity `'OwnerEquity'`, message includes `referenceNumber`
7. Return `this.findOne(id)`

The `validStatuses` whitelist in `findAll` uses `Object.values(OwnerEquityTransactionStatus)` — `REVERSED` is automatically included with no changes.

**Update guards in `post()` and `update()`:**

Both methods currently guard with `if (transaction.status === POSTED)`. After this change, `REVERSED` transactions must also be blocked. Update both guards to:

```ts
if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
  throw new BadRequestException('...');
}
```

This prevents a reversed transaction from being re-posted or edited.

**Update guard in `remove()`:**

`remove()` currently guards with `if (transaction.status === POSTED)`. Update it to match the same `!== DRAFT` pattern:

```ts
if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
  throw new BadRequestException('Cannot delete a non-draft transaction');
}
```

Reversed transactions must not be soft-deleteable — deleting them would hide the source record from the UI while the counter journal entry still exists, breaking the audit trail.

### Controller — `owner-equity.controller.ts`

Add new endpoint alongside the existing `@Post(':id/post')`. NestJS route matching is per-HTTP-method, so `POST :id/reverse` only conflicts with other POST routes that have a leading parameter segment — not with `GET :id`. No catch-all `POST :id` exists in this controller, so placement is not constrained.

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
  - On confirm: call `reverseOwnerEquityTransaction(reverseConfirmId)`, show success/error toast, `refetch()` (consistent with all other action handlers on this page which also call `refetch()` in addition to tag invalidation)

**Sorting:** Add `sortBy: 'referenceNumber'` and `sortOrder: 'DESC'` to the `filters` memo passed to `useGetOwnerEquityTransactionsQuery`.

---

## 4. Impacted Files

| File | Change |
|------|--------|
| `backend/src/database/entities/owner-equity-transaction.entity.ts` | Add `REVERSED` enum value |
| `backend/src/modules/accounting/services/owner-equity.service.ts` | Add `reverse()`, update sort defaults, update `post()`/`update()`/`remove()` guards |
| `backend/src/modules/accounting/services/owner-equity.service.spec.ts` | Add `reverse()` test cases |
| `backend/src/modules/accounting/controllers/owner-equity.controller.ts` | Add `POST :id/reverse` endpoint |
| `backend/src/database/migrations/<timestamp>-AddReversedStatusToOwnerEquity.ts` | New migration |
| `frontend/src/types/index.ts` | Add `'reversed'` to status union |
| `frontend/src/store/api/accountingApi.ts` | Add `reverseOwnerEquityTransaction` mutation |
| `frontend/src/pages/accounting/OwnerEquityPage.tsx` | Reverse button, dialog, chip, filter, sort |

---

## 5. Required Test Cases

File: `backend/src/modules/accounting/services/owner-equity.service.spec.ts`

Add a `describe('reverse')` block with:

1. Throws `NotFoundException` when transaction is not found
2. Throws `BadRequestException` when status is not `POSTED` (test with `DRAFT` and `REVERSED`)
3. Calls `accountingService.reverseSourceEntries` with `('owner_equity_transaction', id, userId)`
4. Sets status to `REVERSED` and saves
5. Calls `auditLogService.log` with action `'REVERSE'`
6. Returns the updated transaction via `findOne`
7. Propagates error from `reverseSourceEntries` without updating status

## 6. Out of Scope

- Bulk reversal (not requested)
- Tracking which user performed the reversal beyond the audit log (audit log covers this)
- Linking original ↔ reversal transaction records (overkill for this use case)
