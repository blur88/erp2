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
  Receipt as InvoiceIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchDeletedInvoices,
  restoreInvoice,
  bulkRestoreInvoices,
  selectDeletedInvoices,
  selectSalesLoading,
  fetchInvoices
} from '@/store/slices/salesSlice'
import { useNotification } from '@/hooks/useNotification'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { Invoice } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedInvoicesDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedInvoicesDialog: React.FC<DeletedInvoicesDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
  const deletedInvoices = useSelector(selectDeletedInvoices) || []
  const loadingState = useSelector(selectSalesLoading)
  const loading = loadingState?.deletedInvoices || false

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedInvoices({}))
      // Reset selections when dialog opens
      setSelectedInvoices(new Set())
    }
  }, [open, dispatch])

  // Filter invoices based on search term
  const filteredInvoices = deletedInvoices.filter(invoice =>
    invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedInvoices.size
  const allSelected = filteredInvoices.length > 0 && selectedInvoices.size === filteredInvoices.length
  const partiallySelected = selectedInvoices.size > 0 && selectedInvoices.size < filteredInvoices.length

  const handleRestore = async (invoice: Invoice) => {
    setRestoringId(invoice.id)
    try {
      const result = await dispatch(restoreInvoice(invoice.id))

      if (restoreInvoice.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      showSuccess(`Invoice "${invoice.invoiceNumber}" restored successfully`)
      // Refresh both deleted and active invoices
      dispatch(fetchDeletedInvoices({}))
      dispatch(fetchInvoices({}))
    } catch (error: any) {
      console.error('Invoice restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore invoice'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handleSelectInvoice = (invoiceId: string, checked: boolean) => {
    setSelectedInvoices(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(invoiceId)
      } else {
        newSet.delete(invoiceId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(new Set(filteredInvoices.map(i => i.id)))
    } else {
      setSelectedInvoices(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const invoiceIds = Array.from(selectedInvoices)
      const result = await dispatch(bulkRestoreInvoices(invoiceIds))

      if (bulkRestoreInvoices.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      const payload = result.payload as any
      console.log('Bulk restore payload:', payload) // Debug log
      const restoredCount = payload?.restoredCount || 0
      const failedIds = payload?.failedIds || []

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} invoices`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} invoices`)
      }

      // Refresh both deleted and active invoices and clear selections
      dispatch(fetchDeletedInvoices({}))
      dispatch(fetchInvoices({}))
      setSelectedInvoices(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore invoices'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleClose = () => {
    setSearchTerm('')
    setSelectedInvoices(new Set())
    onClose()
  }

  // Confirm dialogs
  const renderBulkRestoreConfirmDialog = () => (
    <Dialog
      open={showBulkRestoreConfirm}
      onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)}
    >
      <DialogTitle>Confirm Bulk Restore</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to restore {selectedCount} selected invoice{selectedCount !== 1 ? 's' : ''}?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowBulkRestoreConfirm(false)} disabled={bulkRestoring}>
          Cancel
        </Button>
        <Button
          onClick={handleBulkRestore}
          variant="contained"
          color="primary"
          disabled={bulkRestoring}
          startIcon={bulkRestoring ? <CircularProgress size={20} /> : <RestoreIcon />}
        >
          {bulkRestoring ? 'Restoring...' : 'Restore'}
        </Button>
      </DialogActions>
    </Dialog>
  )

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <InvoiceIcon color="primary" />
              <Typography variant="h6">Deleted Invoices</Typography>
              {filteredInvoices.length > 0 && (
                <Chip
                  label={filteredInvoices.length}
                  size="small"
                  color="default"
                />
              )}
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ p: 0 }}>
          {/* Search and Bulk Actions */}
          <Box sx={{ p: 2, pb: 1 }}>
            <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }} mb={2}>
              <TextField
                size="small"
                placeholder="Search by invoice number or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />
            </Box>

            {/* Bulk Actions */}
            {selectedCount > 0 && (
              <Alert
                severity="info"
                sx={{ mb: 2 }}
                action={
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={() => setShowBulkRestoreConfirm(true)}
                      startIcon={<RestoreIcon />}
                      disabled={bulkRestoring}
                    >
                      Restore ({selectedCount})
                    </Button>
                  </Box>
                }
              >
                {selectedCount} invoice{selectedCount !== 1 ? 's' : ''} selected
              </Alert>
            )}
          </Box>

          {/* Table */}
          <TableContainer sx={{ maxHeight: isMobile ? 'auto' : 500 }}>
            <Table stickyHeader size={isMobile ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      disabled={filteredInvoices.length === 0}
                    />
                  </TableCell>
                  <TableCell>Invoice #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Deleted</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={40} />
                    </TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchTerm ? 'No deleted invoices match your search' : 'No deleted invoices found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedInvoices.has(invoice.id)}
                          onChange={(e) => handleSelectInvoice(invoice.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {invoice.invoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {invoice.customerName || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(invoice.totalAmount || 0)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={invoice.status}
                          size="small"
                          color={
                            invoice.status === 'paid' ? 'success' :
                            invoice.status === 'partial_paid' ? 'warning' :
                            'default'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {invoice.deletedAt ? formatDate(invoice.deletedAt) : 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Restore invoice">
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleRestore(invoice)}
                              disabled={restoringId === invoice.id}
                            >
                              {restoringId === invoice.id ? (
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

        <Divider />

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialogs */}
      {renderBulkRestoreConfirmDialog()}
    </>
  )
}

export default DeletedInvoicesDialog
