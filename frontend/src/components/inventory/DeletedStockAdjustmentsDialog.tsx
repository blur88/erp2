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
  Close as CloseIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchDeletedStockAdjustments,
  restoreStockAdjustment,
  selectDeletedStockAdjustments,
  selectInventoryLoading,
  fetchStockAdjustments,
} from '@/store/slices/inventorySlice'
import { useNotification } from '@/hooks/useNotification'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedStockAdjustmentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedStockAdjustmentsDialog: React.FC<DeletedStockAdjustmentsDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const deletedAdjustments = useSelector(selectDeletedStockAdjustments) || []
  const loading = useSelector(selectInventoryLoading)

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [selectedAdjustments, setSelectedAdjustments] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedStockAdjustments({}))
      // Reset selections when dialog opens
      setSelectedAdjustments(new Set())
    }
  }, [open, dispatch])

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
      const result = await dispatch(restoreStockAdjustment(adjustment.id))

      if (restoreStockAdjustment.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      showSuccess(`Stock adjustment "${adjustment.adjustmentNumber}" restored successfully`)
      // Lists are refreshed by the action's dispatch
    } catch (error: any) {
      console.error('Stock adjustment restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore stock adjustment'
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
          const result = await dispatch(restoreStockAdjustment(id))
          if (!restoreStockAdjustment.rejected.match(result)) {
            successCount++
          } else {
            failCount++
          }
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

      // Refresh both deleted and active adjustments and clear selections
      dispatch(fetchDeletedStockAdjustments({}))
      dispatch(fetchStockAdjustments({}))
      setSelectedAdjustments(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore stock adjustments'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
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
              )}
            </Box>
          </Box>

          <TableContainer component={Paper} sx={{ maxHeight: 'calc(80vh - 300px)' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      disabled={filteredAdjustments.length === 0}
                    />
                  </TableCell>
                  <TableCell>Adjustment Number</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Items</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading?.deletedStockAdjustments ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Loading deleted stock adjustments...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredAdjustments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
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
                  filteredAdjustments.map((adjustment) => (
                    <TableRow
                      key={adjustment.id}
                      hover
                      sx={{
                        '&:hover': { backgroundColor: 'action.hover' },
                        cursor: 'pointer'
                      }}
                      onClick={() => handleSelectAdjustment(adjustment.id, !selectedAdjustments.has(adjustment.id))}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedAdjustments.has(adjustment.id)}
                          onChange={(e) => handleSelectAdjustment(adjustment.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                          {adjustment.adjustmentNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(adjustment.adjustmentDate)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={adjustment.status.charAt(0).toUpperCase() + adjustment.status.slice(1)}
                          color={getStatusColor(adjustment.status)}
                          size="small"
                          sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {adjustment.itemCount || 0}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {adjustment.notes || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Restore stock adjustment">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleRestore(adjustment)}
                              disabled={restoringId === adjustment.id}
                              color="success"
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'success.lighter',
                                  color: 'success.dark'
                                }
                              }}
                            >
                              {restoringId === adjustment.id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <RestoreIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
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
    </>
  )
}

export default DeletedStockAdjustmentsDialog
