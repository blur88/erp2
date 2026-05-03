# Fund Transfers UI/UX Refactor — Design Spec

**Issue:** #511  
**Date:** 2026-05-03  
**Status:** Approved

---

## Overview

Refactor the Fund Transfers page to align with the "Gold Standard" patterns established in the Expenses, Sales Orders, and Purchase Orders modules. The Expenses module (PR #510) is the direct reference implementation.

**Scope:** 1 migration, 1 backend service change, ~6 frontend files modified/replaced, 1 test file updated.

---

## 1. Backend Changes

### 1a. Extend `findOne` response DTO — `fund-transfer.service.ts`

Load `journalEntry.lines` (with nested `account` relation) in `findOne` only. The list endpoint stays lean.

Add to the `journalEntry` shape in `toResponseDto`:

```ts
lines?: Array<{
  accountCode: string
  accountName: string
  debitAmount: number
  creditAmount: number
  description?: string
}>
```

Update `findOne` relations:
```ts
relations: ['sourceAccount', 'destinationAccount', 'journalEntry', 'journalEntry.lines', 'journalEntry.lines.account']
```

Map lines in `toResponseDto` when `transfer.journalEntry?.lines` is present.

### 1b. New migration — `AddFundTransfersDocumentNumberSetting`

Insert `{ documentName: 'Fund Transfers', prefix: 'TRF', paddingDigits: 3, nextNumber: 1 }` into `document_number_settings`.

Use `INSERT ... WHERE NOT EXISTS` to make it safe on instances that already have the row (e.g., auto-created on first transfer).

---

## 2. Frontend Type Update — `FundTransfer` in `types/index.ts`

Add `lines` to the `journalEntry` nested type:

```ts
journalEntry?: {
  id: string
  referenceNumber: string
  status: string
  lines?: Array<{
    accountCode: string
    accountName: string
    debitAmount: number
    creditAmount: number
    description?: string
  }>
}
```

---

## 3. `useFundTransfersWorkspace` Hook Refactor

Replace hand-rolled keyboard/selection state with `useEntityWorkspace`, matching `useExpensesWorkspace` exactly.

**Key decisions:**
- `onEnter`: omitted — transfers are immutable after creation, no edit form
- `onEscape`: clears `selected` and `cancelTarget`
- `routes`: both `create` and `edit` point to `/accounting/fund-transfers` (no dedicated edit route)
- `useEntityWorkspace.handleSelect` only sets focus state — it does NOT lazy-fetch. Keep `useLazyGetFundTransferQuery` and wrap `workspace.handleSelect` in a custom `handleSelect` that calls `selectEntity(item)`, then fetches fresh data and calls `selectEntity(fresh)` — same pattern as the existing hook.

**Return shape:**
```ts
{
  selected, setSelected,
  focusedIndex, listRef, searchInputRef,
  cancelTarget, setCancelTarget,
  cancelling, handleConfirmCancel,
  handleSelect,
}
```

---

## 4. `FundTransfersTable` → `FundTransfersList`

Delete `FundTransfersTable.tsx`. Create `FundTransfersList.tsx` wrapping `EntityTable`.

**Columns (2 only):**

| Key | Render | Width |
|-----|--------|-------|
| `reference` | `row.referenceNumber` | `60%` |
| `status` | `<Chip>` (`ACTIVE` → `success`, `CANCELLED` → `error`) | `40%` |

Status chip uses `raw: true`. Props match `ExpensesTable` pattern: `transfers`, `loading`, `selectedId`, `focusedIndex`, `onSelect`, `listRef`.

---

## 5. `FundTransferContextHeader` Refactor

Align with `ExpenseContextHeader`: two-column Grid, section headers, same density/style.

**Left column — "Transfer Info":**
- Date
- Source Account (code - name)

**Right column — "Amount & Accounts":**
- Total Amount (bold)
- Destination Account (code - name)
- Journal Entry link (via `useJournalEntryRef` with `sourceType: 'fund-transfer'`, `sourceId: selected.id`; shown only when `journalEntryId` is set)

**Empty state:** centered "Select a fund transfer to view details" Paper.

**Actions:** Cancel button (red danger variant, `CancelIcon`) shown only when `canManageTransfers && selected.status === 'ACTIVE'`.

---

## 6. `FundTransferWorkspaceCard` — Ledger Preview

Replace the generic details table with an accounting-focused ledger view.

**Structure:**
1. **Section header:** "Ledger Preview" (uppercase, `0.8rem`, `letterSpacing: 0.5px`)
2. **Dr/Cr table** (4 columns): Account (code - name) | Type | Debit | Credit
   - Populated from `selected.journalEntry?.lines`
   - If `journalEntry` is null: show "No journal entry linked"
3. **Divider**
4. **Notes section:** label "Notes", value `selected.description ?? '—'`

---

## 7. `DocumentNumbersPage`

Add `'Fund Transfers'` to the `Accounting` group in `MODULE_GROUPS`:

```ts
Accounting: ['Journal Entries', 'Expenses', 'Settlements', 'Owner Equity', 'Fund Transfers'],
```

---

## 8. `FundTransfersPage` Updates

- Import `FundTransfersList` instead of `FundTransfersTable`
- Pass `focusedIndex` from workspace to `FundTransfersList`
- Remove `useLazyGetFundTransferQuery` import (handled by `useEntityWorkspace` internally)
- Client-side search filter kept as-is (out of scope)

---

## 9. Tests — `FundTransfersPage.test.tsx`

Update to reflect new narrow list:
- Remove assertions on Date, From, To, Amount, Status columns in the list
- Assert only `referenceNumber` is shown in list rows
- Update any snapshot/render assertions that reference the old 6-column table

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/accounting/services/fund-transfer.service.ts` | Load JE lines in `findOne`, extend `toResponseDto` |
| `backend/src/database/migrations/<timestamp>-AddFundTransfersDocumentNumberSetting.ts` | New migration — timestamp generated at implementation time |
| `frontend/src/types/index.ts` | Add `lines` to `FundTransfer.journalEntry` |
| `frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts` | Wrap `useEntityWorkspace` |
| `frontend/src/pages/accounting/components/FundTransfersTable.tsx` | **Delete** |
| `frontend/src/pages/accounting/components/FundTransfersList.tsx` | **New** — wraps `EntityTable` |
| `frontend/src/pages/accounting/components/FundTransferContextHeader.tsx` | Two-column Grid refactor |
| `frontend/src/pages/accounting/components/FundTransferWorkspaceCard.tsx` | Ledger Preview |
| `frontend/src/pages/accounting/FundTransfersPage.tsx` | Wire new components + `focusedIndex` |
| `frontend/src/pages/settings/DocumentNumbersPage.tsx` | Add `'Fund Transfers'` to `MODULE_GROUPS` |
| `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` | Update for narrow list |

---

## Success Criteria

- [ ] Fund Transfers list shows only `referenceNumber` + status chip
- [ ] Keyboard navigation (Up/Down/Enter//) fully functional
- [ ] Context header shows 2×2 grid with JE link
- [ ] Workspace card shows Dr/Cr ledger lines from actual JE
- [ ] Notes/description shown below ledger preview
- [ ] Fund Transfers appears in Document Numbers settings under Accounting
- [ ] All existing tests pass; new assertions cover narrow list
