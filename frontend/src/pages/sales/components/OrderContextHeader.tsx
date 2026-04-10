import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Button,
  IconButton,
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface JournalEntryRef {
  id: string
  referenceNumber: string
}

interface OrderContextHeaderProps {
  selectedOrder: SalesOrder | null
  isLoading: boolean
  journalEntryRef: JournalEntryRef | null
  journalEntryRefLoading: boolean
  onEditOrder: () => void
  onDeleteOrder: () => void
  onPrintOrder: () => void
  onNavigateToInvoice: (invoice: any, event?: React.MouseEvent) => void
  onNavigateToPayment: (paymentId: string, event?: React.MouseEvent) => void
  onNavigateToJournalEntry: () => void
  onRefundOrder: () => void
  onUnpayOrder: () => void
  onOpenPaymentDialog: () => void
  onFulfillOrder: () => void
  onUnfulfillOrder: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
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

const OrderContextHeader: React.FC<OrderContextHeaderProps> = ({
  selectedOrder,
  isLoading,
  journalEntryRef,
  journalEntryRefLoading,
  onEditOrder,
  onDeleteOrder,
  onPrintOrder,
  onNavigateToInvoice,
  onNavigateToPayment,
  onNavigateToJournalEntry,
  onRefundOrder,
  onUnpayOrder,
  onOpenPaymentDialog,
  onFulfillOrder,
  onUnfulfillOrder,
}) => {
  if (!selectedOrder) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{
          color: "text.secondary"
        }}>
          Select an order to view details
        </Typography>
      </Paper>
    );
  }

  const allPaymentsWithDuplicates = [
    ...(((selectedOrder as any).directPayments || []) as any[]),
    ...((selectedOrder.invoices && selectedOrder.invoices.length > 0
      ? selectedOrder.invoices.flatMap((invoice: any) => invoice.payments || [])
      : []) as any[]),
  ]
  const allPayments = allPaymentsWithDuplicates.filter(
    (payment, index, self) => index === self.findIndex((item) => item.id === payment.id),
  )
  const balance = (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)
  const isOverpaid = (selectedOrder.paidAmount || 0) > (selectedOrder.totalAmount || 0)

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
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          SO Details - {selectedOrder.orderNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Order" onClick={onEditOrder} sx={{ ...actionIconSx, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Order" onClick={onDeleteOrder} sx={{ ...actionIconSx, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Print Order" onClick={onPrintOrder} sx={{ ...actionIconSx, color: 'info.main' }}>
            <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        SO Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Customer Name</TableCell>
                    <TableCell sx={valueCellSx}>{selectedOrder.customer?.name || 'Unknown Customer'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>SO Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Invoice No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.invoices && selectedOrder.invoices.length > 0 ? (
                        selectedOrder.invoices.map((invoice: any, index: number) => (
                          <Box key={invoice.id} component="span">
                            <Typography component="button" onClick={(event) => onNavigateToInvoice(invoice, event)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                              {invoice.invoiceNumber}
                            </Typography>
                            {index < selectedOrder.invoices!.length - 1 && <Typography component="span" sx={{ fontSize: '0.8rem' }}>,</Typography>}
                          </Box>
                        ))
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          {selectedOrder.isFulfilled ? 'Pending' : 'Not fulfilled'}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Payment No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {allPayments.length === 0 ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          No payments
                        </Typography>
                      ) : (
                        <Stack spacing={0.75}>
                          {allPayments.map((payment: any) => (
                            <Box key={payment.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Typography component="button" onClick={(event) => onNavigateToPayment(payment.id, event)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {payment.paymentNumber}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {!selectedOrder.isFulfilled ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Not fulfilled</Typography>
                      ) : journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRef ? (
                        <Typography component="button" onClick={onNavigateToJournalEntry} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Pending</Typography>
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
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment and Fulfillment
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Sub-total</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedOrder.items?.reduce((sum: number, item: any) => sum + (Number(item.totalAmount) || 0), 0) || 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Shipping</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency((selectedOrder as any).shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Paid</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Balance</TableCell>
                    <TableCell sx={valueCellSx}>{balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                        <Button
                          variant="contained"
                          size="small"
                          color={isOverpaid ? 'warning' : selectedOrder.isPaidInFull ? 'warning' : 'primary'}
                          onClick={isOverpaid ? onRefundOrder : selectedOrder.isPaidInFull ? onUnpayOrder : onOpenPaymentDialog}
                          disabled={isLoading || selectedOrder.isFulfilled}
                          sx={{ minWidth: 110 }}
                        >
                          {isOverpaid ? 'Refund' : selectedOrder.isPaidInFull ? 'Unpay' : selectedOrder.paidAmount > 0 ? 'Pay More' : 'Pay'}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          color={selectedOrder.isFulfilled ? 'warning' : 'success'}
                          onClick={selectedOrder.isFulfilled ? onUnfulfillOrder : onFulfillOrder}
                          disabled={isLoading || (!selectedOrder.isFulfilled && !selectedOrder.isPaidInFull)}
                          sx={{ minWidth: 110 }}
                        >
                          {selectedOrder.isFulfilled ? 'Unfulfill' : 'Fulfill'}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}

export default OrderContextHeader
