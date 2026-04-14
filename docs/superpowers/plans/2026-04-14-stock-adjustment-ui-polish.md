# Stock Adjustment UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `StockAdjustmentContextHeader` and `StockAdjustmentWorkspaceCard` with the established SO/PO master-detail pattern — info grid in the context header, items + conditional notes in the workspace card.

**Architecture:** Two component files are modified in isolation. `StockAdjustmentContextHeader` gains a two-column info grid (matching `PurchaseOrderContextHeader`) with the Complete/Revert action and Journal Entry link moved inside the grid's right table. `StockAdjustmentWorkspaceCard` is simplified to items-only + conditional notes, matching `PurchaseOrderWorkspaceCard`.

**Tech Stack:** React 19, MUI v7 (Grid, Table, Paper, Box, Button, Chip, CircularProgress, Typography), TypeScript

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx` | Modify — add info grid, move action buttons into grid's right table, remove standalone action strip |
| `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx` | Modify — remove info grid, restructure to PO WorkspaceCard pattern, make Notes conditional |

---

### Task 1: Refactor `StockAdjustmentContextHeader`

**Files:**
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx`

**Reference file to understand target pattern:**
`frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`

**Current structure to remove:**
- The second `<Box sx={{ px, py: 1, display: 'flex', alignItems: 'center', gap: 2 }}>` block (lines 112–155) — this is the standalone action strip containing the Stack with Complete/Revert buttons and the Journal Entry inline display.

**Target structure to add** (in its place, inside the Paper, after the title strip `<Box borderBottom>`):

```tsx
<Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
  <Grid container spacing={3}>
    <Grid size={{ xs: 12, md: 6 }}>
      <TableContainer>
        <Table size={TABLE_STYLES.size} sx={detailTableSx}>
          <TableBody>
            <TableRow>
              <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                <Typography variant="h6" sx={sectionTitleSx}>SA Information</Typography>
              </TableCell>
            </TableRow>
            <TableRow sx={{ backgroundColor: 'grey.50' }}>
              <TableCell sx={labelCellSx}>Date</TableCell>
              <TableCell sx={valueCellSx}>{formatDate(selectedAdjustment.adjustmentDate)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={labelCellSx}>Item Count</TableCell>
              <TableCell sx={valueCellSx}>{selectedAdjustment.itemCount}</TableCell>
            </TableRow>
            <TableRow sx={{ backgroundColor: 'grey.50' }}>
              <TableCell sx={labelCellSx}>Total Value</TableCell>
              <TableCell sx={valueCellSx}>{formatCurrency(selectedAdjustment.totalValue)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Grid>

    <Grid size={{ xs: 12, md: 6 }}>
      <TableContainer>
        <Table size={TABLE_STYLES.size} sx={detailTableSx}>
          <TableBody>
            <TableRow>
              <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                <Typography variant="h6" sx={sectionTitleSx}>SA Confirmation</Typography>
              </TableCell>
            </TableRow>
            <TableRow sx={{ backgroundColor: 'grey.50' }}>
              <TableCell sx={labelCellSx}>Created At</TableCell>
              <TableCell sx={valueCellSx}>{formatDate(selectedAdjustment.createdAt)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={labelCellSx}>Updated At</TableCell>
              <TableCell sx={valueCellSx}>{formatDate(selectedAdjustment.updatedAt)}</TableCell>
            </TableRow>
            {selectedAdjustment.status === 'completed' && (
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                <TableCell sx={valueCellSx}>
                  {journalEntryRefLoading ? (
                    <CircularProgress size={12} />
                  ) : journalEntryRef ? (
                    <Typography
                      component="button"
                      onClick={onNavigateToJournalEntry}
                      sx={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: 'primary.main',
                        cursor: 'pointer',
                        border: 'none',
                        background: 'none',
                        padding: 0,
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {journalEntryRef.referenceNumber}
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                      Pending
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
                  {selectedAdjustment.status === 'draft' && (
                    <Button variant="contained" size="small" color="primary" onClick={onComplete} sx={{ minWidth: 110 }}>
                      Complete
                    </Button>
                  )}
                  {selectedAdjustment.status === 'completed' && (
                    <Button variant="contained" size="small" color="warning" onClick={onRevert} sx={{ minWidth: 110 }}>
                      Revert to Draft
                    </Button>
                  )}
                </Stack>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Grid>
  </Grid>
</Box>
```

**New imports to add** (add to existing import list):
- `Grid` from `@mui/material/Grid` (already has MUI imports — add `Grid` import separately: `import Grid from '@mui/material/Grid'`)
- `formatCurrency` from `@/utils/formatters` (add to existing `formatDate` import line)
- `TableContainer`, `Table`, `TableBody`, `TableRow`, `TableCell` from `@mui/material`

**Style constants** — add these before the component function (after `actionIconSx`):

```tsx
const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

const sectionTitleSx = {
  fontWeight: 600,
  color: 'primary.main',
  fontSize: '0.8rem',
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }
```

- [ ] **Step 1: Read the current file**

  Open `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx` and note the current structure. The standalone action strip starts at the `<Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, display: 'flex'...` block after the title strip `<Box borderBottom>`.

- [ ] **Step 2: Add missing imports**

  Update the import section so it includes:
  - `Grid` import: `import Grid from '@mui/material/Grid'`
  - Add `TableContainer`, `Table`, `TableBody`, `TableRow`, `TableCell` to the existing `@mui/material` import block
  - Add `formatCurrency` to the `@/utils/formatters` import: `import { formatDate, formatCurrency } from '@/utils/formatters'`

- [ ] **Step 3: Add style constants**

  After the existing `actionIconSx` constant, add `detailTableSx`, `sectionHeaderCellSx`, `sectionTitleSx`, `labelCellSx`, `valueCellSx` as shown above.

- [ ] **Step 4: Replace the standalone action strip with the info grid**

  Remove the entire `<Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, display: 'flex', alignItems: 'center', gap: 2 }}>...</Box>` block (the one containing the `<Stack direction="row">` with Complete/Revert buttons and the Journal Entry inline `<Box>`).

  In its place, add the `<Box sx={{ p: TABLE_STYLES.cell.padding.px }}>` containing the two-column Grid as shown above.

- [ ] **Step 5: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -A3 "StockAdjustmentContextHeader"
  ```

  Expected: no errors related to this file.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx
  git commit -m "refactor(inventory): align StockAdjustmentContextHeader with SO/PO pattern (#359)"
  ```

---

### Task 2: Refactor `StockAdjustmentWorkspaceCard`

**Files:**
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx`

**Reference file to understand target pattern:**
`frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`

**What to remove:**
- The entire `<Grid container spacing={3}>` block that holds "SA Information" and "SA Confirmation" tables (the info grid)
- Both `<Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />` dividers
- The always-visible Notes section with `{selectedAdjustment.notes || '—'}` fallback

**What to add/change:**
- Section header for "SA Items" using `<Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>` with `Typography variant="tableHeader"` (matching PO WorkspaceCard)
- Wrap items table in a `flex: 1, overflow: hidden` inner box, with `TableContainer sx={{ flex: 1, overflow: 'auto' }}` (matching PO WorkspaceCard scroll pattern)
- Conditional Notes section: only render when `selectedAdjustment.notes` is truthy

**Target full component body** (replace everything inside the non-null return):

```tsx
return (
  <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
      <Typography
        variant="tableHeader"
        sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
      >
        SA Items
      </Typography>
    </Box>

    <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedAdjustment.items && selectedAdjustment.items.length > 0 ? (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                '& .MuiTableCell-root': {
                  borderBottom: TABLE_STYLES.cell.border,
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                },
              }}
            >
              <TableHead>
                <TableRow
                  sx={{
                    '& .MuiTableCell-head': {
                      fontWeight: 600,
                      backgroundColor: 'grey.50',
                      color: 'text.primary',
                      fontSize: '0.8rem',
                    },
                  }}
                >
                  <TableCell sx={{ width: '40%' }}>Product</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>Old Quantity</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>New Quantity</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>Difference</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedAdjustment.items.map((item, index) => (
                  <TableRow
                    key={index}
                    hover
                    sx={{ height: TABLE_STYLES.row.height, transition: 'background-color 0.2s ease' }}
                  >
                    <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                      {item.product?.name || 'Unknown Product'}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.2 }}>
                      {Number(item.oldQuantity).toLocaleString()}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                      {Number(item.newQuantity).toLocaleString()}
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        color:
                          Number(item.difference) > 0
                            ? 'success.main'
                            : Number(item.difference) < 0
                              ? 'error.main'
                              : 'text.primary',
                      }}
                    >
                      {Number(item.difference) > 0 ? '+' : ''}
                      {Number(item.difference).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No items in this adjustment</Alert>
        )}
      </Box>

      {selectedAdjustment.notes && (
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1, display: 'block' }}
          >
            Notes
          </Typography>
          <Box
            sx={{
              p: 2,
              backgroundColor: 'grey.50',
              borderRadius: 1,
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {selectedAdjustment.notes}
          </Box>
        </Box>
      )}
    </Box>
  </Paper>
)
```

**Imports to remove** (no longer needed after removing the info grid):
- `Grid` from `@mui/material/Grid`
- `formatDate` from `@/utils/formatters`

- [ ] **Step 1: Read the current file**

  Open `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx` to confirm current structure before editing.

- [ ] **Step 2: Replace the component body**

  Replace the entire return statement (the `<Paper>` block) for the non-null case with the target structure shown above.

- [ ] **Step 3: Clean up unused imports**

  Remove the `Grid` import (`import Grid from '@mui/material/Grid'`) and remove `formatDate` from the `@/utils/formatters` import line since neither is used after the info grid is removed.

- [ ] **Step 4: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -A3 "StockAdjustmentWorkspaceCard"
  ```

  Expected: no errors related to this file.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx
  git commit -m "refactor(inventory): align StockAdjustmentWorkspaceCard with PO pattern (#359)"
  ```

---

### Task 3: Run existing tests and verify no regressions

**Files:**
- Test: `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx`

- [ ] **Step 1: Run the StockAdjustments filter bar test**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 2: Run the full inventory page test suite**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/
  ```

  Expected: all tests pass.

- [ ] **Step 3: Full TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: exit 0, no errors.

- [ ] **Step 4: Commit if any minor fixes were needed**

  If steps above required any corrections, commit them:

  ```bash
  git add -p
  git commit -m "fix(inventory): address type errors in SA UI polish (#359)"
  ```
