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
import { skipToken } from '@reduxjs/toolkit/query'
import {
  Search as SearchIcon,
  Close as CloseIcon,
  ReceiptLong as InvoiceIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useGetDeletedInvoicesQuery } from '@/store/api/salesApi'

type DeletedInvoice = {
  id: string
  invoiceNumber?: string
  customerName?: string
  customer?: { name?: string }
  totalAmount?: number
  total?: number
  deletedAt?: string | Date
}

interface DeletedInvoicesDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedInvoicesDialog: React.FC<DeletedInvoicesDialogProps> = ({ open, onClose }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { data, isLoading } = useGetDeletedInvoicesQuery(open ? {} : skipToken)
  const deletedInvoices = (data?.data ?? []) as DeletedInvoice[]
  const loading = isLoading

  const [searchTerm, setSearchTerm] = useState('')

  // Filter invoices based on search term
  const filteredInvoices = deletedInvoices.filter(invoice =>
    invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
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
            />
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
                    <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Invoice Number
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: isMobile ? '40%' : '35%' }}>
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
                      <TableCell sx={{ width: '20%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Deleted Date
                        </Typography>
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 2 : 4} align="center" sx={{ py: 4 }}>
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
                          transition: 'background-color 0.2s ease',
                          cursor: 'default',
                          height: 48
                        }}
                      >
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
                            {invoice.customerName || invoice.customer?.name || 'Unknown'}
                          </Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell align="right">
                            <Typography variant="caption" sx={{ fontWeight: 500 }} color="primary">
                              {formatCurrency(invoice.totalAmount || 0)}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {invoice.deletedAt ? formatDate(invoice.deletedAt) : 'Unknown'}
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

export default DeletedInvoicesDialog
