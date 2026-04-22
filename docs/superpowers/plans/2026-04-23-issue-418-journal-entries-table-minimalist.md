# Issue #418 — JournalEntriesTable Ultra-Minimalist Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `JournalEntriesTable` to a single `referenceNumber` column, removing all redundant columns and the `onViewSource` prop, mirroring the pattern used in `OrdersTable`.

**Architecture:** Strip `JournalEntriesTable` down to one column and clean up its prop interface. Update `JournalEntriesPage` to remove the now-deleted prop. No other files change — all removed data is already displayed in `JournalEntryContextHeader`.

**Tech Stack:** React 19, TypeScript, Material-UI v7, Vitest

---

### Task 1: Simplify JournalEntriesTable

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`

- [ ] **Step 1: Update the file to single-column, remove onViewSource**

Replace the entire file with:

```tsx
import { useRef, type RefObject } from 'react'
import { Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry } from '@/types'

const COLUMNS: ColumnConfig<JournalEntry>[] = [
  {
    key: 'referenceNumber',
    raw: true,
    render: (entry) => (
      <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', fontSize: '0.8rem' }}>
        {entry.referenceNumber}
      </Typography>
    ),
  },
]

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  onSelect: (entry: JournalEntry) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  onSelect,
  listRef,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)

  return (
    <EntityTable
      rows={entries}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="entry"
    />
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -A2 "JournalEntries"
```

Expected: errors referencing `onViewSource` on the call site in `JournalEntriesPage.tsx` (we fix that next), no errors inside `JournalEntriesTable.tsx` itself.

- [ ] **Step 3: Run existing tests to verify they still pass**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: 3 tests pass. The test mock renders only `referenceNumber`, so no changes needed.

---

### Task 2: Remove onViewSource from JournalEntriesPage

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Remove the onViewSource prop from the JournalEntriesTable call**

In `JournalEntriesPage.tsx`, find the `<JournalEntriesTable>` JSX block (lines ~110–119) and remove the `onViewSource` line:

```tsx
        listSlot={(
          <JournalEntriesTable
            entries={entries}
            loading={isLoading}
            total={pagination?.total ?? entries.length}
            selectedEntryId={workspace.selectedEntry?.id ?? null}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
```

- [ ] **Step 2: Run TypeScript check — expect clean**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Run the page-level tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesTable.tsx \
        frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "refactor(accounting): reduce JournalEntriesTable to single referenceNumber column (issue #418)"
```

---

### Task 3: Verify and close

- [ ] **Step 1: Run the full accounting-related test suite**

```bash
cd frontend && npx vitest run src/pages/accounting/
```

Expected: all tests pass.

- [ ] **Step 2: Confirm no remaining references to removed props**

```bash
grep -rn "onViewSource" frontend/src/pages/accounting/
```

Expected: only output is inside `JournalEntryContextHeader.tsx` (which keeps its own `onViewSource` prop — that's correct and untouched).

- [ ] **Step 3: Open a PR closing the issue**

```bash
gh pr create \
  --title "refactor(accounting): JournalEntriesTable ultra-minimalist single column (issue #418)" \
  --body "$(cat <<'EOF'
## Summary

- Reduces `JournalEntriesTable` to a single `referenceNumber` column, matching the `OrdersTable` / `ProductsTable` pattern
- Removes `onViewSource` prop from `JournalEntriesTable` (source link is already in `JournalEntryContextHeader`)
- Removes all unused imports (Chip, Link, formatCurrency, formatDate, ENTRY_TYPE_LABELS, statusColor)

All removed data (date, description, type, source, debits, credits, status) is confirmed available in `JournalEntryContextHeader` and `JournalEntryWorkspaceCard`.

Closes #418

## Test plan
- [ ] `JournalEntriesTable` unit tests pass (3 tests)
- [ ] `JournalEntriesPage` tests pass
- [ ] TypeScript check clean
- [ ] Visually verified: list shows only JE Number, detail panel shows full entry info
EOF
)"
```
