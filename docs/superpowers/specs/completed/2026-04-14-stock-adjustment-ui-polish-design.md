# Stock Adjustment Page — UI Polish & Round 2 Refactor

**Issue:** #359  
**Date:** 2026-04-14  
**Scope:** `StockAdjustmentContextHeader`, `StockAdjustmentWorkspaceCard`

---

## Overview

Align the Stock Adjustment master-detail page visually and structurally with the established SO/PO pattern. No backend changes. No changes to `StockAdjustmentList` (out of scope per user).

---

## StockAdjustmentContextHeader

### Current state
- Title strip: `SA Details — {adjustmentNumber}` + status Chip (left), Edit/Delete icons (right) — **keep as-is**
- Separate second zone: standalone action strip with Complete/Revert button + Journal Entry link floating below the title strip — **remove**
- No info grid in the header

### Target state (matches SO/PO ContextHeader pattern)

**Title strip** (unchanged):
- Left: `SA Details — {adjustmentNumber}` + status Chip
- Right: Edit + Delete icon buttons

**Info grid** (new — added below title strip inside the Paper body):
- Two-column `Grid container spacing={3}`, each column wraps a `TableContainer > Table` with `detailTableSx`
- Left column — **"SA Information"**: Date, Item Count, Total Value
- Right column — **"SA Confirmation"**: Created At, Updated At, then a final row spanning both cells containing the action buttons (Complete/Revert) and Journal Entry link

**Action button row** (last row of right table, `colSpan={2}`, centered):
- Draft: `Complete` button (contained, primary)
- Completed: `Revert to Draft` button (contained, warning) + Journal Entry link (or "Pending" italic)
- Matches SO's Pay/Fulfill last-row pattern

**Remove**: the standalone `<Box sx={{ px, py: 1 }}>` action strip entirely.

### sx/style conventions
- `detailTableSx`, `labelCellSx`, `valueCellSx`, `sectionHeaderCellSx`, `sectionTitleSx` — reuse existing constants from the file or define inline matching SO/PO values
- `actionIconSx` — keep as-is for Edit/Delete icons
- Journal Entry link: same `Typography component="button"` pattern as SO/PO (no underline by default, underline on hover, `primary.main` color)

---

## StockAdjustmentWorkspaceCard

### Current state
- Contains info grid (two nested tables: SA Information + SA Confirmation)
- Contains items table
- Always renders Notes section with "—" fallback and a `<Box borderTop>` divider

### Target state (matches PO WorkspaceCard pattern exactly)

**Remove**: the info grid (moves to ContextHeader)  
**Remove**: the `<Box borderTop divider>` separators  
**Remove**: always-visible Notes section with "—" fallback

**Structure:**
```
<Paper flex: 1, overflow: hidden, flexDirection: column>
  <Box p borderBottom>          ← "SA Items" section header
  <Box flex: 1, overflow: hidden, p>
    <Box flex: 1, overflow: hidden>
      <TableContainer flex: 1, overflow: auto>   ← items table (scrollable)
        or <Alert> if empty
    {selectedAdjustment.notes && (               ← conditional, no divider
      <Box mt: 1>
        "Notes" header + grey box
    )}
```

**Items table columns** (unchanged): Product, Old Quantity, New Quantity, Difference

**Notes**: only rendered when `selectedAdjustment.notes` is non-null/non-empty — no "—" fallback, no always-visible section.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx` | Add info grid, move action buttons into grid, remove standalone action strip |
| `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx` | Remove info grid, restructure to PO WorkspaceCard pattern, make Notes conditional |

No other files require changes.

---

## Success Criteria

- [ ] `StockAdjustmentContextHeader` renders a two-column info grid matching SO/PO ContextHeader structure
- [ ] Complete/Revert button and Journal Entry link appear inside the right info table's last row
- [ ] Standalone action strip `<Box>` is removed
- [ ] `StockAdjustmentWorkspaceCard` structure matches `PurchaseOrderWorkspaceCard` (items-only + conditional notes)
- [ ] Notes section only renders when notes is non-null
- [ ] No regressions in existing tests
