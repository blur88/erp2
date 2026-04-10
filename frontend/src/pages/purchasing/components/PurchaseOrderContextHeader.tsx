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
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import type { PurchaseJournalEntryRef } from '../hooks/usePurchaseOrdersPageState'

interface PurchaseOrderContextHeaderProps {
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

const PurchaseOrderContextHeader: React.FC<PurchaseOrderContextHeaderProps> = ({
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
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{
          color: "text.secondary"
        }}>
          Select a purchase order to view details
        </Typography>
      </Paper>
    );
  }

  const isReceived = !!(
    selectedOrder.goodsReceivedNotes &&
    selectedOrder.goodsReceivedNotes.length > 0 &&
    selectedOrder.goodsReceivedNotes[0].status === 'received'
  )
  const hasPayment = !!(selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0)

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
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PO Details - {selectedOrder.orderNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Order" onClick={onEditClick} sx={{ ...actionIconSx, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Order" onClick={onDeleteClick} sx={{ ...actionIconSx, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Print Purchase Order" onClick={onPrint} sx={{ ...actionIconSx, color: 'info.main' }}>
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
                        PO Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Supplier</TableCell>
                    <TableCell sx={valueCellSx}>{selectedOrder.supplier?.companyName || 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>PO Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>GRN No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0
                        ? selectedOrder.goodsReceivedNotes.map((grn: any, index: number) => (
                            <Box key={grn.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToGoodsReceived(grn.id)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {grn.grnNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>VP No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
                        ? selectedOrder.vendorPayments.map((payment: any, index: number) => (
                            <Box key={payment.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToVendorPayment(payment.id)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {payment.paymentNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
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
                        Payment and Receiving
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Sub-total</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.subtotal || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Shipping</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50', borderTop: TABLE_STYLES.cell.border }}>
                    <TableCell sx={labelCellSx}>Total</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Paid</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Balance</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}</TableCell>
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
                          color={hasPayment ? 'warning' : 'primary'}
                          onClick={hasPayment ? onUnpay : () => onOpenPaymentDialog(selectedOrder)}
                          disabled={(hasPayment && isReceived) || isLoading}
                          sx={{ minWidth: 110 }}
                        >
                          {hasPayment ? 'Unpay' : 'Pay'}
                        </Button>
                        {isReceived ? (
                          <Button variant="contained" size="small" color="warning" sx={{ minWidth: 110 }} onClick={onReturn} disabled={!selectedOrder.items || selectedOrder.items.length === 0 || isLoading}>
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
                              !selectedOrder.items ||
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
        </Grid>
      </Box>
    </Paper>
  );
}

export default PurchaseOrderContextHeader
