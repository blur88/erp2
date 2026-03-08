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
  Alert,
  IconButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material'
import { useGetDeletedVendorPaymentsQuery } from '@/store/api/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedVendorPaymentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedVendorPaymentsDialog: React.FC<DeletedVendorPaymentsDialogProps> = ({ open, onClose }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { data: deletedPaymentsResponse, isFetching: loading } = useGetDeletedVendorPaymentsQuery({}, { skip: !open })
  const deletedPayments = deletedPaymentsResponse?.data || []

  const [searchTerm, setSearchTerm] = useState('')

  // Filter payments based on search term
  const filteredPayments = deletedPayments.filter((payment: any) =>
    payment.paymentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.supplier?.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleClose = () => {
    setSearchTerm('')
    onClose()
  }

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
              <PaymentIcon sx={{ color: 'error.main' }} />
              <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
                Deleted Vendor Payments
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage soft-deleted vendor payments ({filteredPayments.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These vendor payments have been soft-deleted. You can restore them to make them active again.
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

          {loading && filteredPayments.length === 0 ? (
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
                    <TableCell sx={{ width: isMobile ? '35%' : '25%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Payment Number
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: isMobile ? '40%' : '30%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Supplier
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell sx={{ width: '15%' }} align="right">
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Amount
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '15%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Payment Date
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 2 : 5} align="center" sx={{ py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                          {searchTerm ? 'No deleted payments match your search.' : 'No deleted payments found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayments.map((payment: any) => (
                      <TableRow
                        key={payment.id}
                        hover
                        sx={{
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
                              <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                <Typography variant="caption" color="success.main" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                                  {formatCurrency(payment.amount)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                  • {payment.paymentDate ? formatDate(payment.paymentDate) : 'Unknown'}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {payment.supplier?.companyName || 'Unknown'}
                          </Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'success.main' }}>
                              {formatCurrency(payment.amount)}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {payment.paymentDate ? formatDate(payment.paymentDate) : 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {payment.deletedAt ? formatDate(payment.deletedAt) : 'Unknown'}
                            </Typography>
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
          <Button onClick={handleClose} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default DeletedVendorPaymentsDialog
