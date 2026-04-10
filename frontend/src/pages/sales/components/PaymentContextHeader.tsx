import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import type { PaymentJournalEntryRef, PaymentListItem } from '../hooks/usePaymentsPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface PaymentContextHeaderProps {
  selectedPayment: PaymentListItem | null
  journalEntryRef: PaymentJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onOrderClick: (orderId: string, event: React.MouseEvent) => void
  onInvoiceClick: (invoiceId: string, event: React.MouseEvent) => void
  onNavigateToJournalEntry: (ref: PaymentJournalEntryRef | null) => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const linkButtonSx = {
  fontSize: '0.8rem',
  color: 'primary.main',
  cursor: 'pointer',
  textDecoration: 'none',
  border: 'none',
  background: 'none',
  padding: 0,
  '&:hover': { color: 'primary.dark' },
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  completed: 'success',
  pending: 'warning',
  failed: 'error',
  cancelled: 'default',
  refunded: 'default',
}

const getPaymentMethodLabel = (payment: PaymentListItem) => {
  if (payment.paymentMethodEntity?.name) return payment.paymentMethodEntity.name
  if (payment.paymentMethod) return payment.paymentMethod
  return 'Unknown'
}

const PaymentContextHeader: React.FC<PaymentContextHeaderProps> = ({
  selectedPayment,
  journalEntryRef,
  journalEntryRefLoading: _journalEntryRefLoading,
  onPrint,
  onOrderClick,
  onInvoiceClick,
  onNavigateToJournalEntry,
}) => {
  if (!selectedPayment) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a payment to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Payment Details - {selectedPayment.paymentNumber}
          </Typography>
          <Chip
            label={selectedPayment.status.charAt(0).toUpperCase() + selectedPayment.status.slice(1)}
            color={STATUS_COLORS[selectedPayment.status] ?? 'default'}
            size="small"
            sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
          />
        </Box>
        <IconButton
          size="small"
          title="Print Receipt"
          onClick={onPrint}
          sx={{ ...actionIconSx, color: 'info.main', '&:hover': { backgroundColor: 'info.light', color: 'info.dark' } }}
        >
          <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
        </IconButton>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Customer</TableCell>
                    <TableCell sx={valueCellSx}>{selectedPayment.customerName}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Amount</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedPayment.amount)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Payment Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedPayment.paymentDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Method</TableCell>
                    <TableCell sx={valueCellSx}>{getPaymentMethodLabel(selectedPayment)}</TableCell>
                  </TableRow>
                  {selectedPayment.reference && (
                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell sx={labelCellSx}>Reference</TableCell>
                      <TableCell sx={valueCellSx}>{selectedPayment.reference}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Related Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Order No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.relatedOrderNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) => onOrderClick(selectedPayment.relatedOrderId!, event)}
                          sx={linkButtonSx}
                        >
                          {selectedPayment.relatedOrderNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>N/A</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Invoice No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.relatedInvoiceNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) => onInvoiceClick(selectedPayment.relatedInvoiceId!, event)}
                          sx={linkButtonSx}
                        >
                          {selectedPayment.relatedInvoiceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>N/A</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  {selectedPayment.customer?.email && (
                    <TableRow>
                      <TableCell sx={labelCellSx}>Customer Email</TableCell>
                      <TableCell sx={valueCellSx}>{selectedPayment.customer.email}</TableCell>
                    </TableRow>
                  )}
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={() => onNavigateToJournalEntry(journalEntryRef)}
                          sx={linkButtonSx}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>N/A</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

export default PaymentContextHeader
