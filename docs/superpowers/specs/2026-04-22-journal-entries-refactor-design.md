# Journal Entries Module Refactor — Design Spec

**Issue:** #416  
**Date:** 2026-04-22  
**Branch:** feat/journal-entries-refactor-416

## Goal

Align the Journal Entries module's sub-components and workspace hook with the patterns established across Sales and Purchasing modules (using `OrderContextHeader` / `EntityTable` as the reference). Remove bulk selection entirely.

---

## Changes

### 1. `JournalEntriesTable`

Replace the current custom raw-MUI table with `EntityTable`.

- Remove: checkboxes, `selectedIds`, per-row Post/Delete action buttons, `onToggleCheck`, `onSelectAll`, `onPost`, `onDelete` props
- Columns (all `raw: true` where non-plain-text):
  - Reference — `primary.main` styled text
  - Date
  - Description (truncated)
  - Type — `Chip`
  - Source — clickable link (or `—` if none)
  - Debits — right-aligned
  - Credits — right-aligned
  - Status — `Chip`
- Props reduce to: `entries`, `loading`, `selectedEntryId`, `onSelect`, `listRef`

### 2. `JournalEntryContextHeader`

Rewrite to match the `OrderContextHeader` / `ChartOfAccountContextHeader` pattern exactly.

**Header bar:**
- Left: uppercase `"JE Details - {referenceNumber}"` (`variant="tableHeader"`, `0.8rem`, `letterSpacing: 0.5px`)
- Right: action buttons — Edit (Draft only), Post (Draft + balanced only), Delete (Draft only), Reverse (Posted only)

**Body:** two-column `Grid` with `detailTableSx` / `labelCellSx` / `valueCellSx`, zebra-stripe rows

- Left column — **Entry Information** section:
  - Date
  - Description
  - Type (`Chip`)
  - Source (clickable link, or `—`)

- Right column — **Financials** section:
  - Status (`Chip`)
  - Debits
  - Credits
  - Balance indicator: "Unbalanced" `Chip` (warning) when `|debits - credits| >= 0.01`

**Empty state:** centered `"Select a journal entry to view details"` (matches other modules).

**Prop changes:**
- Remove `onNavigateToSource(path: string)` — replaced by `onViewSource(sourceType, sourceId)` resolved in the hook
- Header receives the already-resolved path or the hook passes a navigation callback

### 3. `JournalEntryWorkspaceCard`

Minor alignment only — already close to the pattern.

- Ensure `headerSx` matches the other workspace cards (`px`, `py`, `borderBottom`)
- No logic changes

### 4. `useJournalEntriesWorkspace`

**Remove:**
- `selectedIds`, `setSelectedIds`
- `handleToggleCheck`, `handleSelectAll`
- `bulkPostOpen`, `setBulkPostOpen`
- `bulkDeleteOpen`, `setBulkDeleteOpen`
- `handleBulkPost`, `handleBulkDelete`
- `useBulkDeleteJournalEntriesMutation`, `useBulkPostJournalEntriesMutation` imports

**Dedup `SOURCE_ROUTES`:**  
Currently copy-pasted in both the hook and `JournalEntryContextHeader`. Define once in the hook; expose `navigateToSource(sourceType, sourceId)` (already exists in return value). Remove `SOURCE_ROUTES` from the header component — it calls `onViewSource(sourceType, sourceId)` and the hook handles navigation.

**Result:** hook returns only — `selectedEntry`, `postTarget`, `setPostTarget`, `deleteTarget`, `setDeleteTarget`, `reverseTarget`, `setReverseTarget`, `actionLoading`, `searchInputRef`, `listRef`, `handleSelect`, `handleConfirmPost`, `handleConfirmReverse`, `handleConfirmDelete`, `navigateToEdit`, `navigateToCreate`, `navigateToSource`

### 5. `JournalEntriesDialogs`

Remove bulk dialogs and their props:
- Remove: `bulkPostIds`, `bulkDeleteIds`, `onConfirmBulkPost`, `onConfirmBulkDelete`, `onCancelBulkPost`, `onCancelBulkDelete`

Keep: post, delete, reverse confirmation dialogs (unchanged logic).

### 6. `JournalEntriesPage`

- Remove `contentSlot` (bulk action buttons)
- Remove prop threading for `onToggleCheck`, `onSelectAll`, `selectedIds`
- Remove bulk dialog props from `JournalEntriesDialogs`
- No filter, sort, or query changes

---

## Acceptance Criteria

- [ ] `JournalEntriesTable` uses `EntityTable`, no checkboxes or action columns
- [ ] `JournalEntryContextHeader` uses two-column Grid layout with `detailTableSx`/`labelCellSx`/`valueCellSx`
- [ ] `SOURCE_ROUTES` defined only once (in the hook)
- [ ] All bulk state and handlers removed from hook, table, page, and dialogs
- [ ] No regression in post, delete, reverse, edit, navigate-to-source functionality
- [ ] Existing `JournalEntriesPage.test.tsx` passes

---

## Files Changed

| File | Change |
|------|--------|
| `components/JournalEntriesTable.tsx` | Rewrite using `EntityTable` |
| `components/JournalEntryContextHeader.tsx` | Rewrite to match SO/COA pattern |
| `components/JournalEntryWorkspaceCard.tsx` | Minor style alignment |
| `components/JournalEntriesDialogs.tsx` | Remove bulk dialogs |
| `hooks/useJournalEntriesWorkspace.ts` | Remove bulk state, dedup SOURCE_ROUTES |
| `JournalEntriesPage.tsx` | Remove bulk contentSlot, trim prop threading |

## Out of Scope

- `useEntityWorkspace` shared hook — not created (no meaningful shared abstraction)
- Filter, sort, or query changes
- Any other accounting module components
