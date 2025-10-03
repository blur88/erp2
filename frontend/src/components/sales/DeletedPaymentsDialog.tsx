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
import LoadingSpinner from '@/components/common/LoadingSpinner'
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
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <PaymentIcon />
            <Typography variant="h6">
              Deleted Payments ({filteredPayments.length})
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent>
        {/* Search and bulk actions */}
        <Box mb={2} display="flex" gap={2} flexDirection={isMobile ? 'column' : 'row'} alignItems={isMobile ? 'stretch' : 'center'}>
          <TextField
            placeholder="Search by payment number or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            fullWidth={isMobile}
            sx={{ minWidth: isMobile ? 'auto' : 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          {selectedCount > 0 && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<RestoreIcon />}
              onClick={() => setShowBulkRestoreConfirm(true)}
              disabled={bulkRestoring}
              fullWidth={isMobile}
            >
              Restore Selected ({selectedCount})
            </Button>
          )}
        </Box>

        {/* Bulk restore confirmation */}
        {showBulkRestoreConfirm && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Box display="flex" gap={1}>
                <Button
                  size="small"
                  onClick={handleBulkRestore}
                  disabled={bulkRestoring}
                  color="inherit"
                >
                  {bulkRestoring ? <CircularProgress size={16} /> : 'Confirm'}
                </Button>
                <Button
                  size="small"
                  onClick={() => setShowBulkRestoreConfirm(false)}
                  disabled={bulkRestoring}
                  color="inherit"
                >
                  Cancel
                </Button>
              </Box>
            }
          >
            Restore {selectedCount} selected payment(s)?
          </Alert>
        )}

        {/* Loading state */}
        {loading && deletedPayments.length === 0 ? (
          <Box display="flex" justifyContent="center" p={4}>
            <LoadingSpinner />
          </Box>
        ) : filteredPayments.length === 0 ? (
          <Box display="flex" justifyContent="center" p={4}>
            <Typography color="text.secondary">
              {searchTerm ? 'No payments match your search' : 'No deleted payments'}
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={isTablet ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>Payment #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Payment Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedPayments.has(payment.id)}
                        onChange={(e) => handleSelectPayment(payment.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {payment.paymentNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{payment.customerName}</TableCell>
                    <TableCell>{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>
                      <Chip
                        label={payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        color={getStatusColor(payment.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Restore payment">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleRestore(payment)}
                          disabled={restoringId === payment.id}
                        >
                          {restoringId === payment.id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <RestoreIcon />
                          )}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <Divider />

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeletedPaymentsDialog
