# Owner's Equity Transaction Reversal & UI Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transaction reversal to posted owner equity transactions, update status guards across the service, add a `REVERSED` status chip and confirmation dialog in the UI, and default the list sort to reference number descending.

**Architecture:** Extend the existing `OwnerEquityTransactionStatus` enum with `REVERSED`, add a `reverse()` service method that delegates journal reversal to the existing `AccountingService.reverseSourceEntries()`, update all three status guards in the service (`post`, `update`, `remove`) to block non-draft transactions, add a migration for the new enum value, and wire up the frontend with a new RTK Query mutation and a confirmation dialog.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 19, MUI v7, RTK Query, Jest (backend), Vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-03-15-owner-equity-reversal-design.md`

---

## File Map

### Backend — Modified files
| File | Change |
|---|---|
| `backend/src/database/entities/owner-equity-transaction.entity.ts` | Add `REVERSED = 'reversed'` to enum |
| `backend/src/modules/accounting/services/owner-equity.service.ts` | Add `reverse()`, update sort defaults, update guards in `post()`/`update()`/`remove()` |
| `backend/src/modules/accounting/services/owner-equity.service.spec.ts` | Add `reverseSourceEntries` mock stub; add `describe('reverse')` tests; update guard tests for `post`/`update`/`remove` |
| `backend/src/modules/accounting/controllers/owner-equity.controller.ts` | Add `POST :id/reverse` endpoint |

### Backend — New files
| File | Responsibility |
|---|---|
| `backend/src/database/migrations/<timestamp>-AddReversedStatusToOwnerEquity.ts` | `ALTER TYPE` to add `reversed` enum value |

### Frontend — Modified files
| File | Change |
|---|---|
| `frontend/src/types/index.ts` | Add `'reversed'` to `OwnerEquityTransaction.status` union |
| `frontend/src/store/api/accountingApi.ts` | Add `reverseOwnerEquityTransaction` mutation + export hook |
| `frontend/src/pages/accounting/OwnerEquityPage.tsx` | Reverse button + dialog, status chip, filter, sort |

---

## Chunk 1: Backend — Entity, Migration, Service + Tests

### Task 1: Add `REVERSED` to the entity enum

**Files:**
- Modify: `backend/src/database/entities/owner-equity-transaction.entity.ts`

- [ ] **Step 1: Add the enum value**

In `owner-equity-transaction.entity.ts`, update the enum:

```ts
export enum OwnerEquityTransactionStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
  REVERSED = 'reversed',
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

---

### Task 2: Generate and fix the database migration

**Files:**
- Create: `backend/src/database/migrations/<timestamp>-AddReversedStatusToOwnerEquity.ts`

- [ ] **Step 1: Generate migration skeleton**

```bash
cd backend && npm run migration:generate --name=AddReversedStatusToOwnerEquity
```

Expected: a new file created under `src/database/migrations/`.

- [ ] **Step 2: Replace generated SQL with the correct ALTER TYPE**

TypeORM does not auto-generate `ADD VALUE` for PostgreSQL enums. Open the generated file and replace the `up` and `down` method bodies with:

```ts
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(
    `ALTER TYPE "owner_equity_transaction_status_enum" ADD VALUE IF NOT EXISTS 'reversed'`
  );
}

public async down(queryRunner: QueryRunner): Promise<void> {
  // PostgreSQL does not support removing enum values.
  // To revert: drop and recreate the enum without 'reversed'.
  // Only do this if no rows use the 'reversed' value.
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

---

### Task 3: Update service — sort defaults and status guards

**Files:**
- Modify: `backend/src/modules/accounting/services/owner-equity.service.ts`

- [ ] **Step 1: Update sort defaults in `findAll`**

Find the `allowedSortFields` line (currently around line 82) and the destructured defaults (line 49). Change:

```ts
// Before
sortBy = 'transactionDate',
// ...
const allowedSortFields = ['transactionDate', 'createdAt', 'amount', 'type'];
const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'transactionDate';
```

```ts
// After
sortBy = 'referenceNumber',
// ...
const allowedSortFields = ['transactionDate', 'createdAt', 'amount', 'type', 'referenceNumber'];
const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'referenceNumber';
```

- [ ] **Step 2: Update guard in `update()`**

Change the existing guard (around line 164):

```ts
// Before
if (transaction.status === OwnerEquityTransactionStatus.POSTED) {
  throw new BadRequestException('Cannot update a posted transaction');
}
```

```ts
// After
if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
  throw new BadRequestException('Cannot update a non-draft transaction');
}
```

- [ ] **Step 3: Update guard in `remove()`**

Change the existing guard (around line 202):

```ts
// Before
if (transaction.status === OwnerEquityTransactionStatus.POSTED) {
  throw new BadRequestException('Cannot delete a posted transaction');
}
```

```ts
// After
if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
  throw new BadRequestException('Cannot delete a non-draft transaction');
}
```

- [ ] **Step 4: Update guard in `post()`**

Change the existing guard (around line 230). The `post()` method has a `try/catch` block wrapping the `postOwnerEquityEntry` call — leave that `try/catch` untouched. Only change the guard condition:

```ts
// Before
if (transaction.status === OwnerEquityTransactionStatus.POSTED) {
  throw new BadRequestException('Transaction is already posted');
}
```

```ts
// After
if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
  throw new BadRequestException('Only draft transactions can be posted');
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

---

### Task 4: Add `reverse()` method to service

**Files:**
- Modify: `backend/src/modules/accounting/services/owner-equity.service.ts`

- [ ] **Step 1: Add the `reverse` method** (after the `post` method, before `bulkPost`)

```ts
async reverse(
  id: string,
  userId?: string,
  username?: string,
): Promise<OwnerEquityResponseDto> {
  const transaction = await this.ownerEquityRepository.findOne({
    where: { id },
    relations: ['paymentMethod'],
    withDeleted: true,
  });

  if (!transaction || transaction.deletedAt) {
    throw new NotFoundException(`Owner equity transaction ${id} not found`);
  }

  if (transaction.status !== OwnerEquityTransactionStatus.POSTED) {
    throw new BadRequestException('Transaction is not posted');
  }

  // Do NOT wrap in try/catch — if reverseSourceEntries throws (e.g. no open
  // fiscal period), the exception propagates before status is updated,
  // leaving the transaction in POSTED state. This is intentional.
  await this.accountingService.reverseSourceEntries(
    'owner_equity_transaction',
    id,
    userId ?? 'system',
  );

  transaction.status = OwnerEquityTransactionStatus.REVERSED;
  await this.ownerEquityRepository.save(transaction);

  await this.auditLogService.log(
    'REVERSE',
    'OwnerEquity',
    `Reversed owner equity transaction: ${transaction.referenceNumber}`,
    { entityId: id, userId: userId ?? 'system', username },
  );

  return this.findOne(id);
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

---

### Task 5: Write and run service tests

**Files:**
- Modify: `backend/src/modules/accounting/services/owner-equity.service.spec.ts`

- [ ] **Step 1: Add `reverseSourceEntries` to the `AccountingService` mock**

In `beforeEach`, the `AccountingService` mock currently only stubs `postOwnerEquityEntry`. Add `reverseSourceEntries`:

```ts
{
  provide: AccountingService,
  useValue: {
    postOwnerEquityEntry: jest.fn(),
    reverseSourceEntries: jest.fn(),
  },
},
```

- [ ] **Step 2: Add `auditLogService` variable**

`auditLogService` is not currently declared or retrieved in the test file. You must add it. At the top of `describe('OwnerEquityService')`, alongside the other `let` declarations:

```ts
let auditLogService: jest.Mocked<AuditLogService>;
```

Inside `beforeEach`, alongside the other `module.get` calls:

```ts
auditLogService = module.get(AuditLogService);
```

- [ ] **Step 3: Write the `describe('reverse')` block**

Add after the existing `describe('post')` block:

```ts
describe('reverse', () => {
  const postedTransaction = {
    id: 'oe-1',
    referenceNumber: 'OE-001',
    status: OwnerEquityTransactionStatus.POSTED,
    deletedAt: null,
    paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  } as any;

  it('throws NotFoundException when transaction is not found', async () => {
    ownerEquityRepository.findOne.mockResolvedValue(null);
    await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when status is DRAFT', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      ...postedTransaction,
      status: OwnerEquityTransactionStatus.DRAFT,
    });
    await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when status is already REVERSED', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      ...postedTransaction,
      status: OwnerEquityTransactionStatus.REVERSED,
    });
    await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('calls reverseSourceEntries with correct sourceType and id', async () => {
    const reversedTx = { ...postedTransaction, status: OwnerEquityTransactionStatus.REVERSED };
    // First call: load transaction inside reverse(). Second call: findOne(id) tail call.
    ownerEquityRepository.findOne
      .mockResolvedValueOnce({ ...postedTransaction })
      .mockResolvedValueOnce(reversedTx);
    accountingService.reverseSourceEntries.mockResolvedValue(undefined);
    ownerEquityRepository.save.mockResolvedValue(reversedTx);

    await service.reverse('oe-1', 'user-1');

    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
      'owner_equity_transaction',
      'oe-1',
      'user-1',
    );
  });

  it('sets status to REVERSED and saves', async () => {
    const tx = { ...postedTransaction };
    const reversedTx = { ...tx, status: OwnerEquityTransactionStatus.REVERSED };
    // First call: load transaction inside reverse(). Second call: findOne(id) tail call.
    ownerEquityRepository.findOne
      .mockResolvedValueOnce(tx)
      .mockResolvedValueOnce(reversedTx);
    accountingService.reverseSourceEntries.mockResolvedValue(undefined);
    ownerEquityRepository.save.mockResolvedValue(reversedTx);

    await service.reverse('oe-1', 'user-1');

    expect(ownerEquityRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OwnerEquityTransactionStatus.REVERSED }),
    );
  });

  it('calls auditLogService with REVERSE action', async () => {
    const reversedTx = { ...postedTransaction, status: OwnerEquityTransactionStatus.REVERSED };
    // First call: load transaction inside reverse(). Second call: findOne(id) tail call.
    ownerEquityRepository.findOne
      .mockResolvedValueOnce({ ...postedTransaction })
      .mockResolvedValueOnce(reversedTx);
    accountingService.reverseSourceEntries.mockResolvedValue(undefined);
    ownerEquityRepository.save.mockResolvedValue(reversedTx);

    await service.reverse('oe-1', 'user-1', 'admin');

    expect(auditLogService.log).toHaveBeenCalledWith(
      'REVERSE',
      'OwnerEquity',
      expect.stringContaining('OE-001'),
      expect.objectContaining({ userId: 'user-1', username: 'admin' }),
    );
  });

  it('propagates error from reverseSourceEntries without updating status', async () => {
    const tx = { ...postedTransaction };
    ownerEquityRepository.findOne.mockResolvedValue(tx);
    accountingService.reverseSourceEntries.mockRejectedValue(new BadRequestException('No open fiscal period'));

    await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow('No open fiscal period');
    expect(ownerEquityRepository.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Add `REVERSED` guard regression tests to `update`, `remove`, and `post` describes**

The guards in `update()`, `remove()`, and `post()` now use `!== DRAFT` to block both `POSTED` and `REVERSED`. Verify this for `REVERSED` by adding one test case to each existing describe block. Find the existing `describe('update')`, `describe('remove')`, and `describe('post')` blocks and add:

```ts
// Inside describe('update'):
it('throws BadRequestException when status is REVERSED', async () => {
  ownerEquityRepository.findOne.mockResolvedValue({
    id: 'oe-1', status: OwnerEquityTransactionStatus.REVERSED, deletedAt: null,
  } as any);
  await expect(service.update('oe-1', {}, 'user-1')).rejects.toThrow(BadRequestException);
});

// Inside describe('remove'):
it('throws BadRequestException when status is REVERSED', async () => {
  ownerEquityRepository.findOne.mockResolvedValue({
    id: 'oe-1', status: OwnerEquityTransactionStatus.REVERSED, deletedAt: null,
  } as any);
  await expect(service.remove('oe-1', 'user-1')).rejects.toThrow(BadRequestException);
});

// Inside describe('post'):
it('throws BadRequestException when status is REVERSED', async () => {
  ownerEquityRepository.findOne.mockResolvedValue({
    id: 'oe-1', status: OwnerEquityTransactionStatus.REVERSED, deletedAt: null,
  } as any);
  await expect(service.post('oe-1', 'user-1')).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 5: Run the new tests to verify they pass**

```bash
cd backend && npx jest src/modules/accounting/services/owner-equity.service.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Run the full backend test suite to check for regressions**

```bash
cd backend && npm run test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add \
  backend/src/database/entities/owner-equity-transaction.entity.ts \
  backend/src/database/migrations/ \
  backend/src/modules/accounting/services/owner-equity.service.ts \
  backend/src/modules/accounting/services/owner-equity.service.spec.ts
git commit -m "feat: add REVERSED status and reverse() to owner equity service (issue #64)"
```

---

### Task 6: Add reverse endpoint to controller

**Files:**
- Modify: `backend/src/modules/accounting/controllers/owner-equity.controller.ts`

- [ ] **Step 1: Add the endpoint**

Add the following alongside `@Post(':id/post')`:

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

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/accounting/controllers/owner-equity.controller.ts
git commit -m "feat: add POST :id/reverse endpoint to owner equity controller (issue #64)"
```

---

## Chunk 2: Frontend

### Task 7: Update types and API

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/api/accountingApi.ts`

- [ ] **Step 1: Update `OwnerEquityTransaction.status` type**

In `frontend/src/types/index.ts`, find the `OwnerEquityTransaction` interface (around line 461) and update:

```ts
// Before
status: 'draft' | 'posted';

// After
status: 'draft' | 'posted' | 'reversed';
```

- [ ] **Step 2: Add the `reverseOwnerEquityTransaction` mutation to `accountingApi.ts`**

Add after the `postOwnerEquityTransaction` mutation:

```ts
reverseOwnerEquityTransaction: builder.mutation<OwnerEquityTransaction, string>({
  query: (id) => ({ url: `/accounting/owner-equity/${id}/reverse`, method: 'POST' }),
  transformResponse: normalizeSingle<OwnerEquityTransaction>,
  invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
}),
```

- [ ] **Step 3: Export the new hook**

In the exports at the bottom of `accountingApi.ts`, add after `usePostOwnerEquityTransactionMutation`:

```ts
useReverseOwnerEquityTransactionMutation,
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/store/api/accountingApi.ts
git commit -m "feat: add reversed status type and reverseOwnerEquityTransaction mutation (issue #64)"
```

---

### Task 8: Update OwnerEquityPage — sort, chip, filter, reverse button + dialog

**Files:**
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`

- [ ] **Step 1: Add `Undo` icon and `useReverseOwnerEquityTransactionMutation` to imports**

Replace the MUI icons import block (lines 29–37) with:

```ts
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PostAdd as PostIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  AccountBalanceWallet as OwnerEquityIcon,
  Undo as UndoIcon,
} from '@mui/icons-material'
```

Replace the accountingApi import block (lines 41–49) with:

```ts
import {
  useBulkDeleteOwnerEquityTransactionsMutation,
  useBulkPostOwnerEquityTransactionsMutation,
  useCreateOwnerEquityTransactionMutation,
  useDeleteOwnerEquityTransactionMutation,
  useGetOwnerEquityTransactionsQuery,
  useGetPaymentMethodsQuery,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
  useUpdateOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
```

- [ ] **Step 2: Add `reverseConfirmId` state and wire up the mutation**

Inside the component, after the existing mutation declarations:

```ts
const [reverseOwnerEquityTransaction] = useReverseOwnerEquityTransactionMutation()
const [reverseConfirmId, setReverseConfirmId] = useState<string | null>(null)
```

- [ ] **Step 3: Add `onReverse` handler**

After `onBulkDelete`:

```ts
const onReverse = async () => {
  if (!reverseConfirmId) return
  try {
    await reverseOwnerEquityTransaction(reverseConfirmId).unwrap()
    showSuccess('Transaction reversed')
    setReverseConfirmId(null)
    refetch()
  } catch (error: any) {
    showError(String(error))
    // Dialog intentionally stays open on error so the user can retry or cancel
  }
}
```

- [ ] **Step 4: Update sort in `filters` memo**

```ts
// Before
const filters = useMemo(
  () => ({
    page: 1,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }),
  [typeFilter, statusFilter, startDate, endDate],
)
```

```ts
// After
const filters = useMemo(
  () => ({
    page: 1,
    sortBy: 'referenceNumber',
    sortOrder: 'DESC',
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }),
  [typeFilter, statusFilter, startDate, endDate],
)
```

- [ ] **Step 5: Add `reversed` to the status filter dropdown**

Find the Status `<Select>` and add after the `posted` MenuItem:

```tsx
<MenuItem value="reversed">Reversed</MenuItem>
```

- [ ] **Step 6: Update the status chip to handle `reversed`**

Find the status chip (around line 390):

```tsx
// Before
<Chip size="small" label={row.status} color={row.status === 'posted' ? 'success' : 'default'} />

// After
<Chip
  size="small"
  label={row.status}
  color={
    row.status === 'posted'
      ? 'success'
      : row.status === 'reversed'
        ? 'error'
        : 'default'
  }
/>
```

- [ ] **Step 7: Add the Reverse icon button to the actions column**

Inside the `<TableCell align="right">` actions cell, after the `{isDraft && (...)}` block, add:

```tsx
{row.status === 'posted' && (
  <IconButton size="small" color="warning" onClick={() => setReverseConfirmId(row.id)}>
    <UndoIcon fontSize="small" />
  </IconButton>
)}
```

- [ ] **Step 8: Add the reverse confirmation dialog**

After the existing create/edit `<Dialog>`, add:

```tsx
<Dialog open={!!reverseConfirmId} onClose={() => setReverseConfirmId(null)} maxWidth="xs" fullWidth>
  <DialogTitle>Reverse Transaction</DialogTitle>
  <DialogContent>
    <Typography>
      Are you sure you want to reverse this transaction? This will create a reversal journal entry.
    </Typography>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setReverseConfirmId(null)}>Cancel</Button>
    <Button variant="contained" color="error" onClick={onReverse}>
      Confirm
    </Button>
  </DialogActions>
</Dialog>
```

- [ ] **Step 9: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 10: Run frontend linter**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/accounting/OwnerEquityPage.tsx
git commit -m "feat: add reverse button, dialog, status chip, filter and sort to OwnerEquityPage (issue #64)"
```

---

## Final Verification

- [ ] **Run the frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass (no regressions from the type and API changes).

- [ ] **Start the full stack and smoke-test**

```bash
docker compose up -d
```

Manual checks:
1. Owner Equity list loads sorted by reference number descending.
2. Status filter includes "Reversed".
3. A posted transaction shows the Undo icon button.
4. Clicking Undo opens the confirmation dialog.
5. Confirming reversal updates the row's chip to red "reversed" and removes the Undo button.
6. A reversed transaction cannot be edited, re-posted, or deleted (backend returns 400).
7. The reversal journal entry appears in Journal Entries.
