# Categories Master-Detail Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip redundant columns from the category list (#348) and fill out the detail panel with a proper info grid and a real Related Products table (#349).

**Architecture:** Three existing files are modified and one new component is created. No backend changes. All data is already available via existing RTK Query endpoints (`useGetProductsQuery`, `useGetRegionalSettingsQuery`).

**Tech Stack:** React 19, TypeScript, Material-UI v7, RTK Query, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/pages/inventory/components/CategoryList.tsx` | Modify | Remove product count Chip, date cell, isMobile logic |
| `frontend/src/pages/inventory/components/CategoryList.test.tsx` | Modify | Update colSpan assertions; assert chip/date are gone |
| `frontend/src/pages/inventory/components/CategoryContextHeader.tsx` | Modify | Add two-column info grid below title bar |
| `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx` | Modify | Simplify Details tab; use CategoryProductsList in Products tab |
| `frontend/src/pages/inventory/components/CategoryProductsList.tsx` | Create | Proper product table with loading/error/empty states |

---

## Task 1: Strip CategoryList down to name-only rows

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryList.tsx`
- Modify: `frontend/src/pages/inventory/components/CategoryList.test.tsx`

### Context

`CategoryList.tsx` currently renders three columns per row: name, product count Chip, and created date. The date column is hidden on mobile via `isMobile`. Both data columns move to the detail panel, so we remove them entirely.

- [ ] **Step 1: Add failing tests**

Open `frontend/src/pages/inventory/components/CategoryList.test.tsx` and add these two tests inside the existing `describe('CategoryList', ...)` block:

```tsx
it('does not show product count chip in rows', () => {
  const cat = makeCategory('1', 'Alpha')

  render(
    <CategoryList
      categories={[cat]}
      loading={false}
      focusedIndex={-1}
      categoryListRef={{ current: null }}
      onSelect={vi.fn()}
    />,
  )

  expect(screen.queryByText(/item/i)).not.toBeInTheDocument()
})

it('does not show creation date in rows', () => {
  const cat = makeCategory('1', 'Alpha')

  render(
    <CategoryList
      categories={[cat]}
      loading={false}
      focusedIndex={-1}
      categoryListRef={{ current: null }}
      onSelect={vi.fn()}
    />,
  )

  // formatDate('2026-01-01T00:00:00.000Z') produces a date string — make sure nothing date-like appears
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryList.test.tsx
```

Expected: the two new tests FAIL (chip and date are still rendered).

- [ ] **Step 3: Rewrite CategoryList.tsx**

Replace the entire file with:

```tsx
import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import { default as DragIndicatorIcon } from '@mui/icons-material/DragIndicator'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'

interface CategoryRowProps {
  category: Category
  index: number
  selectedCategoryId: string | undefined
  focusedIndex: number
  onSelect: (category: Category) => void
}

const CategoryRow = memo(({
  category,
  index,
  selectedCategoryId,
  focusedIndex,
  onSelect,
}: CategoryRowProps) => {
  const isSelected = selectedCategoryId === category.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(category)}
      data-category-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Box
          sx={{ display: 'flex', alignItems: 'center', ml: category.level * 1.5, gap: 0.5 }}
          aria-level={category.level + 1}
          role="treeitem"
          aria-label={`${category.name} ${category.level === 0 ? 'root category' : `level ${category.level} category`}`}
        >
          <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '0.875rem' }} />
          <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.2, fontWeight: 400 }}>
            {category.name}
          </Typography>
        </Box>
      </TableCell>
    </TableRow>
  )
})

CategoryRow.displayName = 'CategoryRow'

interface CategoryListProps {
  categories: Category[]
  loading: boolean
  selectedCategoryId?: string
  focusedIndex: number
  onSelect: (category: Category) => void
  categoryListRef: React.RefObject<HTMLDivElement | null>
}

const CategoryList: React.FC<CategoryListProps> = ({
  categories,
  loading,
  selectedCategoryId,
  focusedIndex,
  onSelect,
  categoryListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Categories ({categories.length})
          </Typography>
          {loading && categories.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={categoryListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && categories.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell colSpan={1}>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : categories.length === 0
                  ? (
                      <TableRow>
                        <TableCell colSpan={1}>
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                            No categories found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : categories.map((category, index) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        index={index}
                        selectedCategoryId={selectedCategoryId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default CategoryList
```

- [ ] **Step 4: Run all CategoryList tests — verify they pass**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryList.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/inventory/components/CategoryList.tsx src/pages/inventory/components/CategoryList.test.tsx
git commit -m "feat(inventory): remove product count and date from CategoryList rows (closes #348)"
```

---

## Task 2: Add info grid to CategoryContextHeader

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

### Context

`CategoryContextHeader` currently only has a title bar (name + Edit/Delete buttons). We add a two-column info grid below it, matching the `CustomerContextHeader` pattern exactly: two `Table`s inside a `Grid`, alternating `grey.50` rows, `0.8rem` font, `TABLE_STYLES` sizing.

Left column — **Category Info**: Category Path, Level, Parent.
Right column — **Summary**: Product Count (Chip), Created Date, Status.

No new props are needed — all fields come from `selectedCategory` which is already passed in.

- [ ] **Step 1: Rewrite CategoryContextHeader.tsx**

Replace the entire file with:

```tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatDate } from '@/utils/formatters'
import type { Category } from '@/types'

interface CategoryContextHeaderProps {
  selectedCategory: Category | null
  onEdit: () => void
  onDelete: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const CategoryContextHeader: React.FC<CategoryContextHeaderProps> = ({
  selectedCategory,
  onEdit,
  onDelete,
}) => {
  if (!selectedCategory) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a category to view details
        </Typography>
      </Paper>
    )
  }

  const levelLabel = selectedCategory.level === 0 ? 'Root' : `Level ${selectedCategory.level}`
  const parentLabel = selectedCategory.parent?.name ?? (selectedCategory.isRoot ? 'None' : '—')
  const productCount = selectedCategory.productCount ?? 0

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Category - {selectedCategory.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title={`Edit ${selectedCategory.name}`}
            aria-label={`Edit category ${selectedCategory.name}`}
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title={`Delete ${selectedCategory.name}`}
            aria-label={`Delete category ${selectedCategory.name}`}
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Category Info
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Category Path</TableCell>
                    <TableCell sx={valueCellSx}>{selectedCategory.fullPath}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Level</TableCell>
                    <TableCell sx={valueCellSx}>{levelLabel}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Parent Category</TableCell>
                    <TableCell sx={valueCellSx}>{parentLabel}</TableCell>
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
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Summary
                      </Typography>
                    </TableCell>
                  </TableRow>
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
                  <TableRow>
                    <TableCell sx={labelCellSx}>Created</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedCategory.createdAt)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell
                      sx={{
                        ...valueCellSx,
                        color: selectedCategory.isActive ? 'success.main' : 'text.disabled',
                      }}
                    >
                      {selectedCategory.isActive ? 'Active' : 'Inactive'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

export default CategoryContextHeader
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "feat(inventory): add two-column info grid to CategoryContextHeader"
```

---

## Task 3: Create CategoryProductsList component

**Files:**
- Create: `frontend/src/pages/inventory/components/CategoryProductsList.tsx`

### Context

This component fetches products by `categoryId` using the existing `useGetProductsQuery` endpoint (`GET /inventory/products?categoryId=...&isActive=true&sortBy=name&sortOrder=asc`). The response is `{ data: Product[], meta: {...} }` — access items as `response.data`.

Stock thresholds come from `useGetRegionalSettingsQuery` — same pattern as `ProductDetailsTab`. Stock ≤ 0 → Out of Stock (error), stock ≤ `lowStockThreshold` → Low Stock (warning), else In Stock (success).

Table columns: **Name** | **Barcode** | **Stock** (quantity + status Chip). Follows `CustomerWorkspaceCard` Orders tab styling exactly: `grey.50` header, `TABLE_STYLES.size`, `hover` rows, no row click navigation.

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/inventory/components/CategoryProductsList.tsx`:

```tsx
import React from 'react'
import {
  Box,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetProductsQuery } from '@/store/api/inventoryApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'

interface CategoryProductsListProps {
  categoryId: string
}

const CategoryProductsList: React.FC<CategoryProductsListProps> = ({ categoryId }) => {
  const { data: productsResponse, isLoading, isError } = useGetProductsQuery({ categoryId })
  const { data: regionalSettings } = useGetRegionalSettingsQuery()

  const products = productsResponse?.data ?? []
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  const getStockStatus = (stockQuantity: number): { label: string; color: 'error' | 'warning' | 'success' } => {
    if (stockQuantity <= 0) return { label: 'Out of Stock', color: 'error' }
    if (stockQuantity <= lowStockThreshold) return { label: 'Low Stock', color: 'warning' }
    return { label: 'In Stock', color: 'success' }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return (
      <Typography sx={{ color: 'error.main', py: 4, textAlign: 'center' }}>
        Failed to load products.
      </Typography>
    )
  }

  if (products.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No products in this category.
      </Typography>
    )
  }

  return (
    <TableContainer>
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell>Name</TableCell>
            <TableCell>Barcode</TableCell>
            <TableCell>Stock</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => {
            const stock = product.stockQuantity ?? 0
            const status = getStockStatus(stock)

            return (
              <TableRow key={product.id} hover>
                <TableCell>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    {product.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: product.barcode ? 'text.primary' : 'text.secondary' }}>
                    {product.barcode || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {stock}
                    </Typography>
                    <Chip
                      label={status.label}
                      color={status.color}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
                    />
                  </Box>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default CategoryProductsList
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryProductsList.tsx
git commit -m "feat(inventory): add CategoryProductsList with stock status chips"
```

---

## Task 4: Refactor CategoryWorkspaceCard to use CategoryProductsList

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx`

### Context

The Details tab's inline Grid of key/value pairs is removed — that info now lives in `CategoryContextHeader`. The Details tab is replaced with a single "Full Path" field (keeps the tab as a useful placeholder without leaving it blank). The Products tab replaces its inline product list with `<CategoryProductsList categoryId={selectedCategory.id} />`.

- [ ] **Step 1: Rewrite CategoryWorkspaceCard.tsx**

Replace the entire file with:

```tsx
import React, { useEffect, useState } from 'react'
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'

import CategoryProductsList from './CategoryProductsList'

interface CategoryWorkspaceCardProps {
  selectedCategory: Category | null
}

const CategoryWorkspaceCard: React.FC<CategoryWorkspaceCardProps> = ({ selectedCategory }) => {
  const [tabValue, setTabValue] = useState(0)
  const categoryId = selectedCategory?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [categoryId])

  if (!selectedCategory) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: '0.8rem', textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab label="Details" />
          <Tab label="Products" />
        </Tabs>
      </Box>

      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 0 ? 'block' : 'none', p: TABLE_STYLES.cell.padding.px }}
      >
        {tabValue === 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              Full Path
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.85rem', mt: 0.25 }}>
              {selectedCategory.fullPath}
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 1 ? 'flex' : 'none', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}
      >
        {tabValue === 1 && <CategoryProductsList categoryId={selectedCategory.id} />}
      </Box>
    </Paper>
  )
}

export default CategoryWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run the full inventory-related test suite**

```bash
cd frontend && npx vitest run src/pages/inventory
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx
git commit -m "feat(inventory): refactor CategoryWorkspaceCard to use CategoryProductsList (closes #349)"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run all frontend tests that touch inventory or categories**

```bash
cd frontend && npx vitest run src/pages/inventory src/components/inventory
```

Expected: all tests PASS.

- [ ] **Step 2: Type-check the full frontend**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.
