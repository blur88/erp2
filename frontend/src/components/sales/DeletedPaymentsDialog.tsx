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

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedPayments({}))
    }
  }, [open, dispatch])

  // Filter payments based on search term
  const filteredPayments = deletedPayments.filter(payment =>
    payment.paymentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
            />
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
                    <TableCell sx={{ width: isMobile ? '30%' : '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Payment Number
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: isMobile ? '35%' : '22%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Customer
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell align="right" sx={{ width: '13%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Amount
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '13%' }}>
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
                    <TableCell align="right" sx={{ width: isMobile ? '35%' : '10%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Actions
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 3 : 7} align="center" sx={{ py: 4 }}>
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
    </>
  )
}

export default DeletedPaymentsDialog
