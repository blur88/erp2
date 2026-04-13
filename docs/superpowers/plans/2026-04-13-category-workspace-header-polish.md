# Category Workspace & Header Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `CategoryWorkspaceCard` (remove tabs, show products table) and `CategoryContextHeader` (fix category path, parent name, remove status row) per issues #350 and #351.

**Architecture:** Frontend-only changes. `CategoryWorkspaceCard` is rewritten to match the `PurchaseOrderWorkspaceCard` pattern — title bar + scrollable table + optional notes. `CategoryContextHeader` gets a `buildCategoryHierarchy` helper that walks the cached flat category list to build the full name path, replacing the broken `fullPath` field and missing `parent.name`.

**Tech Stack:** React 19, MUI v7, RTK Query (`useGetProductsQuery`, `useGetRegionalSettingsQuery`, `useGetCategoriesQuery`), Vitest + Testing Library

---

## File Map

| File | Action | What changes |
|---|---|---|
| `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx` | Rewrite | Remove tabs/state, add inline products table with Name/Stock/Stock Status + notes section |
| `frontend/src/pages/inventory/components/CategoryContextHeader.tsx` | Modify | Add `allCategories` prop, add `buildCategoryHierarchy` helper, fix Category Path + Parent Category rows, remove Status row |
| `frontend/src/pages/inventory/CategoriesPage.tsx` | Modify | Pass `categories` as `allCategories` prop to `CategoryContextHeader` |

---

## Task 1: Rewrite CategoryWorkspaceCard (#350)

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx`

- [ ] **Step 1: Replace the file content**

Replace the entire file with:

```tsx
import React from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
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
import type { Category } from '@/types'

interface CategoryWorkspaceCardProps {
  selectedCategory: Category | null
}

const getStockStatus = (
  stockQuantity: number,
  lowStockThreshold: number,
): { label: string; color: 'error' | 'warning' | 'success' } => {
  if (stockQuantity <= 0) return { label: 'Out of Stock', color: 'error' }
  if (stockQuantity <= lowStockThreshold) return { label: 'Low Stock', color: 'warning' }
  return { label: 'In Stock', color: 'success' }
}

const CategoryWorkspaceCard: React.FC<CategoryWorkspaceCardProps> = ({ selectedCategory }) => {
  const categoryId = selectedCategory?.id ?? ''
  const { data: productsResponse, isLoading, isError } = useGetProductsQuery(
    { categoryId },
    { skip: !categoryId },
  )
  const { data: regionalSettings } = useGetRegionalSettingsQuery()

  const products = productsResponse?.data ?? []
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  if (!selectedCategory) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Category Products
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : isError ? (
            <Alert severity="error">Failed to load products.</Alert>
          ) : products.length === 0 ? (
            <Alert severity="info">No products in this category.</Alert>
          ) : (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                    <TableCell>Name</TableCell>
                    <TableCell align="right" sx={{ width: '15%' }}>Stock</TableCell>
                    <TableCell align="center" sx={{ width: '25%' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.map((product) => {
                    const stock = product.stockQuantity ?? 0
                    const status = getStockStatus(stock, lowStockThreshold)
                    return (
                      <TableRow key={product.id} hover sx={{ height: TABLE_STYLES.row.height }}>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'primary.main' }}>
                          {product.name}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {stock}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={status.label}
                            color={status.color}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {selectedCategory.description && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
              Notes
            </Typography>
            <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selectedCategory.description}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default CategoryWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -A3 "CategoryWorkspaceCard"
```

Expected: no errors referencing `CategoryWorkspaceCard`.

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx
git commit -m "feat(inventory): simplify CategoryWorkspaceCard — remove tabs, show products table (#350)"
```

---

## Task 2: Fix CategoryContextHeader (#351)

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

- [ ] **Step 1: Add the `buildCategoryHierarchy` helper and update the component**

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
import type { Category } from '@/types'
import { formatDate } from '@/utils/formatters'

interface CategoryContextHeaderProps {
  selectedCategory: Category | null
  allCategories: Category[]
  onEdit: () => void
  onDelete: () => void
}

function buildCategoryHierarchy(categoryId: string, allCategories: Category[]): string {
  const names: string[] = []
  let current = allCategories.find(c => c.id === categoryId)
  while (current) {
    names.unshift(current.name)
    current = current.parentId
      ? allCategories.find(c => c.id === current!.parentId)
      : undefined
  }
  return names.length > 0 ? names.join(' > ') : '—'
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
  allCategories,
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
  const parentName = selectedCategory.parentId
    ? allCategories.find(c => c.id === selectedCategory.parentId)?.name ?? '—'
    : 'None'
  const productCount = selectedCategory.productCount ?? 0
  const fullHierarchy = buildCategoryHierarchy(selectedCategory.id, allCategories)

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
                    <TableCell sx={valueCellSx}>{fullHierarchy}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Level</TableCell>
                    <TableCell sx={valueCellSx}>{levelLabel}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Parent Category</TableCell>
                    <TableCell sx={valueCellSx}>{parentName}</TableCell>
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
cd frontend && npm run type-check 2>&1 | grep -A3 "CategoryContextHeader"
```

Expected: no errors referencing `CategoryContextHeader`. (There will be a type error in `CategoriesPage.tsx` because `allCategories` prop is now required — that's fixed in Task 3.)

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "feat(inventory): fix CategoryContextHeader path/parent display, remove status row (#351)"
```

---

## Task 3: Pass `allCategories` prop in CategoriesPage

**Files:**
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`

- [ ] **Step 1: Update the `CategoryContextHeader` usage**

In `CategoriesPage.tsx`, find the `CategoryContextHeader` JSX block (around line 162):

```tsx
<CategoryContextHeader
  selectedCategory={selectedCategory}
  onEdit={() => selectedCategory && actions.handleEditCategory(selectedCategory)}
  onDelete={() => selectedCategory && actions.handleDeleteCategory(selectedCategory)}
/>
```

Replace it with:

```tsx
<CategoryContextHeader
  selectedCategory={selectedCategory}
  allCategories={categories}
  onEdit={() => selectedCategory && actions.handleEditCategory(selectedCategory)}
  onDelete={() => selectedCategory && actions.handleDeleteCategory(selectedCategory)}
/>
```

Note: `categories` is already in scope — it comes from `useGetCategoriesQuery` at line 52 (`const { data: categories = [], ... } = useGetCategoriesQuery(...)`).

- [ ] **Step 2: Type-check the full frontend**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: `Found 0 errors.`

- [ ] **Step 3: Run the affected test files**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryProductsList.test.tsx src/pages/inventory/components/CategoryList.test.tsx
```

Expected: all tests pass. (These are the only test files for the inventory category components — `CategoryWorkspaceCard` and `CategoryContextHeader` have no dedicated test files.)

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/inventory/CategoriesPage.tsx
git commit -m "feat(inventory): wire allCategories prop to CategoryContextHeader in CategoriesPage"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] #350: Remove tabs from `CategoryWorkspaceCard` → Task 1
- [x] #350: Name / Stock / Stock Status columns → Task 1
- [x] #350: Notes section from `description` → Task 1
- [x] #350: Empty state → Task 1
- [x] #351: Fix "Category Path" with `buildCategoryHierarchy` → Task 2
- [x] #351: Fix "Parent Category" via `parentId` lookup → Task 2
- [x] #351: Remove "Status" row → Task 2
- [x] Pass `allCategories` to caller → Task 3
- [x] `CategoryProductsList` untouched → not in file map (no changes)

**No placeholders:** All steps contain complete code.

**Type consistency:** `buildCategoryHierarchy` defined in Task 2, used in Task 2 only. `allCategories: Category[]` prop defined in Task 2, passed in Task 3. `categories` variable in `CategoriesPage` is `Category[]` (matches).
