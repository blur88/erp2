import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import type { InvoiceJournalEntryRef, InvoiceListItem } from '../hooks/useInvoicesWorkspace'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface InvoiceContextHeaderProps {
  selectedInvoice: InvoiceListItem | null
  journalEntryRef: InvoiceJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onNavigateToSalesOrder: (salesOrderId: string, event: React.MouseEvent) => void
  onNavigateToPayment: (paymentId: string, event?: React.MouseEvent) => void
  onNavigateToJournalEntry: () => void
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

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

const InvoiceContextHeader: React.FC<InvoiceContextHeaderProps> = ({
  selectedInvoice,
  journalEntryRef,
  journalEntryRefLoading,
  onPrint,
  onNavigateToSalesOrder,
  onNavigateToPayment,
  onNavigateToJournalEntry,
}) => {
  if (!selectedInvoice) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an invoice to view details
        </Typography>
      </Paper>
    )
  }

  const isOverpaid = (selectedInvoice.paidAmount || 0) > (selectedInvoice.totalAmount || 0)
  const overpaidAmount = (selectedInvoice.paidAmount || 0) - (selectedInvoice.totalAmount || 0)

  const statusChip = isOverpaid ? (
    <Chip
      label="Overpaid"
      size="small"
      color="info"
      sx={{ fontSize: '0.75rem', fontWeight: 600 }}
    />
  ) : (
    <Chip
      label={selectedInvoice.status === 'partial_paid' ? 'Partial Paid' : selectedInvoice.status}
      size="small"
      color={
        selectedInvoice.status === 'paid'
          ? 'success'
          : selectedInvoice.status === 'partial_paid'
            ? 'warning'
            : 'default'
      }
      sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
    />
  )

  const payments = (selectedInvoice as any).payments ?? []

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
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Invoice Details - {selectedInvoice.invoiceNumber}
          </Typography>
          {statusChip}
        </Box>
        <AppButton
          size="small"
          variant="secondary"
          startIcon={<PrintIcon />}
          title="Print Invoice"
          onClick={onPrint}
        >
          Print
        </AppButton>
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
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}
                      >
                        Invoice Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Customer</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedInvoice.customer?.name || selectedInvoice.customerName}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Invoice Date</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatDate(selectedInvoice.invoiceDate)}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Order No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedInvoice.salesOrder?.orderNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) =>
                            onNavigateToSalesOrder(selectedInvoice.salesOrder!.id, event)
                          }
                          sx={linkButtonSx}
                        >
                          {selectedInvoice.salesOrder.orderNumber}
                        </Typography>
                      ) : (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          None
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Payment No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {payments.length > 0 ? (
                        <Stack spacing={0.5}>
                          {payments.map((payment: any, index: number) => (
                            <Box key={payment.id} component="span">
                              <Typography
                                component="button"
                                onClick={(event) => onNavigateToPayment(payment.id, event)}
                                sx={linkButtonSx}
                              >
                                {payment.paymentNumber}
                              </Typography>
                              {index < payments.length - 1 && (
                                <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                                  ,{' '}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Stack>
                      ) : (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          No payments
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          Loading...
                        </Typography>
                      ) : journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={onNavigateToJournalEntry}
                          sx={linkButtonSx}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          Pending
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
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
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}
                      >
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Sub-total</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(
                        (selectedInvoice.totalAmount || 0) - (selectedInvoice.shippingAmount || 0),
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Shipping</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedInvoice.shippingAmount || 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Amount</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedInvoice.totalAmount)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Paid Amount</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedInvoice.paidAmount)}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>
                      {isOverpaid ? 'Overpaid Amount' : 'Balance Due'}
                    </TableCell>
                    <TableCell
                      sx={{
                        ...valueCellSx,
                        color: isOverpaid ? 'info.main' : 'inherit',
                        fontWeight: isOverpaid ? 600 : 400,
                      }}
                    >
                      {isOverpaid
                        ? `+${formatCurrency(overpaidAmount)}`
                        : formatCurrency(selectedInvoice.balanceDue)}
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

export default InvoiceContextHeader
