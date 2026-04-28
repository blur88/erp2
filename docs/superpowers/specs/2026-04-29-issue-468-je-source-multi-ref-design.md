# Design: Journal Entry Source & Multi-Ref Fixes (Issue #468)

## Problem Summary

Three bugs in the Journal Entry cross-reference system:

1. **Missing invoice source**: JEs created from Invoices show no source reference number because `resolveSourceRefNumber` has no `'invoice'` case.
2. **Single JE only**: Sales Orders and Invoices display at most one JE reference, even when multiple exist (e.g. fulfillment JE on the SO + revenue JE on the Invoice).
3. **Filter reset missing**: Navigating from a transaction to the JE list applies `sourceId`/`sourceType` (or `ids`) URL params that have no Reset button.

---

## Backend Changes

### 1. Add `invoice` case to `resolveSourceRefNumber`

**File:** `backend/src/modules/accounting/services/journal-entry.service.ts`

Add a new case to the switch in `resolveSourceRefNumber`:

```ts
case 'invoice': {
  const record = await this.invoiceRepository.findOne({
    where: { id: sourceId },
    select: ['invoiceNumber'],
  });
  return record?.invoiceNumber;
}
```

Also inject `@InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>` in the constructor.

**File:** `backend/src/modules/accounting/accounting.module.ts`

Add `Invoice` to `TypeOrmModule.forFeature([...])`, import the entity, and add it to exports if needed.

### 2. Add `ids` filter to `QueryJournalEntriesDto`

**File:** `backend/src/modules/accounting/dto/journal-entry.dto.ts`

```ts
@ApiPropertyOptional({ description: 'Filter by comma-separated UUIDs' })
@IsOptional()
@IsString()
ids?: string;
```

**File:** `backend/src/modules/accounting/services/journal-entry.service.ts` — `findAll`

When `ids` is present, parse it and apply `WHERE entry.id IN (:...ids)`. Skip the `sourceType`/`sourceId` clauses when `ids` is set (they are mutually exclusive in practice).

```ts
if (ids) {
  const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
  if (idList.length > 0) {
    queryBuilder.andWhere('entry.id IN (:...idList)', { idList });
  }
}
```

---

## Frontend Changes

### 3. New hook: `useJournalEntryRefs`

**File:** `frontend/src/hooks/useJournalEntryRefs.ts` (new)

Returns:
```ts
{
  journalEntryRefs: JournalEntryRef[]
  journalEntryRefsLoading: boolean
  navigateToJournalEntries: () => void
}
```

Behavior:
- Fetches all entries for each valid source (no `limit: 1` constraint).
- Collects every returned entry across all sources into a flat `JournalEntryRef[]`.
- Navigation:
  - 0 entries → no-op.
  - 1 entry → `/accounting/journal-entries?sourceType=...&sourceId=...` (preserves existing reset path).
  - 2+ entries → `/accounting/journal-entries?ids=uuid1,uuid2,...`.

The existing `useJournalEntryRef` hook is **not modified**. All callers that only need a single ref (GRN, purchase orders, vendor payments, stock adjustments) continue using it unchanged.

### 4. Workspace hook updates (3 files)

Switch from `useJournalEntryRef` to `useJournalEntryRefs` in:

- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
  - Sources: `[{ sourceType: 'sales_order', sourceId: selectedOrder?.isFulfilled ? selectedOrder?.id : undefined }, ...invoiceIds]`
  - Expose `journalEntryRefs`, `journalEntryRefsLoading`, `navigateToJournalEntries`.
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
  - Sources: `[{ sourceType: 'invoice', sourceId: selectedInvoice?.id }, { sourceType: 'sales_order', sourceId: selectedInvoice?.salesOrder?.id }]`
  - Expose `journalEntryRefs`, `journalEntryRefsLoading`, `navigateToJournalEntries`.
- `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
  - Sources unchanged (single payment source) — but adopts the new hook for consistency so it benefits from the navigation fix.

### 5. Context header updates (3 files)

**`OrderContextHeader`**, **`InvoiceContextHeader`**, **`PaymentContextHeader`**:

- Props: replace `journalEntryRef: JournalEntryRef | null` with `journalEntryRefs: JournalEntryRef[]`.
- "Journal Entry No" cell: render a comma-separated list of clickable reference numbers.
  - Each number calls `navigateToJournalEntries()` (single navigation target regardless of which number is clicked, since they all go to the same filtered list).
  - Empty state: show "Pending" or "Not fulfilled" as appropriate.

**`EntityContextHeaderBar`**:

- Accept `journalEntryRefs?: JournalEntryRef[]` (in addition to or replacing the single `journalEntryRef` prop).
- When refs present: show the book icon with tooltip "Journal Entries: JE-0001, JE-0002" (or "Journal Entry: JE-0001" for a single ref).
- Callers that still use the single-ref path (GRN, purchase orders, etc.) pass their single ref wrapped in an array, or `EntityContextHeaderBar` accepts both forms.

> **Decision**: To avoid touching the 5 unrelated callers of `EntityContextHeaderBar`, keep the existing `journalEntryRef?: JournalEntryRef | null` prop and add an optional `journalEntryRefs?: JournalEntryRef[]`. The bar renders whichever is populated. The 3 updated headers pass `journalEntryRefs`; the 5 unchanged headers keep passing `journalEntryRef`.

### 6. `JournalEntriesPage` filter reset

**File:** `frontend/src/pages/accounting/JournalEntriesPage.tsx`

Compute URL filter presence:
```ts
const idsParam = urlParams.get('ids')
const hasUrlFilters = Boolean(sourceIdParam || idsParam)
```

Pass to `GenericListPage`:
```tsx
hasActiveFilters={hasActiveFilters || hasUrlFilters}
```

Extend `onClearAll` to strip URL params when active:
```ts
const handleClearAll = useCallback(() => {
  handlers.onClearAll()
  if (hasUrlFilters) {
    navigate('/accounting/journal-entries', { replace: true })
  }
}, [handlers, hasUrlFilters, navigate])
```

Pass `handleClearAll` as the `handlers.onClearAll` override.

Add `ids` to `queryArgs`:
```ts
ids: idsParam ?? undefined,
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/.../accounting.module.ts` | Add `Invoice` entity |
| `backend/.../dto/journal-entry.dto.ts` | Add `ids` field to `QueryJournalEntriesDto` |
| `backend/.../services/journal-entry.service.ts` | Add `invoice` case + `ids` filter in `findAll` |
| `frontend/src/hooks/useJournalEntryRefs.ts` | **New** multi-ref hook |
| `frontend/src/hooks/useJournalEntryRef.ts` | Untouched |
| `frontend/src/components/common/EntityContextHeaderBar.tsx` | Add `journalEntryRefs` prop |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` | Switch to `useJournalEntryRefs` |
| `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` | Switch to `useJournalEntryRefs` |
| `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts` | Switch to `useJournalEntryRefs` |
| `frontend/src/pages/sales/components/OrderContextHeader.tsx` | Render multi-ref list |
| `frontend/src/pages/sales/components/InvoiceContextHeader.tsx` | Render multi-ref list |
| `frontend/src/pages/sales/components/PaymentContextHeader.tsx` | Render multi-ref list |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Add `ids` param + reset fix |

---

## What Is Not Changing

- `useJournalEntryRef` (single-ref hook) — untouched.
- GRN, purchase order, vendor payment, stock adjustment context headers — untouched.
- No DB migration required (no entity changes, only a new query filter).
- No new API endpoint — `ids` is a filter on the existing `GET /accounting/journal-entries`.
