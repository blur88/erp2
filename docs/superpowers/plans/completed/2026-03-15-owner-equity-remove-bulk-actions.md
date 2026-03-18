# Owner's Equity Remove Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the checkbox column and bulk post/delete actions from the Owner's Equity page, fully stack (frontend UI, API layer, backend endpoints, service methods, DTO, and tests).

**Architecture:** Delete all bulk-related code top-to-bottom — backend DTO → service → controller, then frontend API → page component → tests. No new code is introduced; this is pure removal.

**Tech Stack:** NestJS 11 (backend), React 19 + MUI v7 + RTK Query (frontend), Jest (backend tests), Vitest (frontend tests)

---

## Chunk 1: Backend removal

### Task 1: Remove `BulkOwnerEquityDto` from the DTO file

**Files:**
- Modify: `backend/src/modules/accounting/dto/owner-equity.dto.ts:1-10` (imports) and `:92-96` (class)

- [ ] **Step 1: Remove `BulkOwnerEquityDto` class and its unused imports**

In `backend/src/modules/accounting/dto/owner-equity.dto.ts`, delete lines 92–96 (the entire `BulkOwnerEquityDto` class):

```typescript
// DELETE these lines:
export class BulkOwnerEquityDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}
```

Also remove `IsArray` and `IsUUID` from the imports at the top if they are no longer used by any other class in the file. Check: `IsUUID` is used by `CreateOwnerEquityDto` (line 25) and `UpdateOwnerEquityDto` (line 48), and `IsArray` is not used elsewhere — so remove only `IsArray` from the import list.

After editing, the import line should be:
```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsUUID,
  Min,
} from 'class-validator';
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep owner-equity.dto
```

Expected: no output (no errors).

---

### Task 2: Remove bulk methods from the service

**Files:**
- Modify: `backend/src/modules/accounting/services/owner-equity.service.ts`

- [ ] **Step 1: Remove `BulkOwnerEquityDto` import from the service**

In `backend/src/modules/accounting/services/owner-equity.service.ts`, find the import of `BulkOwnerEquityDto` and remove it. The import line will look like:

```typescript
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
  BulkOwnerEquityDto,  // DELETE this line
  ...
} from '../dto/owner-equity.dto';
```

- [ ] **Step 2: Delete the `bulkPost` method**

Find and delete the entire `async bulkPost(...)` method (starts around line 303). It looks like:

```typescript
async bulkPost(
  dto: BulkOwnerEquityDto,
  userId?: string,
  username?: string,
) {
  // ... body ...
}
```

Delete from the method signature through its closing `}`.

- [ ] **Step 3: Delete the `bulkDelete` method**

Find and delete the entire `async bulkDelete(...)` method (starts around line 324). Same pattern as above.

- [ ] **Step 4: Verify no remaining references**

```bash
cd backend && grep -n "bulkPost\|bulkDelete\|BulkOwnerEquity" src/modules/accounting/services/owner-equity.service.ts
```

Expected: no output.

- [ ] **Step 5: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep owner-equity
```

Expected: no output.

---

### Task 3: Remove bulk endpoints from the controller

**Files:**
- Modify: `backend/src/modules/accounting/controllers/owner-equity.controller.ts`

- [ ] **Step 1: Remove `BulkOwnerEquityDto` from the import**

In the import block at the top of the controller:

```typescript
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
  BulkOwnerEquityDto,  // DELETE this line
} from '../dto/owner-equity.dto';
```

- [ ] **Step 2: Delete the `bulkPost` route handler**

Delete the entire method (lines 89–97):

```typescript
@Post('bulk-post')
@Auth(UserRole.ADMIN, UserRole.MANAGER)
bulkPost(
  @Body() dto: BulkOwnerEquityDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
) {
  return this.ownerEquityService.bulkPost(dto, currentUserId, currentUsername);
}
```

- [ ] **Step 3: Delete the `bulkDelete` route handler**

Delete the entire method (lines 99–107):

```typescript
@Post('bulk-delete')
@Auth(UserRole.ADMIN)
bulkDelete(
  @Body() dto: BulkOwnerEquityDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
) {
  return this.ownerEquityService.bulkDelete(dto, currentUserId, currentUsername);
}
```

- [ ] **Step 4: Verify no remaining references**

```bash
cd backend && grep -n "bulkPost\|bulkDelete\|BulkOwnerEquity" src/modules/accounting/controllers/owner-equity.controller.ts
```

Expected: no output.

- [ ] **Step 5: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep owner-equity
```

Expected: no output.

---

### Task 4: Remove bulk tests from the service spec

**Files:**
- Modify: `backend/src/modules/accounting/services/owner-equity.service.spec.ts`

- [ ] **Step 1: Delete the two bulk test cases**

Find and delete the following two `it(...)` blocks (lines 453–469):

```typescript
it('bulkPost posts multiple transactions and returns count', async () => {
  const postSpy = jest.spyOn(service, 'post').mockResolvedValue({} as any);

  const result = await service.bulkPost({ ids: ['tx-1', 'tx-2'] });

  expect(postSpy).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ posted: 2, failed: 0 });
});

it('bulkDelete deletes multiple transactions and returns count', async () => {
  const removeSpy = jest.spyOn(service, 'remove').mockResolvedValue();

  const result = await service.bulkDelete({ ids: ['tx-1', 'tx-2'] });

  expect(removeSpy).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ deleted: 2, failed: 0 });
});
```

- [ ] **Step 2: Run the backend tests to verify they pass**

```bash
cd backend && npx jest src/modules/accounting/services/owner-equity.service.spec.ts --no-coverage
```

Expected: all remaining tests PASS, 0 failed.

- [ ] **Step 3: Commit backend changes**

```bash
cd backend && git add \
  src/modules/accounting/dto/owner-equity.dto.ts \
  src/modules/accounting/services/owner-equity.service.ts \
  src/modules/accounting/services/owner-equity.service.spec.ts \
  src/modules/accounting/controllers/owner-equity.controller.ts
git commit -m "feat(accounting): remove bulk post/delete from owner equity backend"
```

---

## Chunk 2: Frontend removal

### Task 5: Remove bulk mutations from `accountingApi.ts`

**Files:**
- Modify: `frontend/src/store/api/accountingApi.ts`

- [ ] **Step 1: Delete the `bulkPostOwnerEquityTransactions` mutation definition**

Find and delete lines 655–658:

```typescript
bulkPostOwnerEquityTransactions: builder.mutation<{ posted: number; failed: number }, string[]>({
  query: (ids) => ({ url: '/accounting/owner-equity/bulk-post', method: 'POST', data: { ids } }),
  invalidatesTags: ['OwnerEquity', 'AccountingReport'],
}),
```

- [ ] **Step 2: Delete the `bulkDeleteOwnerEquityTransactions` mutation definition**

Find and delete lines 659–662:

```typescript
bulkDeleteOwnerEquityTransactions: builder.mutation<{ deleted: number; failed: number }, string[]>({
  query: (ids) => ({ url: '/accounting/owner-equity/bulk-delete', method: 'POST', data: { ids } }),
  invalidatesTags: ['OwnerEquity', 'AccountingReport'],
}),
```

- [ ] **Step 3: Remove both hooks from the named exports**

Find lines 803–804 in the exports destructure and delete them:

```typescript
useBulkPostOwnerEquityTransactionsMutation,   // DELETE
useBulkDeleteOwnerEquityTransactionsMutation,  // DELETE
```

- [ ] **Step 4: Verify no remaining references in the API file**

```bash
cd frontend && grep -n "bulkPost\|bulkDelete" src/store/api/accountingApi.ts | grep -i owner
```

Expected: no output.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep accountingApi
```

Expected: no errors related to `accountingApi.ts`.

---

### Task 6: Remove bulk UI and selection state from `OwnerEquityPage.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`

- [ ] **Step 1: Remove bulk mutation imports and hook calls**

Remove these two lines from the import block (lines 42–43):

```typescript
useBulkDeleteOwnerEquityTransactionsMutation,
useBulkPostOwnerEquityTransactionsMutation,
```

Remove these two hook call lines (around lines 109–110):

```typescript
const [bulkPostOwnerEquityTransactions] = useBulkPostOwnerEquityTransactionsMutation()
const [bulkDeleteOwnerEquityTransactions] = useBulkDeleteOwnerEquityTransactionsMutation()
```

- [ ] **Step 2: Remove `Checkbox` from MUI imports**

In the MUI import block (line 27), remove `Checkbox,`.

- [ ] **Step 3: Remove selection state and derived variables**

Delete line 74:
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

Delete lines 125–126:
```typescript
const draftRows = filteredRows.filter((r) => r.status === 'draft')
const allSelected = draftRows.length > 0 && selectedIds.size === draftRows.length
```

- [ ] **Step 4: Remove `onBulkPost` and `onBulkDelete` handlers**

Delete the entire `onBulkPost` function (lines 223–234):

```typescript
const onBulkPost = async () => {
  const ids = Array.from(selectedIds)
  if (!ids.length || !window.confirm(`Post ${ids.length} selected transactions?`)) return
  try {
    await bulkPostOwnerEquityTransactions(ids).unwrap()
    showSuccess('Bulk post completed')
    setSelectedIds(new Set())
    refetch()
  } catch (error: any) {
    showError(String(error))
  }
}
```

Delete the entire `onBulkDelete` function (lines 236–247):

```typescript
const onBulkDelete = async () => {
  const ids = Array.from(selectedIds)
  if (!ids.length || !window.confirm(`Delete ${ids.length} selected transactions?`)) return
  try {
    await bulkDeleteOwnerEquityTransactions(ids).unwrap()
    showSuccess('Bulk delete completed')
    setSelectedIds(new Set())
    refetch()
  } catch (error: any) {
    showError(String(error))
  }
}
```

- [ ] **Step 5: Remove `setSelectedIds` calls from `onDelete` and `onPost`**

In `onDelete` (around lines 196–200), remove:
```typescript
setSelectedIds((prev) => {
  const next = new Set(prev)
  next.delete(id)
  return next
})
```

In `onPost` (around lines 212–216), remove the same pattern:
```typescript
setSelectedIds((prev) => {
  const next = new Set(prev)
  next.delete(id)
  return next
})
```

- [ ] **Step 6: Remove `setSelectedIds` from the keyboard shortcut escape handler**

In `useKeyboardShortcuts` (lines 261–269), remove:
```typescript
setSelectedIds(new Set())
```

The `onEscape` callback should now only contain:
```typescript
onEscape: () => {
  setDialogOpen(false)
},
```

- [ ] **Step 7: Remove the bulk action buttons from the header**

Delete the conditional bulk buttons block (lines 287–296):

```tsx
{selectedIds.size > 0 && (
  <>
    <Button variant="contained" startIcon={<PostIcon />} onClick={onBulkPost}>
      Bulk Post ({selectedIds.size})
    </Button>
    <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={onBulkDelete}>
      Bulk Delete ({selectedIds.size})
    </Button>
  </>
)}
```

- [ ] **Step 8: Remove the header checkbox `<TableCell>` from `TableHead`**

Delete lines 354–366 from `TableHead`:

```tsx
<TableCell padding="checkbox">
  <Checkbox
    checked={allSelected}
    indeterminate={!allSelected && selectedIds.size > 0}
    onChange={() => {
      if (allSelected) {
        setSelectedIds(new Set())
        return
      }
      setSelectedIds(new Set(draftRows.map((r) => r.id)))
    }}
  />
</TableCell>
```

- [ ] **Step 9: Remove the per-row checkbox `<TableCell>` from `TableBody`**

Delete lines 382–395 from each `TableRow` in `TableBody`:

```tsx
<TableCell padding="checkbox">
  <Checkbox
    disabled={!isDraft}
    checked={selectedIds.has(row.id)}
    onChange={() => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(row.id)) next.delete(row.id)
        else next.add(row.id)
        return next
      })
    }}
  />
</TableCell>
```

- [ ] **Step 10: Fix the empty-state row `colSpan`**

Change the empty state row (around line 446) from `colSpan={9}` to `colSpan={8}`:

```tsx
// BEFORE:
<TableCell colSpan={9}>
// AFTER:
<TableCell colSpan={8}>
```

- [ ] **Step 11: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep OwnerEquity
```

Expected: no errors.

---

### Task 7: Update `OwnerEquityPage.test.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx`

- [ ] **Step 1: Remove bulk mutations from `mockedApi`**

In the `mockedApi` object (lines 22–32), delete:

```typescript
useBulkPostOwnerEquityTransactionsMutation: vi.fn(),
useBulkDeleteOwnerEquityTransactionsMutation: vi.fn(),
```

- [ ] **Step 2: Remove them from the `vi.mock` block**

In `vi.mock('@/store/api/accountingApi', ...)` (lines 34–44), delete:

```typescript
useBulkPostOwnerEquityTransactionsMutation: mockedApi.useBulkPostOwnerEquityTransactionsMutation,
useBulkDeleteOwnerEquityTransactionsMutation: mockedApi.useBulkDeleteOwnerEquityTransactionsMutation,
```

- [ ] **Step 3: Remove their `mockReturnValue` calls from `beforeEach`**

In `beforeEach` (lines 87–88), delete:

```typescript
mockedApi.useBulkPostOwnerEquityTransactionsMutation.mockReturnValue([vi.fn()])
mockedApi.useBulkDeleteOwnerEquityTransactionsMutation.mockReturnValue([vi.fn()])
```

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit frontend changes**

```bash
cd frontend && git add \
  src/store/api/accountingApi.ts \
  src/pages/accounting/OwnerEquityPage.tsx \
  src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
git commit -m "feat(accounting): remove bulk actions from owner equity page (closes #107)"
```

---

## Final verification

- [ ] **Run all backend tests**

```bash
cd backend && npm run test
```

Expected: all tests pass, 0 failed.

- [ ] **Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass, 0 failed.
