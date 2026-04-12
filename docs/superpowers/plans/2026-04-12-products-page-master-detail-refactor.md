# ProductsPage Master-Detail Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ProductsPage` to use the standardized `MasterDetailWorkspace` pattern, replacing the manual `Grid` layout and legacy component names with the same structure used by `SuppliersPage`.

**Architecture:** Three sequential layers — hooks first, then components, then page rewrite. Each layer commits independently and leaves the app working. The refactor is structural only: no behavior changes, no API changes, no feature additions.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/pages/inventory/hooks/useProductsPageState.ts` | Remove `currentTab`/`setCurrentTab` |
| Modify | `frontend/src/pages/inventory/hooks/useProductsSelection.ts` | Drop `selectedCategory`/`location` params, add `hasAutoSelected` ref, rename handlers |
| Modify | `frontend/src/pages/inventory/hooks/useProductsSelection.test.tsx` | Remove dropped params from test calls |
| Create | `frontend/src/pages/inventory/components/ProductList.tsx` | Memo-ized list with skeleton loading |
| Create | `frontend/src/pages/inventory/components/ProductContextHeader.tsx` | Name + Edit/Delete header bar |
| Create | `frontend/src/pages/inventory/components/ProductWorkspaceCard.tsx` | Tabbed details/history workspace |
| Delete | `frontend/src/pages/inventory/components/ProductDetailsPanel.tsx` | Replaced by above two |
| Rename | `frontend/src/pages/inventory/components/ProductsTable.tsx` → deleted | Replaced by `ProductList.tsx` |
| Rename | `frontend/src/pages/inventory/components/ProductsTable.test.tsx` → `ProductList.test.tsx` | Updated test |
| Modify | `frontend/src/pages/inventory/ProductsPage.tsx` | MasterDetailWorkspace layout |
| Modify | `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx` | Update mocks |

---

## Task 1: Trim `useProductsPageState`

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useProductsPageState.ts`

- [ ] **Step 1: Remove `currentTab` state**

Open `frontend/src/pages/inventory/hooks/useProductsPageState.ts`. Remove the `currentTab` / `setCurrentTab` state and its return entries. Final file:

```typescript
import { useRef, useState } from 'react'

import type { Product } from '@/types'

export function useProductsPageState() {
  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [calculatorPanelOpen, setCalculatorPanelOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1)
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const productListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    deletedProductsDialogOpen,
    setDeletedProductsDialogOpen,
    importDialogOpen,
    setImportDialogOpen,
    calculatorPanelOpen,
    setCalculatorPanelOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    productToDelete,
    setProductToDelete,
    focusedProductIndex,
    setFocusedProductIndex,
    exportMenuAnchor,
    setExportMenuAnchor,
    isExporting,
    setIsExporting,
    productListRef,
    searchInputRef,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useProductsPageState\|currentTab\|ProductsPage" | head -20
```

Expected: errors referencing `currentTab` in `ProductsPage.tsx` and `ProductDetailsPanel.tsx` — these will be fixed in Tasks 3 and 4. No other files should error.

---

## Task 2: Refactor `useProductsSelection`

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useProductsSelection.ts`
- Modify: `frontend/src/pages/inventory/hooks/useProductsSelection.test.tsx`

- [ ] **Step 1: Update the hook**

Replace the full content of `frontend/src/pages/inventory/hooks/useProductsSelection.ts`:

```typescript
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useLocation, type NavigateFunction } from 'react-router-dom'

import { setSelectedProduct } from '@/store/slices/inventorySlice'
import type { AppDispatch } from '@/store'
import type { Product } from '@/types'

interface UseProductsSelectionParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  products: Product[]
  selectedProduct: Product | null
  focusedProductIndex: number
  setFocusedProductIndex: (index: number) => void
  productListRef: RefObject<HTMLDivElement | null>
}

export function useProductsSelection({
  dispatch,
  navigate,
  products,
  selectedProduct,
  focusedProductIndex,
  setFocusedProductIndex,
  productListRef,
}: UseProductsSelectionParams) {
  const location = useLocation()
  const hasAutoSelected = useRef(false)
  const navigationSelectionId = (location.state as { selectedProductId?: string } | null)?.selectedProductId

  // Auto-select first product on initial load
  useEffect(() => {
    if (products.length > 0 && !hasAutoSelected.current && focusedProductIndex === -1 && !selectedProduct && !navigationSelectionId) {
      hasAutoSelected.current = true
      setFocusedProductIndex(0)
      dispatch(setSelectedProduct(products[0]))
    } else if (products.length === 0) {
      dispatch(setSelectedProduct(null))
      setFocusedProductIndex(-1)
    }
  }, [products, dispatch, focusedProductIndex, selectedProduct, navigationSelectionId, setFocusedProductIndex])

  // Handle deep-link selection from navigation state (e.g. returning from edit page)
  useEffect(() => {
    if (navigationSelectionId && products.length > 0) {
      const product = products.find((item) => item.id === navigationSelectionId)
      if (product) {
        navigate(location.pathname, { replace: true, state: {} })
        dispatch(setSelectedProduct(product))
        const index = products.findIndex((item) => item.id === navigationSelectionId)
        if (index >= 0) {
          setFocusedProductIndex(index)
        }
      }
    }
  }, [dispatch, location.pathname, navigate, navigationSelectionId, products, setFocusedProductIndex])

  // Sync selected product data when list refreshes
  useEffect(() => {
    if (selectedProduct && products.length > 0) {
      const updatedProduct = products.find((product) => product.id === selectedProduct.id)
      if (updatedProduct) {
        const hasChanged = JSON.stringify(updatedProduct) !== JSON.stringify(selectedProduct)
        if (hasChanged) {
          dispatch(setSelectedProduct(updatedProduct))
        }
      } else {
        dispatch(setSelectedProduct(null))
      }
    }
  }, [dispatch, products, selectedProduct])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedProductIndex >= 0 && productListRef.current) {
      const focusedRow = productListRef.current.querySelector(`[data-product-index="${focusedProductIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedProductIndex, productListRef])

  const selectAtIndex = useCallback((index: number) => {
    setFocusedProductIndex(index)
    dispatch(setSelectedProduct(products[index]))
  }, [dispatch, products, setFocusedProductIndex])

  const handleProductSelect = useCallback((product: Product) => {
    const index = products.findIndex((candidate) => candidate.id === product.id)
    setFocusedProductIndex(index)
    dispatch(setSelectedProduct(product))
  }, [dispatch, products, setFocusedProductIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedProductIndex > 0) {
      selectAtIndex(focusedProductIndex - 1)
    }
  }, [focusedProductIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedProductIndex < products.length - 1) {
      selectAtIndex(focusedProductIndex + 1)
    }
  }, [focusedProductIndex, products.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (products.length > 0) {
      selectAtIndex(0)
    }
  }, [products.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (products.length > 0) {
      selectAtIndex(products.length - 1)
    }
  }, [products.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedProductIndex - 10)
    if (products[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedProductIndex, products, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(products.length - 1, focusedProductIndex + 10)
    if (products[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedProductIndex, products, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedProductIndex >= 0 && products[focusedProductIndex]) {
      navigate(`/inventory/products/${products[focusedProductIndex].id}/edit`)
    }
  }, [focusedProductIndex, navigate, products])

  const handleEscapeAction = useCallback(() => {
    setFocusedProductIndex(-1)
    dispatch(setSelectedProduct(null))
  }, [dispatch, setFocusedProductIndex])

  return {
    handleProductSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
  }
}
```

- [ ] **Step 2: Update the selection hook tests**

Replace the full content of `frontend/src/pages/inventory/hooks/useProductsSelection.test.tsx`:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useProductsSelection } from './useProductsSelection'

import type { Product } from '@/types'

const makeProduct = (id: string, name: string): Product =>
  (({
    id,
    name,
    barcode: `SKU-${id}`,
    type: 'Stocked Product',
    baseCost: 10,
    stockQuantity: 5,
    isActive: true,
    isOutOfStock: false,
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z')
  }) as Product)

function renderSelectionHook(initialUrl: string, props: Parameters<typeof useProductsSelection>[0]) {
  return renderHook(() => useProductsSelection(props), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
    ),
  })
}

describe('useProductsSelection', () => {
  it('selects and highlights the product when navigation state id matches a loaded product', async () => {
    const dispatch = vi.fn()
    const navigate = vi.fn()
    const setFocusedProductIndex = vi.fn()
    const alpha = makeProduct('1', 'Alpha')
    const beta = makeProduct('2', 'Beta')

    renderSelectionHook('/inventory/products?selectedProductId=2', {
      dispatch: dispatch as never,
      navigate,
      products: [alpha, beta],
      selectedProduct: null,
      focusedProductIndex: -1,
      setFocusedProductIndex,
      productListRef: { current: null },
    })

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/inventory/products', { replace: true, state: {} })
    })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: beta }))
    expect(setFocusedProductIndex).toHaveBeenCalledWith(1)
  })

  it('does not navigate or select when the navigation selection id is missing from the loaded list', async () => {
    const dispatch = vi.fn()
    const navigate = vi.fn()
    const setFocusedProductIndex = vi.fn()

    renderSelectionHook('/inventory/products', {
      dispatch: dispatch as never,
      navigate,
      products: [makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')],
      selectedProduct: null,
      focusedProductIndex: -1,
      setFocusedProductIndex,
      productListRef: { current: null },
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(navigate).not.toHaveBeenCalled()
  })
})
```

**Note:** The hook now reads `useLocation()` internally, so tests must wrap with `MemoryRouter`. The deep-link test previously passed `location.state` — now we pass the URL with state via the router's `initialEntries`. If the existing test used `location.state`, update accordingly — the hook reads from `useLocation()` which MemoryRouter populates from `initialEntries`.

- [ ] **Step 3: Run selection hook tests**

```bash
cd frontend && npx vitest run src/pages/inventory/hooks/useProductsSelection.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/inventory/hooks/useProductsSelection.ts src/pages/inventory/hooks/useProductsSelection.test.tsx ../frontend/src/pages/inventory/hooks/useProductsPageState.ts
git add src/pages/inventory/hooks/useProductsPageState.ts
git commit -m "refactor(inventory): align ProductsPage hooks with master-detail pattern"
```

---

## Task 3: Create `ProductList.tsx`

**Files:**
- Create: `frontend/src/pages/inventory/components/ProductList.tsx`
- Create: `frontend/src/pages/inventory/components/ProductList.test.tsx` (replaces `ProductsTable.test.tsx`)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/inventory/components/ProductList.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ProductList from './ProductList'

import type { Product } from '@/types'

const makeProduct = (id: string, name: string): Product =>
  (({
    id,
    name,
    barcode: `SKU-${id}`,
    type: 'Stocked Product',
    baseCost: 10,
    stockQuantity: 2,
    isActive: true,
    isOutOfStock: false,
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z')
  }) as Product)

describe('ProductList', () => {
  it('shows the visible product count', () => {
    render(
      <ProductList
        products={[makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')]}
        loading={false}
        focusedIndex={0}
        productListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('Products (2)')).toBeInTheDocument()
  })

  it('shows skeleton rows when loading with no products', () => {
    render(
      <ProductList
        products={[]}
        loading={true}
        focusedIndex={-1}
        productListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )
    // Skeletons render instead of empty state message
    expect(screen.queryByText(/no products/i)).not.toBeInTheDocument()
  })

  it('shows empty state when not loading and no products', () => {
    render(
      <ProductList
        products={[]}
        loading={false}
        focusedIndex={-1}
        productListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/no products found/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/inventory/components/ProductList.test.tsx
```

Expected: FAIL — `ProductList` not found.

- [ ] **Step 3: Create `ProductList.tsx`**

Create `frontend/src/pages/inventory/components/ProductList.tsx`:

```typescript
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductRowProps {
  product: Product
  index: number
  selectedProductId: string | undefined
  focusedIndex: number
  onSelect: (product: Product) => void
}

const ProductRow = memo(({ product, index, selectedProductId, focusedIndex, onSelect }: ProductRowProps) => {
  const isSelected = selectedProductId === product.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(product)}
      data-product-index={index}
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
        <Typography
          variant="body2"
          sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}
        >
          {product.name}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

ProductRow.displayName = 'ProductRow'

interface ProductListProps {
  products: Product[]
  loading: boolean
  selectedProductId?: string
  focusedIndex: number
  onSelect: (product: Product) => void
  productListRef: React.RefObject<HTMLDivElement | null>
}

const ProductList: React.FC<ProductListProps> = ({
  products,
  loading,
  selectedProductId,
  focusedIndex,
  onSelect,
  productListRef,
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
            Products ({products.length})
          </Typography>
          {loading && products.length > 0 && (
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
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={productListRef}>
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
              {loading && products.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : products.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}
                          >
                            No products found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : products.map((product, index) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        index={index}
                        selectedProductId={selectedProductId}
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

export default ProductList
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/inventory/components/ProductList.test.tsx
```

Expected: all 3 tests pass.

- [ ] **Step 5: Delete old test file**

```bash
rm frontend/src/pages/inventory/components/ProductsTable.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/components/ProductList.tsx frontend/src/pages/inventory/components/ProductList.test.tsx
git rm frontend/src/pages/inventory/components/ProductsTable.test.tsx
git commit -m "feat(inventory): add ProductList component (replaces ProductsTable)"
```

---

## Task 4: Create `ProductContextHeader.tsx`

**Files:**
- Create: `frontend/src/pages/inventory/components/ProductContextHeader.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/inventory/components/ProductContextHeader.tsx`:

```typescript
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  IconButton,
  Paper,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductContextHeaderProps {
  selectedProduct: Product | null
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const ProductContextHeader: React.FC<ProductContextHeaderProps> = ({
  selectedProduct,
  onEdit,
  onDelete,
}) => {
  if (!selectedProduct) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a product to view details
        </Typography>
      </Paper>
    )
  }

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
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Product — {selectedProduct.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title={`Edit ${selectedProduct.name}`}
            aria-label={`Edit product ${selectedProduct.name}`}
            onClick={() => onEdit(selectedProduct)}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title={`Delete ${selectedProduct.name}`}
            aria-label={`Delete product ${selectedProduct.name}`}
            onClick={() => onDelete(selectedProduct)}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}

export default ProductContextHeader
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "ProductContextHeader" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/ProductContextHeader.tsx
git commit -m "feat(inventory): add ProductContextHeader component"
```

---

## Task 5: Create `ProductWorkspaceCard.tsx`

**Files:**
- Create: `frontend/src/pages/inventory/components/ProductWorkspaceCard.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/inventory/components/ProductWorkspaceCard.tsx`:

```typescript
import React, { useEffect, useState } from 'react'
import { Box, Paper, Tab, Tabs } from '@mui/material'

import MovementHistoryTab from '@/components/inventory/MovementHistoryTab'
import OrderHistoryTab from '@/components/inventory/OrderHistoryTab'
import ProductDetailsTab from '@/components/inventory/ProductDetailsTab'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductWorkspaceCardProps {
  selectedProduct: Product | null
}

const ProductWorkspaceCard: React.FC<ProductWorkspaceCardProps> = ({ selectedProduct }) => {
  const [tabValue, setTabValue] = useState(0)

  const productId = selectedProduct?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [productId])

  if (!selectedProduct) {
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
            '& .MuiTab-root': {
              minHeight: 40,
              fontSize: '0.8rem',
              textTransform: 'none',
              fontWeight: 600,
            },
          }}
        >
          <Tab label="Details" />
          <Tab label="Movement History" />
          <Tab label="Order History" />
        </Tabs>
      </Box>

      <Box
        role="tabpanel"
        sx={{
          flex: 1,
          overflow: 'auto',
          display: tabValue === 0 ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {tabValue === 0 && (
          <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>
            <ProductDetailsTab product={selectedProduct} />
          </Box>
        )}
      </Box>

      <Box
        role="tabpanel"
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: tabValue === 1 ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {tabValue === 1 && <MovementHistoryTab productId={selectedProduct.id} />}
      </Box>

      <Box
        role="tabpanel"
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: tabValue === 2 ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {tabValue === 2 && <OrderHistoryTab productId={selectedProduct.id} />}
      </Box>
    </Paper>
  )
}

export default ProductWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "ProductWorkspaceCard" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/ProductWorkspaceCard.tsx
git commit -m "feat(inventory): add ProductWorkspaceCard component"
```

---

## Task 6: Rewrite `ProductsPage.tsx` and update tests

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`
- Delete: `frontend/src/pages/inventory/components/ProductDetailsPanel.tsx`
- Delete: `frontend/src/pages/inventory/components/ProductsTable.tsx`

- [ ] **Step 1: Rewrite `ProductsPage.tsx`**

Replace the full content of `frontend/src/pages/inventory/ProductsPage.tsx`:

```typescript
import React, { useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteProductMutation,
  useGetProductsQuery,
} from '@/store/api/inventoryApi'
import {
  selectSelectedProduct,
  setSelectedProduct,
} from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import ProductContextHeader from './components/ProductContextHeader'
import ProductList from './components/ProductList'
import ProductsDialogs from './components/ProductsDialogs'
import ProductWorkspaceCard from './components/ProductWorkspaceCard'
import { useProductsActions } from './hooks/useProductsActions'
import { useProductsPageState } from './hooks/useProductsPageState'
import { useProductsSelection } from './hooks/useProductsSelection'

interface InventoryProductFilters {
  search: string
  categoryId: string | null
  type: 'goods' | 'service' | null
  stockStatus: 'low_stock' | 'out_of_stock' | null
}

export const ProductsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const selectedProduct = useAppSelector(selectSelectedProduct)
  const pageState = useProductsPageState()

  const filterConfig = useMemo<FilterBarConfig<InventoryProductFilters>>(
    () => ({
      search: { placeholder: 'Search by name, barcode, or brand...' },
      fields: [
        { field: 'categoryId', label: 'Category', type: 'category' },
        { field: 'type', label: 'Product Type', type: 'product-type' },
        { field: 'stockStatus', label: 'Stock Status', type: 'stock-status' },
      ],
      defaults: {
        search: '',
        categoryId: null,
        type: null,
        stockStatus: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const productQueryParams = useMemo(() => {
    const params: Record<string, string | boolean> = {}

    if (appliedFilters.search) {
      params.search = appliedFilters.search
    }
    if (appliedFilters.categoryId) {
      params.categoryId = appliedFilters.categoryId
    }
    if (appliedFilters.type === 'goods') {
      params.type = 'Stocked Product'
    } else if (appliedFilters.type === 'service') {
      params.type = 'Service'
    }
    if (appliedFilters.stockStatus === 'low_stock') {
      params.lowStock = true
    } else if (appliedFilters.stockStatus === 'out_of_stock') {
      params.outOfStock = true
    }

    return params
  }, [appliedFilters])

  const { data: productsResponse, isFetching: isProductsFetching, refetch: refetchProducts } = useGetProductsQuery(productQueryParams)
  const [deleteProduct] = useDeleteProductMutation()
  const products = productsResponse?.data || []

  const selection = useProductsSelection({
    dispatch,
    navigate,
    products,
    selectedProduct,
    focusedProductIndex: pageState.focusedProductIndex,
    setFocusedProductIndex: pageState.setFocusedProductIndex,
    productListRef: pageState.productListRef,
  })

  const actions = useProductsActions({
    navigate,
    products,
    productFilters: appliedFilters,
    selectedProduct,
    deleteProduct,
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setProductToDelete: pageState.setProductToDelete,
    setExportMenuAnchor: pageState.setExportMenuAnchor,
    setIsExporting: pageState.setIsExporting,
    dispatchSetSelectedProduct: (product) => dispatch(setSelectedProduct(product)),
  })

  useKeyboardShortcuts({
    onSearch: () => {
      pageState.searchInputRef.current?.focus()
      pageState.searchInputRef.current?.select()
    },
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and inventory"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedProductsDialogOpen(true) }}
        primaryAction={{ label: 'Add Product', onClick: actions.handleAddProduct }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        )}
      />

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <ProductList
            products={products}
            loading={isProductsFetching}
            selectedProductId={selectedProduct?.id}
            focusedIndex={pageState.focusedProductIndex}
            onSelect={selection.handleProductSelect}
            productListRef={pageState.productListRef}
          />
        )}
        headerSlot={(
          <ProductContextHeader
            selectedProduct={selectedProduct}
            onEdit={actions.handleEditProduct}
            onDelete={actions.handleDeleteProduct}
          />
        )}
        workspaceSlot={<ProductWorkspaceCard selectedProduct={selectedProduct} />}
      />

      <ProductsDialogs
        exportMenuAnchor={pageState.exportMenuAnchor}
        isExporting={pageState.isExporting}
        products={products}
        productFilters={{
          search: appliedFilters.search,
        }}
        calculatorPanelOpen={pageState.calculatorPanelOpen}
        deletedProductsDialogOpen={pageState.deletedProductsDialogOpen}
        importDialogOpen={pageState.importDialogOpen}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        productToDelete={pageState.productToDelete}
        onCloseExportMenu={actions.handleExportClose}
        onExport={actions.handleExport}
        onCloseCalculator={() => pageState.setCalculatorPanelOpen(false)}
        onCloseDeletedProductsDialog={() => pageState.setDeletedProductsDialogOpen(false)}
        onCloseImportDialog={() => pageState.setImportDialogOpen(false)}
        onImportSuccess={() => { void refetchProducts() }}
        onConfirmDelete={() => void actions.handleConfirmDelete(pageState.productToDelete)}
        onCancelDelete={actions.handleCancelDelete}
      />
    </Box>
  )
}

export default ProductsPage
```

- [ ] **Step 2: Update `ProductsPage.filterbar.test.tsx`**

Replace the mock section at the top of `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx` — update the three component mocks:

```typescript
vi.mock('../components/ProductList', () => ({ default: () => <div>ProductList</div> }))
vi.mock('../components/ProductContextHeader', () => ({ default: () => <div>ProductContextHeader</div> }))
vi.mock('../components/ProductWorkspaceCard', () => ({ default: () => <div>ProductWorkspaceCard</div> }))
```

Remove these old mocks:
```typescript
// DELETE these three lines:
vi.mock('../components/ProductsTable', () => ({ default: () => <div>ProductsTable</div> }))
vi.mock('../components/ProductDetailsPanel', () => ({ default: () => <div>ProductDetailsPanel</div> }))
```

Also add `useTheme` and `useMediaQuery` to the mock setup if they're not already available — add this mock alongside the other hook mocks:

```typescript
vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mui/material')>()
  return {
    ...actual,
    useMediaQuery: vi.fn(() => false),
  }
})
```

- [ ] **Step 3: Delete old files**

```bash
git rm frontend/src/pages/inventory/components/ProductsTable.tsx
git rm frontend/src/pages/inventory/components/ProductDetailsPanel.tsx
```

- [ ] **Step 4: Run filterbar tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i error | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git add frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
git commit -m "refactor(inventory): rewrite ProductsPage with MasterDetailWorkspace pattern

Closes #340"
```

---

## Manual Verification Checklist

After all tasks are complete:

- [ ] `docker compose up -d` (or `cd frontend && npm run dev`)
- [ ] Navigate to `/inventory/products`
- [ ] Product list appears on the left (25% width), detail panel on the right
- [ ] Selecting a product shows its name in the context header with Edit/Delete buttons
- [ ] Details tab shows product fields
- [ ] Movement History tab loads movement data
- [ ] Order History tab loads order data
- [ ] Switching products resets to the Details tab
- [ ] Category, Product Type, Stock Status filters work
- [ ] Keyboard: Up/Down navigates the list
- [ ] Keyboard: PageUp/PageDown jumps 10 items
- [ ] Keyboard: Home/End jumps to first/last
- [ ] Keyboard: Enter navigates to edit page
- [ ] Keyboard: Escape clears selection
- [ ] Save a product edit → returns to `/inventory/products` with that product selected
- [ ] Mobile viewport: list and panels stack vertically
