# Design: StockAdjustmentsPage Master-Detail Refactor

**Issue:** #346
**Date:** 2026-04-14
**Approach:** Option C — GRN structure + upgrade navigation to searchParams

---

## Goal

Refactor `StockAdjustmentsPage.tsx` (1028 lines) from a monolith into the standardized Master-Detail pattern used by `GoodsReceivedPage`, `PurchaseOrdersPage`, and `ProductsPage`. Sort moves into `FilterBar` using the unified sort button. `location.state` navigation is replaced with URL search params (`?saId=`).

## Reference Pages

- **Primary:** `GoodsReceivedPage` — selection hook, journal entry ref, pageState shape
- **Secondary:** `PurchaseOrdersPage` / `usePurchaseOrdersActions` — actions hook with multiple mutations

---

## File Structure

### New files

```
frontend/src/pages/inventory/
  hooks/
    useStockAdjustmentsPageState.ts
    useStockAdjustmentsSelection.ts
    useStockAdjustmentsActions.ts
  components/
    StockAdjustmentList.tsx
    StockAdjustmentContextHeader.tsx
    StockAdjustmentWorkspaceCard.tsx
    StockAdjustmentsDialogs.tsx
```

### Modified files

- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` — rewritten as thin orchestrator (~100 lines)
- `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` — change post-create navigation to use `?saId=`

---

## Hook Designs

### `useStockAdjustmentsPageState`

Mirrors `useGRNPageState` exactly. Returns:

```ts
// Sorting
sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }  // default: { sortBy: 'adjustmentNumber', sortOrder: 'asc' }
setSorting: Dispatch<SetStateAction<...>>

// List navigation
focusedAdjustmentIndex: number          // default: -1
setFocusedAdjustmentIndex: (n: number) => void

// Dialogs - general
showDeletedDialog: boolean
setShowDeletedDialog: (v: boolean) => void

// Dialogs - delete
deleteConfirmOpen: boolean
setDeleteConfirmOpen: (v: boolean) => void
adjustmentToDelete: string | null
setAdjustmentToDelete: (v: string | null) => void
adjustmentToDeleteName: string
setAdjustmentToDeleteName: (v: string) => void

// Dialogs - complete
completeConfirmOpen: boolean
setCompleteConfirmOpen: (v: boolean) => void
adjustmentToComplete: string | null
setAdjustmentToComplete: (v: string | null) => void
adjustmentToCompleteName: string
setAdjustmentToCompleteName: (v: string) => void

// Dialogs - revert to draft
revertConfirmOpen: boolean
setRevertConfirmOpen: (v: boolean) => void
adjustmentToRevert: string | null
setAdjustmentToRevert: (v: string | null) => void
adjustmentToRevertName: string
setAdjustmentToRevertName: (v: string) => void

// Journal entry
journalEntryRef: { referenceNumber: string; sourceType: string; sourceId: string } | null
setJournalEntryRef: (v: ...) => void
journalEntryRefLoading: boolean
setJournalEntryRefLoading: (v: boolean) => void

// Refs
adjustmentListRef: RefObject<HTMLDivElement | null>
searchInputRef: RefObject<HTMLInputElement | null>
userHasNavigatedRef: MutableRefObject<boolean>
```

---

### `useStockAdjustmentsSelection`

Mirrors `useGRNSelection`. Owns both the lazy detail fetch and journal entry fetch internally.

**Params:**
```ts
dispatch, adjustments, selectedAdjustment,
focusedAdjustmentIndex, setFocusedAdjustmentIndex,
searchParams, setSearchParams,
adjustmentListRef, searchInputRef, userHasNavigatedRef,
setJournalEntryRef, setJournalEntryRefLoading
```

**Behaviour:**

1. **`?saId=` param handling** — on mount / when adjustments load, reads `searchParams.get('saId')`. If found and adjustment exists in list, selects it, fetches full detail, clears the param (`replace: true`). Mirrors GRN's `?grnId=` pattern.
2. **Auto-select first** — when list loads, nothing is selected, no `saId` param, and search input is not focused: select index 0 and fetch detail.
3. **Clear on empty list** — when `adjustments.length === 0` and something is selected, dispatch `setSelectedStockAdjustment(null)` and reset index to -1.
4. **Scroll into view** — when `focusedAdjustmentIndex` changes, scroll the row into view.
5. **Journal entry fetch** — `useEffect` on `selectedAdjustment?.id`: fetches `sourceType: 'stock_adjustment'`, `limit: 1`, sets `journalEntryRef` / `journalEntryRefLoading`. Cancellable (same `cancelled` flag pattern as GRN).
6. **`handleAdjustmentSelect(adjustment)`** — set focused index, set `userHasNavigatedRef.current = true`, fetch full detail via `useLazyGetStockAdjustmentQuery`, dispatch result (fallback to list item on error).
7. **`handleNavigateUp` / `handleNavigateDown`** — update index, dispatch list item to Redux (no detail fetch on keyboard nav, same as GRN).
8. **`focusSearchInput`** — focuses search ref.

**Returns:** `handleAdjustmentSelect`, `handleNavigateUp`, `handleNavigateDown`, `focusSearchInput`

---

### `useStockAdjustmentsActions`

Modeled on `usePurchaseOrdersActions` but scoped to the 3 mutations StockAdjustments needs.

**Params:**
```ts
dispatch, navigate,
selectedAdjustment,
deleteStockAdjustment, completeStockAdjustment, uncompleteStockAdjustment,
fetchStockAdjustmentById,
refetchAdjustments,
showSuccess, showError,
// dialog setters from pageState:
setDeleteConfirmOpen, setAdjustmentToDelete, setAdjustmentToDeleteName,
setCompleteConfirmOpen, setAdjustmentToComplete, setAdjustmentToCompleteName,
setRevertConfirmOpen, setAdjustmentToRevert, setAdjustmentToRevertName,
setFocusedAdjustmentIndex,
```

**Handlers:**

- `handleEdit` — guard: status must be `'draft'`, else `showError`. Navigate to edit route.
- `handleDelete(id, number)` — set dialog state, open delete confirm.
- `handleConfirmDelete(id)` — if id matches selected, dispatch `setSelectedStockAdjustment(null)` + reset index first. Call `deleteStockAdjustment`, `showSuccess`, `refetchAdjustments`. Close dialog. `showError` on failure.
- `handleCancelDelete` — reset dialog state.
- `handleComplete(id, number)` — set dialog state, open complete confirm.
- `handleConfirmComplete(id)` — call `completeStockAdjustment`, `showSuccess`, `refetchAdjustments`. If selected, re-fetch detail. Close dialog. `showError` on failure.
- `handleCancelComplete` — reset dialog state.
- `handleRevert(id, number)` — set dialog state, open revert confirm.
- `handleConfirmRevert(id)` — call `uncompleteStockAdjustment`, `showSuccess`, `refetchAdjustments`. If selected, re-fetch detail. Close dialog. `showError` on failure.
- `handleCancelRevert` — reset dialog state.

**Returns:** all 9 handlers above.

---

## Component Designs

### `StockAdjustmentList`

Mirrors `GRNTable`. Single-column list of adjustments.

```ts
interface StockAdjustmentListProps {
  adjustments: StockAdjustment[]
  loading: boolean
  total: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
  adjustmentListRef: React.RefObject<HTMLDivElement | null>
}
```

- Header: `Adjustments ({total})`
- Row: `adjustmentNumber` (single column, same as current `AdjustmentRow`)
- Row data attribute: `data-adjustment-index={index}` (for scroll-into-view)
- Loading: skeleton rows when `loading && adjustments.length === 0`; inline spinner when `loading && adjustments.length > 0`
- Empty state: "No adjustments found" row

---

### `StockAdjustmentContextHeader`

Mirrors `GRNContextHeader`. Shows the selected adjustment summary + primary actions.

```ts
interface StockAdjustmentContextHeaderProps {
  selectedAdjustment: StockAdjustment | null
  journalEntryRef: { referenceNumber: string; sourceType: string; sourceId: string } | null
  journalEntryRefLoading: boolean
  onEdit: () => void
  onDelete: () => void
  onComplete: () => void
  onRevert: () => void
  onNavigateToJournalEntry: () => void
}
```

- Empty state: `<Paper>` with "Select an adjustment to view details"
- Header row: adjustment number + status chip (left), Edit + Delete icon buttons (right)
- Action buttons (status-conditional, same compact style as current):
  - `draft`: `Complete` button (primary)
  - `completed`: `Revert to Draft` button (warning) + journal entry link
  - `cancelled`: no action buttons
- Journal entry link: shown when `journalEntryRef` is set; spinner when `journalEntryRefLoading`

---

### `StockAdjustmentWorkspaceCard`

Mirrors `GRNWorkspaceCard`. Contains the full detail body.

```ts
interface StockAdjustmentWorkspaceCardProps {
  selectedAdjustment: StockAdjustment | null
}
```

- Empty state: `<Paper sx={{ flex: 1 }} />`
- Body (extracted verbatim from current page):
  - SA Information table (date, item count)
  - SA Confirmation table (createdAt, updatedAt)
  - SA Items table (product, old qty, new qty, difference with color coding)
  - Notes section

---

### `StockAdjustmentsDialogs`

All 4 dialogs in one component, mirrors `GRNDialogs`.

```ts
interface StockAdjustmentsDialogsProps {
  // Deleted dialog
  showDeletedDialog: boolean
  onCloseDeletedDialog: () => void

  // Delete confirm
  deleteConfirmOpen: boolean
  adjustmentToDeleteName: string
  onConfirmDelete: () => void
  onCancelDelete: () => void

  // Complete confirm
  completeConfirmOpen: boolean
  adjustmentToCompleteName: string
  onConfirmComplete: () => void
  onCancelComplete: () => void

  // Revert confirm
  revertConfirmOpen: boolean
  adjustmentToRevertName: string
  onConfirmRevert: () => void
  onCancelRevert: () => void
}
```

Dialog messages are identical to current page.

---

## Page Orchestrator

`StockAdjustmentsPage.tsx` rewritten as ~100-line thin orchestrator matching `GoodsReceivedPage` shape:

```tsx
export const StockAdjustmentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedAdjustment = useAppSelector(selectSelectedStockAdjustment)
  const pageState = useStockAdjustmentsPageState()

  // filter config (search + status field)
  const filterConfig = useMemo(...)
  const filterBar = useFilterBar(filterConfig)

  // query
  const queryParams = useMemo(() => ({ ...filterBar.appliedFilters, ...pageState.sorting }), [...])
  const { data, isFetching, error, refetch } = useGetStockAdjustmentsQuery(queryParams)
  const [fetchStockAdjustmentById] = useLazyGetStockAdjustmentQuery()
  const [deleteStockAdjustment] = useDeleteStockAdjustmentMutation()
  const [completeStockAdjustment] = useCompleteStockAdjustmentMutation()
  const [uncompleteStockAdjustment] = useUncompleteStockAdjustmentMutation()
  const adjustments = data?.data || []

  const selection = useStockAdjustmentsSelection({ ... })
  const actions = useStockAdjustmentsActions({ ... })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Stock Adjustments"
        ...
        toolbar={<FilterBar ... sort={{ field: 'adjustmentDate', sortBy, sortOrder, onSort: handleSort }} />}
      />
      {error && <Alert .../>}
      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={<StockAdjustmentList ... />}
        headerSlot={<StockAdjustmentContextHeader ... />}
        workspaceSlot={<StockAdjustmentWorkspaceCard selectedAdjustment={selectedAdjustment} />}
      />
      <StockAdjustmentsDialogs ... />
    </Box>
  )
}
```

---

## Navigation Change

### `CreateStockAdjustmentPage.tsx`

**Before:**
```ts
navigate('/inventory/stock-adjustments', { state: { newAdjustmentId: id } })
```

**After:**
```ts
navigate(`/inventory/stock-adjustments?saId=${id}`)
```

The selection hook reads `searchParams.get('saId')`, selects + fetches detail, then clears the param with `replace: true`. Identical to GRN's `?grnId=` pattern.

---

## Testing

- Existing `StockAdjustmentsPage.filterbar.test.tsx` continues to work unchanged — same component entry point, same mock shape.
- Individual hooks (`useStockAdjustmentsPageState`, `useStockAdjustmentsSelection`) are independently testable if needed.
- Task 4 verification (keyboard shortcuts, actions, sort, deep linking) done manually.
