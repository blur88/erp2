import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import type { PaymentJournalEntryRef, PaymentListItem } from '../hooks/usePaymentsWorkspace'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
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

const getPaymentMethodLabel = (payment: PaymentListItem) => {
  if (payment.paymentMethodEntity?.name) return payment.paymentMethodEntity.name
  if (payment.paymentMethod) return payment.paymentMethod
  return 'Unknown'
}

const PaymentContextHeader: React.FC<PaymentContextHeaderProps> = ({
  selectedPayment,
  journalEntryRef,
  journalEntryRefLoading,
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
      <EntityContextHeaderBar
        title={`Payment Details - ${selectedPayment.paymentNumber}`}
        statusChip={<EntityStatusChip status={selectedPayment.status} />}
        actions={
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<PrintIcon />}
            title="Print Receipt"
            onClick={onPrint}
          >
            Print
          </AppButton>
        }
        journalEntryRef={journalEntryRef}
        journalEntryRefLoading={journalEntryRefLoading}
        onNavigateToJournalEntry={() => onNavigateToJournalEntry(journalEntryRef)}
      />

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
                    <TableCell sx={valueCellSx}>
                      {formatDate(selectedPayment.paymentDate)}
                    </TableCell>
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
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          N/A
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Invoice No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.relatedInvoiceNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) =>
                            onInvoiceClick(selectedPayment.relatedInvoiceId!, event)
                          }
                          sx={linkButtonSx}
                        >
                          {selectedPayment.relatedInvoiceNumber}
                        </Typography>
                      ) : (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          N/A
                        </Typography>
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
                      {journalEntryRefLoading ? (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          Loading...
                        </Typography>
                      ) : journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={() => onNavigateToJournalEntry(journalEntryRef)}
                          sx={linkButtonSx}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography
                          sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
                        >
                          N/A
                        </Typography>
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
