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
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchDeletedPayments,
  restorePayment,
  bulkRestorePayments,
  selectDeletedPayments,
  selectSalesLoading,
  fetchPayments
} from '@/store/slices/salesSlice'
import { useNotification } from '@/hooks/useNotification'
import type { Payment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedPaymentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedPaymentsDialog: React.FC<DeletedPaymentsDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const deletedPayments = useSelector(selectDeletedPayments) || []
  const loadingState = useSelector(selectSalesLoading)
  const loading = loadingState?.deletedPayments || false

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedPayments({}))
      // Reset selections when dialog opens
      setSelectedPayments(new Set())
    }
  }, [open, dispatch])

  // Filter payments based on search term
  const filteredPayments = deletedPayments.filter(payment =>
    payment.paymentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedPayments.size
  const allSelected = filteredPayments.length > 0 && selectedPayments.size === filteredPayments.length
  const partiallySelected = selectedPayments.size > 0 && selectedPayments.size < filteredPayments.length

  const handleRestore = async (payment: Payment) => {
    setRestoringId(payment.id)
    try {
      const result = await dispatch(restorePayment(payment.id))

      if (restorePayment.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      showSuccess(`Payment "${payment.paymentNumber}" restored successfully`)
      // Refresh both deleted and active payments
      dispatch(fetchDeletedPayments({}))
      dispatch(fetchPayments({}))
    } catch (error: any) {
      console.error('Payment restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore payment'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handleSelectPayment = (paymentId: string, checked: boolean) => {
    setSelectedPayments(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(paymentId)
      } else {
        newSet.delete(paymentId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPayments(new Set(filteredPayments.map(p => p.id)))
    } else {
      setSelectedPayments(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const paymentIds = Array.from(selectedPayments)
      const result = await dispatch(bulkRestorePayments(paymentIds))

      if (bulkRestorePayments.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      const payload = result.payload as any
      console.log('Bulk restore payload:', payload) // Debug log
      const restoredCount = payload?.restoredCount || 0
      const failedIds = payload?.failedIds || []

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} payments`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} payments`)
      }

      // Refresh both lists
      dispatch(fetchDeletedPayments({}))
      dispatch(fetchPayments({}))
      setSelectedPayments(new Set())
      setShowBulkRestoreConfirm(false)
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore payments'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success'
      case 'pending': return 'warning'
      case 'failed': return 'error'
      case 'refunded': return 'info'
      default: return 'default'
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
              <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
                Deleted Payments
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage soft-deleted payments ({filteredPayments.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These payments have been soft-deleted. You can restore them to make them active again.
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                fullWidth
                placeholder="Search deleted payments..."
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

          {loading && deletedPayments.length === 0 ? (
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
                    <TableCell sx={{ width: isMobile ? '25%' : '18%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Payment Number
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: isMobile ? '30%' : '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Customer
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell align="right" sx={{ width: '12%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Amount
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '12%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Payment Date
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
                      <TableCell sx={{ width: '12%' }}>
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
                  {filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 4 : 8} align="center" sx={{ py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                          {searchTerm ? 'No deleted payments match your search.' : 'No deleted payments found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayments.map((payment) => (
                      <TableRow
                        key={payment.id}
                        hover
                        sx={{
                          '&:hover, &:focus-within': {
                            backgroundColor: 'action.hover',
                            '& .payment-actions': {
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
                            checked={selectedPayments.has(payment.id)}
                            onChange={(e) => handleSelectPayment(payment.id, e.target.checked)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                              {payment.paymentNumber}
                            </Typography>
                            {isMobile && (
                              <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500 }}>
                                  {formatCurrency(payment.amount)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                  • {formatDate(payment.paymentDate)}
                                </Typography>
                                <Chip
                                  label={payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                  color={getStatusColor(payment.status)}
                                  size="small"
                                  sx={{ height: '16px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }}
                                />
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {payment.customerName}
                          </Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }} color="primary">
                              {formatCurrency(payment.amount)}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                              {formatDate(payment.paymentDate)}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Chip
                              label={payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                              color={getStatusColor(payment.status)}
                              size="small"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {(payment as any).deletedAt ? formatDate((payment as any).deletedAt) : 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell align="right">
                          <Box
                            className="payment-actions"
                            sx={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              gap: 0.25,
                              opacity: isMobile ? 1 : 0.7,
                              transition: 'opacity 0.2s ease'
                            }}
                          >
                            <Tooltip title="Restore Payment">
                              <IconButton
                                onClick={() => handleRestore(payment)}
                                disabled={restoringId === payment.id}
                                size="small"
                                sx={{
                                  '&:hover': {
                                    backgroundColor: 'success.light',
                                    color: 'success.main'
                                  },
                                  p: 0.5
                                }}
                              >
                                {restoringId === payment.id ? (
                                  <CircularProgress size={20} />
                                ) : (
                                  <RestoreIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </Box>
                          {isMobile && (payment as any).deletedAt && (
                            <Typography variant="caption" color="text.secondary" sx={{
                              display: 'block',
                              textAlign: 'right',
                              mt: 0.25,
                              fontSize: '0.65rem'
                            }}>
                              {new Date((payment as any).deletedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: '2-digit'
                              })}
                            </Typography>
                          )}
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
          <Button onClick={onClose} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Restore Confirmation Dialog */}
      <Dialog
        open={showBulkRestoreConfirm}
        onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="success">
          <Box display="flex" alignItems="center" gap={1}>
            <RestoreIcon color="success" />
            Bulk Restore Payments
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected payments back to active status and make them available for management.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected payment{selectedCount !== 1 ? 's' : ''}?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Payments to be restored:
              </Typography>
              {Array.from(selectedPayments).slice(0, 5).map(paymentId => {
                const payment = filteredPayments.find((p: Payment) => p.id === paymentId)
                return payment ? (
                  <Box key={paymentId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {payment.paymentNumber} ({payment.customerName})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}

          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will move the selected payments back to the active payments list and make them available for processing.
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
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Payments`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default DeletedPaymentsDialog
