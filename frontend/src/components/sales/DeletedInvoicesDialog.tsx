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
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle color="success">
        <Box display="flex" alignItems="center" gap={1}>
          <RestoreIcon color="success" />
          Bulk Restore Invoices
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="success" sx={{ mb: 2 }}>
          This will restore the selected invoices back to active status and make them available for management.
        </Alert>

        <Typography variant="body1" gutterBottom>
          Are you sure you want to restore <strong>{selectedCount}</strong> selected invoice{selectedCount !== 1 ? 's' : ''}?
        </Typography>

        {selectedCount <= 5 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Invoices to be restored:
            </Typography>
            {Array.from(selectedInvoices).slice(0, 5).map(invoiceId => {
              const invoice = filteredInvoices.find((i: Invoice) => i.id === invoiceId)
              return invoice ? (
                <Box key={invoiceId} sx={{ mb: 0.5 }}>
                  <Typography variant="body2">
                    • {invoice.invoiceNumber} ({invoice.customerName || 'Unknown Customer'})
                  </Typography>
                </Box>
              ) : null
            })}
          </Box>
        )}

        <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
          This will move the selected invoices back to the active invoices list and make them available for processing.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => setShowBulkRestoreConfirm(false)}
          variant="outlined"
          disabled={bulkRestoring}
        >
          Cancel
        </Button>
        <Button
          onClick={handleBulkRestore}
          variant="contained"
          color="success"
          disabled={bulkRestoring}
          startIcon={bulkRestoring ? <CircularProgress size={16} /> : <RestoreIcon />}
        >
          {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Invoices`}
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
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InvoiceIcon sx={{ color: 'error.main' }} />
              <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
                Deleted Invoices
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage soft-deleted invoices ({filteredInvoices.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These invoices have been soft-deleted. You can restore them to make them active again.
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                fullWidth
                placeholder="Search deleted invoices..."
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

          {loading && filteredInvoices.length === 0 ? (
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
                    py: 0.75,
                    px: 1.5
                  }
                }}
              >
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
                    <TableCell sx={{ width: isMobile ? '25%' : '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Invoice Number
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: isMobile ? '30%' : '25%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Customer
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell align="right" sx={{ width: '15%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Total Amount
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
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 4 : 6} align="center" sx={{ py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                          {searchTerm ? 'No deleted invoices match your search.' : 'No deleted invoices found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        hover
                        sx={{
                          '&:hover, &:focus-within': {
                            backgroundColor: 'action.hover',
                            '& .invoice-actions': {
                              opacity: 1
                            }
                          },
                          transition: 'background-color 0.2s ease',
                          cursor: 'default',
                          height: 48
                        }}
                      >
                        <TableCell sx={{ padding: '8px' }}>
                          <Checkbox
                            checked={selectedInvoices.has(invoice.id)}
                            onChange={(e) => handleSelectInvoice(invoice.id, e.target.checked)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                              {invoice.invoiceNumber}
                            </Typography>
                            {isMobile && (
                              <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500 }}>
                                  {formatCurrency(invoice.totalAmount || 0)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                  • {invoice.deletedAt ? formatDate(invoice.deletedAt) : 'Unknown'}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {invoice.customerName || 'Unknown'}
                          </Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }} color="primary">
                              {formatCurrency(invoice.totalAmount || 0)}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {invoice.deletedAt ? formatDate(invoice.deletedAt) : 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell align="right">
                          <Box
                            className="invoice-actions"
                            sx={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              gap: 0.25,
                              opacity: isMobile ? 1 : 0.7,
                              transition: 'opacity 0.2s ease'
                            }}
                          >
                            <Tooltip title="Restore Invoice">
                              <IconButton
                                onClick={() => handleRestore(invoice)}
                                disabled={restoringId === invoice.id}
                                size="small"
                                sx={{
                                  '&:hover': {
                                    backgroundColor: 'success.light',
                                    color: 'success.main'
                                  },
                                  p: 0.5
                                }}
                              >
                                {restoringId === invoice.id ? (
                                  <CircularProgress size={20} />
                                ) : (
                                  <RestoreIcon fontSize="small" />
                                )}
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
          <Button onClick={handleClose} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialogs */}
      {renderBulkRestoreConfirmDialog()}
    </>
  )
}

export default DeletedInvoicesDialog
