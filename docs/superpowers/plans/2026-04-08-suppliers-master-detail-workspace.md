# Suppliers MasterDetailWorkspace Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `SuppliersPage.tsx` from a flat Table+Dialog pattern to the `MasterDetailWorkspace` layout, matching `CustomersPage.tsx`, with new backend per-supplier history endpoints.

**Architecture:** Mirror the `CustomersPage` pattern exactly — extract hooks (`useSuppliersPageState`, `useSuppliersSelection`, `useSuppliersActions`), sub-components (`SupplierList`, `SupplierContextHeader`, `SupplierWorkspaceCard`, `SuppliersDialogs`), and a standalone `SupplierFormPage` route. Add `selectedSupplier` to `purchasingSlice`. Backend adds three read-only service/controller methods using already-registered TypeORM repositories in `PurchasingModule`.

**Tech Stack:** NestJS 11, TypeORM, React 19, RTK Query, Material-UI v7, React Router, Redux Toolkit, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-suppliers-master-detail-workspace-design.md`

---

## File Map

### Backend — modified
- `backend/src/modules/purchasing/services/supplier.service.ts` — add 3 new methods: `getSupplierPurchaseOrders`, `getSupplierGRNs`, `getSupplierPayments`
- `backend/src/modules/purchasing/controllers/supplier.controller.ts` — add 3 new `@Get(':id/purchase-orders|grns|payments')` routes

### Frontend — modified
- `frontend/src/types/index.ts` — add `isActive`, address fields to `Supplier` interface
- `frontend/src/store/slices/purchasingSlice.ts` — add `selectedSupplier` state + action + selector
- `frontend/src/store/api/purchasingApi.ts` — add 3 new query endpoints + export hooks
- `frontend/src/router.tsx` — add create/edit routes for `SupplierFormPage`
- `frontend/src/pages/purchasing/SuppliersPage.tsx` — gutted to ~100 lines using new components

### Frontend — created
- `frontend/src/pages/purchasing/SupplierFormPage.tsx`
- `frontend/src/pages/purchasing/components/SupplierList.tsx`
- `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`
- `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`
- `frontend/src/pages/purchasing/components/SuppliersDialogs.tsx`
- `frontend/src/pages/purchasing/hooks/useSuppliersPageState.ts`
- `frontend/src/pages/purchasing/hooks/useSuppliersSelection.ts`
- `frontend/src/pages/purchasing/hooks/useSuppliersActions.ts`
- `frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx`
- `frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx`

---

## Task 1: Fix Supplier Type + Redux State

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/slices/purchasingSlice.ts`

- [ ] **Step 1: Add missing fields to Supplier interface**

In `frontend/src/types/index.ts`, find the `Supplier` interface and add the missing fields:

```ts
export interface Supplier {
  id: string;
  type: SupplierType;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  isActive: boolean;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  // Metrics
  totalPurchases: number;
  totalOrders: number;
  lastPurchaseDate?: Date;
  firstPurchaseDate?: Date;
  // Additional
  notes?: string;
  // Computed
  averageOrderValue?: number;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

- [ ] **Step 2: Add selectedSupplier to purchasingSlice**

In `frontend/src/store/slices/purchasingSlice.ts`:

Add `selectedSupplier: Supplier | null` to the import — add `Supplier` to the existing type import from `@/types`:
```ts
import type { GoodsReceivedNote, PurchaseOrder, Supplier, SupplierType, VendorPayment } from '@/types'
```

Add to `PurchasingState`:
```ts
interface PurchasingState {
  selectedPurchaseOrder: PurchaseOrder | null
  selectedGRN: GoodsReceivedNote | null
  selectedVendorPayment: VendorPayment | null
  selectedSupplier: Supplier | null
  supplierFilters: {
    search?: string
    type?: SupplierType
    status?: string
    sortBy?: string
    sortOrder?: 'ASC' | 'DESC'
    isActive?: boolean
  }
}
```

Add to `initialState`:
```ts
selectedSupplier: null,
```

Add to `reducers`:
```ts
setSelectedSupplier: (state, action: PayloadAction<Supplier | null>) => {
  state.selectedSupplier = action.payload
},
```

Add to exports:
```ts
export const {
  setSelectedPurchaseOrder,
  setSelectedGRN,
  setSelectedVendorPayment,
  setSelectedSupplier,
  updatePurchaseOrderInPlace,
  setSupplierFilters,
} = purchasingSlice.actions
```

Add selector after existing selectors:
```ts
export const selectSelectedSupplier = (state: RootState) => state.purchasing.selectedSupplier
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error\|supplier" | head -20
```

Expected: no new errors related to Supplier or purchasingSlice.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/store/slices/purchasingSlice.ts
git commit -m "feat(purchasing): add Supplier address fields, isActive, selectedSupplier state"
```

---

## Task 2: Backend — Per-Supplier History Endpoints

**Files:**
- Modify: `backend/src/modules/purchasing/services/supplier.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/supplier.controller.ts`

- [ ] **Step 1: Inject PurchaseOrder, GRN, VendorPayment repos in SupplierService**

In `supplier.service.ts`, update the constructor to inject the three repositories. First add the entity imports:

```ts
import {
  Supplier,
  SupplierType,
} from '../../../database/entities/supplier.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../../database/entities/goods-received-note.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
```

Update the constructor:
```ts
constructor(
  @InjectRepository(Supplier)
  private readonly supplierRepository: Repository<Supplier>,
  @InjectRepository(PurchaseOrder)
  private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
  @InjectRepository(GoodsReceivedNote)
  private readonly grnRepository: Repository<GoodsReceivedNote>,
  @InjectRepository(VendorPayment)
  private readonly vendorPaymentRepository: Repository<VendorPayment>,
  private readonly auditLogService: AuditLogService,
) {}
```

All three repos are already registered in `TypeOrmModule.forFeature([...])` in `purchasing.module.ts` — no module changes needed.

- [ ] **Step 2: Add service methods**

Add these three methods to `SupplierService` (before the closing brace of the class):

```ts
async getSupplierPurchaseOrders(supplierId: string): Promise<{ data: PurchaseOrder[]; total: number }> {
  const [data, total] = await this.purchaseOrderRepository.findAndCount({
    where: { supplierId },
    order: { orderDate: 'DESC' },
    take: 50,
  });
  return { data, total };
}

async getSupplierGRNs(supplierId: string): Promise<{ data: GoodsReceivedNote[]; total: number }> {
  const [data, total] = await this.grnRepository.findAndCount({
    where: { supplierId },
    relations: ['purchaseOrder'],
    order: { receivedDate: 'DESC' },
    take: 50,
  });
  return { data, total };
}

async getSupplierPayments(supplierId: string): Promise<{ data: VendorPayment[]; total: number }> {
  const [data, total] = await this.vendorPaymentRepository.findAndCount({
    where: { supplierId },
    relations: ['paymentMethodEntity'],
    order: { paymentDate: 'DESC' },
    take: 50,
  });
  return { data, total };
}
```

- [ ] **Step 3: Add controller routes**

In `supplier.controller.ts`, add these three GET endpoints. They must be placed **before** the existing `@Get(':id')` route to avoid NestJS treating the literal strings as UUIDs:

```ts
@Get(':id/purchase-orders')
@ApiOperation({ summary: 'Get purchase orders for a supplier' })
@ApiResponse({ status: 200, description: 'Purchase orders retrieved successfully' })
async getSupplierPurchaseOrders(
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ data: any[]; total: number }> {
  return this.supplierService.getSupplierPurchaseOrders(id);
}

@Get(':id/grns')
@ApiOperation({ summary: 'Get goods received notes for a supplier' })
@ApiResponse({ status: 200, description: 'GRNs retrieved successfully' })
async getSupplierGRNs(
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ data: any[]; total: number }> {
  return this.supplierService.getSupplierGRNs(id);
}

@Get(':id/payments')
@ApiOperation({ summary: 'Get vendor payments for a supplier' })
@ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
async getSupplierPayments(
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ data: any[]; total: number }> {
  return this.supplierService.getSupplierPayments(id);
}
```

- [ ] **Step 4: Build backend**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/purchasing/services/supplier.service.ts \
        backend/src/modules/purchasing/controllers/supplier.controller.ts
git commit -m "feat(purchasing): add per-supplier purchase orders, GRNs, payments endpoints"
```

---

## Task 3: RTK Query — Three New Endpoints

**Files:**
- Modify: `frontend/src/store/api/purchasingApi.ts`

- [ ] **Step 1: Add the three query endpoints**

In `purchasingApi.ts`, inside the `endpoints: (builder) => ({...})` block, add after the `getDeletedSuppliers` endpoint:

```ts
getSupplierPurchaseOrders: builder.query<{ data: PurchaseOrder[]; total: number }, string>({
  query: (id) => ({ url: `/purchasing/suppliers/${id}/purchase-orders` }),
  providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
}),
getSupplierGRNs: builder.query<{ data: GoodsReceivedNote[]; total: number }, string>({
  query: (id) => ({ url: `/purchasing/suppliers/${id}/grns` }),
  providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
}),
getSupplierPayments: builder.query<{ data: VendorPayment[]; total: number }, string>({
  query: (id) => ({ url: `/purchasing/suppliers/${id}/payments` }),
  providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
}),
```

- [ ] **Step 2: Export the generated hooks**

In the destructured export at the bottom of `purchasingApi.ts`, add:

```ts
export const {
  // ...existing exports...
  useGetSupplierPurchaseOrdersQuery,
  useGetSupplierGRNsQuery,
  useGetSupplierPaymentsQuery,
} = purchasingApiSlice
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "purchasingApi\|error" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/api/purchasingApi.ts
git commit -m "feat(purchasing): add RTK Query hooks for supplier history endpoints"
```

---

## Task 4: Hooks — useSuppliersPageState, useSuppliersActions, useSuppliersSelection

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useSuppliersPageState.ts`
- Create: `frontend/src/pages/purchasing/hooks/useSuppliersActions.ts`
- Create: `frontend/src/pages/purchasing/hooks/useSuppliersSelection.ts`

- [ ] **Step 1: Create useSuppliersPageState**

```bash
mkdir -p frontend/src/pages/purchasing/hooks
```

Create `frontend/src/pages/purchasing/hooks/useSuppliersPageState.ts`:

```ts
import { useRef, useState } from 'react'

export function useSuppliersPageState() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedSuppliersDialogOpen, setDeletedSuppliersDialogOpen] = useState(false)
  const [focusedSupplierIndex, setFocusedSupplierIndex] = useState(-1)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)

  const supplierListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedSuppliersDialogOpen,
    setDeletedSuppliersDialogOpen,
    focusedSupplierIndex,
    setFocusedSupplierIndex,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    supplierListRef,
    searchInputRef,
  }
}
```

- [ ] **Step 2: Create useSuppliersActions**

Create `frontend/src/pages/purchasing/hooks/useSuppliersActions.ts`:

```ts
import { useCallback } from 'react'

import type { AppDispatch } from '@/store'
import { useDeleteSupplierMutation } from '@/store/api/purchasingApi'
import { setSelectedSupplier } from '@/store/slices/purchasingSlice'
import type { Supplier } from '@/types'

interface UseSuppliersActionsParams {
  dispatch: AppDispatch
  selectedSupplier: Supplier | null
  refetchSuppliers: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setPageError: (error: string | null) => void
}

export function useSuppliersActions({
  dispatch,
  selectedSupplier,
  refetchSuppliers,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setPageError,
}: UseSuppliersActionsParams) {
  const [deleteSupplier] = useDeleteSupplierMutation()

  const handleDelete = useCallback(async () => {
    if (!selectedSupplier) return

    try {
      await deleteSupplier(selectedSupplier.id).unwrap()
      showSuccess(`Supplier "${selectedSupplier.companyName}" deleted successfully`)
      dispatch(setSelectedSupplier(null))
      setDeleteConfirmOpen(false)
      setPageError(null)
      refetchSuppliers()
    } catch (error: any) {
      const actualError = error?.payload || error
      const backendError = actualError?.response?.data
      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (backendError?.message) {
        errorMessage = backendError.message
        if (backendError.suggestions?.length > 0) {
          errorMessage += `\n\nSuggestion: ${backendError.suggestions[0]}`
        }
      } else if (actualError?.message && actualError.message !== 'Request failed with status code 400') {
        errorMessage = actualError.message
      }

      setPageError(errorMessage)
      showError(errorMessage)
    }
  }, [deleteSupplier, dispatch, refetchSuppliers, selectedSupplier, setDeleteConfirmOpen, setPageError, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [setDeleteConfirmOpen])

  return {
    handleDelete,
    handleCancelDelete,
  }
}
```

- [ ] **Step 3: Create useSuppliersSelection**

Create `frontend/src/pages/purchasing/hooks/useSuppliersSelection.ts`:

```ts
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { setSelectedSupplier } from '@/store/slices/purchasingSlice'
import type { Supplier } from '@/types'

interface UseSuppliersSelectionParams {
  dispatch: AppDispatch
  suppliers: Supplier[]
  selectedSupplier: Supplier | null
  focusedSupplierIndex: number
  setFocusedSupplierIndex: (index: number) => void
  navigate: NavigateFunction
  supplierListRef: RefObject<HTMLDivElement | null>
  setDeleteConfirmOpen: (open: boolean) => void
  setDeletedSuppliersDialogOpen: (open: boolean) => void
}

export function useSuppliersSelection({
  dispatch,
  suppliers,
  selectedSupplier,
  focusedSupplierIndex,
  setFocusedSupplierIndex,
  navigate,
  supplierListRef,
  setDeleteConfirmOpen,
  setDeletedSuppliersDialogOpen,
}: UseSuppliersSelectionParams) {
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    if (suppliers.length > 0 && !hasAutoSelected.current && focusedSupplierIndex === -1 && !selectedSupplier) {
      hasAutoSelected.current = true
      setFocusedSupplierIndex(0)
      dispatch(setSelectedSupplier(suppliers[0]))
    } else if (suppliers.length === 0) {
      dispatch(setSelectedSupplier(null))
      setFocusedSupplierIndex(-1)
    }
  }, [suppliers, dispatch, focusedSupplierIndex, selectedSupplier, setFocusedSupplierIndex])

  useEffect(() => {
    if (focusedSupplierIndex >= 0 && supplierListRef.current) {
      const focusedRow = supplierListRef.current.querySelector(`[data-supplier-index="${focusedSupplierIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedSupplierIndex, supplierListRef])

  const handleSupplierSelect = useCallback((supplier: Supplier) => {
    const index = suppliers.findIndex((s) => s.id === supplier.id)
    setFocusedSupplierIndex(index)
    dispatch(setSelectedSupplier(supplier))
  }, [suppliers, dispatch, setFocusedSupplierIndex])

  const selectAtIndex = useCallback((index: number) => {
    setFocusedSupplierIndex(index)
    dispatch(setSelectedSupplier(suppliers[index]))
  }, [suppliers, dispatch, setFocusedSupplierIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedSupplierIndex > 0) selectAtIndex(focusedSupplierIndex - 1)
  }, [focusedSupplierIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedSupplierIndex < suppliers.length - 1) selectAtIndex(focusedSupplierIndex + 1)
  }, [focusedSupplierIndex, suppliers.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (suppliers.length > 0) selectAtIndex(0)
  }, [suppliers.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (suppliers.length > 0) selectAtIndex(suppliers.length - 1)
  }, [suppliers.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedSupplierIndex - 20)
    if (suppliers[newIndex]) selectAtIndex(newIndex)
  }, [focusedSupplierIndex, suppliers, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(suppliers.length - 1, focusedSupplierIndex + 20)
    if (suppliers[newIndex]) selectAtIndex(newIndex)
  }, [focusedSupplierIndex, suppliers, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedSupplierIndex >= 0 && suppliers[focusedSupplierIndex]) {
      navigate(`/purchasing/suppliers/${suppliers[focusedSupplierIndex].id}/edit`)
    }
  }, [focusedSupplierIndex, suppliers, navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedSupplierIndex(-1)
    dispatch(setSelectedSupplier(null))
    setDeleteConfirmOpen(false)
    setDeletedSuppliersDialogOpen(false)
  }, [dispatch, setDeleteConfirmOpen, setDeletedSuppliersDialogOpen, setFocusedSupplierIndex])

  return {
    handleSupplierSelect,
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

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "purchasing/hooks\|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/
git commit -m "feat(purchasing): add useSuppliersPageState, useSuppliersActions, useSuppliersSelection hooks"
```

---

## Task 5: SupplierList Component

**Files:**
- Create: `frontend/src/pages/purchasing/components/SupplierList.tsx`

- [ ] **Step 1: Create SupplierList**

```bash
mkdir -p frontend/src/pages/purchasing/components/__tests__
```

Create `frontend/src/pages/purchasing/components/SupplierList.tsx`:

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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Supplier } from '@/types'

interface SupplierRowProps {
  supplier: Supplier
  index: number
  selectedSupplierId: string | undefined
  focusedIndex: number
  onSelect: (supplier: Supplier) => void
}

const SupplierRow = memo(({ supplier, index, selectedSupplierId, focusedIndex, onSelect }: SupplierRowProps) => {
  const isSelected = selectedSupplierId === supplier.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(supplier)}
      data-supplier-index={index}
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
          {supplier.companyName}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

SupplierRow.displayName = 'SupplierRow'

interface SupplierListProps {
  suppliers: Supplier[]
  loading: boolean
  total: number
  selectedSupplierId: string | undefined
  focusedIndex: number
  onSelect: (supplier: Supplier) => void
  supplierListRef: React.RefObject<HTMLDivElement | null>
}

const SupplierList: React.FC<SupplierListProps> = ({
  suppliers,
  loading,
  total,
  selectedSupplierId,
  focusedIndex,
  onSelect,
  supplierListRef,
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
            Suppliers ({total})
          </Typography>
          {loading && suppliers.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={supplierListRef}>
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
              {loading && suppliers.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : suppliers.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            No suppliers found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : suppliers.map((supplier, index) => (
                      <SupplierRow
                        key={supplier.id}
                        supplier={supplier}
                        index={index}
                        selectedSupplierId={selectedSupplierId}
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

export default SupplierList
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "SupplierList\|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/SupplierList.tsx
git commit -m "feat(purchasing): add SupplierList component"
```

---

## Task 6: SupplierContextHeader Component + Tests

**Files:**
- Create: `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`
- Create: `frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx`

- [ ] **Step 1: Write failing tests first**

Create `frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SupplierContextHeader from '../SupplierContextHeader'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'

const mockSupplier: Supplier = {
  id: 'sup-1',
  companyName: 'Acme Corp',
  type: SupplierType.LOCAL,
  isActive: true,
  contactPerson: 'Jane Doe',
  phone: '555-1234',
  streetAddress: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
  country: 'USA',
  totalPurchases: 50000,
  totalOrders: 10,
  averageOrderValue: 5000,
  lastPurchaseDate: new Date('2026-01-15'),
  firstPurchaseDate: new Date('2025-01-01'),
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('SupplierContextHeader', () => {
  it('shows empty state when no supplier selected', () => {
    render(<SupplierContextHeader selectedSupplier={null} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Select a supplier to view details')).toBeInTheDocument()
  })

  it('renders supplier company name in header', () => {
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/Supplier - Acme Corp/i)).toBeInTheDocument()
  })

  it('renders contact information', () => {
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('555-1234')).toBeInTheDocument()
  })

  it('calls onEdit when edit button clicked', async () => {
    const onEdit = vi.fn()
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={onEdit} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByTitle('Edit Supplier'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn()
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByTitle('Delete Supplier'))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```

Expected: FAIL — `SupplierContextHeader` does not exist yet.

- [ ] **Step 3: Create SupplierContextHeader**

Create `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`:

```tsx
import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/GridLegacy'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface SupplierContextHeaderProps {
  selectedSupplier: Supplier | null
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

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const SupplierContextHeader: React.FC<SupplierContextHeaderProps> = ({
  selectedSupplier,
  onEdit,
  onDelete,
}) => {
  if (!selectedSupplier) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          Select a supplier to view details
        </Typography>
      </Paper>
    )
  }

  const addressParts = [
    selectedSupplier.streetAddress,
    selectedSupplier.city,
    selectedSupplier.state,
    selectedSupplier.postalCode,
    selectedSupplier.country,
  ].filter(Boolean)

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
          Supplier - {selectedSupplier.companyName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title="Edit Supplier"
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title="Delete Supplier"
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Supplier Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedSupplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={{ ...valueCellSx, color: selectedSupplier.isActive ? 'success.main' : 'text.disabled' }}>
                      {selectedSupplier.isActive ? 'Active' : 'Inactive'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Contact</TableCell>
                    <TableCell sx={valueCellSx}>{selectedSupplier.contactPerson || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Phone</TableCell>
                    <TableCell sx={valueCellSx}>{selectedSupplier.phone || '—'}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Address</TableCell>
                    <TableCell sx={valueCellSx}>
                      {addressParts.length > 0 ? addressParts.join(', ') : '—'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Purchase Statistics
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Orders</TableCell>
                    <TableCell sx={valueCellSx}>{selectedSupplier.totalOrders ?? 0}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Total Purchases</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedSupplier.totalPurchases ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Avg Order Value</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedSupplier.averageOrderValue ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>First Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedSupplier.firstPurchaseDate ? formatDate(selectedSupplier.firstPurchaseDate) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Last Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedSupplier.lastPurchaseDate ? formatDate(selectedSupplier.lastPurchaseDate) : '—'}
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

export default SupplierContextHeader
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/components/SupplierContextHeader.tsx \
        frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
git commit -m "feat(purchasing): add SupplierContextHeader component with tests"
```

---

## Task 7: SupplierWorkspaceCard Component + Tests

**Files:**
- Create: `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`
- Create: `frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx`

- [ ] **Step 1: Write failing tests first**

Create `frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SupplierWorkspaceCard from '../SupplierWorkspaceCard'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'

// Mock the RTK query hooks
vi.mock('@/store/api/purchasingApi', () => ({
  useGetSupplierPurchaseOrdersQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGetSupplierGRNsQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGetSupplierPaymentsQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}))

const mockSupplier: Supplier = {
  id: 'sup-1',
  companyName: 'Acme Corp',
  type: SupplierType.LOCAL,
  isActive: true,
  totalPurchases: 0,
  totalOrders: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('SupplierWorkspaceCard', () => {
  it('renders empty Paper when no supplier selected', () => {
    const { container } = render(
      <MemoryRouter><SupplierWorkspaceCard selectedSupplier={null} /></MemoryRouter>
    )
    expect(container.querySelector('.MuiPaper-root')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('renders three tabs when supplier selected', () => {
    render(
      <MemoryRouter><SupplierWorkspaceCard selectedSupplier={mockSupplier} /></MemoryRouter>
    )
    expect(screen.getByRole('tab', { name: /purchase orders/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /grns/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument()
  })

  it('shows empty state when no purchase orders', async () => {
    render(
      <MemoryRouter><SupplierWorkspaceCard selectedSupplier={mockSupplier} /></MemoryRouter>
    )
    expect(screen.getByText(/no purchase orders found/i)).toBeInTheDocument()
  })

  it('switches to GRNs tab on click', async () => {
    render(
      <MemoryRouter><SupplierWorkspaceCard selectedSupplier={mockSupplier} /></MemoryRouter>
    )
    await userEvent.click(screen.getByRole('tab', { name: /grns/i }))
    expect(screen.getByText(/no grns found/i)).toBeInTheDocument()
  })

  it('switches to Payments tab on click', async () => {
    render(
      <MemoryRouter><SupplierWorkspaceCard selectedSupplier={mockSupplier} /></MemoryRouter>
    )
    await userEvent.click(screen.getByRole('tab', { name: /payments/i }))
    expect(screen.getByText(/no payments found/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx
```

Expected: FAIL — `SupplierWorkspaceCard` does not exist yet.

- [ ] **Step 3: Create SupplierWorkspaceCard**

Create `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`:

```tsx
import React, { useState } from 'react'
import {
  Box,
  CircularProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import {
  LocalShipping as GRNIcon,
  Payment as PaymentIcon,
  ShoppingCart as OrdersIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import {
  useGetSupplierGRNsQuery,
  useGetSupplierPaymentsQuery,
  useGetSupplierPurchaseOrdersQuery,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      sx={{
        flex: 1,
        overflow: 'auto',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {value === index && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}

interface SupplierWorkspaceCardProps {
  selectedSupplier: Supplier | null
}

const SupplierWorkspaceCard: React.FC<SupplierWorkspaceCardProps> = ({ selectedSupplier }) => {
  const navigate = useNavigate()
  const [tabValue, setTabValue] = useState(0)

  const supplierId = selectedSupplier?.id ?? ''

  const { data: posData, isLoading: posLoading } = useGetSupplierPurchaseOrdersQuery(supplierId, {
    skip: !supplierId || tabValue !== 0,
  })
  const { data: grnsData, isLoading: grnsLoading } = useGetSupplierGRNsQuery(supplierId, {
    skip: !supplierId || tabValue !== 1,
  })
  const { data: paymentsData, isLoading: paymentsLoading } = useGetSupplierPaymentsQuery(supplierId, {
    skip: !supplierId || tabValue !== 2,
  })

  const purchaseOrders = posData?.data ?? []
  const grns = grnsData?.data ?? []
  const payments = paymentsData?.data ?? []

  if (!selectedSupplier) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
          <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Purchase Orders" />
          <Tab icon={<GRNIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="GRNs" />
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" />
        </Tabs>
      </Box>

      {/* Purchase Orders Tab */}
      <TabPanel value={tabValue} index={0}>
        {posLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : purchaseOrders.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No purchase orders found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>Order #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {purchaseOrders.map((po) => (
                  <TableRow
                    key={po.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/purchasing/orders/${po.id}/edit`)}
                  >
                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {po.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(po.orderDate)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {po.receivedDate ? 'Received' : po.paidAmount ? 'Paid' : 'Pending'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(po.total ?? po.totalAmount ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* GRNs Tab */}
      <TabPanel value={tabValue} index={1}>
        {grnsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : grns.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No GRNs found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>GRN #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>PO #</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grns.map((grn) => (
                  <TableRow
                    key={grn.id}
                    hover
                    sx={{ cursor: grn.purchaseOrder?.id ? 'pointer' : 'default' }}
                    onClick={() => grn.purchaseOrder?.id && navigate(`/purchasing/orders/${grn.purchaseOrder.id}/edit`)}
                  >
                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {grn.grnNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(grn.receivedDate)}</TableCell>
                    <TableCell>{grn.purchaseOrder?.orderNumber ?? '—'}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: grn.status === 'received' ? 'success.main' : 'text.secondary' }}
                      >
                        {grn.status === 'received' ? 'Received' : 'Draft'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Payments Tab */}
      <TabPanel value={tabValue} index={2}>
        {paymentsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : payments.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No payments found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>Payment #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {payment.paymentNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.paymentMethodEntity?.name ?? '—'}</TableCell>
                    <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>
    </Paper>
  )
}

export default SupplierWorkspaceCard
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx \
        frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx
git commit -m "feat(purchasing): add SupplierWorkspaceCard with PO/GRN/Payments tabs and tests"
```

---

## Task 8: SuppliersDialogs Component

**Files:**
- Create: `frontend/src/pages/purchasing/components/SuppliersDialogs.tsx`

- [ ] **Step 1: Create SuppliersDialogs**

Create `frontend/src/pages/purchasing/components/SuppliersDialogs.tsx`:

```tsx
import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedSuppliersDialog from '@/components/purchasing/DeletedSuppliersDialog'
import type { Supplier } from '@/types'

interface SuppliersDialogsProps {
  selectedSupplier: Supplier | null
  deleteConfirmOpen: boolean
  onConfirmDelete: () => Promise<void> | void
  onCancelDelete: () => void
  deletedSuppliersDialogOpen: boolean
  onCloseDeletedSuppliersDialog: () => void
}

const SuppliersDialogs: React.FC<SuppliersDialogsProps> = ({
  selectedSupplier,
  deleteConfirmOpen,
  onConfirmDelete,
  onCancelDelete,
  deletedSuppliersDialogOpen,
  onCloseDeletedSuppliersDialog,
}) => {
  return (
    <>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedSupplier?.companyName}"? This will move it to deleted items.`}
        confirmText="Delete Supplier"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <DeletedSuppliersDialog
        open={deletedSuppliersDialogOpen}
        onClose={onCloseDeletedSuppliersDialog}
      />
    </>
  )
}

export default SuppliersDialogs
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "SuppliersDialogs\|error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/SuppliersDialogs.tsx
git commit -m "feat(purchasing): add SuppliersDialogs component"
```

---

## Task 9: SupplierFormPage

**Files:**
- Create: `frontend/src/pages/purchasing/SupplierFormPage.tsx`

- [ ] **Step 1: Create SupplierFormPage**

Create `frontend/src/pages/purchasing/SupplierFormPage.tsx`:

```tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Paper,
  Alert,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useLazyCheckDuplicateCompanyNameQuery,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import api from '@/services/api'

const supplierSchema = yup.object({
  companyName: yup.string().required('Company name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['local', 'international']).required('Type is required'),
  contactPerson: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(200, 'Name must be less than 200 characters'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface SupplierFormData {
  companyName: string
  type: SupplierType
  contactPerson?: string | null
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  notes?: string | null
}

const SupplierFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loadingSupplier, setLoadingSupplier] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [companyNameError, setCompanyNameError] = useState<string | null>(null)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)

  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation()
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const [checkDuplicateCompanyName] = useLazyCheckDuplicateCompanyNameQuery()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<SupplierFormData>({
    resolver: yupResolver(supplierSchema) as any,
    defaultValues: {
      companyName: '',
      type: SupplierType.LOCAL,
      contactPerson: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    },
  })

  const companyName = watch('companyName')

  useEffect(() => {
    if (!id) return
    setLoadingSupplier(true)
    api.get(`/purchasing/suppliers/${id}`)
      .then((res) => {
        const s: Supplier = res.data?.data ?? res.data
        setSupplier(s)
        reset({
          companyName: s.companyName,
          type: s.type,
          contactPerson: s.contactPerson || null,
          phone: s.phone || null,
          streetAddress: s.streetAddress || null,
          city: s.city || null,
          state: s.state || null,
          postalCode: s.postalCode || null,
          country: s.country || null,
          notes: s.notes || null,
        })
      })
      .catch(() => setLoadError('Supplier not found.'))
      .finally(() => setLoadingSupplier(false))
  }, [id, reset])

  useEffect(() => {
    if (supplier && companyName === supplier.companyName) {
      setCompanyNameError(null)
      return
    }
    const check = async () => {
      if (!companyName || companyName.trim().length < 2) {
        setCompanyNameError(null)
        return
      }
      setIsCheckingDuplicate(true)
      try {
        const result = await checkDuplicateCompanyName({
          companyName: companyName.trim(),
          excludeId: supplier?.id,
        }).unwrap()
        setCompanyNameError(result?.exists ? (result.message || 'This company name already exists') : null)
      } catch {
        setCompanyNameError(null)
      } finally {
        setIsCheckingDuplicate(false)
      }
    }
    const timer = setTimeout(check, 500)
    return () => clearTimeout(timer)
  }, [companyName, supplier, checkDuplicateCompanyName])

  const handleFormSubmit = async (data: SupplierFormData) => {
    if (companyNameError) {
      showError(companyNameError)
      return
    }
    try {
      if (isEdit && id) {
        await updateSupplier({ id, data }).unwrap()
        showSuccess('Supplier updated successfully')
      } else {
        await createSupplier(data).unwrap()
        showSuccess('Supplier created successfully')
      }
      navigate('/purchasing/suppliers')
    } catch (error: any) {
      showError(`Failed to ${isEdit ? 'update' : 'create'} supplier: ${error?.message ?? error}`)
    }
  }

  if (loadingSupplier) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError) {
    return <Alert severity="error">{loadError}</Alert>
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Supplier' : 'New Supplier'}
        subtitle={isEdit ? `Editing ${supplier?.companyName ?? ''}` : 'Add a new supplier to your account'}
        variant="standard"
      />
      <Paper sx={{ p: 3, maxWidth: 800 }}>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Typography variant="h6" gutterBottom>Basic Information</Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.type}>
                    <InputLabel>Supplier Type</InputLabel>
                    <Select {...field} label="Supplier Type">
                      <MenuItem value={SupplierType.LOCAL}>Local</MenuItem>
                      <MenuItem value={SupplierType.INTERNATIONAL}>International</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="companyName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Company Name"
                    error={!!errors.companyName || !!companyNameError}
                    helperText={errors.companyName?.message || companyNameError || (isCheckingDuplicate ? 'Checking availability...' : '')}
                    InputProps={{
                      endAdornment: isCheckingDuplicate ? <CircularProgress size={20} /> : null,
                    }}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="contactPerson"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Contact Person"
                    error={!!errors.contactPerson} helperText={errors.contactPerson?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Phone"
                    error={!!errors.phone} helperText={errors.phone?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Address Information</Typography>
            </Grid>

            <Grid size={12}>
              <Controller
                name="streetAddress"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Street Address"
                    error={!!errors.streetAddress} helperText={errors.streetAddress?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="city"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="City"
                    error={!!errors.city} helperText={errors.city?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="state"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="State"
                    error={!!errors.state} helperText={errors.state?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="postalCode"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Postal Code"
                    error={!!errors.postalCode} helperText={errors.postalCode?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Country"
                    error={!!errors.country} helperText={errors.country?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth multiline rows={3}
                    label="Notes" error={!!errors.notes} helperText={errors.notes?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 1 }}>
                <Button onClick={() => navigate('/purchasing/suppliers')}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSaving || isCheckingDuplicate || !!companyNameError}
                >
                  {isSaving ? <CircularProgress size={20} /> : (isEdit ? 'Update' : 'Create')}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </>
  )
}

export default SupplierFormPage
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "SupplierFormPage\|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/SupplierFormPage.tsx
git commit -m "feat(purchasing): add SupplierFormPage route component"
```

---

## Task 10: Refactor SuppliersPage + Update Router

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Update router with new routes**

In `frontend/src/router.tsx`, add the lazy import for `SupplierFormPage` alongside the existing `SuppliersPage` import:

```ts
const SupplierFormPage = React.lazy(() => import('./pages/purchasing/SupplierFormPage'))
```

Then in the routes array, add the two new routes **before** the existing `/purchasing/suppliers` route:

```ts
{ path: '/purchasing/suppliers/create', element: <SupplierFormPage />, handle: { title: 'New Supplier' } },
{ path: '/purchasing/suppliers/:id/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
{ path: '/purchasing/suppliers', element: <SuppliersPage />, handle: { title: 'Suppliers' } },
```

- [ ] **Step 2: Rewrite SuppliersPage**

Replace the entire content of `frontend/src/pages/purchasing/SuppliersPage.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
import { selectSelectedSupplier } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'
import SupplierContextHeader from './components/SupplierContextHeader'
import SuppliersDialogs from './components/SuppliersDialogs'
import SupplierList from './components/SupplierList'
import SupplierWorkspaceCard from './components/SupplierWorkspaceCard'
import { useSuppliersActions } from './hooks/useSuppliersActions'
import { useSuppliersPageState } from './hooks/useSuppliersPageState'
import { useSuppliersSelection } from './hooks/useSuppliersSelection'

interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
}

const SuppliersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedSupplier = useAppSelector(selectSelectedSupplier)
  const [pageError, setPageError] = useState<string | null>(null)

  const pageState = useSuppliersPageState()

  const filterConfig = useMemo<FilterBarConfig<SupplierFilters>>(
    () => ({
      search: { placeholder: 'Search by company name...' },
      fields: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      pageState.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, pageState])

  const supplierQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
    }),
    [appliedFilters],
  )

  const { data: suppliersResponse, isLoading, isFetching, error, refetch } = useGetSuppliersQuery(supplierQueryParams)
  const suppliers = suppliersResponse?.data ?? []
  const loading = isLoading || isFetching

  useEffect(() => {
    if (pageState.shouldPreserveSearchFocus && pageState.searchInputRef.current && document.activeElement !== pageState.searchInputRef.current) {
      const timer = setTimeout(() => {
        pageState.searchInputRef.current?.focus()
        pageState.setShouldPreserveSearchFocus(false)
      }, 0)
      return () => clearTimeout(timer)
    }
    if (pageState.shouldPreserveSearchFocus) {
      pageState.setShouldPreserveSearchFocus(false)
    }
  }, [loading, pageState])

  const selection = useSuppliersSelection({
    dispatch,
    suppliers,
    selectedSupplier,
    focusedSupplierIndex: pageState.focusedSupplierIndex,
    setFocusedSupplierIndex: pageState.setFocusedSupplierIndex,
    navigate,
    supplierListRef: pageState.supplierListRef,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setDeletedSuppliersDialogOpen: pageState.setDeletedSuppliersDialogOpen,
  })

  const actions = useSuppliersActions({
    dispatch,
    selectedSupplier,
    refetchSuppliers: () => { void refetch() },
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setPageError,
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
        title="Suppliers"
        subtitle="Manage your suppliers and vendor relationships"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedSuppliersDialogOpen(true) }}
        primaryAction={{ label: 'New Supplier', onClick: () => navigate('/purchasing/suppliers/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        )}
      />

      {(pageError || error) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPageError(null)}>
          {pageError || 'Failed to load suppliers.'}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <SupplierList
            suppliers={suppliers}
            loading={loading}
            total={suppliers.length}
            selectedSupplierId={selectedSupplier?.id}
            focusedIndex={pageState.focusedSupplierIndex}
            onSelect={selection.handleSupplierSelect}
            supplierListRef={pageState.supplierListRef}
          />
        )}
        headerSlot={(
          <SupplierContextHeader
            selectedSupplier={selectedSupplier}
            onEdit={() => navigate(`/purchasing/suppliers/${selectedSupplier!.id}/edit`)}
            onDelete={() => pageState.setDeleteConfirmOpen(true)}
          />
        )}
        workspaceSlot={<SupplierWorkspaceCard selectedSupplier={selectedSupplier} />}
      />

      <SuppliersDialogs
        selectedSupplier={selectedSupplier}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        onConfirmDelete={actions.handleDelete}
        onCancelDelete={actions.handleCancelDelete}
        deletedSuppliersDialogOpen={pageState.deletedSuppliersDialogOpen}
        onCloseDeletedSuppliersDialog={() => pageState.setDeletedSuppliersDialogOpen(false)}
      />
    </Box>
  )
}

export default SuppliersPage
```

- [ ] **Step 3: TypeScript check — full frontend**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Run existing filter bar test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
```

Expected: PASS (or review failures and fix — the test may need mock updates for the new hooks pattern).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/SuppliersPage.tsx frontend/src/router.tsx
git commit -m "feat(purchasing): refactor SuppliersPage to MasterDetailWorkspace pattern"
```

---

## Task 11: Smoke Test End-to-End

- [ ] **Step 1: Start the app**

```bash
cd backend && npm run start:dev &
cd frontend && npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Visit `http://localhost:5173/purchasing/suppliers`:
- [ ] List loads with supplier names in left panel
- [ ] Clicking a supplier populates the context header (right side)
- [ ] Context header shows company name, type, status, contact, phone, address, purchase stats
- [ ] `↑`/`↓` arrow keys navigate the list
- [ ] `Enter` key navigates to the edit form
- [ ] Edit button navigates to `/purchasing/suppliers/:id/edit`
- [ ] Edit form loads supplier data, can save changes
- [ ] "New Supplier" button navigates to `/purchasing/suppliers/create`
- [ ] Create form works, returns to list after save
- [ ] Delete button opens confirmation dialog, deletes on confirm
- [ ] "View Deleted" button opens deleted suppliers dialog
- [ ] WorkspaceCard tabs load Purchase Orders, GRNs, Payments per supplier
- [ ] Clicking a PO row navigates to the PO edit page

- [ ] **Step 3: Run all purchasing-related tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/
```

Expected: all tests pass.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(purchasing): address smoke test issues in suppliers refactor"
```
