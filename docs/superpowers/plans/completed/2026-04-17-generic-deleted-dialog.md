# GenericDeletedDialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 13 independent `Deleted*Dialog.tsx` components with a single generic `GenericDeletedDialog<T>` component, reducing ~7,900 lines to one reusable component + 13 thin wrappers.

**Architecture:** A single `GenericDeletedDialog<T>` component accepts columns config, RTK Query hooks, and entity metadata as props. All 13 existing wrapper files are replaced in-place (same paths, same export names) so no parent component imports change. Bulk mutation hooks are optional props since some entities lack them.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query (Vitest + Testing Library for tests)

---

## File Map

**Create:**
- `frontend/src/components/common/GenericDeletedDialog.tsx` — the generic component
- `frontend/src/components/common/GenericDeletedDialog.test.tsx` — tests

**Replace (same path, same export name — no import changes needed elsewhere):**
- `frontend/src/components/inventory/DeletedProductsDialog.tsx`
- `frontend/src/components/inventory/DeletedCategoriesDialog.tsx`
- `frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx`
- `frontend/src/components/sales/DeletedCustomersDialog.tsx`
- `frontend/src/components/sales/DeletedOrdersDialog.tsx`
- `frontend/src/components/sales/DeletedInvoicesDialog.tsx`
- `frontend/src/components/sales/DeletedPaymentsDialog.tsx`
- `frontend/src/components/purchasing/DeletedSuppliersDialog.tsx`
- `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx`
- `frontend/src/components/purchasing/DeletedGRNsDialog.tsx`
- `frontend/src/components/purchasing/DeletedVendorPaymentsDialog.tsx`
- `frontend/src/components/accounting/DeletedAccountsDialog.tsx`
- `frontend/src/components/settings/DeletedPaymentMethodsDialog.tsx`

---

## Task 1: Create GenericDeletedDialog component

**Files:**
- Create: `frontend/src/components/common/GenericDeletedDialog.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import { default as SearchIcon } from '@mui/icons-material/Search'
import { default as RestoreIcon } from '@mui/icons-material/Restore'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as DeleteForeverIcon } from '@mui/icons-material/DeleteForever'
import { useNotification } from '@/hooks/useNotification'

export interface ColumnDef<T> {
  label: string
  render: (item: T) => React.ReactNode
  width?: string
  hideOnMobile?: boolean
  align?: 'left' | 'right' | 'center'
}

export interface GenericDeletedDialogProps<T extends { id: string }> {
  open: boolean
  onClose: () => void
  title: string
  entityLabel: string
  icon: React.ReactNode
  columns: ColumnDef<T>[]
  getItemLabel: (item: T) => string
  searchPlaceholder: string
  filterItem: (item: T, searchTerm: string) => boolean
  useGetDeletedQuery: (arg: any, options?: any) => { data: any; isFetching: boolean; refetch: () => void }
  getItems?: (data: any) => T[]                // defaults to (data) => data?.data ?? [] — override for plain-array responses
  useRestoreMutation: () => readonly [(...args: any[]) => any, { isLoading: boolean }]
  usePermanentDeleteMutation: () => readonly [(...args: any[]) => any, { isLoading: boolean }]
  useBulkRestoreMutation?: () => readonly [(...args: any[]) => any, { isLoading: boolean }]
  useBulkPermanentDeleteMutation?: () => readonly [(...args: any[]) => any, { isLoading: boolean }]
}

function GenericDeletedDialog<T extends { id: string }>({
  open,
  onClose,
  title,
  entityLabel,
  icon,
  columns,
  getItemLabel,
  searchPlaceholder,
  filterItem,
  useGetDeletedQuery,
  getItems = (data: any) => data?.data ?? [],
  useRestoreMutation,
  usePermanentDeleteMutation,
  useBulkRestoreMutation,
  useBulkPermanentDeleteMutation,
}: GenericDeletedDialogProps<T>) {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const { data, isFetching, refetch } = useGetDeletedQuery({}, { skip: !open })
  const [restore] = useRestoreMutation()
  const [permanentDelete] = usePermanentDeleteMutation()
  const bulkRestoreHook = useBulkRestoreMutation?.()
  const bulkDeleteHook = useBulkPermanentDeleteMutation?.()
  const [bulkRestore] = bulkRestoreHook ?? [null]
  const [bulkPermanentDelete] = bulkDeleteHook ?? [null]

  const items: T[] = getItems(data)

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      void refetch()
      setSelectedItems(new Set())
    }
  }, [open, refetch])

  const filtered = items.filter(item => filterItem(item, searchTerm.toLowerCase()))
  const selectedCount = selectedItems.size
  const allSelected = filtered.length > 0 && selectedItems.size === filtered.length
  const partiallySelected = selectedItems.size > 0 && selectedItems.size < filtered.length

  const handleRestore = async (item: T) => {
    setRestoringId(item.id)
    try {
      await restore(item.id).unwrap()
      showSuccess(`${entityLabel} "${getItemLabel(item)}" restored successfully`)
      void refetch()
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to restore ${entityLabel}`)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (item: T) => {
    setDeletingId(item.id)
    try {
      await permanentDelete(item.id).unwrap()
      showSuccess(`${entityLabel} "${getItemLabel(item)}" permanently deleted`)
      void refetch()
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to permanently delete ${entityLabel}`)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectedItems(checked ? new Set(filtered.map(i => i.id)) : new Set())
  }

  const handleBulkRestore = async () => {
    if (!bulkRestore) return
    setBulkRestoring(true)
    try {
      const ids = Array.from(selectedItems)
      const payload = await bulkRestore(ids).unwrap()
      const restoredCount = payload?.restoredCount ?? ids.length
      const failedIds = payload?.failedIds ?? []
      if (restoredCount > 0) showSuccess(`Successfully restored ${restoredCount} ${entityLabel}s`)
      if (failedIds.length > 0) showError(`Failed to restore ${failedIds.length} ${entityLabel}s`)
      void refetch()
      setSelectedItems(new Set())
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to bulk restore ${entityLabel}s`)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkPermanentDelete = async () => {
    if (!bulkPermanentDelete) return
    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedItems)
      const payload = await bulkPermanentDelete(ids).unwrap()
      const deletedCount = payload?.deletedCount ?? ids.length
      const failedIds = payload?.failedIds ?? []
      if (deletedCount > 0) showSuccess(`Successfully permanently deleted ${deletedCount} ${entityLabel}s`)
      if (failedIds.length > 0) showError(`Failed to delete ${failedIds.length} ${entityLabel}s`)
      void refetch()
      setSelectedItems(new Set())
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to bulk delete ${entityLabel}s`)
    } finally {
      setBulkDeleting(false)
      setShowBulkConfirm(false)
    }
  }

  const hasBulkActions = !!bulkRestore || !!bulkPermanentDelete

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth slotProps={{ paper: { sx: { height: '80vh' } } }}>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Manage soft-deleted {entityLabel}s ({filtered.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These {entityLabel}s have been soft-deleted. You can restore them or permanently delete them from the database.
            <br />
            <strong>Warning:</strong> Permanent deletion cannot be undone!
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              fullWidth
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
              sx={{ flex: 1, minWidth: '300px' }}
            />
            {hasBulkActions && selectedCount > 0 && (
              <>
                {bulkRestore && (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<RestoreIcon />}
                    onClick={() => setShowBulkRestoreConfirm(true)}
                    disabled={bulkRestoring || bulkDeleting}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Restore Selected ({selectedCount})
                  </Button>
                )}
                {bulkPermanentDelete && (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteForeverIcon />}
                    onClick={() => setShowBulkConfirm(true)}
                    disabled={bulkDeleting || bulkRestoring}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Delete Selected ({selectedCount})
                  </Button>
                )}
              </>
            )}
          </Box>
        </Box>

        {isFetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 400 }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                minWidth: isMobile ? 650 : 800,
                '& .MuiTableCell-root': { borderBottom: '1px solid rgba(224, 224, 224, 0.4)', py: 0.75, px: 1.5 },
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  {hasBulkActions && (
                    <TableCell sx={{ width: '48px', padding: '8px' }}>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={partiallySelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        size="small"
                      />
                    </TableCell>
                  )}
                  {columns
                    .filter(col => !col.hideOnMobile || !isMobile)
                    .map((col) => (
                      <TableCell key={col.label} sx={{ width: col.width }} align={col.align ?? 'left'}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          {col.label}
                        </Typography>
                      </TableCell>
                    ))}
                  <TableCell align="right" sx={{ width: isMobile ? '45%' : '13%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + (hasBulkActions ? 2 : 1)} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                        {searchTerm ? `No deleted ${entityLabel}s match your search.` : `No deleted ${entityLabel}s found.`}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{
                        '&:hover, &:focus-within': { backgroundColor: 'action.hover', '& .row-actions': { opacity: 1 } },
                        transition: 'background-color 0.2s ease',
                        cursor: 'default',
                        height: 48,
                      }}
                    >
                      {hasBulkActions && (
                        <TableCell sx={{ padding: '8px' }}>
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                            size="small"
                          />
                        </TableCell>
                      )}
                      {columns
                        .filter(col => !col.hideOnMobile || !isMobile)
                        .map((col) => (
                          <TableCell key={col.label} align={col.align ?? 'left'}>
                            {col.render(item)}
                          </TableCell>
                        ))}
                      <TableCell align="right">
                        <Box
                          className="row-actions"
                          sx={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease',
                          }}
                        >
                          <Tooltip title={`Restore ${entityLabel}`}>
                            <IconButton
                              onClick={() => handleRestore(item)}
                              disabled={restoringId === item.id || deletingId === item.id}
                              size="small"
                              sx={{ color: 'success.main', '&:hover': { backgroundColor: 'success.light', color: 'success.dark' }, p: 0.5 }}
                            >
                              {restoringId === item.id ? <CircularProgress size={16} /> : <RestoreIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete (Cannot be undone)">
                            <IconButton
                              onClick={() => setConfirmDelete(item)}
                              disabled={restoringId === item.id || deletingId === item.id}
                              size="small"
                              sx={{ color: 'error.main', '&:hover': { backgroundColor: 'error.light', color: 'error.dark' }, p: 0.5 }}
                            >
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>

      {/* Single permanent delete confirmation */}
      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="sm" fullWidth>
        <DialogTitle color="error">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteForeverIcon color="error" />
            Permanently Delete {entityLabel}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The {entityLabel} will be completely removed from the database.
          </Alert>
          {confirmDelete && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete this {entityLabel}?
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {getItemLabel(confirmDelete)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} variant="outlined" disabled={deletingId === confirmDelete?.id}>
            Cancel
          </Button>
          <Button
            onClick={() => confirmDelete && handlePermanentDelete(confirmDelete)}
            variant="contained"
            color="error"
            disabled={deletingId === confirmDelete?.id}
            startIcon={deletingId === confirmDelete?.id ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            {deletingId === confirmDelete?.id ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk restore confirmation */}
      <Dialog open={showBulkRestoreConfirm} onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle color="success">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RestoreIcon color="success" />
            Bulk Restore {entityLabel}s
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected {entityLabel}s back to active status.
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected {entityLabel}s?
          </Typography>
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{entityLabel}s to be restored:</Typography>
              {Array.from(selectedItems).slice(0, 5).map(id => {
                const item = filtered.find(i => i.id === id)
                return item ? <Typography key={id} variant="body2">• {getItemLabel(item)}</Typography> : null
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkRestoreConfirm(false)} variant="outlined" disabled={bulkRestoring}>Cancel</Button>
          <Button
            onClick={handleBulkRestore}
            variant="contained"
            color="success"
            disabled={bulkRestoring}
            startIcon={bulkRestoring ? <CircularProgress size={16} /> : <RestoreIcon />}
          >
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} ${entityLabel}s`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk permanent delete confirmation */}
      <Dialog open={showBulkConfirm} onClose={() => !bulkDeleting && setShowBulkConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle color="error">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteForeverIcon color="error" />
            Bulk Permanent Delete
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The selected {entityLabel}s will be completely removed from the database.
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected {entityLabel}s?
          </Typography>
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{entityLabel}s to be deleted:</Typography>
              {Array.from(selectedItems).slice(0, 5).map(id => {
                const item = filtered.find(i => i.id === id)
                return item ? <Typography key={id} variant="body2">• {getItemLabel(item)}</Typography> : null
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkConfirm(false)} variant="outlined" disabled={bulkDeleting}>Cancel</Button>
          <Button
            onClick={handleBulkPermanentDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} ${entityLabel}s`}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default GenericDeletedDialog
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -A 3 "GenericDeletedDialog"
```

Expected: no errors referencing `GenericDeletedDialog.tsx`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/common/GenericDeletedDialog.tsx
git commit -m "feat(common): add GenericDeletedDialog generic component"
```

---

## Task 2: Write tests for GenericDeletedDialog

**Files:**
- Create: `frontend/src/components/common/GenericDeletedDialog.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GenericDeletedDialog from './GenericDeletedDialog'
import type { ColumnDef } from './GenericDeletedDialog'
import { Typography } from '@mui/material'

// Minimal test entity
type TestEntity = { id: string; name: string }

const items: TestEntity[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
  { id: '3', name: 'Gamma' },
]

const columns: ColumnDef<TestEntity>[] = [
  { label: 'Name', render: (item) => <Typography>{item.name}</Typography> },
]

// RTK Query hook mocks
const makeQueryHook = (data: TestEntity[]) =>
  vi.fn(() => ({ data: { data }, isFetching: false, refetch: vi.fn() }))

const makeMutationHook = (fn = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))) =>
  vi.fn(() => [fn, { isLoading: false }] as const)

const makeBulkMutationHook = (fn = vi.fn(() => ({ unwrap: () => Promise.resolve({ restoredCount: 1, deletedCount: 1, failedIds: [] }) }))) =>
  vi.fn(() => [fn, { isLoading: false }] as const)

// Mock useNotification
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderDialog(overrides: Partial<Parameters<typeof GenericDeletedDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    title: 'Deleted Items',
    entityLabel: 'item',
    icon: <span data-testid="test-icon" />,
    columns,
    getItemLabel: (item: TestEntity) => item.name,
    searchPlaceholder: 'Search...',
    filterItem: (item: TestEntity, term: string) => item.name.toLowerCase().includes(term),
    useGetDeletedQuery: makeQueryHook(items),
    useRestoreMutation: makeMutationHook(),
    usePermanentDeleteMutation: makeMutationHook(),
    useBulkRestoreMutation: makeBulkMutationHook(),
    useBulkPermanentDeleteMutation: makeBulkMutationHook(),
    ...overrides,
  }
  return render(<GenericDeletedDialog {...props} />)
}

describe('GenericDeletedDialog', () => {
  it('renders title, icon, and item count', () => {
    renderDialog()
    expect(screen.getByText('Deleted Items')).toBeInTheDocument()
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
    expect(screen.getByText(/3 total/)).toBeInTheDocument()
  })

  it('filters items by search term', async () => {
    renderDialog()
    const input = screen.getByPlaceholderText('Search...')
    await userEvent.type(input, 'alpha')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
  })

  it('calls restore mutation with the item id when restore button clicked', async () => {
    const restoreFn = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))
    renderDialog({ useRestoreMutation: vi.fn(() => [restoreFn, { isLoading: false }] as const) })
    const restoreButtons = screen.getAllByTitle('Restore item')
    await userEvent.click(restoreButtons[0])
    expect(restoreFn).toHaveBeenCalledWith('1')
  })

  it('opens confirmation dialog when permanent delete clicked, then calls mutation on confirm', async () => {
    const deleteFn = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))
    renderDialog({ usePermanentDeleteMutation: vi.fn(() => [deleteFn, { isLoading: false }] as const) })
    const deleteButtons = screen.getAllByTitle('Permanently Delete (Cannot be undone)')
    await userEvent.click(deleteButtons[0])
    expect(screen.getByText('Permanently Delete item')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: 'Permanently Delete' })
    await userEvent.click(confirmBtn)
    expect(deleteFn).toHaveBeenCalledWith('1')
  })

  it('shows bulk action buttons when items are selected', async () => {
    renderDialog()
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1]) // first item checkbox (index 0 is select-all)
    expect(screen.getByText(/Restore Selected \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Delete Selected \(1\)/)).toBeInTheDocument()
  })

  it('calls bulk restore mutation with selected ids', async () => {
    const bulkRestoreFn = vi.fn(() => ({ unwrap: () => Promise.resolve({ restoredCount: 1, failedIds: [] }) }))
    renderDialog({ useBulkRestoreMutation: vi.fn(() => [bulkRestoreFn, { isLoading: false }] as const) })
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1])
    await userEvent.click(screen.getByText(/Restore Selected/))
    const confirmBtn = screen.getByRole('button', { name: /Restore 1 items/ })
    await userEvent.click(confirmBtn)
    expect(bulkRestoreFn).toHaveBeenCalledWith(['1'])
  })

  it('calls bulk permanent delete mutation with selected ids', async () => {
    const bulkDeleteFn = vi.fn(() => ({ unwrap: () => Promise.resolve({ deletedCount: 1, failedIds: [] }) }))
    renderDialog({ useBulkPermanentDeleteMutation: vi.fn(() => [bulkDeleteFn, { isLoading: false }] as const) })
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1])
    await userEvent.click(screen.getByText(/Delete Selected/))
    const confirmBtn = screen.getByRole('button', { name: /Delete 1 items/ })
    await userEvent.click(confirmBtn)
    expect(bulkDeleteFn).toHaveBeenCalledWith(['1'])
  })

  it('select-all checkbox selects all filtered items', async () => {
    renderDialog()
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0]) // select-all
    expect(screen.getByText(/Restore Selected \(3\)/)).toBeInTheDocument()
  })

  it('resets selection when dialog reopens', async () => {
    const { rerender } = renderDialog()
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1])
    expect(screen.getByText(/Restore Selected \(1\)/)).toBeInTheDocument()
    // Close and reopen
    rerender(
      <GenericDeletedDialog
        open={false}
        onClose={vi.fn()}
        title="Deleted Items"
        entityLabel="item"
        icon={<span />}
        columns={columns}
        getItemLabel={(item: TestEntity) => item.name}
        searchPlaceholder="Search..."
        filterItem={(item: TestEntity, term: string) => item.name.toLowerCase().includes(term)}
        useGetDeletedQuery={makeQueryHook(items)}
        useRestoreMutation={makeMutationHook()}
        usePermanentDeleteMutation={makeMutationHook()}
        useBulkRestoreMutation={makeBulkMutationHook()}
        useBulkPermanentDeleteMutation={makeBulkMutationHook()}
      />
    )
    rerender(
      <GenericDeletedDialog
        open={true}
        onClose={vi.fn()}
        title="Deleted Items"
        entityLabel="item"
        icon={<span />}
        columns={columns}
        getItemLabel={(item: TestEntity) => item.name}
        searchPlaceholder="Search..."
        filterItem={(item: TestEntity, term: string) => item.name.toLowerCase().includes(term)}
        useGetDeletedQuery={makeQueryHook(items)}
        useRestoreMutation={makeMutationHook()}
        usePermanentDeleteMutation={makeMutationHook()}
        useBulkRestoreMutation={makeBulkMutationHook()}
        useBulkPermanentDeleteMutation={makeBulkMutationHook()}
      />
    )
    expect(screen.queryByText(/Restore Selected/)).not.toBeInTheDocument()
  })

  it('shows empty state message when search has no results', async () => {
    renderDialog()
    const input = screen.getByPlaceholderText('Search...')
    await userEvent.type(input, 'zzzzz')
    expect(screen.getByText('No deleted items match your search.')).toBeInTheDocument()
  })

  it('hides bulk action buttons when no bulk hooks provided', () => {
    renderDialog({ useBulkRestoreMutation: undefined, useBulkPermanentDeleteMutation: undefined })
    const checkboxes = screen.queryAllByRole('checkbox')
    expect(checkboxes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run src/components/common/GenericDeletedDialog.test.tsx
```

Expected: all 10 tests pass. If any fail due to MUI Dialog rendering issues, check that the test environment has `@testing-library/jest-dom` matchers set up in `vitest.setup.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/GenericDeletedDialog.test.tsx
git commit -m "test(common): add GenericDeletedDialog tests"
```

---

## Task 3: Migrate inventory dialogs (Products, Categories, StockAdjustments)

**Files:**
- Modify: `frontend/src/components/inventory/DeletedProductsDialog.tsx`
- Modify: `frontend/src/components/inventory/DeletedCategoriesDialog.tsx`
- Modify: `frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx`

- [ ] **Step 1: Replace DeletedProductsDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip } from '@mui/material'
import { default as ProductIcon } from '@mui/icons-material/Inventory2'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteProductsMutation,
  useBulkRestoreProductsMutation,
  useGetDeletedProductsQuery,
  usePermanentDeleteProductMutation,
  useRestoreProductMutation,
} from '@/store/api/inventoryApi'
import type { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

const columns: ColumnDef<Product>[] = [
  {
    label: 'Product Name',
    width: '40%',
    render: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
    ),
  },
  {
    label: 'Category',
    width: '20%',
    render: (p) => (
      <Chip
        label={p.category?.name || 'No Category'}
        size="small"
        variant="outlined"
        color={p.category ? 'primary' : 'default'}
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
      />
    ),
  },
  {
    label: 'Price',
    width: '12%',
    align: 'right',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" sx={{ fontWeight: 500 }} color="primary">
        {p.pricingTiers && Object.keys(p.pricingTiers).length > 0
          ? formatCurrency(Object.values(p.pricingTiers)[0] as number)
          : '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(p as any).deletedAt ? formatDate((p as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedProductsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedProductsDialog: React.FC<DeletedProductsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<Product>
    open={open}
    onClose={onClose}
    title="Deleted Products"
    entityLabel="product"
    icon={<ProductIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(p) => p.name}
    searchPlaceholder="Search deleted products..."
    filterItem={(p, term) =>
      p.name?.toLowerCase().includes(term) ||
      (p.barcode?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedProductsQuery}
    useRestoreMutation={useRestoreProductMutation}
    usePermanentDeleteMutation={usePermanentDeleteProductMutation}
    useBulkRestoreMutation={useBulkRestoreProductsMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteProductsMutation}
  />
)

export default DeletedProductsDialog
```

- [ ] **Step 2: Replace DeletedCategoriesDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip } from '@mui/material'
import { default as CategoryIcon } from '@mui/icons-material/Category'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteCategoriesMutation,
  useBulkRestoreCategoriesMutation,
  useGetDeletedCategoriesQuery,
  usePermanentDeleteCategoryMutation,
  useRestoreCategoryMutation,
} from '@/store/api/inventoryApi'
import type { Category } from '@/types'
import { formatDate } from '@/utils/formatters'

const columns: ColumnDef<Category>[] = [
  {
    label: 'Category Name',
    width: '40%',
    render: (c) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
    ),
  },
  {
    label: 'Path',
    width: '30%',
    hideOnMobile: true,
    render: (c) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{c.fullPath}</Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (c) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(c as any).deletedAt ? formatDate((c as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedCategoriesDialogProps {
  open: boolean
  onClose: () => void
  onCategoryRestored?: () => void
}

const DeletedCategoriesDialog: React.FC<DeletedCategoriesDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<Category>
    open={open}
    onClose={onClose}
    title="Deleted Categories"
    entityLabel="category"
    icon={<CategoryIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(c) => c.name}
    searchPlaceholder="Search deleted categories..."
    filterItem={(c, term) =>
      c.name?.toLowerCase().includes(term) ||
      (c.fullPath?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedCategoriesQuery}
    useRestoreMutation={useRestoreCategoryMutation}
    usePermanentDeleteMutation={usePermanentDeleteCategoryMutation}
    useBulkRestoreMutation={useBulkRestoreCategoriesMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteCategoriesMutation}
  />
)

export default DeletedCategoriesDialog
```

- [ ] **Step 3: Replace DeletedStockAdjustmentsDialog.tsx**

Note: `useBulkRestoreStockAdjustmentsMutation` does not exist in `inventoryApi` — only `useBulkPermanentDeleteStockAdjustmentsMutation` exists. Omit the bulk restore prop.

```tsx
import React from 'react'
import { Typography, Chip } from '@mui/material'
import { default as AssessmentIcon } from '@mui/icons-material/Assessment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteStockAdjustmentsMutation,
  useGetDeletedStockAdjustmentsQuery,
  usePermanentDeleteStockAdjustmentMutation,
  useRestoreStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

const columns: ColumnDef<StockAdjustment>[] = [
  {
    label: 'Adjustment Number',
    width: '30%',
    render: (a) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.adjustmentNumber}</Typography>
    ),
  },
  {
    label: 'Status',
    width: '15%',
    render: (a) => (
      <Chip label={a.status} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
    ),
  },
  {
    label: 'Items',
    width: '10%',
    align: 'right',
    hideOnMobile: true,
    render: (a) => <Typography variant="caption">{a.itemCount}</Typography>,
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (a) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(a as any).deletedAt ? formatDate((a as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedStockAdjustmentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedStockAdjustmentsDialog: React.FC<DeletedStockAdjustmentsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<StockAdjustment>
    open={open}
    onClose={onClose}
    title="Deleted Stock Adjustments"
    entityLabel="stock adjustment"
    icon={<AssessmentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(a) => a.adjustmentNumber}
    searchPlaceholder="Search deleted stock adjustments..."
    filterItem={(a, term) =>
      a.adjustmentNumber?.toLowerCase().includes(term) ||
      (a.notes?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedStockAdjustmentsQuery}
    useRestoreMutation={useRestoreStockAdjustmentMutation}
    usePermanentDeleteMutation={usePermanentDeleteStockAdjustmentMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteStockAdjustmentsMutation}
  />
)

export default DeletedStockAdjustmentsDialog
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|warning" | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/inventory/DeletedProductsDialog.tsx \
        frontend/src/components/inventory/DeletedCategoriesDialog.tsx \
        frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx
git commit -m "refactor(inventory): migrate Deleted*Dialog components to GenericDeletedDialog"
```

---

## Task 4: Migrate sales dialogs (Customers, Orders, Invoices, Payments)

**Files:**
- Modify: `frontend/src/components/sales/DeletedCustomersDialog.tsx`
- Modify: `frontend/src/components/sales/DeletedOrdersDialog.tsx`
- Modify: `frontend/src/components/sales/DeletedInvoicesDialog.tsx`
- Modify: `frontend/src/components/sales/DeletedPaymentsDialog.tsx`

Note: `DeletedInvoicesDialog` and `DeletedPaymentsDialog` currently have no restore/permanent-delete mutations at all — they are read-only lists. For these two, pass stub no-op mutations until the backend supports them. Check the actual API files first.

- [ ] **Step 1: Verify available hooks for invoices and payments**

```bash
grep -n "useRestoreInvoice\|usePermanentDeleteInvoice\|useRestorePayment\|usePermanentDeletePayment\|useBulkPermanentDeleteInvoice\|useBulkPermanentDeletePayment" frontend/src/store/api/salesApi.ts
```

If the hooks don't exist, the wrappers for Invoices and Payments will pass only `useGetDeletedQuery` and display-only columns (no restore/delete actions). Skip those two wrappers in this task and document them as read-only.

- [ ] **Step 2: Replace DeletedCustomersDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip, Stack, Box } from '@mui/material'
import { default as PersonIcon } from '@mui/icons-material/Person'
import { default as EmailIcon } from '@mui/icons-material/Email'
import { default as PhoneIcon } from '@mui/icons-material/Phone'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteCustomersMutation,
  useBulkRestoreCustomersMutation,
  useGetDeletedCustomersQuery,
  usePermanentDeleteCustomerMutation,
  useRestoreCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { formatDate } from '@/utils/formatters'

type DeletedCustomer = Customer & { email?: string; deletedAt?: string | Date }

const columns: ColumnDef<DeletedCustomer>[] = [
  {
    label: 'Customer Details',
    width: '30%',
    render: (c) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
    ),
  },
  {
    label: 'Type',
    width: '15%',
    render: (c) => (
      <Chip
        label={c.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
        size="small"
        variant="outlined"
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
      />
    ),
  },
  {
    label: 'Contact',
    width: '20%',
    hideOnMobile: true,
    render: (c) => (
      <Stack spacing={0.5}>
        {c.email && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{c.email}</Typography>
          </Box>
        )}
        {c.phone && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{c.phone}</Typography>
          </Box>
        )}
      </Stack>
    ),
  },
  {
    label: 'Deleted Date',
    width: '20%',
    hideOnMobile: true,
    render: (c) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {c.deletedAt ? formatDate(String(c.deletedAt)) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedCustomersDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedCustomersDialog: React.FC<DeletedCustomersDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedCustomer>
    open={open}
    onClose={onClose}
    title="Deleted Customers"
    entityLabel="customer"
    icon={<PersonIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(c) => c.name}
    searchPlaceholder="Search deleted customers..."
    filterItem={(c, term) =>
      c.name?.toLowerCase().includes(term) ||
      (c.email?.toLowerCase().includes(term) ?? false) ||
      (c.phone?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedCustomersQuery}
    useRestoreMutation={useRestoreCustomerMutation}
    usePermanentDeleteMutation={usePermanentDeleteCustomerMutation}
    useBulkRestoreMutation={useBulkRestoreCustomersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteCustomersMutation}
  />
)

export default DeletedCustomersDialog
```

- [ ] **Step 3: Replace DeletedOrdersDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip } from '@mui/material'
import { default as OrderIcon } from '@mui/icons-material/Receipt'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteSalesOrdersMutation,
  useBulkRestoreSalesOrdersMutation,
  useGetDeletedSalesOrdersQuery,
  usePermanentDeleteSalesOrderMutation,
  useRestoreSalesOrderMutation,
} from '@/store/api/salesApi'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedSalesOrder = SalesOrder & { deletedAt?: string | Date }

const columns: ColumnDef<DeletedSalesOrder>[] = [
  {
    label: 'Order Number',
    width: '25%',
    render: (o) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.orderNumber}</Typography>
    ),
  },
  {
    label: 'Customer',
    width: '25%',
    render: (o) => (
      <Typography variant="body2">{o.customer?.name || '-'}</Typography>
    ),
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (o) => (
      <Typography variant="caption" sx={{ fontWeight: 500 }} color="primary">
        {formatCurrency(o.totalAmount)}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (o) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {o.deletedAt ? formatDate(String(o.deletedAt)) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedOrdersDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedOrdersDialog: React.FC<DeletedOrdersDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedSalesOrder>
    open={open}
    onClose={onClose}
    title="Deleted Orders"
    entityLabel="order"
    icon={<OrderIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(o) => o.orderNumber}
    searchPlaceholder="Search deleted orders..."
    filterItem={(o, term) =>
      o.orderNumber?.toLowerCase().includes(term) ||
      (o.customer?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedSalesOrdersQuery}
    useRestoreMutation={useRestoreSalesOrderMutation}
    usePermanentDeleteMutation={usePermanentDeleteSalesOrderMutation}
    useBulkRestoreMutation={useBulkRestoreSalesOrdersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteSalesOrdersMutation}
  />
)

export default DeletedOrdersDialog
```

- [ ] **Step 4: Handle DeletedInvoicesDialog and DeletedPaymentsDialog**

Run the check from Step 1. If `useRestoreInvoiceMutation` and `usePermanentDeleteInvoiceMutation` do not exist in `salesApi.ts`, replace both files with read-only wrappers that skip bulk/action hooks entirely by passing stub hooks:

For `DeletedInvoicesDialog.tsx`:
```tsx
import React from 'react'
import { Typography } from '@mui/material'
import { default as InvoiceIcon } from '@mui/icons-material/ReceiptLong'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import { useGetDeletedInvoicesQuery } from '@/store/api/salesApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedInvoice = {
  id: string
  invoiceNumber?: string
  customerName?: string
  customer?: { name?: string }
  totalAmount?: number
  total?: number
  deletedAt?: string | Date
}

const columns: ColumnDef<DeletedInvoice>[] = [
  {
    label: 'Invoice Number',
    width: '30%',
    render: (i) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{i.invoiceNumber || '-'}</Typography>
    ),
  },
  {
    label: 'Customer',
    width: '30%',
    render: (i) => (
      <Typography variant="body2">{i.customer?.name || i.customerName || '-'}</Typography>
    ),
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (i) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {i.totalAmount != null ? formatCurrency(i.totalAmount) : i.total != null ? formatCurrency(i.total) : '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (i) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {i.deletedAt ? formatDate(String(i.deletedAt)) : 'Unknown'}
      </Typography>
    ),
  },
]

// Stub mutations — replace with real hooks when backend restore/delete is implemented
const useNoopMutation = () => [() => ({ unwrap: () => Promise.resolve({}) }), { isLoading: false }] as const

interface DeletedInvoicesDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedInvoicesDialog: React.FC<DeletedInvoicesDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedInvoice>
    open={open}
    onClose={onClose}
    title="Deleted Invoices"
    entityLabel="invoice"
    icon={<InvoiceIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(i) => i.invoiceNumber || i.id}
    searchPlaceholder="Search deleted invoices..."
    filterItem={(i, term) =>
      (i.invoiceNumber?.toLowerCase().includes(term) ?? false) ||
      (i.customerName?.toLowerCase().includes(term) ?? false) ||
      (i.customer?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedInvoicesQuery}
    useRestoreMutation={useNoopMutation}
    usePermanentDeleteMutation={useNoopMutation}
  />
)

export default DeletedInvoicesDialog
```

Apply the same pattern for `DeletedPaymentsDialog.tsx`:
```tsx
import React from 'react'
import { Typography } from '@mui/material'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import { useGetDeletedPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedPayment = {
  id: string
  paymentNumber?: string
  customerName?: string
  customer?: { name?: string }
  amount?: number
  deletedAt?: string | Date
}

const columns: ColumnDef<DeletedPayment>[] = [
  {
    label: 'Payment Number',
    width: '30%',
    render: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.paymentNumber || '-'}</Typography>
    ),
  },
  {
    label: 'Customer',
    width: '30%',
    render: (p) => (
      <Typography variant="body2">{p.customer?.name || p.customerName || '-'}</Typography>
    ),
  },
  {
    label: 'Amount',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {p.amount != null ? formatCurrency(p.amount) : '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {p.deletedAt ? formatDate(String(p.deletedAt)) : 'Unknown'}
      </Typography>
    ),
  },
]

const useNoopMutation = () => [() => ({ unwrap: () => Promise.resolve({}) }), { isLoading: false }] as const

interface DeletedPaymentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedPaymentsDialog: React.FC<DeletedPaymentsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedPayment>
    open={open}
    onClose={onClose}
    title="Deleted Payments"
    entityLabel="payment"
    icon={<PaymentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(p) => p.paymentNumber || p.id}
    searchPlaceholder="Search deleted payments..."
    filterItem={(p, term) =>
      (p.paymentNumber?.toLowerCase().includes(term) ?? false) ||
      (p.customerName?.toLowerCase().includes(term) ?? false) ||
      (p.customer?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedPaymentsQuery}
    useRestoreMutation={useNoopMutation}
    usePermanentDeleteMutation={useNoopMutation}
  />
)

export default DeletedPaymentsDialog
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error" | head -20
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/sales/DeletedCustomersDialog.tsx \
        frontend/src/components/sales/DeletedOrdersDialog.tsx \
        frontend/src/components/sales/DeletedInvoicesDialog.tsx \
        frontend/src/components/sales/DeletedPaymentsDialog.tsx
git commit -m "refactor(sales): migrate Deleted*Dialog components to GenericDeletedDialog"
```

---

## Task 5: Migrate purchasing dialogs (Suppliers, PurchaseOrders, GRNs, VendorPayments)

**Files:**
- Modify: `frontend/src/components/purchasing/DeletedSuppliersDialog.tsx`
- Modify: `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx`
- Modify: `frontend/src/components/purchasing/DeletedGRNsDialog.tsx`
- Modify: `frontend/src/components/purchasing/DeletedVendorPaymentsDialog.tsx`

Note: GRNs and VendorPayments have no restore/bulk mutations in `purchasingApi.ts` — use `useNoopMutation` for those two.

- [ ] **Step 1: Replace DeletedSuppliersDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip, Stack, Box } from '@mui/material'
import { default as BusinessIcon } from '@mui/icons-material/Business'
import { default as PhoneIcon } from '@mui/icons-material/Phone'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteSuppliersMutation,
  useBulkRestoreSuppliersMutation,
  useGetDeletedSuppliersQuery,
  usePermanentDeleteSupplierMutation,
  useRestoreSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { formatDate } from '@/utils/formatters'

const columns: ColumnDef<Supplier>[] = [
  {
    label: 'Supplier',
    width: '30%',
    render: (s) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.companyName}</Typography>
    ),
  },
  {
    label: 'Type',
    width: '15%',
    render: (s) => (
      <Chip
        label={s.type === SupplierType.MANUFACTURER ? 'Manufacturer' : s.type}
        size="small"
        variant="outlined"
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
      />
    ),
  },
  {
    label: 'Contact',
    width: '20%',
    hideOnMobile: true,
    render: (s) => (
      <Stack spacing={0.5}>
        {s.contactPerson && (
          <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{s.contactPerson}</Typography>
        )}
        {s.phone && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{s.phone}</Typography>
          </Box>
        )}
      </Stack>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (s) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(s as any).deletedAt ? formatDate((s as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedSuppliersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const DeletedSuppliersDialog: React.FC<DeletedSuppliersDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<Supplier>
    open={open}
    onClose={onClose}
    title="Deleted Suppliers"
    entityLabel="supplier"
    icon={<BusinessIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(s) => s.companyName}
    searchPlaceholder="Search deleted suppliers..."
    filterItem={(s, term) =>
      s.companyName?.toLowerCase().includes(term) ||
      (s.contactPerson?.toLowerCase().includes(term) ?? false) ||
      (s.phone?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedSuppliersQuery}
    useRestoreMutation={useRestoreSupplierMutation}
    usePermanentDeleteMutation={usePermanentDeleteSupplierMutation}
    useBulkRestoreMutation={useBulkRestoreSuppliersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteSuppliersMutation}
  />
)

export default DeletedSuppliersDialog
```

- [ ] **Step 2: Replace DeletedPurchaseOrdersDialog.tsx**

```tsx
import React from 'react'
import { Typography } from '@mui/material'
import { default as OrderIcon } from '@mui/icons-material/Description'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeletePurchaseOrdersMutation,
  useBulkRestorePurchaseOrdersMutation,
  useGetDeletedPurchaseOrdersQuery,
  usePermanentDeletePurchaseOrderMutation,
  useRestorePurchaseOrderMutation,
} from '@/store/api/purchasingApi'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

const columns: ColumnDef<PurchaseOrder>[] = [
  {
    label: 'Order Number',
    width: '25%',
    render: (o) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.orderNumber}</Typography>
    ),
  },
  {
    label: 'Supplier',
    width: '30%',
    render: (o) => (
      <Typography variant="body2">{o.supplier?.companyName || '-'}</Typography>
    ),
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (o) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {formatCurrency(o.total)}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (o) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(o as any).deletedAt ? formatDate((o as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedPurchaseOrdersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const DeletedPurchaseOrdersDialog: React.FC<DeletedPurchaseOrdersDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<PurchaseOrder>
    open={open}
    onClose={onClose}
    title="Deleted Purchase Orders"
    entityLabel="purchase order"
    icon={<OrderIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(o) => o.orderNumber}
    searchPlaceholder="Search deleted purchase orders..."
    filterItem={(o, term) =>
      o.orderNumber?.toLowerCase().includes(term) ||
      (o.supplier?.companyName?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedPurchaseOrdersQuery}
    useRestoreMutation={useRestorePurchaseOrderMutation}
    usePermanentDeleteMutation={usePermanentDeletePurchaseOrderMutation}
    useBulkRestoreMutation={useBulkRestorePurchaseOrdersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeletePurchaseOrdersMutation}
  />
)

export default DeletedPurchaseOrdersDialog
```

- [ ] **Step 3: Replace DeletedGRNsDialog.tsx and DeletedVendorPaymentsDialog.tsx**

For GRNs:
```tsx
import React from 'react'
import { Typography } from '@mui/material'
import { default as GRNIcon } from '@mui/icons-material/LocalShipping'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import { useGetDeletedGRNsQuery } from '@/store/api/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedGRN = {
  id: string
  grnNumber?: string
  supplier?: { companyName?: string }
  totalAmount?: number
  deletedAt?: string | Date
}

const columns: ColumnDef<DeletedGRN>[] = [
  {
    label: 'GRN Number',
    width: '30%',
    render: (g) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{g.grnNumber || '-'}</Typography>
    ),
  },
  {
    label: 'Supplier',
    width: '30%',
    render: (g) => (
      <Typography variant="body2">{g.supplier?.companyName || '-'}</Typography>
    ),
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (g) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {g.totalAmount != null ? formatCurrency(g.totalAmount) : '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (g) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {g.deletedAt ? formatDate(String(g.deletedAt)) : 'Unknown'}
      </Typography>
    ),
  },
]

const useNoopMutation = () => [() => ({ unwrap: () => Promise.resolve({}) }), { isLoading: false }] as const

interface DeletedGRNsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedGRNsDialog: React.FC<DeletedGRNsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedGRN>
    open={open}
    onClose={onClose}
    title="Deleted GRNs"
    entityLabel="GRN"
    icon={<GRNIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(g) => g.grnNumber || g.id}
    searchPlaceholder="Search deleted GRNs..."
    filterItem={(g, term) =>
      (g.grnNumber?.toLowerCase().includes(term) ?? false) ||
      (g.supplier?.companyName?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedGRNsQuery}
    useRestoreMutation={useNoopMutation}
    usePermanentDeleteMutation={useNoopMutation}
  />
)

export default DeletedGRNsDialog
```

For `DeletedVendorPaymentsDialog.tsx`:
```tsx
import React from 'react'
import { Typography } from '@mui/material'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import { useGetDeletedVendorPaymentsQuery } from '@/store/api/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedVendorPayment = {
  id: string
  paymentNumber?: string
  supplier?: { companyName?: string }
  amount?: number
  deletedAt?: string | Date
}

const columns: ColumnDef<DeletedVendorPayment>[] = [
  {
    label: 'Payment Number',
    width: '30%',
    render: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.paymentNumber || '-'}</Typography>
    ),
  },
  {
    label: 'Supplier',
    width: '30%',
    render: (p) => (
      <Typography variant="body2">{p.supplier?.companyName || '-'}</Typography>
    ),
  },
  {
    label: 'Amount',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {p.amount != null ? formatCurrency(p.amount) : '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {p.deletedAt ? formatDate(String(p.deletedAt)) : 'Unknown'}
      </Typography>
    ),
  },
]

const useNoopMutation = () => [() => ({ unwrap: () => Promise.resolve({}) }), { isLoading: false }] as const

interface DeletedVendorPaymentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedVendorPaymentsDialog: React.FC<DeletedVendorPaymentsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedVendorPayment>
    open={open}
    onClose={onClose}
    title="Deleted Vendor Payments"
    entityLabel="vendor payment"
    icon={<PaymentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(p) => p.paymentNumber || p.id}
    searchPlaceholder="Search deleted vendor payments..."
    filterItem={(p, term) =>
      (p.paymentNumber?.toLowerCase().includes(term) ?? false) ||
      (p.supplier?.companyName?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedVendorPaymentsQuery}
    useRestoreMutation={useNoopMutation}
    usePermanentDeleteMutation={useNoopMutation}
  />
)

export default DeletedVendorPaymentsDialog
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error" | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/purchasing/DeletedSuppliersDialog.tsx \
        frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx \
        frontend/src/components/purchasing/DeletedGRNsDialog.tsx \
        frontend/src/components/purchasing/DeletedVendorPaymentsDialog.tsx
git commit -m "refactor(purchasing): migrate Deleted*Dialog components to GenericDeletedDialog"
```

---

## Task 6: Migrate accounting and settings dialogs (Accounts, PaymentMethods)

**Files:**
- Modify: `frontend/src/components/accounting/DeletedAccountsDialog.tsx`
- Modify: `frontend/src/components/settings/DeletedPaymentMethodsDialog.tsx`

Note: `DeletedPaymentMethodsDialog` has no bulk mutations — use `useNoopMutation` for bulk hooks.

- [ ] **Step 1: Replace DeletedAccountsDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip } from '@mui/material'
import { default as AccountIcon } from '@mui/icons-material/AccountBalance'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteChartOfAccountsMutation,
  useBulkRestoreChartOfAccountsMutation,
  useGetDeletedChartOfAccountsQuery,
  usePermanentDeleteChartOfAccountMutation,
  useRestoreChartOfAccountMutation,
} from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import { formatDate } from '@/utils/formatters'

const columns: ColumnDef<ChartOfAccount>[] = [
  {
    label: 'Code',
    width: '15%',
    render: (a) => (
      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{a.code}</Typography>
    ),
  },
  {
    label: 'Account Name',
    width: '35%',
    render: (a) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.name}</Typography>
    ),
  },
  {
    label: 'Type',
    width: '20%',
    render: (a) => (
      <Chip label={a.type} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (a) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(a as any).deletedAt ? formatDate((a as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedAccountsDialogProps {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

const DeletedAccountsDialog: React.FC<DeletedAccountsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<ChartOfAccount>
    open={open}
    onClose={onClose}
    title="Deleted Accounts"
    entityLabel="account"
    icon={<AccountIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(a) => `${a.code} - ${a.name}`}
    searchPlaceholder="Search deleted accounts..."
    filterItem={(a, term) =>
      a.code?.toLowerCase().includes(term) ||
      a.name?.toLowerCase().includes(term) ||
      (a.type?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedChartOfAccountsQuery}
    useRestoreMutation={useRestoreChartOfAccountMutation}
    usePermanentDeleteMutation={usePermanentDeleteChartOfAccountMutation}
    useBulkRestoreMutation={useBulkRestoreChartOfAccountsMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteChartOfAccountsMutation}
  />
)

export default DeletedAccountsDialog
```

- [ ] **Step 2: Replace DeletedPaymentMethodsDialog.tsx**

```tsx
import React from 'react'
import { Typography, Chip } from '@mui/material'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useGetDeletedPaymentMethodsQuery,
  usePermanentDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation,
} from '@/store/api/accountingApi'
import type { PaymentMethodConfig } from '@/types'
import { formatDate } from '@/utils/formatters'

const columns: ColumnDef<PaymentMethodConfig>[] = [
  {
    label: 'Code',
    width: '15%',
    render: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.code}</Typography>
    ),
  },
  {
    label: 'Name',
    width: '35%',
    render: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '20%',
    hideOnMobile: true,
    render: (p) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {(p as any).deletedAt ? formatDate((p as any).deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

interface DeletedPaymentMethodsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedPaymentMethodsDialog: React.FC<DeletedPaymentMethodsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<PaymentMethodConfig>
    open={open}
    onClose={onClose}
    title="Deleted Payment Methods"
    entityLabel="payment method"
    icon={<PaymentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(p) => p.name}
    searchPlaceholder="Search deleted payment methods..."
    filterItem={(p, term) =>
      p.name?.toLowerCase().includes(term) ||
      p.code?.toLowerCase().includes(term)
    }
    useGetDeletedQuery={useGetDeletedPaymentMethodsQuery}
    getItems={(data) => data ?? []}
    useRestoreMutation={useRestorePaymentMethodMutation}
    usePermanentDeleteMutation={usePermanentDeletePaymentMethodMutation}
  />
)

export default DeletedPaymentMethodsDialog
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error" | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/accounting/DeletedAccountsDialog.tsx \
        frontend/src/components/settings/DeletedPaymentMethodsDialog.tsx
git commit -m "refactor(accounting,settings): migrate Deleted*Dialog components to GenericDeletedDialog"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full type-check**

```bash
cd frontend && npm run type-check
```

Expected: 0 errors

- [ ] **Step 2: Run the GenericDeletedDialog test suite**

```bash
cd frontend && npx vitest run src/components/common/GenericDeletedDialog.test.tsx
```

Expected: 10 tests pass, 0 fail

- [ ] **Step 3: Run full frontend test suite to check for regressions**

```bash
cd frontend && npm run test
```

This takes ~12 minutes — do not assume it is hung. Expected: all tests pass.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p  # stage only what changed
git commit -m "fix: resolve type-check issues after GenericDeletedDialog migration"
```
