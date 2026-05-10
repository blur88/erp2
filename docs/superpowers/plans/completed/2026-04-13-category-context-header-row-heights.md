# CategoryContextHeader Row Height Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inconsistent row heights in `CategoryContextHeader` by truncating the Category Path with an ellipsis+tooltip and replacing the Product Count Chip with plain text.

**Architecture:** Two surgical changes to a single file — no new abstractions, no changes to shared constants or other components. The `tableLayout: 'fixed'` already in `detailTableSx` ensures ellipsis truncation fires at the correct cell boundary.

**Tech Stack:** React 19, MUI v7, Vitest, `@testing-library/react`

---

### Task 1: Add tests for the two new behaviors

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.test.tsx`

- [ ] **Step 1: Add test for long Category Path truncation (tooltip present)**

Open `frontend/src/pages/inventory/components/CategoryContextHeader.test.tsx` and add the following test inside the existing `describe('CategoryContextHeader', ...)` block, after the last existing `it(...)`:

```tsx
it('renders a tooltip with the full hierarchy when the category path is long', async () => {
  const root = makeCategory({ id: 'a', name: 'Electronics' })
  const l1 = makeCategory({ id: 'b', name: 'Computers', level: 1, parentId: 'a', isRoot: false })
  const l2 = makeCategory({ id: 'c', name: 'Laptops', level: 2, parentId: 'b', isRoot: false })
  const l3 = makeCategory({ id: 'd', name: 'Gaming', level: 3, parentId: 'c', isRoot: false })

  render(
    <CategoryContextHeader
      selectedCategory={l3}
      allCategories={[root, l1, l2, l3]}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

  // The full path text is rendered inside the tooltip trigger
  expect(screen.getByText('Electronics > Computers > Laptops > Gaming')).toBeInTheDocument()
})
```

- [ ] **Step 2: Add test for Product Count as plain text (no Chip)**

Add the following test inside the same `describe` block:

```tsx
it('renders product count as plain text, not a Chip', () => {
  render(
    <CategoryContextHeader
      selectedCategory={makeCategory({ productCount: 5 })}
      allCategories={[makeCategory()]}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

  expect(screen.getByText('5 items')).toBeInTheDocument()
  // MUI Chip renders with role="status" or a specific class — absence of chip role confirms plain text
  expect(screen.queryByRole('button', { name: /items/i })).not.toBeInTheDocument()
})

it('renders singular "item" for a count of 1', () => {
  render(
    <CategoryContextHeader
      selectedCategory={makeCategory({ productCount: 1 })}
      allCategories={[makeCategory()]}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

  expect(screen.getByText('1 item')).toBeInTheDocument()
})

it('renders "0 items" for zero product count', () => {
  render(
    <CategoryContextHeader
      selectedCategory={makeCategory({ productCount: 0 })}
      allCategories={[makeCategory()]}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

  expect(screen.getByText('0 items')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx
```

Expected: the three product count tests pass (Chip already renders the text), the tooltip test passes (text is already in the DOM). All existing tests pass. This confirms the test suite is healthy before we change implementation.

> Note: The tests may already pass since they test text content presence, not structure. That's fine — we're confirming baseline, then the implementation changes will keep them green.

- [ ] **Step 4: Commit the tests**

```bash
cd frontend && git add src/pages/inventory/components/CategoryContextHeader.test.tsx
git commit -m "test(inventory): add tests for CategoryContextHeader row height fixes (#354)"
```

---

### Task 2: Replace Chip with plain text for Product Count

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

- [ ] **Step 1: Remove the Chip from the Product Count cell**

In `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`, find the Product Count `<TableCell>` (lines ~191–200) and replace it:

**Before:**
```tsx
<TableRow sx={{ backgroundColor: 'grey.50' }}>
  <TableCell sx={labelCellSx}>Product Count</TableCell>
  <TableCell sx={valueCellSx}>
    <Chip
      label={`${productCount} ${productCount === 1 ? 'item' : 'items'}`}
      size="small"
      color={productCount > 0 ? 'primary' : 'default'}
      variant="outlined"
      sx={{ fontSize: '0.7rem', fontWeight: 500 }}
    />
  </TableCell>
</TableRow>
```

**After:**
```tsx
<TableRow sx={{ backgroundColor: 'grey.50' }}>
  <TableCell sx={labelCellSx}>Product Count</TableCell>
  <TableCell sx={valueCellSx}>
    {productCount} {productCount === 1 ? 'item' : 'items'}
  </TableCell>
</TableRow>
```

- [ ] **Step 2: Remove the Chip import**

At the top of the file, remove `Chip` from the MUI import destructure:

**Before:**
```tsx
import {
  Box,
  Chip,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```

**After:**
```tsx
import {
  Box,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
```

> Note: We're adding `Tooltip` to the import at the same time, ready for Task 3.

- [ ] **Step 3: Run the tests**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep CategoryContextHeader
```

Expected: no errors for this file.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "fix(inventory): replace Product Count Chip with plain text in CategoryContextHeader (#354)"
```

---

### Task 3: Truncate Category Path with ellipsis and tooltip

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

- [ ] **Step 1: Wrap Category Path text in Tooltip and apply truncation styles**

In `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`, find the Category Path `<TableRow>` (lines ~156–159) and replace it:

**Before:**
```tsx
<TableRow sx={{ backgroundColor: 'grey.50' }}>
  <TableCell sx={labelCellSx}>Category Path</TableCell>
  <TableCell sx={valueCellSx}>{fullHierarchy}</TableCell>
</TableRow>
```

**After:**
```tsx
<TableRow sx={{ backgroundColor: 'grey.50' }}>
  <TableCell sx={labelCellSx}>Category Path</TableCell>
  <TableCell sx={{ ...valueCellSx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    <Tooltip title={fullHierarchy} placement="top">
      <span>{fullHierarchy}</span>
    </Tooltip>
  </TableCell>
</TableRow>
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep CategoryContextHeader
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "fix(inventory): truncate long Category Path with ellipsis and tooltip in CategoryContextHeader (#354)"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test file one more time**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx
```

Expected output: all tests pass, no failures.

- [ ] **Step 2: TypeScript check across the frontend**

```bash
cd frontend && npm run type-check
```

Expected: exit 0, no errors.

- [ ] **Step 3: Lint check**

```bash
cd frontend && npm run lint -- --quiet src/pages/inventory/components/CategoryContextHeader.tsx
```

Expected: no errors or warnings.
