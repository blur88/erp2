import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/GridLegacy'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface JournalEntryRef {
  id: string
  referenceNumber: string
}

interface OrderDetailsPanelProps {
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

const OrderDetailsPanel: React.FC<OrderDetailsPanelProps> = ({
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
      <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Select an order to view details
        </Typography>
      </Paper>
    )
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
    <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  tableLayout: 'fixed',
                  '& .MuiTableCell-root': {
                    border: 'none',
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                    '&:nth-of-type(1)': { width: '40%' },
                    '&:nth-of-type(2)': { width: '60%' },
                  },
                }}
              >
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        SO Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Customer Name
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {selectedOrder.customer?.name || 'Unknown Customer'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>SO Date</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Invoice No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
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
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Payment No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
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
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Journal Entry No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
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

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  tableLayout: 'fixed',
                  '& .MuiTableCell-root': {
                    border: 'none',
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                    '&:nth-of-type(1)': { width: '40%' },
                    '&:nth-of-type(2)': { width: '60%' },
                  },
                }}
              >
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment and Fulfillment
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Sub-total</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {formatCurrency(selectedOrder.items?.reduce((sum: number, item: any) => sum + (Number(item.totalAmount) || 0), 0) || 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Shipping</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency((selectedOrder as any).shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Total</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Paid</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Balance</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
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

        <Box sx={{ borderTop: '2px solid', borderColor: 'divider', pageBreakBefore: 'always', '@media print': { pageBreakBefore: 'always' } }} />

        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                    <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      SO Items
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {selectedOrder.items && selectedOrder.items.length > 0 ? (
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
                  <TableHead>
                    <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                      <TableCell sx={{ width: '40%' }}>Product</TableCell>
                      <TableCell align="center" sx={{ width: '12%' }}>Quantity</TableCell>
                      <TableCell align="right" sx={{ width: '16%' }}>Unit Price</TableCell>
                      <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                      <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedOrder.items.map((item: any, index: number) => (
                      <TableRow key={index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                        <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                          {item.product?.name || 'Unknown Product'}
                          {item.description && (
                            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block' }}>
                              {item.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                          {item.quantity || 0}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                          {formatCurrency(item.unitPrice || 0)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                          {item.discountType === 'percentage' && item.discountPercent ? `${item.discountPercent}%` : item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                          {formatCurrency(item.totalAmount || item.quantity * item.unitPrice || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No items in this order</Alert>
            )}
          </Box>
        </Box>

        {selectedOrder.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
              NOTES
            </Typography>
            <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selectedOrder.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default OrderDetailsPanel
