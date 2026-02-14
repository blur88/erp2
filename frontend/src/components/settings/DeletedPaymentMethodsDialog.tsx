import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
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
} from '@mui/material'
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Restore as RestoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import type { PaymentMethodConfig } from '@/types'
import { paymentMethodsApi } from '@/services/paymentMethodsApi'
import { useNotification } from '@/hooks/useNotification'
import { formatDate } from '@/utils/formatters'

interface DeletedPaymentMethodsDialogProps {
  open: boolean
  onClose: () => void
  onChanged: () => Promise<void> | void
}

const DeletedPaymentMethodsDialog: React.FC<DeletedPaymentMethodsDialogProps> = ({
  open,
  onClose,
  onChanged,
}) => {
  const { showError, showSuccess } = useNotification()

  const [rows, setRows] = useState<PaymentMethodConfig[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedMethods, setSelectedMethods] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<PaymentMethodConfig | null>(null)
  const [bulkRestoring, setBulkRestoring] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const loadRows = async () => {
    setLoading(true)
    try {
      const data = await paymentMethodsApi.getDeleted()
      setRows(data || [])
    } catch (error: any) {
      setRows([])
      showError(error?.response?.data?.message || error?.message || 'Failed to load deleted payment methods')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadRows()
      setSelectedMethods(new Set())
    }
  }, [open])

  const filteredRows = rows.filter((row) =>
    row.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const selectedCount = selectedMethods.size
  const allSelected = filteredRows.length > 0 && selectedCount === filteredRows.length
  const partiallySelected = selectedCount > 0 && selectedCount < filteredRows.length

  const handleRestore = async (row: PaymentMethodConfig) => {
    setRestoringId(row.id)
    try {
      await paymentMethodsApi.restore(row.id)
      await loadRows()
      await onChanged()
      showSuccess(`Payment method "${row.code}" restored successfully`)
    } catch (error: any) {
      showError(error?.response?.data?.message || error?.message || 'Failed to restore payment method')
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async () => {
    if (!showDeleteConfirm) return

    setDeletingId(showDeleteConfirm.id)
    try {
      await paymentMethodsApi.permanentDelete(showDeleteConfirm.id)
      await loadRows()
      await onChanged()
      showSuccess(`Payment method "${showDeleteConfirm.code}" permanently deleted`)
      setShowDeleteConfirm(null)
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to permanently delete payment method'
      showError(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSelectMethod = (id: string, checked: boolean) => {
    setSelectedMethods((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMethods(new Set(filteredRows.map((row) => row.id)))
      return
    }
    setSelectedMethods(new Set())
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const ids = Array.from(selectedMethods)
      const results = await Promise.allSettled(ids.map((id) => paymentMethodsApi.restore(id)))
      const restoredCount = results.filter((r) => r.status === 'fulfilled').length
      const failedCount = results.length - restoredCount

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} payment methods`)
      }
      if (failedCount > 0) {
        showError(`Failed to restore ${failedCount} payment methods`)
      }

      await loadRows()
      await onChanged()
      setSelectedMethods(new Set())
    } catch (error: any) {
      showError(error?.response?.data?.message || error?.message || 'Failed to bulk restore payment methods')
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedMethods)
      const results = await Promise.allSettled(ids.map((id) => paymentMethodsApi.permanentDelete(id)))
      const deletedCount = results.filter((r) => r.status === 'fulfilled').length
      const failedCount = results.length - deletedCount

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} payment methods`)
      }
      if (failedCount > 0) {
        showError(`Failed to delete ${failedCount} payment methods`)
      }

      await loadRows()
      await onChanged()
      setSelectedMethods(new Set())
    } catch (error: any) {
      showError(error?.response?.data?.message || error?.message || 'Failed to bulk delete payment methods')
    } finally {
      setBulkDeleting(false)
      setShowBulkDeleteConfirm(false)
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
              <PaymentIcon sx={{ color: 'error.main' }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Deleted Payment Methods
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage soft-deleted payment methods ({filteredRows.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These payment methods have been soft-deleted. You can restore them to make them active again.
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                fullWidth
                placeholder="Search deleted payment methods..."
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
                    disabled={bulkRestoring || bulkDeleting}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Restore Selected ({selectedCount})
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    disabled={bulkRestoring || bulkDeleting}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Delete Selected ({selectedCount})
                  </Button>
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
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                    <TableCell sx={{ width: '48px', padding: '8px' }}>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={partiallySelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Settlement</TableCell>
                    <TableCell>Deleted Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                          {searchTerm ? 'No deleted payment methods match your search.' : 'No deleted payment methods found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id} hover sx={{ height: 48 }}>
                        <TableCell sx={{ padding: '8px' }}>
                          <Checkbox
                            checked={selectedMethods.has(row.id)}
                            onChange={(e) => handleSelectMethod(row.id, e.target.checked)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.code}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={row.requiresSettlement ? 'warning' : 'default'}
                            label={row.requiresSettlement ? 'Required' : 'Not Required'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {formatDate(row.updatedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                            <Tooltip title="Restore">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleRestore(row)}
                                disabled={restoringId === row.id || deletingId === row.id}
                              >
                                <RestoreIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Permanently Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setShowDeleteConfirm(row)}
                                disabled={restoringId === row.id || deletingId === row.id}
                              >
                                <DeleteIcon fontSize="small" />
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
      </Dialog>

      <Dialog
        open={showBulkRestoreConfirm}
        onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="success">
          <Box display="flex" alignItems="center" gap={1}>
            <RestoreIcon color="success" />
            Bulk Restore Payment Methods
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected payment methods back to active status.
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected payment methods?
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
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Methods`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showBulkDeleteConfirm}
        onClose={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteIcon color="error" />
            Permanent Delete Payment Methods
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Warning:</strong> This action cannot be undone.
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected payment methods?
          </Typography>
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            Methods referenced by payments/settlements will fail and remain in this list.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkDeleteConfirm(false)} variant="outlined" disabled={bulkDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Methods`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!showDeleteConfirm}
        onClose={() => !deletingId && setShowDeleteConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteIcon color="error" />
            Permanent Delete Payment Method
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Warning:</strong> This action cannot be undone.
          </Alert>
          {showDeleteConfirm && (
            <>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete <strong>{showDeleteConfirm.code}</strong>?
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">• Name: {showDeleteConfirm.name}</Typography>
                <Typography variant="body2">• Requires Settlement: {showDeleteConfirm.requiresSettlement ? 'Yes' : 'No'}</Typography>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(null)} variant="outlined" disabled={!!deletingId}>
            Cancel
          </Button>
          <Button
            onClick={handlePermanentDelete}
            variant="contained"
            color="error"
            disabled={!!deletingId}
            startIcon={deletingId ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deletingId ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default DeletedPaymentMethodsDialog
