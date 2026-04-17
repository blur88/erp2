import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as DeleteForeverIcon } from '@mui/icons-material/DeleteForever'
import { default as RestoreIcon } from '@mui/icons-material/Restore'
import { default as SearchIcon } from '@mui/icons-material/Search'
import { useNotification } from '@/hooks/useNotification'

export interface ColumnDef<T> {
  label: string
  render: (item: T) => React.ReactNode
  width?: string
  hideOnMobile?: boolean
  align?: 'left' | 'right' | 'center'
}

type QueryResult = {
  data?: unknown
  isFetching?: boolean
  isLoading?: boolean
  refetch?: () => unknown
}

type QueryHook = (arg?: unknown, options?: unknown) => QueryResult
type MutationFn = ((...args: any[]) => { unwrap?: () => Promise<any> }) | null
type MutationHook = () => readonly [MutationFn, { isLoading?: boolean }]

export interface GenericDeletedDialogProps<T extends { id: string }> {
  open: boolean
  onClose: () => void
  title: string
  entityLabel: string
  entityLabelPlural?: string
  icon: React.ReactNode
  columns: ColumnDef<T>[]
  getItemLabel: (item: T) => string
  searchPlaceholder: string
  filterItem: (item: T, searchTerm: string) => boolean
  useGetDeletedQuery: QueryHook
  queryArg?: unknown
  queryOptions?: unknown
  getItems?: (data: unknown) => T[]
  useRestoreMutation?: MutationHook
  usePermanentDeleteMutation?: MutationHook
  useBulkRestoreMutation?: MutationHook
  useBulkPermanentDeleteMutation?: MutationHook
  onChanged?: () => void
  infoMessage?: React.ReactNode
}

function GenericDeletedDialog<T extends { id: string }>({
  open,
  onClose,
  title,
  entityLabel,
  entityLabelPlural = `${entityLabel}s`,
  icon,
  columns,
  getItemLabel,
  searchPlaceholder,
  filterItem,
  useGetDeletedQuery,
  queryArg = {},
  queryOptions = { skip: !open },
  getItems = (data) => ((data as { data?: T[] } | undefined)?.data ?? []),
  useRestoreMutation,
  usePermanentDeleteMutation,
  useBulkRestoreMutation,
  useBulkPermanentDeleteMutation,
  onChanged,
  infoMessage,
}: GenericDeletedDialogProps<T>) {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const { data, isFetching, isLoading, refetch } = useGetDeletedQuery(queryArg, queryOptions)
  const restoreTuple = useRestoreMutation?.() ?? [null, { isLoading: false }]
  const permanentDeleteTuple = usePermanentDeleteMutation?.() ?? [null, { isLoading: false }]
  const bulkRestoreTuple = useBulkRestoreMutation?.() ?? [null, { isLoading: false }]
  const bulkPermanentDeleteTuple = useBulkPermanentDeleteMutation?.() ?? [null, { isLoading: false }]
  const restore = restoreTuple[0]
  const restoreState = restoreTuple[1] ?? { isLoading: false }
  const permanentDelete = permanentDeleteTuple[0]
  const permanentDeleteState = permanentDeleteTuple[1] ?? { isLoading: false }
  const bulkRestore = bulkRestoreTuple[0]
  const bulkPermanentDelete = bulkPermanentDeleteTuple[0]

  const items = getItems(data)
  const loading = Boolean(isFetching || isLoading)
  const hasRowActions = Boolean(restore || permanentDelete)
  const hasBulkActions = Boolean(bulkRestore || bulkPermanentDelete)
  const defaultInfoMessage = restore && permanentDelete
    ? `These ${entityLabelPlural} have been soft-deleted. You can restore them or permanently delete them from the database.`
    : restore
      ? `These ${entityLabelPlural} have been soft-deleted. You can restore them to make them active again.`
      : `These ${entityLabelPlural} are shown here for review. Restore and permanent delete actions are not available for this record type.`

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setSearchTerm('')
    setSelectedItems(new Set())
    void refetch?.()
    // `refetch` can be unstable in tests and some generated hooks; reopening is the event that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filteredItems = items.filter((item) => filterItem(item, searchTerm.toLowerCase()))
  const selectedCount = selectedItems.size
  const allSelected = filteredItems.length > 0 && selectedCount === filteredItems.length
  const partiallySelected = selectedCount > 0 && selectedCount < filteredItems.length
  const visibleColumns = columns.filter((column) => !column.hideOnMobile || !isMobile)

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedItems((previous) => {
      const next = new Set(previous)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedItems(new Set())
      return
    }

    setSelectedItems(new Set(filteredItems.map((item) => item.id)))
  }

  const afterSuccessfulChange = async () => {
    await refetch?.()
    onChanged?.()
  }

  const handleRestore = async (item: T) => {
    if (!restore) {
      return
    }

    setRestoringId(item.id)
    try {
      await restore(item.id).unwrap?.()
      showSuccess(`${entityLabel} "${getItemLabel(item)}" restored successfully`)
      await afterSuccessfulChange()
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to restore ${entityLabel}`)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (item: T) => {
    if (!permanentDelete) {
      return
    }

    setDeletingId(item.id)
    try {
      await permanentDelete(item.id).unwrap?.()
      showSuccess(`${entityLabel} "${getItemLabel(item)}" permanently deleted`)
      await afterSuccessfulChange()
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to permanently delete ${entityLabel}`)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const handleBulkRestore = async () => {
    if (!bulkRestore) {
      return
    }

    setBulkRestoring(true)
    try {
      const ids = Array.from(selectedItems)
      const result = await bulkRestore(ids).unwrap?.()
      const restoredCount = result?.restoredCount ?? ids.length
      const failedIds = result?.failedIds ?? []

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} ${entityLabelPlural}`)
      }
      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} ${entityLabelPlural}`)
      }

      setSelectedItems(new Set())
      await afterSuccessfulChange()
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to bulk restore ${entityLabelPlural}`)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkPermanentDelete = async () => {
    if (!bulkPermanentDelete) {
      return
    }

    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedItems)
      const result = await bulkPermanentDelete(ids).unwrap?.()
      const deletedCount = result?.deletedCount ?? ids.length
      const failedIds = result?.failedIds ?? []

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} ${entityLabelPlural}`)
      }
      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} ${entityLabelPlural}`)
      }

      setSelectedItems(new Set())
      await afterSuccessfulChange()
    } catch (error: any) {
      showError(error?.data?.message || error?.message || `Failed to bulk delete ${entityLabelPlural}`)
    } finally {
      setBulkDeleting(false)
      setShowBulkDeleteConfirm(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth slotProps={{ paper: { sx: { height: '80vh' } } }}>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            <Box>
              <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Manage soft-deleted {entityLabelPlural} ({filteredItems.length} {searchTerm ? 'found' : 'total'})
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Close deleted dialog">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {infoMessage ?? defaultInfoMessage}
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              fullWidth
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
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
                  >
                    Restore Selected ({selectedCount})
                  </Button>
                )}
                {bulkPermanentDelete && (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteForeverIcon />}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    disabled={bulkDeleting || bulkRestoring}
                  >
                    Delete Selected ({selectedCount})
                  </Button>
                )}
              </>
            )}
          </Box>
        </Box>

        {loading ? (
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
                '& .MuiTableCell-root': {
                  borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                  px: 1.5,
                  py: 0.75,
                },
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { backgroundColor: 'grey.50', fontWeight: 600, py: 1 } }}>
                  {hasBulkActions && (
                    <TableCell sx={{ padding: '8px', width: '48px' }}>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={partiallySelected}
                        onChange={(event) => handleSelectAll(event.target.checked)}
                        size="small"
                      />
                    </TableCell>
                  )}
                  {visibleColumns.map((column) => (
                    <TableCell key={column.label} sx={{ width: column.width }} align={column.align ?? 'left'}>
                      <Typography variant="body2" sx={{ color: 'text.primary', fontSize: '0.8rem', fontWeight: 600 }}>
                        {column.label}
                      </Typography>
                    </TableCell>
                  ))}
                  {hasRowActions && (
                    <TableCell align="right" sx={{ width: isMobile ? '45%' : '13%' }}>
                      <Typography variant="body2" sx={{ color: 'text.primary', fontSize: '0.8rem', fontWeight: 600 }}>
                        Actions
                      </Typography>
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + (hasBulkActions ? 1 : 0) + (hasRowActions ? 1 : 0)} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                        {searchTerm ? `No deleted ${entityLabelPlural} match your search.` : `No deleted ${entityLabelPlural} found.`}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .row-actions': { opacity: 1 },
                        },
                        cursor: 'default',
                        height: 48,
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      {hasBulkActions && (
                        <TableCell sx={{ padding: '8px' }}>
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onChange={(event) => handleSelectItem(item.id, event.target.checked)}
                            size="small"
                          />
                        </TableCell>
                      )}
                      {visibleColumns.map((column) => (
                        <TableCell key={column.label} align={column.align ?? 'left'}>
                          {column.render(item)}
                        </TableCell>
                      ))}
                      {hasRowActions && (
                        <TableCell align="right">
                          <Box
                            className="row-actions"
                            sx={{
                              display: 'flex',
                              gap: 0.25,
                              justifyContent: 'flex-end',
                              opacity: isMobile ? 1 : 0.7,
                              transition: 'opacity 0.2s ease',
                            }}
                          >
                            {restore && (
                              <Tooltip title={`Restore ${entityLabel}`}>
                                <IconButton
                                  aria-label={`Restore ${entityLabel}`}
                                  onClick={() => handleRestore(item)}
                                  disabled={restoringId === item.id || deletingId === item.id || restoreState.isLoading}
                                  size="small"
                                  sx={{
                                    '&:hover': { backgroundColor: 'success.light', color: 'success.dark' },
                                    color: 'success.main',
                                    p: 0.5,
                                  }}
                                >
                                  {restoringId === item.id ? <CircularProgress size={16} /> : <RestoreIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            )}
                            {permanentDelete && (
                              <Tooltip title="Permanently Delete (Cannot be undone)">
                                <IconButton
                                  aria-label="Permanently Delete (Cannot be undone)"
                                  onClick={() => setConfirmDelete(item)}
                                  disabled={restoringId === item.id || deletingId === item.id || permanentDeleteState.isLoading}
                                  size="small"
                                  sx={{
                                    '&:hover': { backgroundColor: 'error.light', color: 'error.dark' },
                                    color: 'error.main',
                                    p: 0.5,
                                  }}
                                >
                                  <DeleteForeverIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="sm" fullWidth>
        <DialogTitle color="error">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteForeverIcon color="error" />
            Permanently Delete {entityLabel}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone. The {entityLabel} will be completely removed from the database.
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

      <Dialog open={showBulkRestoreConfirm} onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle color="success">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RestoreIcon color="success" />
            Bulk Restore {entityLabelPlural}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected {entityLabelPlural} back to active status.
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected {entityLabelPlural}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkRestoreConfirm(false)} variant="outlined" disabled={bulkRestoring}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkRestore}
            variant="contained"
            color="success"
            disabled={bulkRestoring}
            startIcon={bulkRestoring ? <CircularProgress size={16} /> : <RestoreIcon />}
          >
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} ${entityLabelPlural}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showBulkDeleteConfirm} onClose={() => !bulkDeleting && setShowBulkDeleteConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle color="error">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteForeverIcon color="error" />
            Bulk Permanent Delete
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone. The selected {entityLabelPlural} will be completely removed from the database.
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected {entityLabelPlural}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkDeleteConfirm(false)} variant="outlined" disabled={bulkDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkPermanentDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} ${entityLabelPlural}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default GenericDeletedDialog
