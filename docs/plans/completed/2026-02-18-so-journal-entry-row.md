# SO Journal Entry Row Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Journal Entry No" row in the SO Information table that shows the linked journal entry reference number as a clickable link when the sales order is fulfilled.

**Architecture:** Add a local state `journalEntryRef` in `OrdersPage.tsx` that fetches the linked journal entry via `journalEntriesApi.getAll({ sourceType: 'sales_order', sourceId })` when a fulfilled SO is selected. Render the reference number as a clickable Typography button styled identically to the existing Invoice No and Payment No rows, navigating to `/accounting/journal-entries?sourceType=sales_order&sourceId=<id>`.

**Tech Stack:** React 18, TypeScript, Material-UI v7, React Router v6, existing `journalEntriesApi` from `@/services/accountingApi`

---

### Task 1: Add local state and fetch effect for journal entry ref

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`

**Step 1: Find the existing local state declarations near the top of the component**

Search for `const [viewDialog` or `const [selectedOrder` in `OrdersPage.tsx` to find where component state is declared.

**Step 2: Add `journalEntryRef` state**

After the existing state declarations (near other `useState` calls), add:

```typescript
const [journalEntryRef, setJournalEntryRef] = React.useState<{ id: string; referenceNumber: string } | null>(null);
const [journalEntryRefLoading, setJournalEntryRefLoading] = React.useState(false);
```

**Step 3: Add a useEffect to fetch the JE ref when a fulfilled order is selected**

Find the block of `useEffect` hooks in the component (or add after state declarations). Add:

```typescript
React.useEffect(() => {
  if (!selectedOrder?.isFulfilled || !selectedOrder?.id) {
    setJournalEntryRef(null);
    return;
  }
  let cancelled = false;
  setJournalEntryRefLoading(true);
  journalEntriesApi
    .getAll({ sourceType: 'sales_order', sourceId: selectedOrder.id, limit: 1 })
    .then((res) => {
      if (cancelled) return;
      const entry = res.data?.[0];
      setJournalEntryRef(entry ? { id: entry.id, referenceNumber: entry.referenceNumber } : null);
    })
    .catch(() => {
      if (!cancelled) setJournalEntryRef(null);
    })
    .finally(() => {
      if (!cancelled) setJournalEntryRefLoading(false);
    });
  return () => { cancelled = true; };
}, [selectedOrder?.id, selectedOrder?.isFulfilled]);
```

**Step 4: Ensure `journalEntriesApi` is imported**

Find the import line for `accountingApi` near the top of `OrdersPage.tsx`. It likely imports from `@/services/accountingApi`. Check if `journalEntriesApi` is already imported. If not, add it:

```typescript
import { journalEntriesApi } from '@/services/accountingApi'
```

If the file already imports from `accountingApi`, add `journalEntriesApi` to the existing import.

**Step 5: Run TypeScript check**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```

Expected: No new errors related to `journalEntryRef` or `journalEntriesApi`.

**Step 6: Commit**

```bash
cd /home/blur/erp2 && git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "feat: fetch journal entry ref for fulfilled sales orders"
```

---

### Task 2: Add Journal Entry No row to SO Information table

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx:1684-1747` (after Payment No row, before `</TableBody>`)

**Step 1: Locate the end of the SO Information TableBody**

Find the Payment No `<TableRow>` block (lines ~1684-1746). It ends with `</TableRow>` followed by `</TableBody>`.

**Step 2: Insert the Journal Entry No row after Payment No, before `</TableBody>`**

Add the following row immediately after the closing `</TableRow>` of the Payment No row and before `</TableBody>`:

```tsx
<TableRow sx={{ backgroundColor: 'grey.50' }}>
  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
    Journal Entry No
  </TableCell>
  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
    {!selectedOrder.isFulfilled ? (
      <Typography sx={{
        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
        color: 'text.secondary',
        fontStyle: 'italic'
      }}>
        Not fulfilled
      </Typography>
    ) : journalEntryRefLoading ? (
      <Typography sx={{
        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
        color: 'text.secondary',
        fontStyle: 'italic'
      }}>
        Loading…
      </Typography>
    ) : journalEntryRef ? (
      <Typography
        component="button"
        onClick={() => navigate(`/accounting/journal-entries?sourceType=sales_order&sourceId=${selectedOrder.id}`)}
        sx={{
          fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
          color: 'primary.main',
          cursor: 'pointer',
          textDecoration: 'none',
          border: 'none',
          background: 'none',
          padding: 0,
          fontFamily: 'inherit',
          '&:hover': {
            color: 'primary.dark'
          }
        }}
      >
        {journalEntryRef.referenceNumber}
      </Typography>
    ) : (
      <Typography sx={{
        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
        color: 'text.secondary',
        fontStyle: 'italic'
      }}>
        Pending
      </Typography>
    )}
  </TableCell>
</TableRow>
```

**Note:** The alternating `grey.50` background follows the existing pattern (Invoice No = grey.50, Payment No = no background, Journal Entry No = grey.50).

**Step 3: Verify `navigate` is available**

Confirm `useNavigate` is already used in `OrdersPage.tsx` (it is — used for invoice and payment navigation). No new import needed.

**Step 4: Run TypeScript check**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```

Expected: No errors.

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "feat: add journal entry reference number row to SO Information table"
```

---

### Task 3: Manual verification

**Step 1: Build and verify in browser**

```bash
cd /home/blur/erp2/frontend && npm run build 2>&1 | tail -20
```

Expected: Build succeeds (or only pre-existing warnings).

**Step 2: Check visually (if running)**

Open http://localhost:3000/sales, click on a fulfilled sales order and verify:
- "Journal Entry No" row appears in the SO Information section with alternating grey background
- Shows the JE reference number (e.g. `JE-2026-001`) as a blue clickable link
- Clicking navigates to `/accounting/journal-entries` filtered by that SO
- For unfulfilled orders: shows italic "Not fulfilled"

**Step 3: Check unfulfilled order**

Click an unfulfilled SO and verify the row shows "Not fulfilled" in italic.
