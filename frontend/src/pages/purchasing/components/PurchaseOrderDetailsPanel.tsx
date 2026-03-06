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

import { TABLE_STYLES, TYPOGRAPHY_STYLES } from '@/constants/typography'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import type { PurchaseJournalEntryRef } from '../hooks/usePurchaseOrdersPageState'

interface PurchaseOrderDetailsPanelProps {
  selectedOrder: PurchaseOrder | null
  isLoading: boolean
  journalEntryRef: PurchaseJournalEntryRef | null
  journalEntryRefLoading: boolean
  onEditClick: () => void
  onDeleteClick: () => void
  onPrint: () => void
  onNavigateToGoodsReceived: (grnId: string) => void
  onNavigateToVendorPayment: (paymentId: string) => void
  onNavigateToJournalEntry: () => void
  onUnpay: () => void
  onOpenPaymentDialog: (order: PurchaseOrder) => void
  onReturn: () => void
  onReceive: () => void
}

const PurchaseOrderDetailsPanel: React.FC<PurchaseOrderDetailsPanelProps> = ({
  selectedOrder,
  isLoading,
  journalEntryRef,
  journalEntryRefLoading,
  onEditClick,
  onDeleteClick,
  onPrint,
  onNavigateToGoodsReceived,
  onNavigateToVendorPayment,
  onNavigateToJournalEntry,
  onUnpay,
  onOpenPaymentDialog,
  onReturn,
  onReceive,
}) => {
  if (!selectedOrder) {
    return (
      <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Select a purchase order to view details
        </Typography>
      </Paper>
    )
  }

  const isReceived = !!(
    selectedOrder.goodsReceivedNotes &&
    selectedOrder.goodsReceivedNotes.length > 0 &&
    selectedOrder.goodsReceivedNotes[0].status === 'received'
  )
  const hasPayment = !!(selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0)

  return (
    <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PO Details - {selectedOrder.orderNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Order" onClick={onEditClick} sx={{ height: `${TABLE_STYLES.row.height * 0.75}px`, width: `${TABLE_STYLES.row.height * 0.75}px`, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Order" onClick={onDeleteClick} sx={{ height: `${TABLE_STYLES.row.height * 0.75}px`, width: `${TABLE_STYLES.row.height * 0.75}px`, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Print Purchase Order" onClick={onPrint} sx={{ height: `${TABLE_STYLES.row.height * 0.75}px`, width: `${TABLE_STYLES.row.height * 0.75}px`, color: 'info.main' }}>
            <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, color: 'primary.main', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        PO Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Supplier</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{selectedOrder.supplier?.companyName || 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>PO Date</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>GRN No</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                      {selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0
                        ? selectedOrder.goodsReceivedNotes.map((grn: any, index: number) => (
                            <Box key={grn.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToGoodsReceived(grn.id)} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit' }}>
                                {grn.grnNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>VP No</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                      {selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
                        ? selectedOrder.vendorPayments.map((payment: any, index: number) => (
                            <Box key={payment.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToVendorPayment(payment.id)} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit' }}>
                                {payment.paymentNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Journal Entry No</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRef ? (
                        <Typography component="button" onClick={onNavigateToJournalEntry} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit' }}>
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, color: 'text.secondary', fontStyle: 'italic' }}>Pending</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, color: 'primary.main', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Payment and Receiving
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Sub-total</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{formatCurrency((selectedOrder as any).subtotal || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Shipping</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{formatCurrency(selectedOrder.shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50', borderTop: TABLE_STYLES.cell.border }}>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Total</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Paid</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>Balance</TableCell>
                    <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{formatCurrency(Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                        <Button
                          variant="contained"
                          size="small"
                          color={hasPayment ? 'warning' : 'primary'}
                          onClick={hasPayment ? onUnpay : () => onOpenPaymentDialog(selectedOrder)}
                          disabled={(hasPayment && isReceived) || isLoading}
                          sx={{ minWidth: 110 }}
                        >
                          {hasPayment ? 'Unpay' : 'Pay'}
                        </Button>
                        {isReceived ? (
                          <Button variant="contained" size="small" color="warning" sx={{ minWidth: 110 }} onClick={onReturn} disabled={!selectedOrder?.items || selectedOrder.items.length === 0 || isLoading}>
                            Return
                          </Button>
                        ) : (
                          <Button
                            variant="contained"
                            size="small"
                            color="success"
                            sx={{ minWidth: 110 }}
                            onClick={onReceive}
                            disabled={
                              !selectedOrder?.items ||
                              selectedOrder.items.length === 0 ||
                              isLoading ||
                              !((selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0)
                            }
                          >
                            Receive
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                PO Items
              </Typography>
              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
                    <TableHead>
                      <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: 'grey.50', color: TYPOGRAPHY_STYLES.tableHeader.color, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize } }}>
                        <TableCell sx={{ width: '35%' }}>Product</TableCell>
                        <TableCell align="center" sx={{ width: '13%' }}>Quantity</TableCell>
                        <TableCell align="center" sx={{ width: '13%' }}>Price</TableCell>
                        <TableCell align="center" sx={{ width: '13%' }}>Discount</TableCell>
                        <TableCell align="center" sx={{ width: '13%' }}>Sub-total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedOrder.items.map((item: any, index: number) => (
                        <TableRow key={item.id || index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                          <TableCell sx={{ fontSize: '0.8rem' }}>{item.product?.name || item.description || 'N/A'}</TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{item.quantity}</TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.unitPrice || item.unitCost || 0)}</TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            {item.discountAmount ? (
                              <Box component="span">
                                {`-${formatCurrency(item.discountAmount)}`}
                                {item.discountPercent > 0 && (
                                  <Typography component="span" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize, color: 'text.secondary', ml: 0.5 }}>
                                    ({item.discountPercent}%)
                                  </Typography>
                                )}
                              </Box>
                            ) : '-'}
                          </TableCell>
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.totalAmount || item.total || item.quantity * (item.unitPrice || item.unitCost || 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info">No items in this order</Alert>
              )}
            </Box>
          </Grid>

          {selectedOrder.notes && (
            <Grid item xs={12}>
              <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                  Notes
                </Typography>
                <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedOrder.notes}
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>
      </Box>
    </Paper>
  )
}

export default PurchaseOrderDetailsPanel
