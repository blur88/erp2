# Design: Fix Inconsistent Row Heights in CategoryContextHeader

**Issue:** #354
**Date:** 2026-04-13
**File:** `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

## Problem

The `CategoryContextHeader` component renders two independent `<Table>` components side-by-side in a MUI `<Grid>`. Because the tables are independent, their row heights are not shared — when content in one table expands a row, the other table's rows fall out of visual alignment.

Two root causes:

1. **Category Path row** — `fullHierarchy` (e.g., `Electronics > Computers > Laptops`) can be a long string that wraps to a second line, inflating the row height and causing all subsequent rows in the left table to visually desync from their right-table counterparts.

2. **Product Count row** — renders a MUI `<Chip>` component which carries its own internal padding (~24px tall), making that row taller than plain-text rows like Created and Level.

The **Parent Category row** appearing misaligned is a symptom of cause #1, not an independent problem — once Category Path stops wrapping, the left and right tables naturally re-align.

## Design

Two surgical changes to `CategoryContextHeader.tsx`. No changes to `TABLE_STYLES`, shared sx objects, or any other component.

### 1. Category Path — Ellipsis Truncation with Tooltip

Apply `overflow: hidden`, `textOverflow: ellipsis`, and `whiteSpace: nowrap` to the Category Path `<TableCell>`. Wrap the text content in a MUI `<Tooltip>` so the full path is accessible on hover.

The `tableLayout: 'fixed'` on `detailTableSx` already constrains column widths, so ellipsis truncation will fire correctly at the cell boundary.

```tsx
import { Tooltip } from '@mui/material'

<TableCell sx={{ ...valueCellSx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
  <Tooltip title={fullHierarchy} placement="top">
    <span>{fullHierarchy}</span>
  </Tooltip>
</TableCell>
```

### 2. Product Count — Replace Chip with Plain Text

Remove the `<Chip>` component and render the product count as plain text using the existing `valueCellSx` styles. This matches the visual weight and height of all other value cells.

```tsx
<TableCell sx={valueCellSx}>
  {productCount} {productCount === 1 ? 'item' : 'items'}
</TableCell>
```

The `Chip` import can be removed if no longer used elsewhere in the file.

## What This Does Not Change

- No `TableRow` height enforcement — not needed once content stops expanding rows
- No changes to `Parent Category`, `Level`, `Created`, or section header rows
- No changes to `TABLE_STYLES`, `detailTableSx`, `labelCellSx`, or `valueCellSx`
- No new shared utilities or abstractions

## Testing

- `CategoryContextHeader.test.tsx` — verify existing tests still pass; add cases for long hierarchy strings and zero/non-zero product counts
- Manual: select a deeply nested category and confirm Category Path truncates with ellipsis and tooltip shows full path
- Manual: confirm all rows in both tables appear at equal height across a range of categories
