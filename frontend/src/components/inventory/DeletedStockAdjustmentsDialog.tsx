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
  Paper,
  TextField,
  InputAdornment,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Divider,
  CircularProgress,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import {
  useBulkPermanentDeleteStockAdjustmentsMutation,
  useGetDeletedStockAdjustmentsQuery,
  usePermanentDeleteStockAdjustmentMutation,
  useRestoreStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { useNotification } from '@/hooks/useNotification'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedStockAdjustmentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedStockAdjustmentsDialog: React.FC<DeletedStockAdjustmentsDialogProps> = ({ open, onClose }) => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { data: deletedAdjustmentsResponse, isFetching: isFetchingDeleted, refetch: refetchDeletedAdjustments } = useGetDeletedStockAdjustmentsQuery(
    {},
    { skip: !open }
  )
  const [restoreStockAdjustment, { isLoading: isRestoringMutation }] = useRestoreStockAdjustmentMutation()
  const [permanentDeleteStockAdjustment, { isLoading: isDeletingMutation }] = usePermanentDeleteStockAdjustmentMutation()
  const [bulkPermanentDeleteStockAdjustments, { isLoading: isBulkDeletingMutation }] = useBulkPermanentDeleteStockAdjustmentsMutation()
  const deletedAdjustments = deletedAdjustmentsResponse?.data || []
  const loading = isFetchingDeleted || isRestoringMutation || isDeletingMutation || isBulkDeletingMutation

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedAdjustments, setSelectedAdjustments] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<StockAdjustment | null>(null)
  const [bulkRestoring, setBulkRestoring] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      void refetchDeletedAdjustments()
      // Reset selections when dialog opens
      setSelectedAdjustments(new Set())
    }
  }, [open, refetchDeletedAdjustments])

  // Filter adjustments based on search term
  const filteredAdjustments = deletedAdjustments.filter(adjustment =>
    adjustment.adjustmentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    adjustment.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedAdjustments.size
  const allSelected = filteredAdjustments.length > 0 && selectedAdjustments.size === filteredAdjustments.length
  const partiallySelected = selectedAdjustments.size > 0 && selectedAdjustments.size < filteredAdjustments.length

  const handleRestore = async (adjustment: StockAdjustment) => {
    setRestoringId(adjustment.id)
    try {
      await restoreStockAdjustment(adjustment.id).unwrap()

      showSuccess(`Stock adjustment "${adjustment.adjustmentNumber}" restored successfully`)
      void refetchDeletedAdjustments()
    } catch (error: any) {
      console.error('Stock adjustment restore error:', error)
      const errorMessage = error?.data?.message || error?.message || 'Failed to restore stock adjustment'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handleSelectAdjustment = (adjustmentId: string, checked: boolean) => {
    setSelectedAdjustments(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(adjustmentId)
      } else {
        newSet.delete(adjustmentId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAdjustments(new Set(filteredAdjustments.map(a => a.id)))
    } else {
      setSelectedAdjustments(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const adjustmentIds = Array.from(selectedAdjustments)
      let successCount = 0
      let failCount = 0

      for (const id of adjustmentIds) {
        try {
          await restoreStockAdjustment(id).unwrap()
          successCount++
        } catch {
          failCount++
        }
      }

      if (successCount > 0) {
        showSuccess(`Successfully restored ${successCount} stock adjustment${successCount > 1 ? 's' : ''}`)
      }

      if (failCount > 0) {
        showError(`Failed to restore ${failCount} stock adjustment${failCount > 1 ? 's' : ''}`)
      }

      void refetchDeletedAdjustments()
      setSelectedAdjustments(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.data?.message || error?.message || 'Failed to bulk restore stock adjustments'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handlePermanentDelete = async (adjustment: StockAdjustment) => {
    setDeletingId(adjustment.id)
    try {
      await permanentDeleteStockAdjustment(adjustment.id).unwrap()

      showSuccess(`Stock adjustment "${adjustment.adjustmentNumber}" permanently deleted`)
      void refetchDeletedAdjustments()
    } catch (error: any) {
      console.error('Stock adjustment permanent delete error:', error)
      const errorMessage = error?.data?.message || error?.message || 'Failed to permanently delete stock adjustment'
      showError(errorMessage)
    } finally {
      setDeletingId(null)
      setShowDeleteConfirm(null)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      const adjustmentIds = Array.from(selectedAdjustments)
      const payload = await bulkPermanentDeleteStockAdjustments(adjustmentIds).unwrap()
      const deletedCount = payload?.successCount || 0
      const failedIds = payload?.failedIds || []

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} stock adjustments`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} stock adjustments`)
      }

      void refetchDeletedAdjustments()
      setSelectedAdjustments(new Set())
    } catch (error: any) {
      console.error('Bulk delete error:', error)
      const errorMessage = error?.data?.message || error?.message || 'Failed to bulk delete stock adjustments'
      showError(errorMessage)
    } finally {
      setBulkDeleting(false)
      setShowBulkDeleteConfirm(false)
    }
  }

  const getStatusColor = (status: string): 'warning' | 'success' | 'error' => {
    switch (status.toLowerCase()) {
      case 'draft':
        return 'warning'
      case 'completed':
        return 'success'
      case 'cancelled':
        return 'error'
      default:
        return 'warning'
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssessmentIcon sx={{ color: 'error.main' }} />
              <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
                Deleted Stock Adjustments
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage soft-deleted stock adjustments ({filteredAdjustments.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These stock adjustments have been soft-deleted. You can restore them to make them active again.
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                fullWidth
                placeholder="Search deleted adjustments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ flex: 1, minWidth: '300px' }}
              />

              {selectedCount > 0 && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<RestoreIcon />}
                    onClick={() => setShowBulkRestoreConfirm(true)}
                    disabled={bulkRestoring}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Restore Selected ({selectedCount})
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    disabled={bulkDeleting}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Delete Selected ({selectedCount})
                  </Button>
                </>
              )}
            </Box>
          </Box>

          <TableContainer component={Paper} sx={{ maxHeight: 'calc(80vh - 300px)' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: '48px', padding: '8px' }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      size="small"
                      disabled={filteredAdjustments.length === 0}
                    />
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '25%' : '20%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Adjustment Number
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '30%' : '25%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Adjusted By
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Adjustment Date
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell sx={{ width: '10%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Status
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell align="center" sx={{ width: '10%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Items
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Deleted Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '45%' : '10%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 5 : 8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Loading deleted stock adjustments...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredAdjustments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 5 : 8} align="center" sx={{ py: 4 }}>
                      <AssessmentIcon sx={{ fontSize: 48, color: 'action.disabled', mb: 1 }} />
                      <Typography variant="body1" color="text.secondary">
                        {searchTerm ? 'No matching deleted stock adjustments found' : 'No deleted stock adjustments'}
                      </Typography>
                      {searchTerm && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Try adjusting your search criteria
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdjustments.map((adjustment: StockAdjustment) => (
                    <TableRow
                      key={adjustment.id}
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .adjustment-actions': {
                            opacity: 1
                          }
                        },
                        transition: 'background-color 0.2s ease',
                        cursor: 'default',
                        height: 48
                      }}
                      onClick={() => handleSelectAdjustment(adjustment.id, !selectedAdjustments.has(adjustment.id))}
                    >
                      <TableCell sx={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedAdjustments.has(adjustment.id)}
                          onChange={(e) => handleSelectAdjustment(adjustment.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            {adjustment.adjustmentNumber}
                          </Typography>
                          {isMobile && (
                            <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                {formatDate(adjustment.adjustmentDate)}
                              </Typography>
                              <Chip
                                label={adjustment.status.charAt(0).toUpperCase() + adjustment.status.slice(1)}
                                color={getStatusColor(adjustment.status)}
                                size="small"
                                sx={{ fontSize: '0.6rem', height: 16, textTransform: 'capitalize' }}
                              />
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {adjustment.adjustedByUser?.firstName && adjustment.adjustedByUser?.lastName
                            ? `${adjustment.adjustedByUser.firstName} ${adjustment.adjustedByUser.lastName}`
                            : adjustment.adjustedByUser?.email || 'Unknown User'}
                        </Typography>
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="caption">
                            {formatDate(adjustment.adjustmentDate)}
                          </Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell>
                          <Chip
                            label={adjustment.status.charAt(0).toUpperCase() + adjustment.status.slice(1)}
                            color={getStatusColor(adjustment.status)}
                            size="small"
                            sx={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'capitalize' }}
                          />
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell align="center">
                          <Typography variant="caption" sx={{ fontWeight: 500 }}>
                            {adjustment.itemCount || 0}
                          </Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {(adjustment as any).deletedAt ? formatDate((adjustment as any).deletedAt) : 'Unknown'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box className="adjustment-actions" sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', opacity: 0.8, transition: 'opacity 0.2s ease' }}>
                          <Tooltip title="Restore stock adjustment">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleRestore(adjustment)}
                                disabled={restoringId === adjustment.id}
                                color="success"
                                sx={{
                                  '&:hover': {
                                    backgroundColor: 'success.light',
                                    color: 'success.dark'
                                  }
                                }}
                              >
                                {restoringId === adjustment.id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <RestoreIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Permanently delete stock adjustment">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => setShowDeleteConfirm(adjustment)}
                                disabled={deletingId === adjustment.id}
                                color="error"
                                sx={{
                                  '&:hover': {
                                    backgroundColor: 'error.light',
                                    color: 'error.dark'
                                  }
                                }}
                              >
                                {deletingId === adjustment.id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <DeleteIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {selectedCount > 0 ? `${selectedCount} selected` : `${filteredAdjustments.length} total`}
            </Typography>
          </Box>
          <Button onClick={onClose} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Restore Confirmation Dialog */}
      <Dialog open={showBulkRestoreConfirm} onClose={() => setShowBulkRestoreConfirm(false)}>
        <DialogTitle>Confirm Bulk Restore</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to restore {selectedCount} stock adjustment{selectedCount > 1 ? 's' : ''}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkRestoreConfirm(false)} disabled={bulkRestoring}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkRestore}
            variant="contained"
            color="success"
            disabled={bulkRestoring}
          >
            {bulkRestoring ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onClose={() => setShowBulkDeleteConfirm(false)}>
        <DialogTitle>Confirm Bulk Permanent Delete</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to permanently delete {selectedCount} stock adjustment{selectedCount > 1 ? 's' : ''}? They will be removed from the database permanently.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
          >
            {bulkDeleting ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Single Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)}>
        <DialogTitle>Confirm Permanent Delete</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to permanently delete stock adjustment "{showDeleteConfirm?.adjustmentNumber}"? It will be removed from the database permanently.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(null)} disabled={!!deletingId}>
            Cancel
          </Button>
          <Button
            onClick={() => showDeleteConfirm && handlePermanentDelete(showDeleteConfirm)}
            variant="contained"
            color="error"
            disabled={!!deletingId}
          >
            {deletingId ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default DeletedStockAdjustmentsDialog
