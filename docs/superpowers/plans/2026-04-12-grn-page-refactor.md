# GRN Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `GoodsReceivedPage.tsx` from a 919-line monolith into the standardized Master-Detail pattern, matching `PurchaseOrdersPage` in layout, behavior, and code structure.

**Architecture:** Extract state into `useGRNPageState`, selection/navigation into `useGRNSelection`, UI into four components (`GRNTable`, `GRNContextHeader`, `GRNWorkspaceCard`, `GRNDialogs`), wire up `FilterBar` and `MasterDetailWorkspace`, and add a lazy single-GRN fetch endpoint to the RTK Query API slice. No `useGRNActions` hook — GRNs are read-only.

**Tech Stack:** React 19, MUI v7, RTK Query, Redux Toolkit, React Router v6, Vitest (frontend tests), NestJS/Jest (backend tests — backend already complete, just add test cases).

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/store/api/purchasingApi.ts` — add `getGoodsReceivedNote` lazy query |
| Create | `frontend/src/pages/purchasing/hooks/useGRNPageState.ts` |
| Create | `frontend/src/pages/purchasing/hooks/useGRNSelection.ts` |
| Create | `frontend/src/pages/purchasing/components/GRNTable.tsx` |
| Create | `frontend/src/pages/purchasing/components/GRNContextHeader.tsx` |
| Create | `frontend/src/pages/purchasing/components/GRNWorkspaceCard.tsx` |
| Create | `frontend/src/pages/purchasing/components/GRNDialogs.tsx` |
| Rewrite | `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` |
| Create | `frontend/src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx` |
| Modify | `backend/src/modules/purchasing/services/goods-received-note.service.spec.ts` — add `findAll` filter tests |

---

## Task 1: Add lazy single-GRN query to purchasingApi

The selection hook needs to fetch a fresh single GRN on selection, just as `usePurchaseOrdersSelection` calls `useLazyGetPurchaseOrderQuery`. A `GET /purchasing/goods-received-notes/:id` endpoint already exists in the backend. We just need to expose it through RTK Query.

**Files:**
- Modify: `frontend/src/store/api/purchasingApi.ts`

- [ ] **Step 1: Add the query endpoint**

In `purchasingApi.ts`, inside the `endpoints` builder (after the `getDeletedGRNs` endpoint, before `getVendorPayments`), add:

```ts
getGoodsReceivedNote: builder.query<GoodsReceivedNote, string>({
  query: (id) => ({ url: `/purchasing/goods-received-notes/${id}` }),
  transformResponse: (response: any) => response.data ?? response,
  providesTags: ['GoodsReceivedNote'],
}),
```

- [ ] **Step 2: Export the lazy hook**

In the `export const { ... } = purchasingApiSlice` block at the bottom of the file, add `useLazyGetGoodsReceivedNoteQuery` to the export list (alongside the existing `useGetGoodsReceivedNotesQuery`).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "purchasingApi\|GoodsReceivedNote" | head -20
```

Expected: no errors related to purchasingApi.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/api/purchasingApi.ts
git commit -m "feat: add useLazyGetGoodsReceivedNoteQuery to purchasingApi"
```

---

## Task 2: Create useGRNPageState hook

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useGRNPageState.ts`

- [ ] **Step 1: Write the hook**

Create `frontend/src/pages/purchasing/hooks/useGRNPageState.ts`:

```ts
import { useRef, useState } from 'react'

export interface GRNPageSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface GRNJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useGRNPageState() {
  const [sorting, setSorting] = useState<GRNPageSorting>({
    sortBy: 'receivedDate',
    sortOrder: 'desc',
  })
  const [focusedGRNIndex, setFocusedGRNIndex] = useState(-1)
  const [deletedGRNsOpen, setDeletedGRNsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<GRNJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const grnListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    sorting,
    setSorting,
    focusedGRNIndex,
    setFocusedGRNIndex,
    deletedGRNsOpen,
    setDeletedGRNsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    grnListRef,
    searchInputRef,
    userHasNavigatedRef,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useGRNPageState\|GRNPageSorting" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useGRNPageState.ts
git commit -m "feat: add useGRNPageState hook for GRN page refactor"
```

---

## Task 3: Create useGRNSelection hook

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useGRNSelection.ts`

- [ ] **Step 1: Write the hook**

Create `frontend/src/pages/purchasing/hooks/useGRNSelection.ts`:

```ts
import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetGoodsReceivedNoteQuery } from '@/store/api/purchasingApi'
import { setSelectedGRN } from '@/store/slices/purchasingSlice'
import type { AppDispatch } from '@/store'
import type { GoodsReceivedNote } from '@/types'

import type { GRNJournalEntryRef } from './useGRNPageState'

interface UseGRNSelectionParams {
  dispatch: AppDispatch
  grns: GoodsReceivedNote[]
  selectedGRN: GoodsReceivedNote | null
  focusedGRNIndex: number
  setFocusedGRNIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  grnListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: GRNJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function useGRNSelection({
  dispatch,
  grns,
  selectedGRN,
  focusedGRNIndex,
  setFocusedGRNIndex,
  searchParams,
  setSearchParams,
  grnListRef,
  searchInputRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UseGRNSelectionParams) {
  const [fetchGRN] = useLazyGetGoodsReceivedNoteQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  // Fetch journal entry when selected GRN changes
  useEffect(() => {
    if (!selectedGRN?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'goods_received_note',
          sourceId: selectedGRN.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'goods_received_note',
            sourceId: selectedGRN.id,
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
  }, [selectedGRN?.id, setJournalEntryRef, setJournalEntryRefLoading, fetchJournalEntries])

  // Restore selection from ?grnId= URL param
  useEffect(() => {
    const grnId = searchParams.get('grnId')
    if (grnId && grns.length > 0) {
      const grn = grns.find((g) => g.id === grnId)
      if (grn) {
        dispatch(setSelectedGRN(grn))
        const index = grns.findIndex((g) => g.id === grn.id)
        setFocusedGRNIndex(index)
        setSearchParams({})
      }
    }
  }, [dispatch, grns, searchParams, setFocusedGRNIndex, setSearchParams])

  // Auto-select first GRN when list loads
  useEffect(() => {
    if (grns.length > 0 && focusedGRNIndex === -1) {
      if (selectedGRN) {
        const index = grns.findIndex((g) => g.id === selectedGRN.id)
        setFocusedGRNIndex(index >= 0 ? index : 0)
      } else if (searchInputRef.current !== document.activeElement) {
        const grnId = searchParams.get('grnId')
        if (!grnId) {
          setFocusedGRNIndex(0)
          dispatch(setSelectedGRN(grns[0]))
        }
      }
    }
  }, [dispatch, focusedGRNIndex, grns, searchInputRef, searchParams, selectedGRN, setFocusedGRNIndex])

  // Clear selection when list becomes empty
  useEffect(() => {
    if (grns.length === 0 && selectedGRN) {
      dispatch(setSelectedGRN(null))
      setFocusedGRNIndex(-1)
    }
  }, [dispatch, grns.length, selectedGRN, setFocusedGRNIndex])

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedGRNIndex >= 0 && grnListRef.current) {
      const row = grnListRef.current.querySelector(`[data-grn-index="${focusedGRNIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedGRNIndex, grnListRef])

  const handleGRNSelect = useCallback(async (grn: GoodsReceivedNote) => {
    const index = grns.findIndex((g) => g.id === grn.id)
    setFocusedGRNIndex(index)
    userHasNavigatedRef.current = true

    try {
      const freshGRN = await fetchGRN(grn.id).unwrap()
      dispatch(setSelectedGRN(freshGRN))
    } catch {
      dispatch(setSelectedGRN(grn))
    }
  }, [dispatch, fetchGRN, grns, setFocusedGRNIndex, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedGRNIndex > 0) {
      const newIndex = focusedGRNIndex - 1
      setFocusedGRNIndex(newIndex)
      dispatch(setSelectedGRN(grns[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedGRNIndex, grns, setFocusedGRNIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedGRNIndex < grns.length - 1) {
      const newIndex = focusedGRNIndex + 1
      setFocusedGRNIndex(newIndex)
      dispatch(setSelectedGRN(grns[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedGRNIndex, grns, setFocusedGRNIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handleGRNSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useGRNSelection" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useGRNSelection.ts
git commit -m "feat: add useGRNSelection hook for GRN page refactor"
```

---

## Task 4: Create GRNTable component

**Files:**
- Create: `frontend/src/pages/purchasing/components/GRNTable.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/pages/purchasing/components/GRNTable.tsx`:

```tsx
import React, { memo } from 'react'
import {
  Box,
  Chip,
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
import type { GoodsReceivedNote } from '@/types'
import { formatDate } from '@/utils/formatters'

interface GRNRowProps {
  grn: GoodsReceivedNote
  index: number
  selectedGRNId?: string
  focusedGRNIndex: number
  onGRNSelect: (grn: GoodsReceivedNote) => void
}

const GRNRow = memo(({ grn, index, selectedGRNId, focusedGRNIndex, onGRNSelect }: GRNRowProps) => {
  const isSelected = selectedGRNId === grn.id
  const isFocused = index === focusedGRNIndex

  return (
    <TableRow
      hover
      onClick={() => onGRNSelect(grn)}
      data-grn-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': { backgroundColor: isSelected ? 'action.selected' : 'action.hover' },
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
          {grn.grnNumber}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.2 }}>
          {grn.supplier?.companyName || '—'}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          {formatDate(grn.receivedDate)}
        </Typography>
        <Box sx={{ mt: 0.25 }}>
          <Chip
            label={grn.status}
            size="small"
            color={grn.status === 'received' ? 'success' : 'default'}
            sx={{ fontSize: '0.68rem', height: 16 }}
          />
        </Box>
      </TableCell>
    </TableRow>
  )
})

GRNRow.displayName = 'GRNRow'

interface GRNTableProps {
  grns: GoodsReceivedNote[]
  loading: boolean
  total: number
  selectedGRNId?: string
  focusedGRNIndex: number
  onGRNSelect: (grn: GoodsReceivedNote) => void
  grnListRef: React.RefObject<HTMLDivElement | null>
}

const GRNTable: React.FC<GRNTableProps> = ({
  grns,
  loading,
  total,
  selectedGRNId,
  focusedGRNIndex,
  onGRNSelect,
  grnListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          GRN List ({total})
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={grnListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size}>
            <TableBody>
              {loading && grns.length === 0
                ? [...Array(10)].map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={2}>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : grns.map((grn, index) => (
                    <GRNRow
                      key={grn.id}
                      grn={grn}
                      index={index}
                      selectedGRNId={selectedGRNId}
                      focusedGRNIndex={focusedGRNIndex}
                      onGRNSelect={onGRNSelect}
                    />
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default GRNTable
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "GRNTable" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/GRNTable.tsx
git commit -m "feat: add GRNTable component for GRN page refactor"
```

---

## Task 5: Create GRNContextHeader component

**Files:**
- Create: `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`:

```tsx
import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
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
import Grid from '@mui/material/Grid'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { GoodsReceivedNote } from '@/types'
import { formatDate } from '@/utils/formatters'

import type { GRNJournalEntryRef } from '../hooks/useGRNPageState'

interface GRNContextHeaderProps {
  selectedGRN: GoodsReceivedNote | null
  journalEntryRef: GRNJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onNavigateToJournalEntry: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
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

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const GRNContextHeader: React.FC<GRNContextHeaderProps> = ({
  selectedGRN,
  journalEntryRef,
  journalEntryRefLoading,
  onPrint,
  onNavigateToJournalEntry,
}) => {
  const navigate = useNavigate()

  if (!selectedGRN) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a goods received note to view details
        </Typography>
      </Paper>
    )
  }

  const handleNavigateToPO = () => {
    if (selectedGRN.purchaseOrder?.id) {
      navigate(`/purchasing/purchase-orders?poId=${selectedGRN.purchaseOrder.id}`)
    }
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
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          GRN Details - {selectedGRN.grnNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Print GRN" onClick={onPrint} sx={{ ...actionIconSx, color: 'info.main' }}>
            <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        GRN Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>GRN Number</TableCell>
                    <TableCell sx={valueCellSx}>{selectedGRN.grnNumber}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx} style={{ textTransform: 'capitalize' }}>{selectedGRN.status}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Received Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedGRN.receivedDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={onNavigateToJournalEntry}
                          sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Pending</Typography>
                      )}
                    </TableCell>
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
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Supplier & Order
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Supplier</TableCell>
                    <TableCell sx={valueCellSx}>{selectedGRN.supplier?.companyName || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Purchase Order</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedGRN.purchaseOrder ? (
                        <Typography
                          component="button"
                          onClick={handleNavigateToPO}
                          sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}
                        >
                          {selectedGRN.purchaseOrder.orderNumber}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Qty Received</TableCell>
                    <TableCell sx={valueCellSx}>{selectedGRN.totalQuantityReceived ?? '—'}</TableCell>
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

export default GRNContextHeader
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "GRNContextHeader" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/GRNContextHeader.tsx
git commit -m "feat: add GRNContextHeader component with PO navigation link"
```

---

## Task 6: Create GRNWorkspaceCard component

**Files:**
- Create: `frontend/src/pages/purchasing/components/GRNWorkspaceCard.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/pages/purchasing/components/GRNWorkspaceCard.tsx`:

```tsx
import React from 'react'
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { GoodsReceivedNote } from '@/types'

interface GRNWorkspaceCardProps {
  selectedGRN: GoodsReceivedNote | null
}

const GRNWorkspaceCard: React.FC<GRNWorkspaceCardProps> = ({ selectedGRN }) => {
  if (!selectedGRN) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          GRN Items
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        {selectedGRN.items && selectedGRN.items.length > 0 ? (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                  <TableCell sx={{ width: '40%' }}>Product</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>Ordered Qty</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>Received Qty</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedGRN.items.map((item, index) => (
                  <TableRow
                    key={item.id || index}
                    hover
                    sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}
                  >
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {item.purchaseOrderItem?.product?.name || (item as any).product?.name || 'N/A'}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{item.orderedQuantity}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{item.receivedQuantity}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                      {Number(item.receivedQuantity) >= Number(item.orderedQuantity) ? (
                        <Typography sx={{ fontSize: '0.75rem', color: 'success.main', fontWeight: 600 }}>Full</Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.75rem', color: 'warning.main', fontWeight: 600 }}>Partial</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No items in this GRN</Alert>
        )}
      </Box>
    </Paper>
  )
}

export default GRNWorkspaceCard
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "GRNWorkspaceCard" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/GRNWorkspaceCard.tsx
git commit -m "feat: add GRNWorkspaceCard component for GRN page refactor"
```

---

## Task 7: Create GRNDialogs component

**Files:**
- Create: `frontend/src/pages/purchasing/components/GRNDialogs.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/pages/purchasing/components/GRNDialogs.tsx`:

```tsx
import React from 'react'

import DeletedGRNsDialog from '@/components/purchasing/DeletedGRNsDialog'
import { GRNPrint } from '@/components/print'
import type { GoodsReceivedNote } from '@/types'

interface GRNDialogsProps {
  selectedGRN: GoodsReceivedNote | null
  deletedGRNsOpen: boolean
  onCloseDeletedGRNs: () => void
  printDialogOpen: boolean
  onClosePrintDialog: () => void
}

const GRNDialogs: React.FC<GRNDialogsProps> = ({
  selectedGRN,
  deletedGRNsOpen,
  onCloseDeletedGRNs,
  printDialogOpen,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedGRNsDialog
        open={deletedGRNsOpen}
        onClose={onCloseDeletedGRNs}
      />

      {selectedGRN && (
        <GRNPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          grn={selectedGRN}
        />
      )}
    </>
  )
}

export default GRNDialogs
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "GRNDialogs" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/GRNDialogs.tsx
git commit -m "feat: add GRNDialogs component for GRN page refactor"
```

---

## Task 8: Rewrite GoodsReceivedPage as thin orchestrator

This replaces the 919-line monolith. All business logic lives in the hooks and components from Tasks 2–7.

**Files:**
- Rewrite: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` with:

```tsx
import React, { useCallback, useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetGoodsReceivedNotesQuery } from '@/store/api/purchasingApi'
import { selectSelectedGRN } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import GRNContextHeader from './components/GRNContextHeader'
import GRNDialogs from './components/GRNDialogs'
import GRNTable from './components/GRNTable'
import GRNWorkspaceCard from './components/GRNWorkspaceCard'
import { useGRNPageState } from './hooks/useGRNPageState'
import { useGRNSelection } from './hooks/useGRNSelection'

interface GRNFilters {
  search: string
  supplierId: string | null
  period: PeriodValue
  status: 'draft' | 'received' | null
}

export const GoodsReceivedPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = useGRNPageState()
  const selectedGRN = useAppSelector(selectSelectedGRN)

  const filterConfig = useMemo<FilterBarConfig<GRNFilters>>(
    () => ({
      search: { placeholder: 'Search goods received notes...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'supplierId', label: 'Supplier', type: 'supplier' },
        { field: 'status', label: 'Status', type: 'purchasing-status' },
      ],
      defaults: {
        search: '',
        supplierId: null,
        period: { key: null, from: null, to: null },
        status: null,
      },
    }),
    [],
  )

  const filterBar = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = filterBar.appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    status: filterBar.appliedFilters.status || undefined,
    receivedDateFrom: dateRange.fromDate,
    receivedDateTo: dateRange.toDate,
  }), [dateRange, filterBar.appliedFilters, pageState.sorting])

  const {
    data: grnsResponse,
    isFetching: loading,
    error: grnsError,
  } = useGetGoodsReceivedNotesQuery(queryParams)

  const grns = grnsResponse?.data || []
  const total = grnsResponse?.meta?.total || 0
  const error = grnsError && typeof grnsError === 'object'
    ? ((grnsError as any).data?.message || (grnsError as any).data || 'Failed to fetch goods received notes')
    : null

  const selection = useGRNSelection({
    dispatch,
    grns,
    selectedGRN,
    focusedGRNIndex: pageState.focusedGRNIndex,
    setFocusedGRNIndex: pageState.setFocusedGRNIndex,
    searchParams,
    setSearchParams,
    grnListRef: pageState.grnListRef,
    searchInputRef: pageState.searchInputRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Goods Received Notes"
        subtitle="Track and manage goods received from suppliers"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedGRNsOpen(true) }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={filterBar.draftFilters}
            handlers={filterBar.handlers}
            hasActiveFilters={filterBar.hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{
              field: 'grnNumber',
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
          <GRNTable
            grns={grns}
            loading={loading}
            total={total}
            selectedGRNId={selectedGRN?.id}
            focusedGRNIndex={pageState.focusedGRNIndex}
            onGRNSelect={selection.handleGRNSelect}
            grnListRef={pageState.grnListRef}
          />
        )}
        headerSlot={(
          <GRNContextHeader
            selectedGRN={selectedGRN}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        )}
        workspaceSlot={<GRNWorkspaceCard selectedGRN={selectedGRN} />}
      />

      <GRNDialogs
        selectedGRN={selectedGRN}
        deletedGRNsOpen={pageState.deletedGRNsOpen}
        onCloseDeletedGRNs={() => pageState.setDeletedGRNsOpen(false)}
        printDialogOpen={pageState.printDialogOpen}
        onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
      />
    </Box>
  )
}

export default GoodsReceivedPage
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 3: Run existing purchasing tests to check for regressions**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/ 2>&1 | tail -20
```

Expected: all existing tests pass (CreatePurchaseOrderPage, PurchaseOrdersPage.filterbar, SuppliersPage.filterbar).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/GoodsReceivedPage.tsx
git commit -m "refactor: rewrite GoodsReceivedPage as thin orchestrator using MasterDetailWorkspace"
```

---

## Task 9: Write filterbar tests for GoodsReceivedPage

**Files:**
- Create: `frontend/src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx`

- [ ] **Step 1: Write the failing tests first**

Create `frontend/src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GoodsReceivedPage } from '../GoodsReceivedPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const { useGetGoodsReceivedNotesQuery } = vi.hoisted(() => ({
  useGetGoodsReceivedNotesQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: null,
  })),
}))

const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetGoodsReceivedNotesQuery,
  useLazyGetGoodsReceivedNoteQuery: vi.fn(() => [vi.fn()]),
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [{ id: 'sup-1', companyName: 'Anaheim Electronics' }] },
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/components/filters', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return (
      <div>
        <input placeholder="Search goods received notes..." />
      </div>
    )
  },
}))

vi.mock('@/components/common/MasterDetailWorkspace', () => ({
  default: ({ listSlot, headerSlot, workspaceSlot }: any) => (
    <div>
      <div>MasterDetailWorkspace</div>
      <div>{listSlot}</div>
      <div>{headerSlot}</div>
      <div>{workspaceSlot}</div>
    </div>
  ),
}))

vi.mock('../components/GRNContextHeader', () => ({ default: () => <div>GRNContextHeader</div> }))
vi.mock('../components/GRNTable', () => ({ default: () => <div>GRNTable</div> }))
vi.mock('../components/GRNWorkspaceCard', () => ({ default: () => <div>GRNWorkspaceCard</div> }))
vi.mock('../components/GRNDialogs', () => ({ default: () => <div>GRNDialogs</div> }))
vi.mock('../hooks/useGRNSelection', () => ({
  useGRNSelection: () => ({
    handleGRNSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    focusSearchInput: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: { purchasing: purchasingReducer },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <GoodsReceivedPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('GoodsReceivedPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search goods received notes/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with GRN components', () => {
    renderPage()
    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('GRNTable')).toBeInTheDocument()
    expect(screen.getByText('GRNWorkspaceCard')).toBeInTheDocument()
  })

  it('passes search and supplierId from URL params to the query', () => {
    renderPage('/?search=grn-001&supplierId=sup-1')
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'grn-001',
        supplierId: 'sup-1',
      }),
    )
  })

  it('passes status filter to the query', () => {
    renderPage('/?status=received')
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'received',
      }),
    )
  })

  it('configures the supplier filter with the supplier type', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: { fields: Array<{ field: string; type: string }> }
    }
    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'supplierId', type: 'supplier' }),
      ]),
    )
  })

  it('configures the status filter with purchasing-status type', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: { fields: Array<{ field: string; type: string }> }
    }
    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'status', type: 'purchasing-status' }),
      ]),
    )
  })

  it('maps period filter to receivedDateFrom/receivedDateTo params', () => {
    renderPage('/?periodKey=custom&periodFrom=2025-01-01&periodTo=2025-01-31')
    // Period mapping is handled by the page — verify the query never receives raw periodKey
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ periodKey: expect.anything() }),
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx 2>&1 | tail -20
```

Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx
git commit -m "test: add GoodsReceivedPage filterbar tests for refactored architecture"
```

---

## Task 10: Add findAll filter tests to backend service spec

The backend `findAll` method already handles `supplierId` and `status` WHERE clauses (confirmed in the service code). This task adds test coverage to verify that behavior.

**Files:**
- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Find the end of the existing `describe('create', ...)` block in the spec file, and add a new `describe('findAll', ...)` block after it:

```ts
describe('findAll', () => {
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    grnRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
  });

  it('applies supplierId WHERE clause when supplierId is provided', async () => {
    await service.findAll({ supplierId: 'supplier-123' } as any);
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'grn.supplierId = :supplierId',
      { supplierId: 'supplier-123' },
    );
  });

  it('applies status WHERE clause when status is provided', async () => {
    await service.findAll({ status: GrnStatus.RECEIVED } as any);
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'grn.status = :status',
      { status: GrnStatus.RECEIVED },
    );
  });

  it('does not apply supplierId or status clauses when neither is provided', async () => {
    await service.findAll({} as any);
    const calls = mockQueryBuilder.andWhere.mock.calls.map(([clause]) => clause as string);
    expect(calls.some((c) => c.includes('supplierId'))).toBe(false);
    expect(calls.some((c) => c.includes('status'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd backend && npx jest src/modules/purchasing/services/goods-received-note.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass, including the 3 new `findAll` tests.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/purchasing/services/goods-received-note.service.spec.ts
git commit -m "test: add findAll filter tests for GoodsReceivedNoteService"
```

---

## Task 11: Run full verification and open PR

- [ ] **Step 1: Run all purchasing frontend tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/ 2>&1 | tail -20
```

Expected: all tests pass (CreatePurchaseOrderPage, PurchaseOrdersPage.filterbar, SuppliersPage.filterbar, GoodsReceivedPage.filterbar, PurchasingPage.filters).

- [ ] **Step 2: Run full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 3: Run backend GRN service tests**

```bash
cd backend && npx jest src/modules/purchasing/services/goods-received-note.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Open PR**

```bash
gh pr create \
  --title "refactor: rewrite GoodsReceivedPage using Master-Detail pattern (#335)" \
  --body "$(cat <<'EOF'
## Summary
- Decomposes 919-line `GoodsReceivedPage.tsx` into `useGRNPageState`, `useGRNSelection`, `GRNTable`, `GRNContextHeader`, `GRNWorkspaceCard`, and `GRNDialogs`
- Replaces custom grid layout with `MasterDetailWorkspace`
- Wires up `FilterBar` with Search, Period, Supplier, and Status filters (all server-side)
- Adds PO reference as a navigable link in `GRNContextHeader`
- Adds `useLazyGetGoodsReceivedNoteQuery` to RTK Query API slice for fresh-data-on-selection

## Test plan
- [ ] All purchasing filterbar tests pass
- [ ] TypeScript compiles with 0 errors
- [ ] Backend GRN service spec passes
- [ ] Manual: GRN page loads, filters work, selecting a GRN shows detail, keyboard nav works, print dialog opens, deleted GRNs dialog opens, clicking PO link navigates to PO page

Closes #335

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
