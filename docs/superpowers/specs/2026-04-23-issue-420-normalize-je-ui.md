# Issue #420: Normalize Journal Entries UI with Sales Module

## Overview

Align the Journal Entries list and detail header with the visual patterns established in the Sales module, removing custom styling that creates inconsistency.

## Changes

### 1. `JournalEntriesTable.tsx`

Remove `raw: true` and the custom `Typography` render for the `referenceNumber` column. Use the same plain render pattern as `OrdersTable.tsx`:

```tsx
const COLUMNS: ColumnConfig<JournalEntry>[] = [
  { key: 'referenceNumber', render: (entry) => entry.referenceNumber },
]
```

- Drop the `Typography` import (no longer used).
- Result: `EntityTable` handles default formatting (fontWeight 400, standard text color).

### 2. `JournalEntryContextHeader.tsx`

Replace all three `Chip` components with plain text inside existing `valueCellSx` cells:

| Field | Before | After |
|-------|--------|-------|
| Type | `<Chip label={ENTRY_TYPE_LABELS[...]} />` | Plain text: `ENTRY_TYPE_LABELS[sourceType] ?? 'Manual Entry'` |
| Status | `<Chip label={status} color={statusColor(...)} />` | Plain text: `selectedEntry.status` |
| Balance (unbalanced) | `<Chip label="Unbalanced" color="warning" />` | Plain text: `Unbalanced` |

- Remove `statusColor` helper function (no longer used).
- Remove `Chip` from the MUI import (no longer used).

## Test Updates

The existing frontend test for `JournalEntriesTable` checks column rendering and expects the styled `Typography` output. It must be updated to expect plain text string output instead.

## Acceptance Criteria

- Journal Entries list reference number uses fontWeight 400 and default text color (same as Sales Orders list).
- JE detail header Type, Status, and Balance fields display as plain text, no Chip chrome.
- UI feels consistent when navigating between Sales and Accounting modules.
- No TypeScript errors. Existing tests pass after update.

## Out of Scope

- No backend changes.
- No changes to other accounting components.
- Status text capitalization left as-is (raw enum values: `DRAFT`, `POSTED`, `REVERSED`).
