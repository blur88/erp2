# StockAdjustmentsPage Master-Detail Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `StockAdjustmentsPage.tsx` (1028 lines) into the standardized Master-Detail pattern used by `GoodsReceivedPage`, with sort moved into `FilterBar` and `location.state` navigation replaced with `?saId=` search params.

**Architecture:** Follow `GoodsReceivedPage` as primary reference for `useStockAdjustmentsPageState` and `useStockAdjustmentsSelection` (including lazy detail fetch + journal entry ref inside the selection hook). Add `useStockAdjustmentsActions` modeled on `usePurchaseOrdersActions` for the 3 mutations (complete, delete, revert). The page orchestrator becomes ~100 lines using `MasterDetailWorkspace`.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Redux Toolkit, React Router v6, Vitest

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/pages/inventory/hooks/useStockAdjustmentsPageState.ts` |
| Create | `frontend/src/pages/inventory/hooks/useStockAdjustmentsSelection.ts` |
| Create | `frontend/src/pages/inventory/hooks/useStockAdjustmentsActions.ts` |
| Create | `frontend/src/pages/inventory/components/StockAdjustmentList.tsx` |
| Create | `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx` |
| Create | `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx` |
| Create | `frontend/src/pages/inventory/components/StockAdjustmentsDialogs.tsx` |
| Rewrite | `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` |
| Modify | `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` |

---

## Task 1: `useStockAdjustmentsPageState`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useStockAdjustmentsPageState.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/pages/inventory/hooks/useStockAdjustmentsPageState.ts
import { useRef, useState } from 'react'

export interface StockAdjustmentsSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface StockAdjustmentsJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useStockAdjustmentsPageState() {
  const [sorting, setSorting] = useState<StockAdjustmentsSorting>({
    sortBy: 'adjustmentNumber',
    sortOrder: 'asc',
  })
  const [focusedAdjustmentIndex, setFocusedAdjustmentIndex] = useState(-1)

  // Deleted dialog
  const [showDeletedDialog, setShowDeletedDialog] = useState(false)

  // Journal entry
  const [journalEntryRef, setJournalEntryRef] = useState<StockAdjustmentsJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  // Delete dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [adjustmentToDelete, setAdjustmentToDelete] = useState<string | null>(null)
  const [adjustmentToDeleteName, setAdjustmentToDeleteName] = useState('')

  // Complete dialog
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false)
  const [adjustmentToComplete, setAdjustmentToComplete] = useState<string | null>(null)
  const [adjustmentToCompleteName, setAdjustmentToCompleteName] = useState('')

  // Revert dialog
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [adjustmentToRevert, setAdjustmentToRevert] = useState<string | null>(null)
  const [adjustmentToRevertName, setAdjustmentToRevertName] = useState('')

  // Refs
  const adjustmentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    sorting,
    setSorting,
    focusedAdjustmentIndex,
    setFocusedAdjustmentIndex,
    showDeletedDialog,
    setShowDeletedDialog,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    adjustmentToDelete,
    setAdjustmentToDelete,
    adjustmentToDeleteName,
    setAdjustmentToDeleteName,
    completeConfirmOpen,
    setCompleteConfirmOpen,
    adjustmentToComplete,
    setAdjustmentToComplete,
    adjustmentToCompleteName,
    setAdjustmentToCompleteName,
    revertConfirmOpen,
    setRevertConfirmOpen,
    adjustmentToRevert,
    setAdjustmentToRevert,
    adjustmentToRevertName,
    setAdjustmentToRevertName,
    adjustmentListRef,
    searchInputRef,
    userHasNavigatedRef,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useStockAdjustmentsPageState\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useStockAdjustmentsPageState.ts
git commit -m "feat(inventory): add useStockAdjustmentsPageState hook (#346)"
```

---

## Task 2: `useStockAdjustmentsSelection`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useStockAdjustmentsSelection.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/pages/inventory/hooks/useStockAdjustmentsSelection.ts
import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetStockAdjustmentQuery } from '@/store/api/inventoryApi'
import { setSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { AppDispatch } from '@/store'
import type { StockAdjustment } from '@/types'

import type { StockAdjustmentsJournalEntryRef } from './useStockAdjustmentsPageState'

interface UseStockAdjustmentsSelectionParams {
  dispatch: AppDispatch
  adjustments: StockAdjustment[]
  selectedAdjustment: StockAdjustment | null
  focusedAdjustmentIndex: number
  setFocusedAdjustmentIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  adjustmentListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: StockAdjustmentsJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function useStockAdjustmentsSelection({
  dispatch,
  adjustments,
  selectedAdjustment,
  focusedAdjustmentIndex,
  setFocusedAdjustmentIndex,
  searchParams,
  setSearchParams,
  adjustmentListRef,
  searchInputRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UseStockAdjustmentsSelectionParams) {
  const [fetchAdjustment] = useLazyGetStockAdjustmentQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  // Fetch journal entry whenever selected adjustment changes
  useEffect(() => {
    if (!selectedAdjustment?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'stock_adjustment',
          sourceId: selectedAdjustment.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'stock_adjustment',
            sourceId: selectedAdjustment.id,
          })
        } else {
          setJournalEntryRef(null)
        }
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchJournalEntries, selectedAdjustment?.id, setJournalEntryRef, setJournalEntryRefLoading])

  // Handle ?saId= param — select and fetch detail, then clear param
  useEffect(() => {
    const saId = searchParams.get('saId')
    if (saId && adjustments.length > 0) {
      const adjustment = adjustments.find((item) => item.id === saId)
      if (adjustment) {
        dispatch(setSelectedStockAdjustment(adjustment))
        const index = adjustments.findIndex((item) => item.id === saId)
        setFocusedAdjustmentIndex(index)
        setSearchParams((prev) => {
          prev.delete('saId')
          return prev
        }, { replace: true })
        void fetchAdjustment(saId).unwrap().then((fresh) => {
          dispatch(setSelectedStockAdjustment(fresh))
        }).catch(() => {
          // fallback to list item already set above
        })
      }
    }
  }, [dispatch, adjustments, searchParams, setFocusedAdjustmentIndex, setSearchParams, fetchAdjustment])

  // Auto-select first when list loads and nothing is selected
  useEffect(() => {
    if (adjustments.length > 0 && focusedAdjustmentIndex === -1) {
      if (selectedAdjustment) {
        const index = adjustments.findIndex((item) => item.id === selectedAdjustment.id)
        setFocusedAdjustmentIndex(index >= 0 ? index : 0)
      } else if (searchInputRef.current !== document.activeElement) {
        const saId = searchParams.get('saId')
        if (!saId) {
          setFocusedAdjustmentIndex(0)
          dispatch(setSelectedStockAdjustment(adjustments[0]))
          void fetchAdjustment(adjustments[0].id).unwrap().then((fresh) => {
            dispatch(setSelectedStockAdjustment(fresh))
          }).catch(() => {})
        }
      }
    }
  }, [adjustments, dispatch, fetchAdjustment, focusedAdjustmentIndex, searchInputRef, searchParams, selectedAdjustment, setFocusedAdjustmentIndex])

  // Clear selection when list becomes empty
  useEffect(() => {
    if (adjustments.length === 0 && selectedAdjustment) {
      dispatch(setSelectedStockAdjustment(null))
      setFocusedAdjustmentIndex(-1)
    }
  }, [adjustments.length, dispatch, selectedAdjustment, setFocusedAdjustmentIndex])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedAdjustmentIndex >= 0 && adjustmentListRef.current) {
      const row = adjustmentListRef.current.querySelector(`[data-adjustment-index="${focusedAdjustmentIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedAdjustmentIndex, adjustmentListRef])

  const handleAdjustmentSelect = useCallback(async (adjustment: StockAdjustment) => {
    const index = adjustments.findIndex((item) => item.id === adjustment.id)
    setFocusedAdjustmentIndex(index)
    userHasNavigatedRef.current = true

    try {
      const fresh = await fetchAdjustment(adjustment.id).unwrap()
      dispatch(setSelectedStockAdjustment(fresh))
    } catch {
      dispatch(setSelectedStockAdjustment(adjustment))
    }
  }, [adjustments, dispatch, fetchAdjustment, setFocusedAdjustmentIndex, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedAdjustmentIndex > 0) {
      const newIndex = focusedAdjustmentIndex - 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [adjustments, dispatch, focusedAdjustmentIndex, setFocusedAdjustmentIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedAdjustmentIndex < adjustments.length - 1) {
      const newIndex = focusedAdjustmentIndex + 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [adjustments, dispatch, focusedAdjustmentIndex, setFocusedAdjustmentIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handleAdjustmentSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useStockAdjustmentsSelection\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useStockAdjustmentsSelection.ts
git commit -m "feat(inventory): add useStockAdjustmentsSelection hook (#346)"
```

---

## Task 3: `useStockAdjustmentsActions`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useStockAdjustmentsActions.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/pages/inventory/hooks/useStockAdjustmentsActions.ts
import { useCallback } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { setSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { StockAdjustment } from '@/types'

interface UseStockAdjustmentsActionsParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  selectedAdjustment: StockAdjustment | null
  deleteStockAdjustment: (id: string) => { unwrap: () => Promise<any> }
  completeStockAdjustment: (id: string) => { unwrap: () => Promise<any> }
  uncompleteStockAdjustment: (id: string) => { unwrap: () => Promise<any> }
  fetchStockAdjustmentById: (id: string) => { unwrap: () => Promise<StockAdjustment> }
  refetchAdjustments: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  // dialog setters
  setDeleteConfirmOpen: (v: boolean) => void
  setAdjustmentToDelete: (v: string | null) => void
  setAdjustmentToDeleteName: (v: string) => void
  setCompleteConfirmOpen: (v: boolean) => void
  setAdjustmentToComplete: (v: string | null) => void
  setAdjustmentToCompleteName: (v: string) => void
  setRevertConfirmOpen: (v: boolean) => void
  setAdjustmentToRevert: (v: string | null) => void
  setAdjustmentToRevertName: (v: string) => void
  setFocusedAdjustmentIndex: (v: number) => void
}

export function useStockAdjustmentsActions({
  dispatch,
  navigate,
  selectedAdjustment,
  deleteStockAdjustment,
  completeStockAdjustment,
  uncompleteStockAdjustment,
  fetchStockAdjustmentById,
  refetchAdjustments,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setAdjustmentToDelete,
  setAdjustmentToDeleteName,
  setCompleteConfirmOpen,
  setAdjustmentToComplete,
  setAdjustmentToCompleteName,
  setRevertConfirmOpen,
  setAdjustmentToRevert,
  setAdjustmentToRevertName,
  setFocusedAdjustmentIndex,
}: UseStockAdjustmentsActionsParams) {
  const handleEdit = useCallback(() => {
    if (!selectedAdjustment) return
    if (selectedAdjustment.status !== 'draft') {
      showError('Only draft adjustments can be edited')
      return
    }
    navigate(`/inventory/stock-adjustments/${selectedAdjustment.id}/edit`)
  }, [navigate, selectedAdjustment, showError])

  // Delete
  const handleDelete = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToDelete(id)
    setAdjustmentToDeleteName(adjustmentNumber)
    setDeleteConfirmOpen(true)
  }, [setAdjustmentToDelete, setAdjustmentToDeleteName, setDeleteConfirmOpen])

  const handleConfirmDelete = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      if (selectedAdjustment?.id === id) {
        dispatch(setSelectedStockAdjustment(null))
        setFocusedAdjustmentIndex(-1)
      }
      await deleteStockAdjustment(id).unwrap()
      showSuccess('Stock adjustment deleted successfully')
      refetchAdjustments()
    } catch (error: any) {
      showError(error?.data?.message || 'Failed to delete stock adjustment')
    } finally {
      setDeleteConfirmOpen(false)
      setAdjustmentToDelete(null)
      setAdjustmentToDeleteName('')
    }
  }, [deleteStockAdjustment, dispatch, refetchAdjustments, selectedAdjustment?.id, setAdjustmentToDelete, setAdjustmentToDeleteName, setDeleteConfirmOpen, setFocusedAdjustmentIndex, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setAdjustmentToDelete(null)
    setAdjustmentToDeleteName('')
  }, [setAdjustmentToDelete, setAdjustmentToDeleteName, setDeleteConfirmOpen])

  // Complete
  const handleComplete = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToComplete(id)
    setAdjustmentToCompleteName(adjustmentNumber)
    setCompleteConfirmOpen(true)
  }, [setAdjustmentToComplete, setAdjustmentToCompleteName, setCompleteConfirmOpen])

  const handleConfirmComplete = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      await completeStockAdjustment(id).unwrap()
      showSuccess('Stock adjustment completed successfully')
      refetchAdjustments()
      if (selectedAdjustment?.id === id) {
        const fresh = await fetchStockAdjustmentById(id).unwrap()
        dispatch(setSelectedStockAdjustment(fresh))
      }
    } catch (error: any) {
      showError(error?.data?.message || 'Failed to complete stock adjustment')
    } finally {
      setCompleteConfirmOpen(false)
      setAdjustmentToComplete(null)
      setAdjustmentToCompleteName('')
    }
  }, [completeStockAdjustment, dispatch, fetchStockAdjustmentById, refetchAdjustments, selectedAdjustment?.id, setAdjustmentToComplete, setAdjustmentToCompleteName, setCompleteConfirmOpen, showError, showSuccess])

  const handleCancelComplete = useCallback(() => {
    setCompleteConfirmOpen(false)
    setAdjustmentToComplete(null)
    setAdjustmentToCompleteName('')
  }, [setAdjustmentToComplete, setAdjustmentToCompleteName, setCompleteConfirmOpen])

  // Revert to draft
  const handleRevert = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToRevert(id)
    setAdjustmentToRevertName(adjustmentNumber)
    setRevertConfirmOpen(true)
  }, [setAdjustmentToRevert, setAdjustmentToRevertName, setRevertConfirmOpen])

  const handleConfirmRevert = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      await uncompleteStockAdjustment(id).unwrap()
      showSuccess('Stock adjustment reverted to draft successfully')
      refetchAdjustments()
      if (selectedAdjustment?.id === id) {
        const fresh = await fetchStockAdjustmentById(id).unwrap()
        dispatch(setSelectedStockAdjustment(fresh))
      }
    } catch (error: any) {
      showError(error?.data?.message || 'Failed to revert stock adjustment')
    } finally {
      setRevertConfirmOpen(false)
      setAdjustmentToRevert(null)
      setAdjustmentToRevertName('')
    }
  }, [dispatch, fetchStockAdjustmentById, refetchAdjustments, selectedAdjustment?.id, setAdjustmentToRevert, setAdjustmentToRevertName, setRevertConfirmOpen, showError, showSuccess, uncompleteStockAdjustment])

  const handleCancelRevert = useCallback(() => {
    setRevertConfirmOpen(false)
    setAdjustmentToRevert(null)
    setAdjustmentToRevertName('')
  }, [setAdjustmentToRevert, setAdjustmentToRevertName, setRevertConfirmOpen])

  return {
    handleEdit,
    handleDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleComplete,
    handleConfirmComplete,
    handleCancelComplete,
    handleRevert,
    handleConfirmRevert,
    handleCancelRevert,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useStockAdjustmentsActions\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useStockAdjustmentsActions.ts
git commit -m "feat(inventory): add useStockAdjustmentsActions hook (#346)"
```

---

## Task 4: `StockAdjustmentList`

**Files:**
- Create: `frontend/src/pages/inventory/components/StockAdjustmentList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/inventory/components/StockAdjustmentList.tsx
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
import type { StockAdjustment } from '@/types'

interface AdjustmentRowProps {
  adjustment: StockAdjustment
  index: number
  selectedAdjustmentId: string | undefined
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
}

const AdjustmentRow = memo(({
  adjustment,
  index,
  selectedAdjustmentId,
  focusedAdjustmentIndex,
  onSelect,
}: AdjustmentRowProps) => {
  const isSelected = selectedAdjustmentId === adjustment.id
  const isFocused = index === focusedAdjustmentIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(adjustment)}
      data-adjustment-index={index}
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
        <Typography variant="body2" sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}>
          {adjustment.adjustmentNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

AdjustmentRow.displayName = 'AdjustmentRow'

interface StockAdjustmentListProps {
  adjustments: StockAdjustment[]
  loading: boolean
  total: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
  adjustmentListRef: React.RefObject<HTMLDivElement | null>
}

const StockAdjustmentList: React.FC<StockAdjustmentListProps> = ({
  adjustments,
  loading,
  total,
  selectedAdjustmentId,
  focusedAdjustmentIndex,
  onSelect,
  adjustmentListRef,
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
            Adjustments ({total})
          </Typography>
          {loading && adjustments.length > 0 && (
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
      <Box
        sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        ref={adjustmentListRef}
      >
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
              {loading && adjustments.length === 0
                ? [...Array(10)].map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : adjustments.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                            No adjustments found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : adjustments.map((adjustment, index) => (
                      <AdjustmentRow
                        key={adjustment.id}
                        adjustment={adjustment}
                        index={index}
                        selectedAdjustmentId={selectedAdjustmentId}
                        focusedAdjustmentIndex={focusedAdjustmentIndex}
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

export default StockAdjustmentList
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "StockAdjustmentList\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/StockAdjustmentList.tsx
git commit -m "feat(inventory): add StockAdjustmentList component (#346)"
```

---

## Task 5: `StockAdjustmentWorkspaceCard`

**Files:**
- Create: `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx`

- [ ] **Step 1: Create the component**

Extract the detail body verbatim from the current `StockAdjustmentsPage.tsx` (lines ~615–973). The component renders SA Information, SA Confirmation, SA Items, and Notes sections.

```tsx
// frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx
import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface StockAdjustmentWorkspaceCardProps {
  selectedAdjustment: StockAdjustment | null
}

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

const StockAdjustmentWorkspaceCard: React.FC<StockAdjustmentWorkspaceCardProps> = ({
  selectedAdjustment,
}) => {
  const navigate = useNavigate()

  if (!selectedAdjustment) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          {/* SA Information */}
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
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          {/* SA Confirmation */}
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
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>

        {/* Divider */}
        <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />

        {/* SA Items */}
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1, display: 'block' }}
        >
          SA Items
        </Typography>

        {selectedAdjustment.items && selectedAdjustment.items.length > 0 ? (
          <TableContainer>
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

        {/* Divider */}
        <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />

        {/* Notes */}
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
          {selectedAdjustment.notes || '—'}
        </Box>
      </Box>
    </Paper>
  )
}

export default StockAdjustmentWorkspaceCard
```

Note: The `navigate` import is declared but not used in this component (journal entry navigation moved to `StockAdjustmentContextHeader`). Remove it.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "StockAdjustmentWorkspaceCard\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx
git commit -m "feat(inventory): add StockAdjustmentWorkspaceCard component (#346)"
```

---

## Task 6: `StockAdjustmentContextHeader`

**Files:**
- Create: `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'

import type { StockAdjustmentsJournalEntryRef } from '../hooks/useStockAdjustmentsPageState'

interface StockAdjustmentContextHeaderProps {
  selectedAdjustment: StockAdjustment | null
  journalEntryRef: StockAdjustmentsJournalEntryRef | null
  journalEntryRefLoading: boolean
  onEdit: () => void
  onDelete: () => void
  onComplete: () => void
  onRevert: () => void
  onNavigateToJournalEntry: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const StockAdjustmentContextHeader: React.FC<StockAdjustmentContextHeaderProps> = ({
  selectedAdjustment,
  journalEntryRef,
  journalEntryRefLoading,
  onEdit,
  onDelete,
  onComplete,
  onRevert,
  onNavigateToJournalEntry,
}) => {
  if (!selectedAdjustment) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an adjustment to view details
        </Typography>
      </Paper>
    )
  }

  const statusColor =
    selectedAdjustment.status === 'completed'
      ? 'success'
      : selectedAdjustment.status === 'cancelled'
        ? 'error'
        : 'default'

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
        {/* Left: title + status chip */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            SA Details — {selectedAdjustment.adjustmentNumber}
          </Typography>
          <Chip
            label={selectedAdjustment.status}
            size="small"
            color={statusColor}
            sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
          />
        </Box>

        {/* Right: icon buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title="Edit Adjustment"
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title="Delete Adjustment"
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      {/* Action strip */}
      <Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
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

        {/* Journal entry link */}
        {selectedAdjustment.status === 'completed' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Journal Entry:</Typography>
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
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default StockAdjustmentContextHeader
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "StockAdjustmentContextHeader\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx
git commit -m "feat(inventory): add StockAdjustmentContextHeader component (#346)"
```

---

## Task 7: `StockAdjustmentsDialogs`

**Files:**
- Create: `frontend/src/pages/inventory/components/StockAdjustmentsDialogs.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/inventory/components/StockAdjustmentsDialogs.tsx
import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedStockAdjustmentsDialog from '@/components/inventory/DeletedStockAdjustmentsDialog'

interface StockAdjustmentsDialogsProps {
  // Deleted
  showDeletedDialog: boolean
  onCloseDeletedDialog: () => void

  // Delete
  deleteConfirmOpen: boolean
  adjustmentToDeleteName: string
  onConfirmDelete: () => void
  onCancelDelete: () => void

  // Complete
  completeConfirmOpen: boolean
  adjustmentToCompleteName: string
  onConfirmComplete: () => void
  onCancelComplete: () => void

  // Revert
  revertConfirmOpen: boolean
  adjustmentToRevertName: string
  onConfirmRevert: () => void
  onCancelRevert: () => void
}

const StockAdjustmentsDialogs: React.FC<StockAdjustmentsDialogsProps> = ({
  showDeletedDialog,
  onCloseDeletedDialog,
  deleteConfirmOpen,
  adjustmentToDeleteName,
  onConfirmDelete,
  onCancelDelete,
  completeConfirmOpen,
  adjustmentToCompleteName,
  onConfirmComplete,
  onCancelComplete,
  revertConfirmOpen,
  adjustmentToRevertName,
  onConfirmRevert,
  onCancelRevert,
}) => {
  return (
    <>
      <DeletedStockAdjustmentsDialog
        open={showDeletedDialog}
        onClose={onCloseDeletedDialog}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete stock adjustment #${adjustmentToDeleteName}? This will move it to deleted stock adjustments.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <ConfirmationDialog
        open={completeConfirmOpen}
        title="Confirm Complete"
        message={`Are you sure you want to complete stock adjustment #${adjustmentToCompleteName}? This will post the stock movements and update inventory levels. This action cannot be undone.`}
        confirmText="Complete"
        cancelText="Cancel"
        onConfirm={onConfirmComplete}
        onCancel={onCancelComplete}
        severity="info"
      />

      <ConfirmationDialog
        open={revertConfirmOpen}
        title="Revert to Draft"
        message={`Are you sure you want to revert stock adjustment #${adjustmentToRevertName} back to draft? This will reverse the stock movements and return inventory levels to their previous state.`}
        confirmText="Revert to Draft"
        cancelText="Go Back"
        onConfirm={onConfirmRevert}
        onCancel={onCancelRevert}
        severity="warning"
      />
    </>
  )
}

export default StockAdjustmentsDialogs
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "StockAdjustmentsDialogs\|error" | head -20
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/StockAdjustmentsDialogs.tsx
git commit -m "feat(inventory): add StockAdjustmentsDialogs component (#346)"
```

---

## Task 8: Rewrite `StockAdjustmentsPage.tsx`

**Files:**
- Rewrite: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire file content:

```tsx
// frontend/src/pages/inventory/StockAdjustmentsPage.tsx
import React, { useCallback, useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useCompleteStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useGetStockAdjustmentsQuery,
  useLazyGetStockAdjustmentQuery,
  useUncompleteStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { selectSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import StockAdjustmentContextHeader from './components/StockAdjustmentContextHeader'
import StockAdjustmentList from './components/StockAdjustmentList'
import StockAdjustmentWorkspaceCard from './components/StockAdjustmentWorkspaceCard'
import StockAdjustmentsDialogs from './components/StockAdjustmentsDialogs'
import { useStockAdjustmentsActions } from './hooks/useStockAdjustmentsActions'
import { useStockAdjustmentsPageState } from './hooks/useStockAdjustmentsPageState'
import { useStockAdjustmentsSelection } from './hooks/useStockAdjustmentsSelection'

interface StockAdjustmentFilters {
  search: string
  status: 'draft' | 'completed' | 'cancelled' | null
}

const StockAdjustmentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedAdjustment = useAppSelector(selectSelectedStockAdjustment)
  const pageState = useStockAdjustmentsPageState()

  const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(
    () => ({
      search: { placeholder: 'Search by adjustment number or notes...' },
      fields: [
        { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const filterBar = useFilterBar(filterConfig)

  const queryParams = useMemo(
    () => ({
      search: filterBar.appliedFilters.search || undefined,
      status: filterBar.appliedFilters.status ?? undefined,
      sortBy: pageState.sorting.sortBy,
      sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    }),
    [filterBar.appliedFilters, pageState.sorting],
  )

  const {
    data: adjustmentsResponse,
    isFetching: loading,
    error: adjustmentsError,
    refetch: refetchAdjustments,
  } = useGetStockAdjustmentsQuery(queryParams)
  const [fetchStockAdjustmentById] = useLazyGetStockAdjustmentQuery()
  const [deleteStockAdjustment] = useDeleteStockAdjustmentMutation()
  const [completeStockAdjustment] = useCompleteStockAdjustmentMutation()
  const [uncompleteStockAdjustment] = useUncompleteStockAdjustmentMutation()

  const adjustments = adjustmentsResponse?.data || []
  const total = adjustmentsResponse?.meta?.total || 0
  const error = adjustmentsError && typeof adjustmentsError === 'object'
    ? ((adjustmentsError as any).data?.message || (adjustmentsError as any).data || 'Failed to fetch stock adjustments')
    : null

  const selection = useStockAdjustmentsSelection({
    dispatch,
    adjustments,
    selectedAdjustment,
    focusedAdjustmentIndex: pageState.focusedAdjustmentIndex,
    setFocusedAdjustmentIndex: pageState.setFocusedAdjustmentIndex,
    searchParams,
    setSearchParams,
    adjustmentListRef: pageState.adjustmentListRef,
    searchInputRef: pageState.searchInputRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const actions = useStockAdjustmentsActions({
    dispatch,
    navigate,
    selectedAdjustment,
    deleteStockAdjustment,
    completeStockAdjustment,
    uncompleteStockAdjustment,
    fetchStockAdjustmentById,
    refetchAdjustments,
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setAdjustmentToDelete: pageState.setAdjustmentToDelete,
    setAdjustmentToDeleteName: pageState.setAdjustmentToDeleteName,
    setCompleteConfirmOpen: pageState.setCompleteConfirmOpen,
    setAdjustmentToComplete: pageState.setAdjustmentToComplete,
    setAdjustmentToCompleteName: pageState.setAdjustmentToCompleteName,
    setRevertConfirmOpen: pageState.setRevertConfirmOpen,
    setAdjustmentToRevert: pageState.setAdjustmentToRevert,
    setAdjustmentToRevertName: pageState.setAdjustmentToRevertName,
    setFocusedAdjustmentIndex: pageState.setFocusedAdjustmentIndex,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Stock Adjustments"
        subtitle="View and manage stock adjustment history"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setShowDeletedDialog(true) }}
        primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={filterBar.draftFilters}
            handlers={filterBar.handlers}
            hasActiveFilters={filterBar.hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{
              field: 'adjustmentDate',
              sortBy: pageState.sorting.sortBy,
              sortOrder: pageState.sorting.sortOrder,
              onSort: handleSort,
            }}
          />
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <StockAdjustmentList
            adjustments={adjustments}
            loading={loading}
            total={total}
            selectedAdjustmentId={selectedAdjustment?.id}
            focusedAdjustmentIndex={pageState.focusedAdjustmentIndex}
            onSelect={selection.handleAdjustmentSelect}
            adjustmentListRef={pageState.adjustmentListRef}
          />
        )}
        headerSlot={(
          <StockAdjustmentContextHeader
            selectedAdjustment={selectedAdjustment}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEdit={actions.handleEdit}
            onDelete={() => selectedAdjustment && actions.handleDelete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
            onComplete={() => selectedAdjustment && actions.handleComplete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
            onRevert={() => selectedAdjustment && actions.handleRevert(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        )}
        workspaceSlot={<StockAdjustmentWorkspaceCard selectedAdjustment={selectedAdjustment} />}
      />

      <StockAdjustmentsDialogs
        showDeletedDialog={pageState.showDeletedDialog}
        onCloseDeletedDialog={() => pageState.setShowDeletedDialog(false)}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        adjustmentToDeleteName={pageState.adjustmentToDeleteName}
        onConfirmDelete={() => void actions.handleConfirmDelete(pageState.adjustmentToDelete)}
        onCancelDelete={actions.handleCancelDelete}
        completeConfirmOpen={pageState.completeConfirmOpen}
        adjustmentToCompleteName={pageState.adjustmentToCompleteName}
        onConfirmComplete={() => void actions.handleConfirmComplete(pageState.adjustmentToComplete)}
        onCancelComplete={actions.handleCancelComplete}
        revertConfirmOpen={pageState.revertConfirmOpen}
        adjustmentToRevertName={pageState.adjustmentToRevertName}
        onConfirmRevert={() => void actions.handleConfirmRevert(pageState.adjustmentToRevert)}
        onCancelRevert={actions.handleCancelRevert}
      />
    </Box>
  )
}

export default StockAdjustmentsPage
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Run existing filterbar tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/StockAdjustmentsPage.tsx
git commit -m "refactor(inventory): rewrite StockAdjustmentsPage using Master-Detail pattern (#346)"
```

---

## Task 9: Update `CreateStockAdjustmentPage.tsx` navigation

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` (lines 217 and 227)

- [ ] **Step 1: Update navigate calls**

Find and replace both `navigate` calls that use `location.state`. There are two — one for create, one for update:

Current (line ~217):
```ts
navigate('/inventory/stock-adjustments', { state: { newAdjustmentId: id } })
```

New:
```ts
navigate(`/inventory/stock-adjustments?saId=${id}`)
```

Current (line ~227):
```ts
navigate('/inventory/stock-adjustments', { state: { newAdjustmentId: adjustment.id } })
```

New:
```ts
navigate(`/inventory/stock-adjustments?saId=${adjustment.id}`)
```

Also remove the `useLocation` import if it is no longer used after this change:
```ts
// Remove this import if present:
import { useNavigate, useParams } from 'react-router-dom'  // useLocation already not imported here
```

Check: `CreateStockAdjustmentPage.tsx` imports only `useNavigate` and `useParams` from react-router-dom — no `useLocation`, so no import change needed.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Run CreateStockAdjustmentPage tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx
git commit -m "feat(inventory): use ?saId= param for post-create navigation in StockAdjustments (#346)"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -30
```

Expected: 0 errors.

- [ ] **Step 2: Run all inventory page tests**

```bash
cd frontend && npx vitest run src/pages/inventory/
```

Expected: all tests pass.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint 2>&1 | grep -i "error\|warning" | head -30
```

Expected: no new errors.

- [ ] **Step 4: Manual verification checklist**

Start the dev server:
```bash
cd frontend && npm run dev
```

Verify each of the following:
- [ ] Stock Adjustments page loads with Master-Detail layout (list left, detail right)
- [ ] Keyboard Up/Down navigates the list
- [ ] `/` or `Ctrl+F` focuses the search input
- [ ] Status filter works (draft / completed / cancelled)
- [ ] Sort button in FilterBar toggles `adjustmentDate` asc/desc
- [ ] Clicking an adjustment loads its full details (items, notes)
- [ ] "Complete" button on a draft opens confirmation dialog and completes it
- [ ] "Revert to Draft" button on a completed adjustment opens confirmation and reverts it
- [ ] "Delete" icon opens confirmation and deletes (selection clears)
- [ ] "Edit" on a draft navigates to edit page; on completed shows error toast
- [ ] After creating a new adjustment, page auto-selects it (via `?saId=`)
- [ ] After editing an adjustment, page auto-selects it (via `?saId=`)
- [ ] "View Deleted" opens the deleted adjustments dialog
- [ ] Journal entry link appears on completed adjustments and navigates correctly
- [ ] Mobile layout stacks list and detail vertically

- [ ] **Step 5: Commit final verification note**

```bash
git commit --allow-empty -m "chore(inventory): verify StockAdjustmentsPage Master-Detail refactor (#346)"
```
